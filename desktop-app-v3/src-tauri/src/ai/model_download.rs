//! Model download infrastructure — disk-space precheck, sha256 verifier,
//! resumable HTTP Range downloader, multi-file orchestrator.
//!
//! Lifecycle:
//! - User confirms consent → `start_download(handle)` spawns a tokio task
//! - Task transitions ai_model_state.status: NotStarted → Downloading → Ready/Error
//! - Per-file progress events emitted to the frontend via `ai-model-progress`
//! - Final `ai-model-status-changed` event signals completion or failure

use crate::error::AiError;
use std::path::Path;

/// Available bytes on the volume containing `path`. Cross-platform: uses
/// `statvfs` on Unix, `GetDiskFreeSpaceExW` on Windows. Wrapping the raw
/// syscall here keeps the higher-level orchestrator portable.
#[cfg(unix)]
pub fn available_bytes(path: &Path) -> Result<u64, AiError> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let path_bytes = path.as_os_str().as_bytes();
    let cpath = CString::new(path_bytes)
        .map_err(|e| AiError::ModelDownload(format!("path with NUL byte: {e}")))?;

    // SAFETY: cpath is a valid CString; statvfs writes into a stack-local struct.
    unsafe {
        let mut buf: libc::statvfs = std::mem::zeroed();
        let rc = libc::statvfs(cpath.as_ptr(), &mut buf);
        if rc != 0 {
            return Err(AiError::ModelDownload(format!(
                "statvfs failed: {}",
                std::io::Error::last_os_error()
            )));
        }
        Ok((buf.f_bavail as u64) * (buf.f_frsize as u64))
    }
}

#[cfg(windows)]
pub fn available_bytes(path: &Path) -> Result<u64, AiError> {
    use std::os::windows::ffi::OsStrExt;

    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);

    // SAFETY: wide is null-terminated UTF-16; out param written into stack u64.
    unsafe {
        let mut free: u64 = 0;
        let rc = windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut free as *mut u64,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
        if rc == 0 {
            return Err(AiError::ModelDownload(format!(
                "GetDiskFreeSpaceExW failed: {}",
                std::io::Error::last_os_error()
            )));
        }
        Ok(free)
    }
}

/// Refuse to start a download if free space < `needed + 200 MB margin`.
/// The margin guards against partial-download conditions filling the disk.
pub fn check_space(target_dir: &Path, needed_bytes: u64) -> Result<(), AiError> {
    const MARGIN_BYTES: u64 = 200 * 1024 * 1024;
    let available = available_bytes(target_dir)?;
    let total_required = needed_bytes + MARGIN_BYTES;
    if available < total_required {
        return Err(AiError::DiskFull {
            needed_mb: total_required / (1024 * 1024),
            available_mb: available / (1024 * 1024),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn available_bytes_returns_nonzero_on_temp_dir() {
        let tmp = std::env::temp_dir();
        let avail = available_bytes(&tmp).expect("statvfs should succeed");
        assert!(avail > 0, "temp dir reported 0 free bytes (unrealistic)");
    }

    #[test]
    fn check_space_passes_when_plenty_free() {
        let tmp = std::env::temp_dir();
        assert!(check_space(&tmp, 1024).is_ok());
    }

    #[test]
    fn check_space_fails_with_unrealistic_request() {
        let tmp = std::env::temp_dir();
        let result = check_space(&tmp, u64::MAX / 2);
        match result {
            Err(AiError::DiskFull { needed_mb, available_mb }) => {
                assert!(needed_mb > available_mb, "expected DiskFull");
            }
            other => panic!("expected DiskFull, got {other:?}"),
        }
    }
}
