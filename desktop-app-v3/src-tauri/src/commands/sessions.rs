//! Session-timer commands. The frontend invokes these; we forward to the
//! FlowShield REST API using the in-memory token from AppState.
//!
//! The activity tracker is always on (spawned in `lib.rs` setup). These
//! commands only publish the active session id so buckets get tagged:
//!   - session_start / session_active set `AppState.active_session_id`
//!   - session_end clears it, flushes the open bucket, and triggers an
//!     immediate upload so the web dashboard reflects the session

use crate::api::{self, Session};
use crate::device;
use crate::error::{AppError, AppResult};
use crate::AppState;
use tauri::State;

async fn token_or_err(state: &State<'_, AppState>) -> AppResult<String> {
    state
        .token
        .read()
        .await
        .clone()
        .ok_or_else(|| AppError::Api {
            status: 401,
            message: "Not authenticated".into(),
            code: Some("UNAUTHENTICATED".into()),
        })
}

/// `session_start` — POST /api/sessions, then publish the session id so
/// the always-on tracker starts tagging buckets with it.
#[tauri::command]
pub async fn session_start(
    state: State<'_, AppState>,
    planned_duration: i32,
    session_type: Option<String>,
    project_id: Option<String>,
) -> AppResult<Session> {
    let token = token_or_err(&state).await?;
    let session_type = session_type.as_deref().unwrap_or("WORK");
    let project_id = project_id.as_deref().filter(|s| !s.is_empty());
    let session = api::sessions::start_session(
        &state.http,
        &token,
        planned_duration,
        session_type,
        project_id,
    )
    .await?;

    *state.active_session_id.write().await = Some(session.id.clone());
    Ok(session)
}

/// `session_active` — GET /api/sessions/active. Returns null if none.
/// Also publishes the id so buckets get tagged for sessions started on
/// another device (web, mobile, extension).
#[tauri::command]
pub async fn session_active(state: State<'_, AppState>) -> AppResult<Option<Session>> {
    let token = token_or_err(&state).await?;
    let session = api::sessions::get_active_session(&state.http, &token).await?;
    let id = session
        .as_ref()
        .filter(|s| !s.completed)
        .map(|s| s.id.clone());
    *state.active_session_id.write().await = id;
    Ok(session)
}

/// `session_end` — PATCH /api/sessions/[id] with completed=true, then stop
/// the tracker and POST whatever it collected to /api/activity/sync.
#[tauri::command]
pub async fn session_end(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    session_id: String,
    productivity_score: Option<i32>,
) -> AppResult<Session> {
    let token = token_or_err(&state).await?;

    // End the session first — if this fails, we keep the tracker running so
    // the user can retry without losing collected data.
    let session =
        api::sessions::end_session(&state.http, &token, &session_id, productivity_score).await?;

    *state.active_session_id.write().await = None;
    if let Some(tracker) = state.tracker.read().await.as_ref() {
        tracker.flush().await;
    }
    // Best-effort immediate upload so the session's activity appears on the
    // web without waiting for the next sync tick. Failure is fine: rows stay
    // in activity_local and the sync worker retries.
    if let Some(db) = state.db.get() {
        let share = crate::activity_upload::resolve_share_flag(&state.http, &token, &state.prefs_cache).await;
        match crate::activity_upload::upload_once(&state.http, &token, db, share).await {
            Ok(n) => tracing::info!(uploaded = n, "post-session activity upload"),
            Err(err) => tracing::warn!(?err, "post-session upload failed; sync worker will retry"),
        }
    }

    // Refresh the device row's lastSyncAt — mirrors v2's SyncService which
    // re-registers after every activity-sync round. Fire-and-forget so a
    // network blip on the registration POST doesn't fail the session end.
    if let Some(device_id) = state.device_id.get().cloned() {
        let http = state.http.clone();
        let token = token.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(err) = api::devices::register_device(
                &http,
                &token,
                &device_id,
                &device::device_name(),
                device::platform(),
                device::app_version(),
            )
            .await
            {
                tracing::debug!(?err, "device re-register on session end failed");
            }
        });
    }

    // Phase 1.6a — index this completed session into the AI corpus.
    // Best-effort, backgrounded: never blocks or fails the session end.
    //
    // TODO(always-on-tracking follow-up): the tracker no longer drains an
    // in-memory per-session sample buffer (Task 8 of the always-on-tracking
    // plan) — buckets are persisted straight to activity_local as they
    // open. `top_apps` below is empty until store::activity_local grows a
    // "rows for this session_id" query the indexer can read from.
    if let Some(db) = state.db.get().cloned() {
        use tauri::Manager;
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            let input = crate::ai::indexer::session_chunk_input(
                &session,
                productivity_score,
                &[],
            );
            crate::ai::indexer::index_session_background(
                app.clone(),
                db,
                state.embedder.clone(),
                app_data_dir.join("models"),
                input,
            );
        }
    }

    Ok(session)
}

/// `session_toggle_pause` — POST /api/sessions/[id]/toggle-pause
/// `action` is "pause" or "resume".
#[tauri::command]
pub async fn session_toggle_pause(
    state: State<'_, AppState>,
    session_id: String,
    action: String,
) -> AppResult<Session> {
    let token = token_or_err(&state).await?;
    api::sessions::toggle_pause(&state.http, &token, &session_id, &action).await
}
