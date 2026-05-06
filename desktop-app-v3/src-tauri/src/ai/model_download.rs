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

use sha2::{Digest, Sha256};
use tokio::io::AsyncReadExt;

/// Compute the sha256 of a file at `path` by streaming through 64 KB chunks.
/// Returns the lowercase hex digest. Async because callers run inside the
/// tokio runtime; sync `std::fs` would block the executor on multi-GB models.
pub async fn sha256_file(path: &Path) -> Result<String, AiError> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| AiError::ModelDownload(format!("open {path:?}: {e}")))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .await
            .map_err(|e| AiError::ModelDownload(format!("read {path:?}: {e}")))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Verify a downloaded file against an expected hash. Empty-string `expected`
/// is treated as "skip verification" — used during Plans 1.3/1.4 development
/// when real hashes haven't been published yet. Production callers should
/// refuse to mark a file usable when the registry hash is empty.
pub async fn verify_sha256(path: &Path, expected: &str) -> Result<(), AiError> {
    if expected.is_empty() {
        tracing::warn!(?path, "sha256 verify skipped: empty expected hash (placeholder)");
        return Ok(());
    }
    let actual = sha256_file(path).await?;
    if actual.eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err(AiError::ModelDownload(format!(
            "sha256 mismatch for {path:?}: expected {expected}, got {actual}"
        )))
    }
}

use crate::ai::registry::ModelFile;
use std::time::Instant;
use tokio::io::AsyncWriteExt;

/// Progress callback shape: `(bytes_downloaded, bytes_total)`. Emit on every
/// 1 MB chunk to keep event traffic reasonable. The orchestrator wraps this
/// to forward into Tauri's event bus.
pub type ProgressFn = Box<dyn Fn(u64, u64) + Send + Sync>;

/// Download a single ModelFile to `target_path` with HTTP Range resumability.
/// If a partial file already exists, resumes from `len(file)` bytes.
/// After the body completes, verifies sha256 (if registry has a non-empty hash).
pub async fn download_file(
    http: &reqwest::Client,
    file: &ModelFile,
    target_path: &Path,
    on_progress: ProgressFn,
) -> Result<(), AiError> {
    if let Some(parent) = target_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AiError::ModelDownload(format!("mkdir {parent:?}: {e}")))?;
    }

    let already_downloaded = match tokio::fs::metadata(target_path).await {
        Ok(m) => m.len(),
        Err(_) => 0,
    };

    if already_downloaded == file.size_bytes && file.size_bytes > 0 {
        verify_sha256(target_path, file.sha256).await?;
        on_progress(file.size_bytes, file.size_bytes);
        return Ok(());
    }

    let mut req = http.get(file.url);
    if already_downloaded > 0 {
        req = req.header("Range", format!("bytes={already_downloaded}-"));
        tracing::info!(
            url = %file.url,
            resume_from = already_downloaded,
            "resuming partial download"
        );
    }

    let resp = req
        .send()
        .await
        .map_err(|e| AiError::ModelDownload(format!("GET {}: {e}", file.url)))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(AiError::ModelDownload(format!(
            "GET {} returned status {}",
            file.url, status
        )));
    }

    let mut out = tokio::fs::OpenOptions::new()
        .create(true)
        .append(already_downloaded > 0)
        .write(already_downloaded == 0)
        .truncate(already_downloaded == 0)
        .open(target_path)
        .await
        .map_err(|e| AiError::ModelDownload(format!("open {target_path:?}: {e}")))?;

    let total = file.size_bytes;
    let mut downloaded = already_downloaded;
    let mut last_emit = Instant::now();
    const EMIT_INTERVAL_BYTES: u64 = 1024 * 1024;
    let mut bytes_since_last_emit: u64 = 0;

    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AiError::ModelDownload(format!("body chunk: {e}")))?;
        out.write_all(&chunk)
            .await
            .map_err(|e| AiError::ModelDownload(format!("write {target_path:?}: {e}")))?;
        downloaded += chunk.len() as u64;
        bytes_since_last_emit += chunk.len() as u64;

        if bytes_since_last_emit >= EMIT_INTERVAL_BYTES
            || last_emit.elapsed().as_millis() >= 250
        {
            on_progress(downloaded, total);
            bytes_since_last_emit = 0;
            last_emit = Instant::now();
        }
    }

    out.flush()
        .await
        .map_err(|e| AiError::ModelDownload(format!("flush {target_path:?}: {e}")))?;
    on_progress(downloaded, total);

    verify_sha256(target_path, file.sha256).await?;
    Ok(())
}

use crate::ai::registry;
use crate::store::ai::{self as store_ai, ModelState, ModelStatus};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

/// Payload for the `ai-model-progress` Tauri event. Frontend listens to this
/// to render the consent-screen progress bar.
#[derive(Debug, Clone, Serialize)]
pub struct ProgressEvent {
    pub current_file: String,
    pub current_index: usize,
    pub total_files: usize,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub overall_bytes_downloaded: u64,
    pub overall_bytes_total: u64,
}

/// Resolve the directory model files live in: `app_data_dir/models/`.
pub fn models_dir(handle: &AppHandle) -> Result<PathBuf, AiError> {
    let dir = handle
        .path()
        .app_data_dir()
        .map_err(|e| AiError::ModelDownload(format!("app_data_dir: {e}")))?
        .join("models");
    Ok(dir)
}

/// Download every file in the registry into `app_data_dir/models/`. Updates
/// `ai_model_state.status` from Downloading → Ready (or → Error). Emits
/// `ai-model-progress` per chunk and `ai-model-status-changed` on transition.
pub async fn run_download(
    handle: &AppHandle,
    http: &reqwest::Client,
    db: &crate::store::Db,
) -> Result<(), AiError> {
    let target_dir = models_dir(handle)?;
    let total_bytes = registry::total_download_bytes();

    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| AiError::ModelDownload(format!("mkdir {target_dir:?}: {e}")))?;
    check_space(&target_dir, total_bytes)?;

    transition_status(db, ModelStatus::Downloading)?;
    emit_status_changed(handle, ModelStatus::Downloading);

    let files = registry::all_files();
    let mut overall: u64 = 0;
    let total_files = files.len();

    for (idx, file) in files.iter().enumerate() {
        let target = target_dir.join(file.local_filename);
        let handle_for_cb = handle.clone();
        let filename = file.local_filename.to_string();
        let file_total = file.size_bytes;
        let overall_so_far = overall;

        let progress = move |bytes_dl: u64, _file_total: u64| {
            let _ = handle_for_cb.emit(
                "ai-model-progress",
                ProgressEvent {
                    current_file: filename.clone(),
                    current_index: idx,
                    total_files,
                    bytes_downloaded: bytes_dl,
                    bytes_total: file_total,
                    overall_bytes_downloaded: overall_so_far + bytes_dl,
                    overall_bytes_total: total_bytes,
                },
            );
        };

        if let Err(e) = download_file(http, file, &target, Box::new(progress)).await {
            let _ = transition_status(db, ModelStatus::Error);
            emit_status_changed(handle, ModelStatus::Error);
            return Err(e);
        }

        overall += file.size_bytes;
    }

    let now = chrono::Utc::now().to_rfc3339();
    let model_path = target_dir
        .join(registry::LLM_FILES[0].local_filename)
        .to_string_lossy()
        .to_string();
    let embedder_path = target_dir
        .join(registry::EMBEDDER_FILES[0].local_filename)
        .to_string_lossy()
        .to_string();

    let state = ModelState {
        model_id: registry::LLM_ID.to_string(),
        model_path,
        model_sha256: registry::LLM_FILES[0].sha256.to_string(),
        embedder_id: registry::EMBEDDER_ID.to_string(),
        embedder_path,
        embedder_sha256: registry::EMBEDDER_FILES[0].sha256.to_string(),
        downloaded_at: Some(now),
        status: ModelStatus::Ready,
    };

    {
        let conn = db
            .lock()
            .map_err(|_| AiError::ModelDownload("db mutex poisoned".into()))?;
        store_ai::upsert_model_state(&conn, &state)
            .map_err(|e| AiError::ModelDownload(format!("upsert_model_state: {e}")))?;
    }

    emit_status_changed(handle, ModelStatus::Ready);
    Ok(())
}

fn transition_status(db: &crate::store::Db, new_status: ModelStatus) -> Result<(), AiError> {
    let conn = db
        .lock()
        .map_err(|_| AiError::ModelDownload("db mutex poisoned".into()))?;

    let existing = store_ai::get_model_state(&conn)
        .map_err(|e| AiError::ModelDownload(format!("get_model_state: {e}")))?;

    let next = match existing {
        Some(mut s) => {
            s.status = new_status;
            s
        }
        None => ModelState {
            model_id: registry::LLM_ID.to_string(),
            model_path: String::new(),
            model_sha256: String::new(),
            embedder_id: registry::EMBEDDER_ID.to_string(),
            embedder_path: String::new(),
            embedder_sha256: String::new(),
            downloaded_at: None,
            status: new_status,
        },
    };

    store_ai::upsert_model_state(&conn, &next)
        .map_err(|e| AiError::ModelDownload(format!("upsert: {e}")))
}

fn emit_status_changed(handle: &AppHandle, status: ModelStatus) {
    let _ = handle.emit("ai-model-status-changed", &status);
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

    use std::io::Write;

    fn write_temp_file(content: &[u8]) -> tempfile::NamedTempFile {
        let mut f = tempfile::NamedTempFile::new().expect("temp file");
        f.write_all(content).expect("write");
        f
    }

    #[tokio::test]
    async fn sha256_of_known_input_is_known_hash() {
        let f = write_temp_file(b"hello world");
        let got = sha256_file(f.path()).await.unwrap();
        assert_eq!(got, "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    }

    #[tokio::test]
    async fn verify_sha256_passes_on_match() {
        let f = write_temp_file(b"hello world");
        verify_sha256(f.path(), "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9")
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn verify_sha256_passes_case_insensitively() {
        let f = write_temp_file(b"hello world");
        verify_sha256(f.path(), "B94D27B9934D3E08A52E52D7DA7DABFAC484EFE37A5380EE9088F7ACE2EFCDE9")
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn verify_sha256_fails_on_mismatch() {
        let f = write_temp_file(b"hello world");
        let result = verify_sha256(f.path(), "0000000000000000000000000000000000000000000000000000000000000000").await;
        assert!(matches!(result, Err(AiError::ModelDownload(_))));
    }

    #[tokio::test]
    async fn verify_sha256_skips_when_expected_empty() {
        let f = write_temp_file(b"hello world");
        verify_sha256(f.path(), "").await.unwrap();
    }

    #[tokio::test]
    async fn download_file_writes_complete_body() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let body = b"hello world".to_vec();
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model.bin"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(body.clone()))
            .mount(&server)
            .await;

        let url_owned = format!("{}/model.bin", server.uri());
        let url: &'static str = Box::leak(url_owned.into_boxed_str());

        let file = ModelFile {
            url,
            local_filename: "test.bin",
            sha256: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
            size_bytes: body.len() as u64,
        };

        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("test.bin");
        let progress: std::sync::Arc<std::sync::Mutex<Vec<(u64, u64)>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let progress_clone = progress.clone();

        let http = reqwest::Client::new();
        download_file(
            &http,
            &file,
            &target,
            Box::new(move |d, t| progress_clone.lock().unwrap().push((d, t))),
        )
        .await
        .unwrap();

        let written = tokio::fs::read(&target).await.unwrap();
        assert_eq!(written, body);

        let progress_log = progress.lock().unwrap();
        assert!(!progress_log.is_empty());
        let last = progress_log.last().unwrap();
        assert_eq!(last.0, body.len() as u64);
        assert_eq!(last.1, body.len() as u64);
    }

    #[tokio::test]
    async fn download_file_resumes_from_partial() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let full = b"hello world".to_vec();
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/m"))
            .and(header("range", "bytes=6-"))
            .respond_with(ResponseTemplate::new(206).set_body_bytes(b"world".to_vec()))
            .mount(&server)
            .await;

        let url_owned = format!("{}/m", server.uri());
        let url: &'static str = Box::leak(url_owned.into_boxed_str());

        let file = ModelFile {
            url,
            local_filename: "m",
            sha256: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
            size_bytes: full.len() as u64,
        };

        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("m");
        tokio::fs::write(&target, b"hello ").await.unwrap();

        let http = reqwest::Client::new();
        download_file(&http, &file, &target, Box::new(|_, _| {})).await.unwrap();

        let final_bytes = tokio::fs::read(&target).await.unwrap();
        assert_eq!(final_bytes, full);
    }
}
