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
    Idle,
    EmptyState { sessions: i64, needed: i64 },
    Hidden,
}

/// Pure briefing-state decision. No I/O, no generation. A cached row always
/// wins; otherwise gate on labs + model-ready + session count, landing on
/// `Idle` when eligible but not yet generated.
pub(crate) fn briefing_state(
    cached: Option<store_ai::Briefing>,
    labs_enabled: bool,
    model_ready: bool,
    sessions: i64,
    needed: i64,
) -> BriefingState {
    if let Some(row) = cached {
        return BriefingState::Ready {
            text: row.text,
            generated_at: row.generated_at,
        };
    }
    if !labs_enabled || !model_ready {
        return BriefingState::Hidden;
    }
    if sessions < needed {
        return BriefingState::EmptyState { sessions, needed };
    }
    BriefingState::Idle
}

/// Compute the current `BriefingState` from the DB + labs/model status. Shared
/// by `ai_briefing_today` and `ai_briefing_delete` so the state machine lives
/// in one place.
pub(crate) fn current_briefing_state(
    db: &crate::store::Db,
    app: &AppHandle,
) -> Result<BriefingState, String> {
    let today_s = chrono::Local::now().date_naive().to_string();
    let cached = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        store_ai::get_briefing_for(&conn, &today_s, crate::ai::registry::LLM_ID)
            .ok()
            .flatten()
    };
    let labs = labs_enabled(app);
    let model_ready = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        matches!(
            store_ai::get_model_state(&conn).ok().flatten().map(|s| s.status),
            Some(store_ai::ModelStatus::Ready)
        )
    };
    let sessions = crate::ai::empty_state::session_chunk_count_last_7d(db);
    let needed = crate::ai::empty_state::MIN_SESSION_CHUNKS_LAST_7D;
    Ok(briefing_state(cached, labs, model_ready, sessions, needed))
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
    current_briefing_state(&db, &app)
}

/// User-initiated briefing generation. Re-checks eligibility; if eligible
/// (Idle), emits `ai-briefing-generating`, spawns generation, and returns
/// `Generating`. Otherwise returns the current non-Idle state without
/// spawning. This is the ONLY path that runs the briefing LLM.
#[tauri::command]
pub async fn ai_briefing_generate(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<BriefingState, String> {
    let db = state
        .db
        .get()
        .cloned()
        .ok_or_else(|| "local DB not initialized".to_string())?;
    let today = chrono::Local::now().date_naive();
    let today_s = today.to_string();

    let cached = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        store_ai::get_briefing_for(&conn, &today_s, crate::ai::registry::LLM_ID)
            .ok()
            .flatten()
    };
    let labs = labs_enabled(&app);
    let model_ready = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        matches!(
            store_ai::get_model_state(&conn).ok().flatten().map(|s| s.status),
            Some(store_ai::ModelStatus::Ready)
        )
    };
    let sessions = crate::ai::empty_state::session_chunk_count_last_7d(&db);
    let needed = crate::ai::empty_state::MIN_SESSION_CHUNKS_LAST_7D;

    match briefing_state(cached, labs, model_ready, sessions, needed) {
        BriefingState::Idle => {}
        other => return Ok(other), // not eligible to generate (Hidden / EmptyState / Ready)
    }

    let _ = app.emit("ai-briefing-generating", today_s);
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
        match briefing::generate_with_real_models(&db_clone, &in_flight, &embedder, &model_dir, today).await {
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

/// Delete today's cached briefing and return the recomputed state (resolves to
/// `Idle` when eligible). Lets the user clear the card and regenerate at will.
#[tauri::command]
pub async fn ai_briefing_delete(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<BriefingState, String> {
    let db = match state.db.get() {
        Some(d) => d.clone(),
        None => return Ok(BriefingState::Hidden),
    };
    let today_s = chrono::Local::now().date_naive().to_string();
    {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        store_ai::delete_briefing_for(&conn, &today_s).map_err(|e| e.to_string())?;
    }
    current_briefing_state(&db, &app)
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

// ---------- Plan 1.6c commands: reflection state + answer ----------

#[derive(Serialize, Debug)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ReflectionState {
    Pending { question: String },
    Answered,
    Hidden,
}

/// Pure mapping from a stored reflection row (or none) + labs flag to the
/// UI state. Hidden when labs off, no row, or a row with no question.
pub(crate) fn reflection_state_from(
    row: Option<store_ai::Reflection>,
    labs_enabled: bool,
) -> ReflectionState {
    if !labs_enabled {
        return ReflectionState::Hidden;
    }
    match row {
        Some(r) => {
            if r.answer.is_empty() {
                match r.questions.into_iter().next() {
                    Some(question) => ReflectionState::Pending { question },
                    None => ReflectionState::Hidden,
                }
            } else {
                ReflectionState::Answered
            }
        }
        None => ReflectionState::Hidden,
    }
}

/// Today's reflection state for the dashboard card.
#[tauri::command]
pub async fn ai_reflection_today(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<ReflectionState, String> {
    let labs = labs_enabled(&app);
    let db = match state.db.get() {
        Some(d) => d.clone(),
        None => return Ok(ReflectionState::Hidden),
    };
    let today = chrono::Local::now().date_naive().to_string();
    let row = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        store_ai::get_reflection_by_date(&conn, &today).map_err(|e| e.to_string())?
    };
    Ok(reflection_state_from(row, labs))
}

/// Persist the user's answer to today's reflection, then index it as a
/// Reflection chunk (best-effort). The answer save is the contract; a
/// chunk-index failure is logged, not fatal.
#[tauri::command]
pub async fn ai_reflection_answer(
    state: State<'_, crate::AppState>,
    app: AppHandle,
    answer: String,
) -> Result<(), String> {
    let db = state
        .db
        .get()
        .cloned()
        .ok_or_else(|| "local DB not initialized".to_string())?;
    let today = chrono::Local::now().date_naive();
    let today_s = today.to_string();

    // Load today's pending row; update its answer; upsert.
    let updated = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        let mut row = store_ai::get_reflection_by_date(&conn, &today_s)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no reflection for today".to_string())?;
        row.answer = answer;
        store_ai::upsert_reflection(&conn, &row).map_err(|e| e.to_string())?;
        row
    };

    // Best-effort: index the answered reflection as a chunk for retrieval.
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let model_dir = app_data_dir.join("models");
        let questions = updated.questions.clone();
        let answer_text = updated.answer.clone();
        let embedder_slot = state.embedder.clone();
        let db2 = db.clone();
        let date_for_chunk = today;
        let today_for_chunk = today_s.clone();
        tauri::async_runtime::spawn(async move {
            let input = crate::ai::corpus::ReflectionChunkInput {
                date: date_for_chunk,
                questions,
                answer: answer_text,
            };
            let text = crate::ai::corpus::render_reflection_chunk(&input);
            match crate::ai::candle_embedder::CandleEmbedder::get_or_load(
                &embedder_slot,
                &model_dir,
            ) {
                Ok(embedder) => {
                    if let Err(e) = crate::ai::indexer::index_chunk(
                        &db2,
                        embedder.as_ref(),
                        crate::store::ai::ChunkSource::Reflection,
                        &today_for_chunk,
                        &format!("{today_for_chunk}T23:59:59Z"),
                        text,
                    )
                    .await
                    {
                        tracing::warn!(?e, "reflection chunk index failed");
                    }
                }
                Err(e) => tracing::warn!(?e, "reflection index skipped: embedder load failed"),
            }
        });
    }

    let _ = app.emit("ai-reflection-answered", today_s);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::ai::{Briefing, Reflection};

    fn cached_row() -> Briefing {
        Briefing {
            date: "2026-06-24".into(),
            text: "hi".into(),
            generated_at: "2026-06-24T05:00:00Z".into(),
            model_id: "phi-3-mini-4k-instruct-q4".into(),
        }
    }

    #[test]
    fn briefing_state_decision_table() {
        // cached row → Ready regardless of other inputs
        assert!(matches!(briefing_state(Some(cached_row()), true, true, 9, 5), BriefingState::Ready { .. }));
        // labs off → Hidden
        assert!(matches!(briefing_state(None, false, true, 9, 5), BriefingState::Hidden));
        // model not ready → Hidden
        assert!(matches!(briefing_state(None, true, false, 9, 5), BriefingState::Hidden));
        // eligible but under threshold → EmptyState
        assert!(matches!(briefing_state(None, true, true, 3, 5), BriefingState::EmptyState { sessions: 3, needed: 5 }));
        // eligible, enough chunks, no cache → Idle
        assert!(matches!(briefing_state(None, true, true, 5, 5), BriefingState::Idle));
    }

    fn row(answer: &str) -> Reflection {
        Reflection {
            id: "reflection-2026-06-23".into(),
            date: "2026-06-23".into(),
            questions: vec!["What blocked you?".into()],
            answer: answer.into(),
            created_at: "2026-06-23T18:05:00Z".into(),
        }
    }

    #[test]
    fn reflection_state_maps_pending_answered_hidden() {
        // labs off → always Hidden
        assert!(matches!(
            reflection_state_from(Some(row("")), false),
            ReflectionState::Hidden
        ));
        // no row → Hidden
        assert!(matches!(
            reflection_state_from(None, true),
            ReflectionState::Hidden
        ));
        // empty answer → Pending with the question
        match reflection_state_from(Some(row("")), true) {
            ReflectionState::Pending { question } => assert_eq!(question, "What blocked you?"),
            other => panic!("expected Pending, got {other:?}"),
        }
        // non-empty answer → Answered
        assert!(matches!(
            reflection_state_from(Some(row("it was fine")), true),
            ReflectionState::Answered
        ));
    }
}
