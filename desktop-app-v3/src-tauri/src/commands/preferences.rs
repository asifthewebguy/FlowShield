//! User-preferences commands. The deep-work card on the dashboard
//! invokes `prefs_load` to discover which sites to block.

use crate::api::{self, Preferences};
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

#[tauri::command]
pub async fn prefs_load(state: State<'_, AppState>) -> AppResult<Preferences> {
    let token = token_or_err(&state).await?;
    let prefs = api::preferences::get_preferences(&state.http, &token).await?;
    *state.prefs_cache.write().await = Some(prefs.clone());
    Ok(prefs)
}

#[tauri::command]
pub async fn prefs_set_share_window_details(
    state: State<'_, AppState>,
    enabled: bool,
) -> AppResult<Preferences> {
    let token = token_or_err(&state).await?;
    let prefs = api::preferences::set_share_window_details(&state.http, &token, enabled).await?;
    *state.prefs_cache.write().await = Some(prefs.clone());
    Ok(prefs)
}
