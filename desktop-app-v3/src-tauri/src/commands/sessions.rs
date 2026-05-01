//! Session-timer commands. The frontend invokes these; we forward to the
//! FlowShield REST API using the in-memory token from AppState.
//!
//! Activity-tracker lifecycle is bound to session lifecycle:
//!   - session_start spawns the tracker after the API confirms the new session
//!   - session_end stops the tracker, drains its buffer, and syncs to
//!     /api/activity/sync (best-effort — sync errors are logged but don't
//!     fail the end since the user already clicked "End")

use crate::api::{self, Session};
use crate::error::{AppError, AppResult};
use crate::store;
use crate::tracker::TrackerHandle;
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

/// `session_start` — POST /api/sessions, then spawn the activity tracker.
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

    // Replace any leftover tracker (e.g. a previous session that wasn't ended
    // cleanly) — drop the old one, spawn a fresh one for this session.
    let mut slot = state.tracker.write().await;
    if let Some(prev) = slot.take() {
        // Drain (and discard) — phase 4 will surface this as orphaned-session
        // recovery; for now, log and move on.
        let leftover = prev.stop_and_drain().await;
        if !leftover.is_empty() {
            tracing::warn!(
                count = leftover.len(),
                "discarded leftover tracker samples from a prior session"
            );
        }
    }
    *slot = Some(TrackerHandle::spawn());
    Ok(session)
}

/// `session_active` — GET /api/sessions/active. Returns null if none.
#[tauri::command]
pub async fn session_active(state: State<'_, AppState>) -> AppResult<Option<Session>> {
    let token = token_or_err(&state).await?;
    api::sessions::get_active_session(&state.http, &token).await
}

/// `session_end` — PATCH /api/sessions/[id] with completed=true, then stop
/// the tracker and POST whatever it collected to /api/activity/sync.
#[tauri::command]
pub async fn session_end(
    state: State<'_, AppState>,
    session_id: String,
    productivity_score: Option<i32>,
) -> AppResult<Session> {
    let token = token_or_err(&state).await?;

    // End the session first — if this fails, we keep the tracker running so
    // the user can retry without losing collected data.
    let session =
        api::sessions::end_session(&state.http, &token, &session_id, productivity_score).await?;

    // Drain whatever the tracker captured during this session.
    let samples = {
        let mut slot = state.tracker.write().await;
        match slot.take() {
            Some(handle) => handle.stop_and_drain().await,
            None => Vec::new(), // No tracker (e.g. session created elsewhere; we never started one)
        }
    };

    // Best-effort sync — failure here does NOT fail the end.
    // On failure, we persist the payload to the local SQLite queue so the
    // background drainer can retry later (network blip, server hiccup).
    if !samples.is_empty() {
        let count = samples.len();
        match api::activity::sync_activity(&state.http, &token, &session_id, &samples).await {
            Ok(result) => tracing::info!(
                synced = result.synced.unwrap_or(count as i32),
                "activity samples synced"
            ),
            Err(err) => {
                tracing::warn!(count, ?err, "activity sync failed; enqueueing for retry");
                if let Some(db) = state.db.get() {
                    if let Err(e) = store::pending_sync::enqueue(db, &session_id, &samples) {
                        tracing::error!(?e, count, "failed to enqueue pending sync; samples lost");
                    }
                } else {
                    tracing::warn!(count, "local store unavailable; samples lost");
                }
            }
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
