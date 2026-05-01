//! Project commands. The frontend invokes these to populate the session
//! picker's project dropdown and to create new projects inline.

use crate::api::{self, projects::Project};
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

/// `projects_list` — GET /api/projects.
#[tauri::command]
pub async fn projects_list(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    let token = token_or_err(&state).await?;
    api::projects::list_projects(&state.http, &token).await
}

/// `projects_create` — POST /api/projects with { name }.
#[tauri::command]
pub async fn projects_create(state: State<'_, AppState>, name: String) -> AppResult<Project> {
    let token = token_or_err(&state).await?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Api {
            status: 400,
            message: "Project name is required".into(),
            code: Some("INVALID_NAME".into()),
        });
    }
    api::projects::create_project(&state.http, &token, trimmed).await
}
