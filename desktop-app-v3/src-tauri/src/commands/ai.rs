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
