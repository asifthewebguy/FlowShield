//! Cross-platform "spawn self with admin privileges" helper.
//!
//! Pattern: for operations that need root (writing /etc/hosts, etc.) we
//! re-invoke our own binary as a privileged subprocess via the OS's
//! standard prompt mechanism. The same Rust code path runs in the child;
//! the GUI process never holds elevated privileges.
//!
//! - **Linux**: `pkexec /proc/self/exe <subcommand> <args...>` — polkit
//!   shows a graphical password prompt; default polkit rules already let
//!   admin-group members elevate without extra `.policy` files.
//! - **macOS**: `osascript -e 'do shell script "..." with administrator
//!   privileges'` — Keychain / TouchID prompt.
//! - **Windows**: not yet wired up. Returns a clear error so the frontend
//!   can show a "launch as administrator" toast. Real fix is `ShellExecuteW`
//!   with the `runas` verb — phase 6.6.
//!
//! Cancelled prompts (user dismisses the password dialog) surface as a
//! non-zero exit status, which we map to an `AppError::Storage` with a
//! user-readable message.

use crate::error::{AppError, AppResult};
use std::process::Command;

pub fn run_self_elevated(subcommand: &str, args: Vec<String>) -> AppResult<()> {
    let exe = std::env::current_exe()
        .map_err(|e| AppError::Storage(format!("current_exe: {e}")))?;

    #[cfg(target_os = "linux")]
    {
        let mut cmd = Command::new("pkexec");
        cmd.arg(&exe).arg(subcommand).args(&args);
        return run(cmd, "pkexec");
    }

    #[cfg(target_os = "macos")]
    {
        let exe_quoted = quote_for_osascript(&exe.to_string_lossy());
        let args_quoted: String = std::iter::once(subcommand.to_string())
            .chain(args.into_iter())
            .map(|s| quote_for_osascript(&s))
            .collect::<Vec<_>>()
            .join(" ");
        let script = format!(
            "do shell script \"{} {}\" with administrator privileges",
            exe_quoted, args_quoted
        );
        let mut cmd = Command::new("osascript");
        cmd.args(["-e", &script]);
        return run(cmd, "osascript");
    }

    #[cfg(target_os = "windows")]
    {
        let _ = (exe, subcommand, args);
        Err(AppError::Storage(
            "Windows UAC elevation isn't wired up yet — for now, launch the app as administrator manually."
                .into(),
        ))
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn run(mut cmd: Command, name: &str) -> AppResult<()> {
    let status = cmd
        .status()
        .map_err(|e| AppError::Storage(format!("spawn {name}: {e}")))?;
    if !status.success() {
        return Err(AppError::Storage(format!(
            "{name} exited with {} — the elevation prompt may have been cancelled",
            status
                .code()
                .map(|c| c.to_string())
                .unwrap_or_else(|| "(no code)".into())
        )));
    }
    Ok(())
}

/// Escape a string so it can be embedded inside an `osascript`
/// `do shell script "..."` argument. We end up with two escape layers:
///   1. The outer Rust `format!` already wraps the script in `"..."`.
///   2. AppleScript's `do shell script` expects POSIX-shell quoting inside
///      the string, where backslash + double-quote escape the inner pieces.
/// Wrapping each token in escaped double-quotes (`\"...\"`) is the
/// conventional shape and survives spaces in paths.
#[cfg(target_os = "macos")]
fn quote_for_osascript(s: &str) -> String {
    let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\\\"{}\\\"", escaped)
}
