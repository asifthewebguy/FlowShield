//! FlowShield desktop — library entry point. main.rs wraps `run()` so the
//! same code can be unit-tested without spinning up a webview.

mod api;
mod commands;
mod error;
mod tracker;

use std::sync::Arc;
use tokio::sync::RwLock;

pub use error::AppError;

/// Shared application state. The HTTP client is reused across requests so
/// connections are pooled. Token + user are mirrored from the persistent
/// store on first read so commands don't pay the IPC round-trip every call.
/// `tracker` holds the activity-monitoring task while a session is running;
/// session_start populates it, session_end takes() it and drains the buffer.
#[derive(Default)]
pub struct AppState {
    pub token: Arc<RwLock<Option<String>>>,
    pub user: Arc<RwLock<Option<api::AuthUser>>>,
    pub http: reqwest::Client,
    pub tracker: Arc<RwLock<Option<tracker::TrackerHandle>>>,
}

impl AppState {
    fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(format!(
                "FlowShield-Desktop/{} (rust)",
                env!("CARGO_PKG_VERSION")
            ))
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .expect("build reqwest client");

        Self {
            token: Arc::new(RwLock::new(None)),
            user: Arc::new(RwLock::new(None)),
            http,
            tracker: Arc::new(RwLock::new(None)),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,flowshield_desktop_lib=debug".into()),
        )
        .with_target(false)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::auth::auth_login,
            commands::auth::auth_load,
            commands::auth::auth_logout,
            commands::ping::ping,
            commands::sessions::session_start,
            commands::sessions::session_active,
            commands::sessions::session_end,
            commands::sessions::session_toggle_pause,
            commands::projects::projects_list,
            commands::projects::projects_create,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FlowShield desktop");
}
