// Prevent a console window from popping up alongside the Tauri webview on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // When the binary is re-invoked as a privileged child by `pkexec` /
    // `osascript`, we run the requested blocking subcommand and exit
    // without booting the GUI. Returns None for normal launches.
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) = flowshield_desktop_lib::run_blocker_subcommand(&args) {
        std::process::exit(code);
    }

    flowshield_desktop_lib::run();
}
