//! Hosts-file blocking commands. The frontend invokes these to enter
//! deep-work mode and to release the block on session end.
//!
//! These commands re-invoke the binary itself with an elevation prompt
//! (Linux: pkexec; macOS: osascript) so the GUI never holds root. The
//! privileged child runs `flowshield_desktop_lib::run_blocker_subcommand`
//! which dispatches `--blocking-apply <domains>` / `--blocking-clear`
//! and exits.
//!
//! Wrapped in `spawn_blocking` because the elevation subprocess is
//! synchronous and we don't want to stall the async runtime while the
//! user types their password.

use super::elevation;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn blocking_apply(domains: Vec<String>) -> AppResult<()> {
    // The frontend hands us the user's `primaryDistractions` list verbatim,
    // which is a list of CATEGORIES (e.g. "Social Media") — not real
    // domains. Expand here to the actual domains before paying the
    // elevation prompt; the privileged child stays dumb (just writes
    // whatever we tell it). Already-real domains pass through unchanged
    // so a future custom-domains UI works without further plumbing.
    let domains = crate::blocking::expand_categories(&domains);
    if domains.is_empty() {
        // Nothing to block (categories all unmapped + no raw domains) —
        // short-circuit so we don't pop the elevation dialog for a no-op.
        return Ok(());
    }
    // Comma-join because we pass through pkexec/osascript argv, where
    // each token is a separate shell argument; one packed string keeps
    // the wire format simple. The privileged child splits on commas.
    let arg = domains.join(",");
    tauri::async_runtime::spawn_blocking(move || {
        elevation::run_self_elevated("--blocking-apply", vec![arg])
    })
    .await
    .map_err(|e| AppError::Storage(format!("blocking task: {e}")))?
}

#[tauri::command]
pub async fn blocking_clear() -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(|| {
        elevation::run_self_elevated("--blocking-clear", vec![])
    })
    .await
    .map_err(|e| AppError::Storage(format!("blocking task: {e}")))?
}

/// Read-only check (no elevation): is the FlowShield block region
/// currently in the hosts file? The frontend uses this to sync the
/// dashboard's "blocking" indicator on launch — picks up state left
/// over from a previous run that ended uncleanly.
#[tauri::command]
pub async fn blocking_status() -> AppResult<bool> {
    tauri::async_runtime::spawn_blocking(crate::blocking::is_active)
        .await
        .map_err(|e| AppError::Storage(format!("blocking task: {e}")))?
}
