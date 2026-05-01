//! Hosts-file blocking commands. The frontend invokes these to enter
//! deep-work mode and to release the block on session end.
//!
//! Both commands require the app to be running with admin/root privileges
//! since the OS hosts file is owned by root. If not, the underlying write
//! fails with `PermissionDenied` and the error propagates as an
//! `AppError::Storage` to JS. Phase 6.5 will add a `pkexec`/UAC elevation
//! path so users don't have to launch the app with sudo.
//!
//! Wrapped in `spawn_blocking` because hosts-file I/O is synchronous and
//! we don't want to stall the runtime — the actual reads/writes are tiny
//! but `fs::rename` can briefly block on slow disks.

use crate::blocking;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn blocking_apply(domains: Vec<String>) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || blocking::apply_blocks(&domains))
        .await
        .map_err(|e| AppError::Storage(format!("blocking task: {e}")))?
}

#[tauri::command]
pub async fn blocking_clear() -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(blocking::clear_blocks)
        .await
        .map_err(|e| AppError::Storage(format!("blocking task: {e}")))?
}
