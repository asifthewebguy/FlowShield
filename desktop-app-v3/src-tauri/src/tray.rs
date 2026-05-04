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
use crate::update::UpdateInfo;
use crate::AppState;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconEvent;
use tauri::{App, AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

const TRAY_ID: &str = "main";
const SHOW_ID: &str = "show";
const QUIT_ID: &str = "quit";
const UPDATE_ID: &str = "update";

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
        UPDATE_ID => open_update_url(app),
        _ => {}
    }
}

/// Click handler for the dynamic "Updates available" menu item. Pulls the
/// most recent UpdateInfo out of AppState (set by `announce_update`) and
/// opens the channel-appropriate URL — GitHub Release page for direct
/// downloads, AUR/Flathub/etc. package page for PM channels.
fn open_update_url(app: &AppHandle) {
    let latest_update_arc = app.state::<AppState>().latest_update.clone();
    let url = match latest_update_arc.lock() {
        Ok(guard) => guard.as_ref().map(|info| info.release_url.clone()),
        Err(poisoned) => {
            tracing::warn!("latest_update mutex poisoned; recovering");
            poisoned.into_inner().as_ref().map(|info| info.release_url.clone())
        }
    };
    let Some(url) = url else {
        tracing::warn!("update menu clicked but no UpdateInfo cached — ignoring");
        return;
    };
    if let Err(e) = app.shell().open(&url, None) {
        tracing::warn!(error = %e, %url, "failed to open update URL");
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

/// Cache the new UpdateInfo and rebuild the tray menu with an "Updates
/// available" item prepended. Idempotent — calling this twice with the
/// same info is a no-op user-visible (the menu just gets rebuilt with the
/// same label). Called both from the periodic background check and from
/// the manual `update_check_now` command.
pub fn announce_update(handle: &AppHandle, info: &UpdateInfo) -> tauri::Result<()> {
    // Stash the URL where `open_update_url` can fetch it on click. Lock
    // contention isn't a concern — at most one writer (the check task) and
    // one reader (the menu click handler). We clone the Arc to detach the
    // guard's lifetime from `tauri::State`'s reference wrapper (which would
    // otherwise borrow a temporary).
    let latest_update_arc = handle.state::<AppState>().latest_update.clone();
    match latest_update_arc.lock() {
        Ok(mut guard) => *guard = Some(info.clone()),
        Err(poisoned) => *poisoned.into_inner() = Some(info.clone()),
    }

    let Some(tray) = handle.tray_by_id(TRAY_ID) else {
        return Ok(()); // tray install failed earlier — log already emitted
    };

    let label = format!("▲ Updates: {} available", info.latest_version);
    let update_item = MenuItem::with_id(handle, UPDATE_ID, &label, true, None::<&str>)?;
    let show = MenuItem::with_id(handle, SHOW_ID, "Show FlowShield", true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, QUIT_ID, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(handle, &[&update_item, &show, &quit])?;
    tray.set_menu(Some(menu))?;
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
