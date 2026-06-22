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
    // Use a download-specific client: the shared `state.http` carries a 20s
    // total-request timeout that would abort a multi-GB model download.
    let http = model_download::download_client()?;
    let handle_for_task = handle.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = model_download::run_download(&handle_for_task, &http, &db).await {
            tracing::error!(?e, "model download failed");
        }
    });

    Ok(())
}

/// Wipe all AI data: drops chunks, reflections, briefings, model_state rows,
/// and deletes the model files from `app_data_dir/models/`. Used by the
/// "Delete AI data" button in /settings/ai. Returns Ok even if nothing was
/// present to delete (idempotent).
#[tauri::command]
pub async fn ai_data_delete(
    handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let db = state
        .db
        .get()
        .ok_or_else(|| AppError::Storage("local DB not initialized".into()))?;
    {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        store_ai::delete_all_chunks(&conn)?;
        store_ai::delete_all_reflections(&conn)?;
        store_ai::delete_all_briefings(&conn)?;
        store_ai::delete_all_session_facts(&conn)?;
        store_ai::delete_model_state(&conn)?;
    } // drop the lock before the async filesystem op below

    let models_dir = model_download::models_dir(&handle)
        .map_err(|e| AppError::Storage(format!("models_dir: {e}")))?;
    if models_dir.exists() {
        tokio::fs::remove_dir_all(&models_dir)
            .await
            .map_err(|e| AppError::Storage(format!("remove_dir_all {models_dir:?}: {e}")))?;
    }

    use tauri::Emitter;
    let _ = handle.emit("ai-model-status-changed", "not_started");
    Ok(())
}

// ---------- Plan 1.5 commands: briefing + labs flag + settings ----------

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::ai::briefing;

#[derive(Serialize, Debug)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BriefingState {
    Ready { text: String, generated_at: String },
    Generating,
    EmptyState,
    Hidden,
    Error { message: String },
}

#[tauri::command]
pub async fn ai_briefing_today(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<BriefingState, String> {
    let db = match state.db.get() {
        Some(d) => d.clone(),
        None => return Ok(BriefingState::Hidden),
    };

    let today = chrono::Local::now().date_naive();
    let today_s = today.to_string();

    // Cached row?
    {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        if let Ok(Some(row)) = store_ai::get_briefing_for(
            &conn,
            &today_s,
            crate::ai::registry::LLM_ID,
        ) {
            return Ok(BriefingState::Ready {
                text: row.text,
                generated_at: row.generated_at,
            });
        }
    }

    let labs = labs_enabled(&app);
    if !labs {
        return Ok(BriefingState::Hidden);
    }

    // Model status check (lock briefly).
    let status = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        store_ai::get_model_state(&conn)
            .ok()
            .flatten()
            .map(|s| s.status)
            .unwrap_or(store_ai::ModelStatus::NotStarted)
    };
    if !matches!(status, store_ai::ModelStatus::Ready) {
        return Ok(BriefingState::Hidden);
    }

    if !crate::ai::empty_state::has_minimum_data(&db) {
        return Ok(BriefingState::EmptyState);
    }

    let _ = app.emit("ai-briefing-generating", today_s.clone());
    let app_handle = app.clone();
    let db_clone = db.clone();
    let embedder = state.embedder.clone();
    let in_flight = state.briefing_in_flight.clone();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let model_dir = app_data_dir.join("models");

    tauri::async_runtime::spawn(async move {
        match briefing::generate_with_real_models(
            &db_clone,
            &in_flight,
            &embedder,
            &model_dir,
            today,
        )
        .await
        {
            Ok(()) => {
                let _ = app_handle.emit("ai-briefing-ready", today.to_string());
            }
            Err(e) => {
                let _ = app_handle.emit("ai-briefing-error", e.to_string());
            }
        }
    });

    Ok(BriefingState::Generating)
}

#[tauri::command]
pub async fn ai_labs_set_enabled(enabled: bool, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("ai.labs.enabled", serde_json::Value::Bool(enabled));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn ai_labs_get_enabled(app: AppHandle) -> Result<bool, String> {
    Ok(labs_enabled(&app))
}

#[derive(Serialize, Debug)]
pub struct AiSettings {
    pub labs_enabled: bool,
    pub model_id: String,
    pub embedder_id: String,
    pub status: String,
    pub disk_usage_bytes: u64,
    pub indexed_chunk_count: i64,
}

#[tauri::command]
pub async fn ai_settings(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<AiSettings, String> {
    let db = state.db.get().ok_or_else(|| "store unavailable".to_string())?;

    let labs_enabled = labs_enabled(&app);

    let (status_str, indexed_chunk_count) = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        let model_state = store_ai::get_model_state(&conn).ok().flatten();
        let status = match model_state.as_ref().map(|s| &s.status) {
            Some(store_ai::ModelStatus::Ready) => "ready",
            Some(store_ai::ModelStatus::Downloading) => "downloading",
            Some(store_ai::ModelStatus::Error) => "error",
            Some(store_ai::ModelStatus::Disabled) => "disabled",
            _ => "not_started",
        }
        .to_string();
        let chunks = store_ai::count_chunks(&conn).unwrap_or(0);
        (status, chunks)
    };

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let models_dir = app_data_dir.join("models");
    let disk_usage_bytes = dir_size_bytes(&models_dir).unwrap_or(0);

    Ok(AiSettings {
        labs_enabled,
        model_id: crate::ai::registry::LLM_ID.to_string(),
        embedder_id: crate::ai::registry::EMBEDDER_ID.to_string(),
        status: status_str,
        disk_usage_bytes,
        indexed_chunk_count,
    })
}

pub(crate) fn labs_enabled(app: &AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    match app.store("settings.json") {
        Ok(store) => store
            .get("ai.labs.enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn dir_size_bytes(dir: &std::path::Path) -> std::io::Result<u64> {
    use std::fs;
    let mut total = 0u64;
    if !dir.exists() {
        return Ok(0);
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        if meta.is_file() {
            total += meta.len();
        } else if meta.is_dir() {
            total += dir_size_bytes(&entry.path()).unwrap_or(0);
        }
    }
    Ok(total)
}
