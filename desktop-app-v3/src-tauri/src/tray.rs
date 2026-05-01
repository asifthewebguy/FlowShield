//! System-tray menu wiring. The tray icon itself is declared in
//! `tauri.conf.json` (`app.trayIcon`) so Tauri creates it before our
//! `setup` callback runs; here we just attach a menu and event handlers.
//!
//! Menu items:
//! - **Show FlowShield** — show + focus the main window (used after the
//!   user has hidden it via close-to-tray).
//! - **Quit** — actually exit the process. Without this menu, hide-to-tray
//!   would leave no obvious way to quit.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconEvent;
use tauri::{App, AppHandle, Manager};

const TRAY_ID: &str = "main";
const SHOW_ID: &str = "show";
const QUIT_ID: &str = "quit";

pub fn install(app: &App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, SHOW_ID, "Show FlowShield", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT_ID, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| tauri::Error::AssetNotFound(format!("tray '{TRAY_ID}' not configured")))?;

    tray.set_menu(Some(menu))?;
    tray.on_menu_event(handle_menu_event);
    tray.on_tray_icon_event(handle_icon_event);
    Ok(())
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        SHOW_ID => focus_main(app),
        QUIT_ID => {
            tracing::info!("quit requested via tray menu");
            app.exit(0);
        }
        _ => {}
    }
}

fn handle_icon_event(tray: &tauri::tray::TrayIcon, event: TrayIconEvent) {
    // Left-click on the icon brings the window forward — matches the
    // platform convention users expect from tray-resident apps.
    if let TrayIconEvent::Click {
        button: tauri::tray::MouseButton::Left,
        button_state: tauri::tray::MouseButtonState::Up,
        ..
    } = event
    {
        focus_main(tray.app_handle());
    }
}

fn focus_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
