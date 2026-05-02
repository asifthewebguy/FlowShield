//! Realtime config command. The frontend calls `realtime_config` once on
//! login to discover the Pusher key + cluster for its WebSocket connection.

use crate::api::{self, RealtimeConfig};
use crate::error::AppResult;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn realtime_config(state: State<'_, AppState>) -> AppResult<RealtimeConfig> {
    api::realtime::get_config(&state.http).await
}
