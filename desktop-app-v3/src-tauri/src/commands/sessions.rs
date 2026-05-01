//! Session-timer commands. The frontend invokes these; we forward to the
//! FlowShield REST API using the in-memory token from AppState.

use crate::api::{self, Session};
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

/// `session_start` — POST /api/sessions
#[tauri::command]
pub async fn session_start(
    state: State<'_, AppState>,
    planned_duration: i32,
    session_type: Option<String>,
) -> AppResult<Session> {
    let token = token_or_err(&state).await?;
    let session_type = session_type.as_deref().unwrap_or("WORK");
    api::sessions::start_session(&state.http, &token, planned_duration, session_type).await
}

/// `session_active` — GET /api/sessions/active. Returns null if none.
#[tauri::command]
pub async fn session_active(state: State<'_, AppState>) -> AppResult<Option<Session>> {
    let token = token_or_err(&state).await?;
    api::sessions::get_active_session(&state.http, &token).await
}

/// `session_end` — PATCH /api/sessions/[id] with completed=true.
#[tauri::command]
pub async fn session_end(
    state: State<'_, AppState>,
    session_id: String,
    productivity_score: Option<i32>,
) -> AppResult<Session> {
    let token = token_or_err(&state).await?;
    api::sessions::end_session(&state.http, &token, &session_id, productivity_score).await
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
