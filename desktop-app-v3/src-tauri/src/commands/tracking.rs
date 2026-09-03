//! Always-on tracker controls exposed to the frontend. The tray menu
//! toggles the same flag; both paths rebuild the tray menu so the label
//! stays in sync.

use crate::error::{AppError, AppResult};
use crate::AppState;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn tracking_paused_get(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(state.tracking_paused.load(Ordering::Relaxed))
}

#[tauri::command]
pub async fn tracking_set_paused(
    app: AppHandle,
    state: State<'_, AppState>,
    paused: bool,
) -> AppResult<()> {
    state.tracking_paused.store(paused, Ordering::Relaxed);
    tracing::info!(paused, "tracking pause set from settings");
    crate::tray::rebuild_menu(&app)
        .map_err(|e| AppError::Storage(format!("rebuild tray menu: {e}")))
}
