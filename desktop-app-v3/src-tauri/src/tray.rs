//! System-tray menu wiring. The tray icon itself is declared in
//! `tauri.conf.json` (`app.trayIcon`) so Tauri creates it before our
//! `setup` callback runs; here we just attach a menu + event handlers,
//! plus expose helpers for updating the icon during a focus session.
//!
//! Menu items:
//! - **Show FlowShield** — show + focus the main window (used after the
//!   user has hidden it via close-to-tray).
//! - **Quit** — actually exit the process. Without this menu, hide-to-tray
//!   would leave no obvious way to quit.
//!
//! Session indicator: while a focus session is running, the frontend
//! ticks once per second and calls `tray_set_session_indicator` (in
//! `commands::tray`) which routes here via `update_session_indicator`.
//! We swap the icon (FlowShield logo with a progress ring overlay) and
//! set the text label to a `MM:SS` countdown.

use crate::tray_indicator;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconEvent;
use tauri::{App, AppHandle, Manager};

const TRAY_ID: &str = "main";
const SHOW_ID: &str = "show";
const QUIT_ID: &str = "quit";

/// Embedded base FlowShield logo, used to reset the tray icon when no
/// session is active. Same source as the bundle icons (PR #48).
const BASE_ICON_PNG: &[u8] = include_bytes!("../icons/icon.png");
/// Tray icon size at which we render the progress overlay. 32px is a
/// sweet spot — large enough for a readable ring, small enough that
/// rendering once per second is sub-ms.
const TRAY_ICON_SIZE: u32 = 32;

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

/// Swap the tray icon to a progress-ring overlay and set the text label
/// next to the icon. Called once per second from the frontend while a
/// session is active.
///
/// `label` is shown as a freedesktop label (libayatana on Linux, NSStatusItem
/// title on macOS). On Windows the tray-icon crate's `set_title` is a no-op
/// so the label only shows on hover via the existing tooltip — not perfect,
/// but harmless. The icon swap works on all three platforms.
pub fn update_session_indicator(
    handle: &AppHandle,
    label: &str,
    progress: f32,
) -> tauri::Result<()> {
    let Some(tray) = handle.tray_by_id(TRAY_ID) else {
        return Ok(()); // tray not installed (rare — only if `install()` failed)
    };
    let img = tray_indicator::render_progress_icon(progress, TRAY_ICON_SIZE);
    let (w, h) = (img.width(), img.height());
    let icon = Image::new_owned(img.into_raw(), w, h);
    tray.set_icon(Some(icon))?;
    tray.set_title(Some(label))?;
    Ok(())
}

/// Restore the default tray icon + clear the text label. Called when the
/// session ends (auto, manual, or stale-cleanup).
pub fn reset_session_indicator(handle: &AppHandle) -> tauri::Result<()> {
    let Some(tray) = handle.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    // Decode the embedded base PNG to raw RGBA so we can hand it to
    // tauri::image::Image::new (which doesn't decode PNG by itself —
    // would require the `image-png` Tauri feature, but we already pull
    // the `image` crate for the indicator render anyway).
    let decoded = image::load_from_memory_with_format(BASE_ICON_PNG, image::ImageFormat::Png)
        .map_err(|e| tauri::Error::AssetNotFound(format!("decode base tray icon: {e}")))?
        .into_rgba8();
    let (w, h) = (decoded.width(), decoded.height());
    let icon = Image::new_owned(decoded.into_raw(), w, h);
    tray.set_icon(Some(icon))?;
    tray.set_title(None::<String>)?;
    Ok(())
}
