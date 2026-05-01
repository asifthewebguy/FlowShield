//! FlowShield desktop — library entry point. main.rs wraps `run()` so the
//! same code can be unit-tested without spinning up a webview.

mod api;
mod blocking;
mod commands;
mod error;
mod store;
mod sync_worker;
mod tracker;
mod tray;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

pub use error::AppError;

/// Privileged-child entrypoint. When the binary is re-invoked via
/// `pkexec` / `osascript` with one of our blocking subcommands, this
/// function runs the requested operation and returns an exit code. If
/// the args don't match a subcommand, returns None and the caller falls
/// through to the normal GUI launch path.
///
/// Args layout:
///   `flowshield-desktop --blocking-apply <comma,separated,domains>`
///   `flowshield-desktop --blocking-clear`
pub fn run_blocker_subcommand(args: &[String]) -> Option<i32> {
    let sub = args.get(1)?.as_str();
    match sub {
        "--blocking-apply" => {
            let domains: Vec<String> = args
                .get(2)
                .map(|s| {
                    s.split(',')
                        .filter(|d| !d.is_empty())
                        .map(String::from)
                        .collect()
                })
                .unwrap_or_default();
            Some(match blocking::apply_blocks(&domains) {
                Ok(()) => 0,
                Err(e) => {
                    eprintln!("flowshield-blocker apply: {e}");
                    1
                }
            })
        }
        "--blocking-clear" => Some(match blocking::clear_blocks() {
            Ok(()) => 0,
            Err(e) => {
                eprintln!("flowshield-blocker clear: {e}");
                1
            }
        }),
        _ => None,
    }
}

/// Shared application state. The HTTP client is reused across requests so
/// connections are pooled. Token + user are mirrored from the persistent
/// store on first read so commands don't pay the IPC round-trip every call.
/// `tracker` holds the activity-monitoring task while a session is running;
/// session_start populates it, session_end takes() it and drains the buffer.
/// `db` is opened lazily in `setup()` once we can resolve the OS app-data
/// directory; it stays `None` in test/headless contexts and the offline
/// queue is treated as a best-effort feature when absent.
#[derive(Default)]
pub struct AppState {
    pub token: Arc<RwLock<Option<String>>>,
    pub user: Arc<RwLock<Option<api::AuthUser>>>,
    pub http: reqwest::Client,
    pub tracker: Arc<RwLock<Option<tracker::TrackerHandle>>>,
    pub db: Arc<std::sync::OnceLock<store::Db>>,
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
            db: Arc::new(std::sync::OnceLock::new()),
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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // No CLI args on autostart: the desktop launches itself; the
            // user can quit via the tray menu if they don't want it
            // running on this boot.
            None,
        ))
        .on_window_event(|window, event| {
            // Close-to-tray: intercept the close button on the main window
            // so the app keeps running (auto-syncing, draining the offline
            // queue). The Quit menu item is the only path to exit.
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .manage(AppState::new())
        .setup(|app| {
            // Tray icon (declared in tauri.conf.json) gets its menu attached.
            if let Err(err) = tray::install(app) {
                tracing::warn!(?err, "tray install failed; tray menu unavailable");
            }

            // Enable autostart on first launch only — never overwrite a
            // user's choice on subsequent runs. The plugin reads OS-level
            // state (LaunchAgent / registry / .desktop file).
            #[cfg(not(any(test, debug_assertions)))]
            {
                use tauri_plugin_autostart::ManagerExt;
                let manager = app.autolaunch();
                match manager.is_enabled() {
                    Ok(false) => {
                        if let Err(err) = manager.enable() {
                            tracing::warn!(?err, "could not enable autostart");
                        } else {
                            tracing::info!("autostart enabled (first launch)");
                        }
                    }
                    Ok(true) => tracing::debug!("autostart already enabled"),
                    Err(err) => tracing::warn!(?err, "autostart status check failed"),
                }
            }

            // Open the local SQLite store under the OS app-data directory.
            // If this fails (read-only FS, weird sandbox, …) we log + skip:
            // the app still works, the offline-sync queue is just unavailable.
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("resolve app_data_dir: {e}"))?;
            let db_path = app_data_dir.join("local.sqlite");
            match store::open(&db_path) {
                Ok(db) => {
                    let state: tauri::State<'_, AppState> = app.state();
                    let _ = state.db.set(db.clone());
                    sync_worker::spawn(state.http.clone(), state.token.clone(), db);
                    tracing::info!(path = %db_path.display(), "local store opened");
                }
                Err(err) => {
                    tracing::warn!(?err, path = %db_path.display(), "local store unavailable; offline queue disabled");
                }
            }
            Ok(())
        })
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
            commands::blocking::blocking_apply,
            commands::blocking::blocking_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FlowShield desktop");
}
