//! Manual "Check for updates" Tauri command. The automatic background
//! check lives in `lib.rs::setup` (12-hour interval); this command is the
//! entry point for explicit user-triggered checks (tray menu, settings UI).

use crate::update::{check_and_publish, UpdateInfo};
use crate::AppState;

/// Force an update check right now. Returns `None` if the app is up-to-date
/// or if the install source is suppressed (dev / unknown). Also updates the
/// tray menu + emits the `update-available` event so the in-app banner sees
/// the same result the periodic background check would have produced.
#[tauri::command]
pub async fn update_check_now(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<UpdateInfo>, String> {
    Ok(check_and_publish(&app, &state.http).await)
}
