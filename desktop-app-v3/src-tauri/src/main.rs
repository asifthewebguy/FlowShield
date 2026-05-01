// Prevent a console window from popping up alongside the Tauri webview on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    flowshield_desktop_lib::run();
}
