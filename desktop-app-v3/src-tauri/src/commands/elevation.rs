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
//! - **Windows**: `powershell Start-Process -Verb RunAs -Wait` — UAC
//!   prompt. Using PowerShell instead of FFI'ing `ShellExecuteExW` keeps
//!   the dep tree small and the elevation logic readable. PowerShell ships
//!   with every Windows ≥ 7.
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
        // PowerShell's Start-Process -Verb RunAs triggers UAC. -Wait blocks
        // until the elevated child exits; -PassThru gives us the process
        // object so we can read $proc.ExitCode and forward it. We exit the
        // PowerShell host with the same code so our `run()` helper sees a
        // non-zero status when the child failed (or the user cancelled UAC,
        // which throws and falls into PowerShell's $? = false → exit 1).
        let exe_str = exe
            .to_str()
            .ok_or_else(|| AppError::Storage("exe path not valid UTF-8".into()))?
            .to_string();
        let argument_list = std::iter::once(subcommand.to_string())
            .chain(args.into_iter())
            .map(|s| ps_single_quote(&s))
            .collect::<Vec<_>>()
            .join(",");
        let script = format!(
            "$ErrorActionPreference='Stop'; \
             try {{ \
               $proc = Start-Process -FilePath {} -ArgumentList {} -Verb RunAs -Wait -PassThru -WindowStyle Hidden; \
               exit $proc.ExitCode \
             }} catch {{ \
               Write-Error $_; \
               exit 1 \
             }}",
            ps_single_quote(&exe_str),
            argument_list
        );
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
        return run(cmd, "powershell");
    }
}

#[cfg(target_os = "windows")]
fn ps_single_quote(s: &str) -> String {
    // PowerShell single-quoted strings: '' is a literal '. No other escapes.
    format!("'{}'", s.replace('\'', "''"))
}

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
