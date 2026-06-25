//! FlowShield desktop — library entry point. main.rs wraps `run()` so the
//! same code can be unit-tested without spinning up a webview.

mod ai;
mod api;
mod blocking;
mod commands;
mod device;
mod error;
mod store;
mod sync_worker;
mod tracker;
mod tray;
mod tray_indicator;
mod update;

use std::sync::Arc;
use std::sync::atomic::AtomicBool;
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
    /// 32-char URL-safe base64 id derived once from hostname+username
    /// and cached at `<app_data_dir>/device_id.txt`. Set in `setup`.
    /// Empty until then — callers should `.get()` and skip registration
    /// if the cache hasn't populated yet (very brief window during launch).
    pub device_id: Arc<std::sync::OnceLock<String>>,
    /// Most recent UpdateInfo from the periodic background check (if any).
    /// Read by the tray "Updates available" menu click handler to know
    /// which URL to open. `None` until the first check finds something
    /// newer; reset to `None` on app restart (no persistence needed).
    /// std::sync::Mutex (not tokio's) because the menu click handler is
    /// synchronous and lock contention is effectively zero.
    pub latest_update: Arc<std::sync::Mutex<Option<update::UpdateInfo>>>,
    /// `OnceLock` because `CandleEmbedder` is loaded lazily on first
    /// briefing generation and reused for the process lifetime (~135 MB
    /// resident; cheap to keep around).
    pub embedder: Arc<std::sync::OnceLock<Arc<crate::ai::candle_embedder::CandleEmbedder>>>,
    /// Set true while `briefing::generate` is running; prevents the 5am
    /// scheduler tick and the lazy-fallback dashboard mount from racing.
    pub briefing_in_flight: Arc<AtomicBool>,
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
            device_id: Arc::new(std::sync::OnceLock::new()),
            latest_update: Arc::new(std::sync::Mutex::new(None)),
            embedder: Arc::new(std::sync::OnceLock::new()),
            briefing_in_flight: Arc::new(AtomicBool::new(false)),
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
        .plugin(tauri_plugin_opener::init())
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
            //
            // Linux gotcha: window.hide() destroys the GTK surface and
            // window.show() (called from the tray "Show" menu) creates a
            // new one. After this round-trip libdecor's client-side
            // decorations get reattached but the close-button hit area
            // stops registering single clicks reliably — the user sees
            // the close button "stop working" the second time, and
            // double-clicking it lands on the title bar (GNOME default
            // = double-click maximize). Minimizing instead keeps the
            // surface alive so CSD bindings stay valid.
            //
            // macOS / Windows tolerate hide/show fine + the full-hide
            // UX matches platform convention there, so they keep hide().
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    #[cfg(target_os = "linux")]
                    let _ = window.minimize();
                    #[cfg(not(target_os = "linux"))]
                    let _ = window.hide();
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

            // Compute (or load) the cached device id. Best-effort: a failure
            // here means the "Connected Devices" card on the web won't list
            // this desktop, but everything else still works.
            match device::ensure_device_id(&app_data_dir) {
                Ok(id) => {
                    let state: tauri::State<'_, AppState> = app.state();
                    let _ = state.device_id.set(id);
                    tracing::info!("device id cached");
                }
                Err(err) => {
                    tracing::warn!(?err, "device id unavailable; /api/devices won't be called");
                }
            }

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

            // Periodic update check. 60s warmup so the network has settled
            // (DHCP, captive portals) and the user isn't bothered with
            // banners during the launch flow. Then every 12h. The check
            // is a no-op for dev builds and PM-channel sources that don't
            // get a loud prompt — see update::detect_install_source.
            {
                let state: tauri::State<'_, AppState> = app.state();
                let http = state.http.clone();
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    loop {
                        let _ = update::check_and_publish(&app_handle, &http).await;
                        tokio::time::sleep(std::time::Duration::from_secs(12 * 60 * 60))
                            .await;
                    }
                });
            }

            // Phase 1.5 — briefing scheduler. Re-checks labs flag and
            // model status every 60s; fires the pipeline at 5am local
            // (or any post-5am tick if the laptop slept through).
            {
                let state: tauri::State<'_, AppState> = app.state();
                let app_handle = app.handle().clone();
                if let Some(db) = state.db.get().cloned() {
                    let embedder = state.embedder.clone();
                    let in_flight = state.briefing_in_flight.clone();
                    let model_dir = app_data_dir.join("models");
                    crate::ai::scheduler::spawn(
                        app_handle,
                        db,
                        embedder,
                        in_flight,
                        model_dir,
                    );
                } else {
                    tracing::warn!("local store unavailable; briefing scheduler disabled");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ai::ai_briefing_today,
            commands::ai::ai_briefing_generate,
            commands::ai::ai_briefing_delete,
            commands::ai::ai_data_delete,
            commands::ai::ai_labs_get_enabled,
            commands::ai::ai_labs_set_enabled,
            commands::ai::ai_model_download_start,
            commands::ai::ai_model_status,
            commands::ai::ai_reflection_today,
            commands::ai::ai_reflection_answer,
            commands::ai::ai_settings,
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
            commands::blocking::blocking_status,
            commands::preferences::prefs_load,
            commands::realtime::realtime_config,
            commands::tray::tray_set_session_indicator,
            commands::tray::tray_reset_session_indicator,
            commands::update::update_check_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FlowShield desktop");
}
