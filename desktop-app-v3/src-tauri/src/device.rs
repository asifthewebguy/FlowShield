//! Local device identity helpers — used by the `/api/devices` registration
//! call so the web app can list connected desktops under "Connected Devices".
//!
//! `device_id` is intentionally stable across launches AND v2-compatible:
//! the same `SHA256("$hostname-$username")` → base64url[..32] algorithm the
//! .NET v2 client uses (see `desktop-app/Services/ApiClient.cs::GetDeviceId`).
//! That way a user upgrading from v2 to v3 gets the same `deviceId` and the
//! existing `device_connections` row is updated instead of duplicated.
//!
//! The id is cached at `<app_data_dir>/device_id.txt` after first compute so
//! a hostname/username change post-install doesn't silently mint a new
//! device row — once a v3 instance has an id, it keeps it.

use crate::error::{AppError, AppResult};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

const CACHE_FILE: &str = "device_id.txt";
const ID_LEN: usize = 32;

pub fn platform() -> &'static str {
    if cfg!(target_os = "linux") {
        "Linux"
    } else if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "windows") {
        "Windows"
    } else {
        "Unknown"
    }
}

pub fn device_name() -> String {
    // `devicename()` is whoami's name for the machine (hostname / NetBIOS
    // name). Falls back to `realname()` (the human-set machine name) only
    // if the OS hostname read failed — better than empty.
    let n = whoami::devicename();
    if n.is_empty() {
        whoami::realname()
    } else {
        n
    }
}

pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Read the cached device id from disk, or compute + write it on first call.
/// Caching means the id stays stable even if the user renames their machine
/// post-install, mirroring v2's behavior.
pub fn ensure_device_id(app_data_dir: &Path) -> AppResult<String> {
    let cache_path = app_data_dir.join(CACHE_FILE);
    if let Ok(existing) = fs::read_to_string(&cache_path) {
        let trimmed = existing.trim();
        if trimmed.len() == ID_LEN {
            return Ok(trimmed.to_string());
        }
    }
    let computed = compute_device_id(&whoami::devicename(), &whoami::username());
    fs::create_dir_all(app_data_dir)
        .map_err(|e| AppError::Storage(format!("mkdir app_data_dir: {e}")))?;
    fs::write(&cache_path, &computed)
        .map_err(|e| AppError::Storage(format!("write device_id.txt: {e}")))?;
    Ok(computed)
}

/// Pure-function device-id derivation. Matches v2 desktop's algorithm so
/// migrating users get the same id.
fn compute_device_id(hostname: &str, username: &str) -> String {
    let unique = format!("{hostname}-{username}");
    let digest = Sha256::digest(unique.as_bytes());
    // Standard base64 (with `+` `/` chars), then map to URL-safe to match v2's
    // `Replace("+", "-").Replace("/", "_")`. NO_PAD strips trailing `=` —
    // v2 keeps padding but truncates to 32 chars before any `=` shows up
    // (SHA-256 → 44 b64 chars, the single `=` is at position 43).
    let b64 = URL_SAFE_NO_PAD.encode(digest);
    b64.chars().take(ID_LEN).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_id_is_stable() {
        let a = compute_device_id("host", "user");
        let b = compute_device_id("host", "user");
        assert_eq!(a, b);
        assert_eq!(a.len(), ID_LEN);
    }

    #[test]
    fn device_id_changes_with_input() {
        let a = compute_device_id("host", "alice");
        let b = compute_device_id("host", "bob");
        assert_ne!(a, b);
    }

    #[test]
    fn device_id_is_url_safe() {
        let id = compute_device_id("host", "user");
        // No `+` or `/` — those would break URL handling on the server side.
        assert!(!id.contains('+'));
        assert!(!id.contains('/'));
        assert!(!id.contains('='));
    }
}
