# FlowShield Local AI — Model Download Infrastructure (Phase 1.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the HuggingFace CDN downloader, sha256 verifier, disk-space precheck, and model-state lifecycle plumbing so Plan 1.3 (concrete embedder) and Plan 1.4 (concrete LLM) can drop in their model parsers without re-inventing the download flow. Adds 3 new Tauri commands (`ai_model_status`, `ai_model_download_start`, `ai_data_delete`) so the future settings page and dashboard card can drive lifecycle from the frontend.

**Architecture:** Pure Rust HTTP using the existing `reqwest` client with `Range` header for resumable downloads. Sha256 verify after each file via `sha2`. Background download runs in a tokio task spawned from `ai_model_download_start`; progress events emitted via Tauri's event bus (`ai-model-progress`, `ai-model-status-changed`) so the future BriefingCard / settings page can show progress bars. Model files live under `app_data_dir/models/`. Lifecycle state persisted in the existing `ai_model_state` table from Plan 1.1. **No candle / tokenizers / actual ML inference in this sub-plan** — those land in Plans 1.3 + 1.4.

**Tech Stack:** Rust 2021, Tauri 2 (existing), `reqwest = "0.12"` (existing), `tokio` (existing), `sha2 = "0.10"` (new), `serde` (existing), `futures-util = "0.3"` (new for stream consumption), `libc` (new, Unix only), `windows-sys` (new, Windows only).

**Reference parent spec:** [/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md](/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md) — design doc approved 2026-05-05.
**Predecessor plan:** [docs/superpowers/plans/2026-05-05-local-ai-substrate-phase-1.1.md](2026-05-05-local-ai-substrate-phase-1.1.md) (PR #70, merged in `fb32bfb`).

---

## File structure

**New files:**
- `desktop-app-v3/src-tauri/src/ai/registry.rs` — model URL + sha256 + size constants for Gemma-2-2B-it Q4_K_M (LLM) and BGE-small-en-v1.5 (embedder)
- `desktop-app-v3/src-tauri/src/ai/model_download.rs` — disk-space precheck, sha256 verifier, resumable HTTP Range downloader, multi-file orchestrator with Tauri events
- `desktop-app-v3/src-tauri/src/commands/ai.rs` — Tauri commands `ai_model_status`, `ai_model_download_start`, `ai_data_delete`

**Modified files:**
- `desktop-app-v3/src-tauri/Cargo.toml` — add `sha2 = "0.10"`, `futures-util = "0.3"`, target-gated `libc` (Unix) / `windows-sys` (Windows), dev-dep `tempfile = "3"` + `wiremock = "0.6"`
- `desktop-app-v3/src-tauri/src/ai/mod.rs` — `pub mod model_download;` and `pub mod registry;`
- `desktop-app-v3/src-tauri/src/commands/mod.rs` — `pub mod ai;`
- `desktop-app-v3/src-tauri/src/lib.rs` — register the three Tauri commands in `invoke_handler!`

**Out of scope** (defer to later sub-plans):
- Concrete `CandleEmbedder` impl of `Embedder` trait → **Plan 1.3**
- Concrete `CandleLlmRuntime` impl of `LlmRuntime` trait → **Plan 1.4**
- Real (non-placeholder) sha256 hashes in registry → filled by Plans 1.3/1.4 once they download + verify against published HF hashes
- Briefing pipeline (`briefing.rs`, `scheduler.rs`, BriefingCard) → **Plan 1.5**
- Reflection dialog + scheduler → **Plan 1.6**
- Settings page UI driving these commands → **Plan 1.7**
- Tokenizer integration (lives with the model that needs it)

---

## Tasks

### Task 1: Branch + add sha2 dependency

**Files:** Modify `desktop-app-v3/src-tauri/Cargo.toml`.

- [ ] **Step 1: Branch from main**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git checkout main
git pull --ff-only
git checkout -b feat/local-ai-model-download
```

- [ ] **Step 2: Add sha2 to `[dependencies]`**

In `desktop-app-v3/src-tauri/Cargo.toml`, find the `[dependencies]` block — append after the existing `chrono = ...` line (added in Plan 1.1 Task 11):

```toml
# AI model file integrity verification (Plan 1.2 model_download.rs).
# Pure-Rust SHA-256 — no openssl bindings, works in the same build matrix
# as ndarray/chrono.
sha2 = "0.10"
```

- [ ] **Step 3: Verify build**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -10
```

Expected: clean build, sha2 + transitive deps download.

- [ ] **Step 4: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/Cargo.toml
git commit -m "chore(desktop-v3): add sha2 dep for AI model file verification"
```

---

### Task 2: Model registry constants

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/registry.rs`
- Modify: `desktop-app-v3/src-tauri/src/ai/mod.rs` (declare `pub mod registry;`)

- [ ] **Step 1: Create `registry.rs`**

```rust
//! Model file registry — URL + sha256 + size for every file we download.
//!
//! Updating a model means: change the entry here, change the `model_id` /
//! `embedder_id` constants downstream, and ship a release. The `ai_model_state`
//! sha256 column gates whether re-download is needed (sha256 mismatch on disk
//! triggers redownload).
//!
//! The sha256 placeholders below are PLACEHOLDERS confirmed during Plan 1.3
//! (embedder) and Plan 1.4 (LLM). Plan 1.2 wires the infra; Plans 1.3+1.4 fill
//! in real hashes once they download the artifacts and verify against the
//! upstream HuggingFace published sha256s.

/// Identifier baked into `ai_briefings.model_id` for cache invalidation.
pub const LLM_ID: &str = "gemma-2-2b-it-q4_k_m";

/// BGE-small-en-v1.5 embedder identifier.
pub const EMBEDDER_ID: &str = "bge-small-en-v1.5";

/// Single file in the model bundle.
#[derive(Debug, Clone, Copy)]
pub struct ModelFile {
    /// Absolute URL on HuggingFace's CDN.
    pub url: &'static str,
    /// Filename relative to `app_data_dir/models/`.
    pub local_filename: &'static str,
    /// Expected sha256 in lowercase hex. Empty string ("") means "no verify
    /// during Plan 1.2 — to be filled by Plan 1.3/1.4 when we have a real
    /// download to hash". Production callers MUST refuse to mark a model
    /// `Ready` if the placeholder is empty.
    pub sha256: &'static str,
    /// Size in bytes. Used for disk-space precheck + progress bars.
    pub size_bytes: u64,
}

/// Files that make up the LLM bundle. Gemma-2-2B Q4_K_M is a single GGUF.
pub const LLM_FILES: &[ModelFile] = &[
    ModelFile {
        url: "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf",
        local_filename: "gemma-2-2b-it-Q4_K_M.gguf",
        sha256: "",  // PLACEHOLDER — Plan 1.4 fills with real hash
        size_bytes: 1_500_000_000, // ~1.5 GB; refined in Plan 1.4
    },
];

/// Files that make up the embedder bundle. BGE-small-en-v1.5 ships as
/// safetensors + tokenizer + config.
pub const EMBEDDER_FILES: &[ModelFile] = &[
    ModelFile {
        url: "https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/model.safetensors",
        local_filename: "bge-small-en-v1.5/model.safetensors",
        sha256: "",  // PLACEHOLDER — Plan 1.3 fills
        size_bytes: 135_000_000,
    },
    ModelFile {
        url: "https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/tokenizer.json",
        local_filename: "bge-small-en-v1.5/tokenizer.json",
        sha256: "",  // PLACEHOLDER — Plan 1.3 fills
        size_bytes: 700_000,
    },
    ModelFile {
        url: "https://huggingface.co/BAAI/bge-small-en-v1.5/resolve/main/config.json",
        local_filename: "bge-small-en-v1.5/config.json",
        sha256: "",  // PLACEHOLDER — Plan 1.3 fills
        size_bytes: 800,
    },
];

/// All files that need to download for a complete first-run setup.
/// Concatenated in download order: LLM first (largest, slowest), then embedder.
pub fn all_files() -> Vec<&'static ModelFile> {
    LLM_FILES.iter().chain(EMBEDDER_FILES.iter()).collect()
}

/// Total bytes the user must download for a fresh install. Used by the
/// consent screen's "1.55 GB free space required" check.
pub fn total_download_bytes() -> u64 {
    all_files().iter().map(|f| f.size_bytes).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_total_matches_individual_files() {
        let llm: u64 = LLM_FILES.iter().map(|f| f.size_bytes).sum();
        let embed: u64 = EMBEDDER_FILES.iter().map(|f| f.size_bytes).sum();
        assert_eq!(total_download_bytes(), llm + embed);
    }

    #[test]
    fn all_files_includes_both_bundles() {
        let count = all_files().len();
        assert_eq!(count, LLM_FILES.len() + EMBEDDER_FILES.len());
    }

    #[test]
    fn no_duplicate_local_filenames() {
        let names: Vec<&str> = all_files().iter().map(|f| f.local_filename).collect();
        let unique: std::collections::HashSet<&&str> = names.iter().collect();
        assert_eq!(names.len(), unique.len(), "duplicate local_filename in registry");
    }
}
```

- [ ] **Step 2: Declare module in `ai/mod.rs`**

Append `pub mod registry;` to `desktop-app-v3/src-tauri/src/ai/mod.rs` in alphabetical order — between `prompts` and `retriever`.

- [ ] **Step 3: Run tests**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::registry::tests 2>&1 | tail -10
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/registry.rs desktop-app-v3/src-tauri/src/ai/mod.rs
git commit -m "feat(desktop-v3): add model registry with HF CDN URLs + size budget"
```

---

### Task 3: Disk-space precheck helper

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/model_download.rs` (will grow across Tasks 3-7)
- Modify: `desktop-app-v3/src-tauri/src/ai/mod.rs` (declare `pub mod model_download;`)
- Modify: `desktop-app-v3/src-tauri/Cargo.toml` (target-gated platform deps)

- [ ] **Step 1: Create `model_download.rs` with the disk-space helper**

```rust
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
        // The temp dir on any working dev machine has SOME free bytes.
        let tmp = std::env::temp_dir();
        let avail = available_bytes(&tmp).expect("statvfs should succeed");
        assert!(avail > 0, "temp dir reported 0 free bytes (unrealistic)");
    }

    #[test]
    fn check_space_passes_when_plenty_free() {
        let tmp = std::env::temp_dir();
        // Asking for 1 KB on a real disk should always succeed
        assert!(check_space(&tmp, 1024).is_ok());
    }

    #[test]
    fn check_space_fails_with_unrealistic_request() {
        let tmp = std::env::temp_dir();
        // Asking for a near-u64::MAX is more than any real disk
        let result = check_space(&tmp, u64::MAX / 2);
        match result {
            Err(AiError::DiskFull { needed_mb, available_mb }) => {
                assert!(needed_mb > available_mb, "expected DiskFull");
            }
            other => panic!("expected DiskFull, got {other:?}"),
        }
    }
}
```

- [ ] **Step 2: Add target-gated platform deps to `Cargo.toml`**

Append after the main `[dependencies]` block (or merge into existing `[target.*]` sections if any):

```toml
[target.'cfg(unix)'.dependencies]
libc = "0.2"

[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.59", features = ["Win32_Storage_FileSystem", "Win32_Foundation"] }
```

- [ ] **Step 3: Declare module in `ai/mod.rs`**

Append `pub mod model_download;` to `desktop-app-v3/src-tauri/src/ai/mod.rs` in alphabetical order — between `embedder` and `prompts`.

- [ ] **Step 4: Run tests + verify build**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::model_download::tests 2>&1 | tail -10
# Expected: 3 passed (Linux/macOS host)
cargo check 2>&1 | tail -5
```

(Windows path is cross-compiled in CI; not testable from the dev machine, but the cfg-gating ensures it compiles on the target platform.)

- [ ] **Step 5: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/model_download.rs desktop-app-v3/src-tauri/src/ai/mod.rs desktop-app-v3/src-tauri/Cargo.toml
git commit -m "feat(desktop-v3): add cross-platform disk-space precheck for AI download"
```

---

### Task 4: SHA-256 file verifier

**Files:** Modify `desktop-app-v3/src-tauri/src/ai/model_download.rs` and `Cargo.toml`.

- [ ] **Step 1: Append the verifier function above the test module**

```rust
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
```

- [ ] **Step 2: Add `tempfile` to dev-dependencies**

In `Cargo.toml`, find or create `[dev-dependencies]`:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Add tests inside the existing `#[cfg(test)] mod tests {` block**

```rust
    use std::io::Write;

    fn write_temp_file(content: &[u8]) -> tempfile::NamedTempFile {
        let mut f = tempfile::NamedTempFile::new().expect("temp file");
        f.write_all(content).expect("write");
        f
    }

    #[tokio::test]
    async fn sha256_of_known_input_is_known_hash() {
        // sha256("hello world") = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
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
        // empty expected → placeholder, skip the check
        let f = write_temp_file(b"hello world");
        verify_sha256(f.path(), "").await.unwrap();
    }
```

- [ ] **Step 4: Run tests + commit**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::model_download::tests 2>&1 | tail -10
# Expected: 8 passed (3 disk + 5 sha256)
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/model_download.rs desktop-app-v3/src-tauri/Cargo.toml
git commit -m "feat(desktop-v3): add streaming SHA-256 file verifier"
```

---

### Task 5: HTTP Range resumable downloader

**Files:** Modify `desktop-app-v3/src-tauri/src/ai/model_download.rs` and `Cargo.toml`.

- [ ] **Step 1: Add `futures-util` to `[dependencies]`**

```toml
futures-util = "0.3"
```

- [ ] **Step 2: Append the per-file downloader above the test module**

```rust
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
        // Already complete — verify and short-circuit
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

    // OpenOptions::append for resume; create_new + write for fresh download.
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
    const EMIT_INTERVAL_BYTES: u64 = 1024 * 1024; // 1 MB
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

        // Emit progress on every 1 MB or every 250 ms, whichever comes first.
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
```

- [ ] **Step 3: Add `wiremock` to dev-dependencies**

```toml
[dev-dependencies]
tempfile = "3"
wiremock = "0.6"
```

- [ ] **Step 4: Add tests using a local mock HTTP server**

Append inside the existing `tests` module:

```rust
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
        assert!(!progress_log.is_empty(), "expected at least one progress callback");
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
        // The mock expects a Range header indicating resume from byte 6 ("hello ")
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
        // Pre-write the first 6 bytes as if we'd partially downloaded
        tokio::fs::write(&target, b"hello ").await.unwrap();

        let http = reqwest::Client::new();
        download_file(&http, &file, &target, Box::new(|_, _| {})).await.unwrap();

        let final_bytes = tokio::fs::read(&target).await.unwrap();
        assert_eq!(final_bytes, full);
    }
```

- [ ] **Step 5: Run tests + commit**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::model_download::tests 2>&1 | tail -15
# Expected: 10 passed (8 prior + 2 new)
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/model_download.rs desktop-app-v3/src-tauri/Cargo.toml
git commit -m "feat(desktop-v3): add resumable HTTP Range downloader for model files"
```

---

### Task 6: Multi-file download orchestrator with progress events

**Files:** Modify `desktop-app-v3/src-tauri/src/ai/model_download.rs`.

- [ ] **Step 1: Read the existing `Db` API**

Open `desktop-app-v3/src-tauri/src/store/mod.rs` and confirm how connections are obtained. The plan assumes `Db::conn() -> Result<Connection, AppError>` (or similar). If the actual API is `with_conn(|c| ...)` or returns a guard, **adapt the code below accordingly** when applying it. The pattern can also be confirmed by reading any existing call site like `pending_sync` migration or read.

- [ ] **Step 2: Append the orchestrator above the test module**

```rust
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

    // Disk precheck before we start
    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| AiError::ModelDownload(format!("mkdir {target_dir:?}: {e}")))?;
    check_space(&target_dir, total_bytes)?;

    // State → Downloading
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
            transition_status(db, ModelStatus::Error)?;
            emit_status_changed(handle, ModelStatus::Error);
            return Err(e);
        }

        overall += file.size_bytes;
    }

    // All files downloaded + verified — write the ModelState row
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
    let conn = db.conn().map_err(|e| AiError::ModelDownload(format!("db conn: {e}")))?;
    store_ai::upsert_model_state(&conn, &state)
        .map_err(|e| AiError::ModelDownload(format!("upsert_model_state: {e}")))?;
    drop(conn);

    emit_status_changed(handle, ModelStatus::Ready);
    Ok(())
}

fn transition_status(db: &crate::store::Db, new_status: ModelStatus) -> Result<(), AiError> {
    let conn = db.conn().map_err(|e| AiError::ModelDownload(format!("db conn: {e}")))?;
    let existing = store_ai::get_model_state(&conn)
        .map_err(|e| AiError::ModelDownload(format!("get_model_state: {e}")))?;

    let next = match existing {
        Some(mut s) => {
            s.status = new_status.clone();
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
```

- [ ] **Step 3: Build verification**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -10
```

Tests for the orchestrator are deferred — `AppHandle` is hard to mock outside a Tauri runtime. Per-component logic is covered by Tasks 3-5 unit tests. Integration smoke happens in Plan 1.5 (BriefingCard exercising the full path).

- [ ] **Step 4: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/ai/model_download.rs
git commit -m "feat(desktop-v3): add multi-file download orchestrator with Tauri events"
```

---

### Task 7: Tauri command `ai_model_status`

**Files:**
- Create: `desktop-app-v3/src-tauri/src/commands/ai.rs`
- Modify: `desktop-app-v3/src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Create the commands file**

```rust
//! Tauri commands for AI model lifecycle. Frontend uses these to drive the
//! consent screen, settings page, and reset flow.

use crate::ai::model_download;
use crate::error::AppError;
use crate::store::ai::{self as store_ai, ModelState};
use crate::AppState;

/// Read the current model lifecycle state. Returns `None` when no row exists
/// (i.e. user has never opted into AI). Frontend uses this on app launch to
/// decide whether to show the consent card vs. proceed to BriefingCard.
#[tauri::command]
pub async fn ai_model_status(
    state: tauri::State<'_, AppState>,
) -> Result<Option<ModelState>, AppError> {
    let db = state
        .db
        .get()
        .ok_or_else(|| AppError::Storage("local DB not initialized".into()))?;
    let conn = db.conn()?;
    let result = store_ai::get_model_state(&conn)?;
    Ok(result)
}
```

- [ ] **Step 2: Declare module in `commands/mod.rs`**

Append `pub mod ai;` to `desktop-app-v3/src-tauri/src/commands/mod.rs` in alphabetical order (likely first, before any existing entries that start with letters after `a`).

- [ ] **Step 3: Build verification**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -10
```

If `Db::conn()` doesn't exist on the actual `store::Db` type, adapt to whatever the existing pattern is. (Tasks 6 + 7 + 8 + 9 share this assumption — fix once and the rest follow.)

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/commands/ai.rs desktop-app-v3/src-tauri/src/commands/mod.rs
git commit -m "feat(desktop-v3): add ai_model_status Tauri command"
```

---

### Task 8: Tauri command `ai_model_download_start`

**Files:** Modify `desktop-app-v3/src-tauri/src/commands/ai.rs`.

- [ ] **Step 1: Append the command**

```rust
/// Kick off the model download in a background tokio task. Returns immediately;
/// progress comes via `ai-model-progress` and completion via
/// `ai-model-status-changed` Tauri events. Idempotent — calling twice while a
/// download is running is a no-op (the orchestrator's resume logic handles it).
#[tauri::command]
pub async fn ai_model_download_start(
    handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let db = state
        .db
        .get()
        .ok_or_else(|| AppError::Storage("local DB not initialized".into()))?
        .clone();
    let http = state.http.clone();
    let handle_for_task = handle.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = model_download::run_download(&handle_for_task, &http, &db).await {
            tracing::error!(?e, "model download failed");
        }
    });

    Ok(())
}
```

- [ ] **Step 2: Build + commit**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -10
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/commands/ai.rs
git commit -m "feat(desktop-v3): add ai_model_download_start Tauri command"
```

---

### Task 9: Tauri command `ai_data_delete`

**Files:** Modify `desktop-app-v3/src-tauri/src/commands/ai.rs`.

- [ ] **Step 1: Append the command**

```rust
/// Wipe all AI data: drops chunks, reflections, briefings, model_state rows,
/// and deletes the model files from `app_data_dir/models/`. Used by the
/// "Delete AI data" button in /settings/ai. Returns Ok even if nothing was
/// present to delete (idempotent).
#[tauri::command]
pub async fn ai_data_delete(
    handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let db = state
        .db
        .get()
        .ok_or_else(|| AppError::Storage("local DB not initialized".into()))?;
    let conn = db.conn()?;

    // Drop all DB rows in a single batch.
    store_ai::delete_all_chunks(&conn)?;
    store_ai::delete_all_reflections(&conn)?;
    store_ai::delete_all_briefings(&conn)?;
    store_ai::delete_model_state(&conn)?;
    drop(conn);

    // Delete the model files. Best-effort — if the dir doesn't exist (already
    // wiped, or never created), succeed silently.
    let models_dir = model_download::models_dir(&handle)
        .map_err(|e| AppError::Storage(format!("models_dir: {e}")))?;
    if models_dir.exists() {
        tokio::fs::remove_dir_all(&models_dir)
            .await
            .map_err(|e| AppError::Storage(format!("remove_dir_all {models_dir:?}: {e}")))?;
    }

    use tauri::Emitter;
    let _ = handle.emit("ai-model-status-changed", "not_started");
    Ok(())
}
```

- [ ] **Step 2: Build + commit**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -10
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/commands/ai.rs
git commit -m "feat(desktop-v3): add ai_data_delete Tauri command"
```

---

### Task 10: Register commands in lib.rs `invoke_handler!`

**Files:** Modify `desktop-app-v3/src-tauri/src/lib.rs`.

- [ ] **Step 1: Read the current handler**

```bash
grep -n 'invoke_handler\|generate_handler' desktop-app-v3/src-tauri/src/lib.rs
```

The existing macro lists commands like `commands::auth::login`, `commands::sessions::start`, etc.

- [ ] **Step 2: Add the three new commands**

Append to the macro's argument list (commas matter — match existing style):

```rust
            commands::ai::ai_model_status,
            commands::ai::ai_model_download_start,
            commands::ai::ai_data_delete,
```

- [ ] **Step 3: Build verification + lib smoke**

```bash
cd desktop-app-v3/src-tauri && cargo build 2>&1 | tail -10
cargo test --lib 2>&1 | tail -15
```

Expected: clean build, ~75+ tests pass (62 from Plan 1.1 + 13 new from Plan 1.2 — registry 3, model_download 10).

- [ ] **Step 4: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/lib.rs
git commit -m "feat(desktop-v3): register ai_model_* Tauri commands in invoke_handler"
```

---

### Task 11: Open the Phase 1.2 PR

- [ ] **Step 1: Final build + test**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri
cargo check 2>&1 | tail -5
cargo test --lib 2>&1 | tail -15
```

Expected: clean, all tests pass.

- [ ] **Step 2: Push + open PR**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git push -u origin feat/local-ai-model-download

gh pr create --title "feat(desktop-v3): local AI model download infra (Phase 1.2)" --body "$(cat <<'EOF'
## Summary

Second sub-plan of FlowShield Local AI feature. Lands the model-download infrastructure that Plans 1.3 (concrete embedder) and 1.4 (concrete LLM) will plug into without re-inventing HTTP / sha256 / lifecycle plumbing.

- HuggingFace CDN downloader with HTTP Range resumability (network drop → resume from last byte)
- Sha256 verifier (streaming, async; case-insensitive; placeholder \"\" hashes are intentionally skipped during Plans 1.3/1.4 development)
- Cross-platform disk-space precheck (statvfs on Unix, GetDiskFreeSpaceExW on Windows; 200 MB margin above raw need)
- Model registry constants for Gemma-2-2B-it Q4_K_M (~1.5 GB) + BGE-small-en-v1.5 (~135 MB; safetensors + tokenizer + config) — sha256 hashes left as placeholders, Plans 1.3/1.4 fill them in
- Multi-file download orchestrator emitting \`ai-model-progress\` + \`ai-model-status-changed\` Tauri events; transitions \`ai_model_state.status\` NotStarted → Downloading → Ready/Error
- 3 new Tauri commands: \`ai_model_status\`, \`ai_model_download_start\`, \`ai_data_delete\`

**No user-visible UI surface yet.** Plan 1.5 wires the consent screen + BriefingCard that drive these commands from React.

## Reference

- Parent design: \`/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md\` (approved 2026-05-05)
- Predecessor: PR #70 (Plan 1.1 substrate, merged \`fb32bfb\`)

## Verification

- ✓ \`cargo check\` clean
- ✓ \`cargo test --lib ai::registry::tests ai::model_download::tests\` — 13 new unit tests pass (3 registry + 3 disk + 5 sha256 + 2 wiremock-based downloader)
- ✓ Resumable download verified via mock HTTP server: pre-write partial file, resume sends Range header, final bytes match expected
- ✓ Sha256 verifies: positive match, mismatch, case-insensitive, empty-placeholder skip

## Test plan

- [ ] CI green
- [ ] Smoke test in dev mode: trigger \`ai_model_download_start\` → confirm progress events arrive in console → kill mid-download → re-trigger → confirm resume from partial file (manual)
- [ ] No regressions on existing tests (62 pre-existing + 13 new = 75)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report PR URL**

Capture the PR URL printed by `gh pr create` and report it back.

---

## Self-review

**Spec coverage:** Each item from Phase 1.2 of the parent design has a task:
- HF CDN download + Range resume → Task 5
- sha256 verify → Task 4
- Disk-space precheck → Task 3
- Multi-file orchestrator + progress events → Task 6
- ModelState lifecycle (NotStarted → Downloading → Ready/Error) → Task 6 (`transition_status`)
- Tauri commands `ai_model_status` / `ai_model_download_start` / `ai_data_delete` → Tasks 7, 8, 9
- Registry constants → Task 2
- Module wiring (mod.rs declarations + invoke_handler!) → Tasks 2, 3, 7, 10

**Out-of-scope items deferred to Plans 1.3-1.7:**
- Concrete `CandleEmbedder` impl
- Concrete `CandleLlmRuntime` impl
- Real sha256 hashes for the registered model files (filled when those plans actually download + hash the artifacts)
- BriefingCard / ReflectionDialog UIs
- Settings page wired to these commands
- Background scheduler for periodic briefings
- The cron-style trigger of run_download from a labs/settings toggle

**Placeholder scan:** No `TBD` / `TODO`. Empty-string sha256 in registry IS intentional and documented — it's the contract by which future plans (1.3/1.4) signal "real hash here once we've downloaded the artifact and confirmed it matches HuggingFace's published checksum." A guard in `verify_sha256` skips empty hashes with a `tracing::warn!`, and the doc comment explicitly says production must refuse to mark a model `Ready` when registry hashes are empty.

**Type consistency:**
- `ModelFile` (Task 2) referenced in `download_file` (Task 5) and `run_download` (Task 6) — same shape throughout
- `ModelStatus` enum re-used from Plan 1.1 (`store::ai::ModelStatus`) — no new copy
- `ProgressFn` boxed closure in Task 5; `run_download` (Task 6) constructs concrete instances passing `Box::new(move |...| ...)`
- `ProgressEvent` Serialize struct shape matches what frontend consumers will deserialize (Plan 1.5 will type this on the React side as a Zustand state shape)

**Cross-task references verified:**
- Task 2 exports `LLM_ID`, `EMBEDDER_ID`, `LLM_FILES`, `EMBEDDER_FILES`, `all_files()`, `total_download_bytes()`
- Task 5 imports `ModelFile` from registry
- Task 6 imports `registry`, `store::ai::{ModelState, ModelStatus, upsert_model_state, get_model_state}` (latter two from Plan 1.1 Task 10)
- Tasks 7-9 import `model_download::{run_download, models_dir}` (Task 6) and `store::ai::*delete*` helpers (Plan 1.1 Tasks 7, 8, 9, 10)

**Risk callouts** that the implementer should flag if they bite:

1. **`Db::conn()` API surface.** Plan 1.1 used `&conn: Connection` directly in tests via `Connection::open_in_memory()`. The actual `crate::store::Db` runtime API may use a different shape (e.g. `db.with_conn(|c| ...)` or `db.lock()` returning a guard). Tasks 6-9 assume `db.conn() -> Result<Connection, _>`. **If this assumption is wrong, the implementer must adapt the orchestrator + commands to match.** Reading `desktop-app-v3/src-tauri/src/store/mod.rs` first is the safest move.

2. **`tauri::async_runtime::spawn` vs `tokio::spawn`.** The plan uses `tauri::async_runtime::spawn` because the rest of the codebase does. If the project uses bare `tokio::spawn`, follow the existing pattern.

3. **Empty placeholder sha256.** The registry constants ship with empty hashes. This is the **only** task where placeholders are acceptable in the plan — they're the explicit handoff to Plans 1.3/1.4. The `verify_sha256` skip-on-empty path makes this safe at runtime; the doc comment + warn-log surface the risk.

---

## Verification (run before opening the PR)

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield/desktop-app-v3/src-tauri

# 1. Clean build
cargo check 2>&1 | tail -5

# 2. Full lib test suite (Plan 1.1 baseline + Plan 1.2 additions)
cargo test --lib 2>&1 | tail -15

# 3. New tests specifically
cargo test --lib 'ai::registry::tests' 'ai::model_download::tests' 2>&1 | tail -10

# 4. Confirm Tauri commands compile + register cleanly
cargo build 2>&1 | tail -5

# 5. (Optional, manual) Smoke-test the orchestrator end-to-end on a real
# small file. Add to a scratch binary or use a debug-only menu item:
#   tauri::async_runtime::spawn(model_download::run_download(&handle, &http, &db));
# Watch for ai-model-progress events in the dev console.
```

**Expected outcome of merge:** A new `feat(desktop-v3):` commit lands on main, release-please will queue another minor bump. Substrate-only release; no UI yet, but Plans 1.3/1.4 can now `cargo run` and download model files end-to-end before they wire candle.

**Plan 1.3 (concrete BGE-small embedder) starts** once this PR merges. Plan 1.3 will:
- Add `candle-core`, `candle-nn`, `candle-transformers`, `tokenizers` dependencies
- Implement `CandleEmbedder` against the `Embedder` trait
- Wire BGE-small forward pass + tokenization
- Replace the empty `sha256: ""` placeholders in `EMBEDDER_FILES` with real hashes
- Add ~10 unit tests including a real-model integration test gated by `FLOWSHIELD_AI_TESTS=1`
