// Prevent a console window from popping up alongside the Tauri webview on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK 2.44+ has a DMA-BUF renderer that crashes on many Wayland
    // compositors with "Gdk-Message: Error 71 (Protocol error) dispatching
    // to Wayland display" — Fedora 43 + GNOME hits this reliably. Disabling
    // the DMA-BUF renderer falls back to a software path that works
    // everywhere. Must be set BEFORE any GTK code runs; doing it in main()
    // before flowshield_desktop_lib::run() is the earliest point.
    //
    // Setting the var on non-Linux platforms has no effect (no WebKitGTK
    // there). Users who deliberately set the var (including to "0" to opt
    // back into DMA-BUF on a known-good system) are respected.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    // When the binary is re-invoked as a privileged child by `pkexec` /
    // `osascript`, we run the requested blocking subcommand and exit
    // without booting the GUI. Returns None for normal launches.
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) = flowshield_desktop_lib::run_blocker_subcommand(&args) {
        std::process::exit(code);
    }

    flowshield_desktop_lib::run();
}
