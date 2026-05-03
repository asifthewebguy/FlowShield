//! Tray-icon update commands. The frontend ticks once per second while
//! a focus session is running and calls `tray_set_session_indicator` to
//! refresh the progress ring + countdown label. On session end / pause /
//! cancellation it calls `tray_reset_session_indicator` to restore the
//! default FlowShield logo and clear the label.
//!
//! Both commands are sync-flavored (no I/O beyond the cheap PNG render
//! + Tauri's tray-icon swap), so they don't need spawn_blocking.

use crate::error::{AppError, AppResult};
use tauri::AppHandle;

#[tauri::command]
pub async fn tray_set_session_indicator(
    app: AppHandle,
    label: String,
    progress: f32,
) -> AppResult<()> {
    crate::tray::update_session_indicator(&app, &label, progress)
        .map_err(|e| AppError::Storage(format!("update tray indicator: {e}")))
}

#[tauri::command]
pub async fn tray_reset_session_indicator(app: AppHandle) -> AppResult<()> {
    crate::tray::reset_session_indicator(&app)
        .map_err(|e| AppError::Storage(format!("reset tray indicator: {e}")))
}
