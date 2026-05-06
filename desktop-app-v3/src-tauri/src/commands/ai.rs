//! Tauri commands for AI model lifecycle. Frontend uses these to drive the
//! consent screen, settings page, and reset flow.

use crate::ai::model_download;
use crate::error::AppError;
use crate::store::ai::{self as store_ai, ModelState};
use crate::AppState;

/// Read the current model lifecycle state. Returns `None` when no row exists
/// (i.e. user has never opted into AI). Frontend uses this on app launch to
/// decide whether to show the consent card vs. proceed to BriefingCard.
#[tauri::command]
pub async fn ai_model_status(
    state: tauri::State<'_, AppState>,
) -> Result<Option<ModelState>, AppError> {
    let db = state
        .db
        .get()
        .ok_or_else(|| AppError::Storage("local DB not initialized".into()))?;
    let conn = db
        .lock()
        .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
    let result = store_ai::get_model_state(&conn)?;
    Ok(result)
}

/// Kick off the model download in a background tokio task. Returns immediately;
/// progress comes via `ai-model-progress` and completion via
/// `ai-model-status-changed` Tauri events. Idempotent — calling twice while a
/// download is running is a no-op (the orchestrator's resume logic handles it).
#[tauri::command]
pub async fn ai_model_download_start(
    handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let db = state
        .db
        .get()
        .cloned()
        .ok_or_else(|| AppError::Storage("local DB not initialized".into()))?;
    let http = state.http.clone();
    let handle_for_task = handle.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = model_download::run_download(&handle_for_task, &http, &db).await {
            tracing::error!(?e, "model download failed");
        }
    });

    Ok(())
}
