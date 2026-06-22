# Local AI Corpus Indexer — Phase 1.6a (Session Chunks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Index one `ai_chunks` row per completed focus session at `session_end`, so `has_minimum_data` passes after 5 sessions and briefings leave empty-state.

**Architecture:** A new `ai/indexer.rs` owns a generic `index_chunk` (embed text → upsert one row, idempotent by a stable id). `session_end` builds a `SessionChunkInput` from the data already in hand (the returned `Session`, the productivity score, and the drained tracker samples) and spawns a best-effort background task that gates on labs+Ready, loads the shared embedder, renders the session chunk, and indexes it.

**Tech Stack:** Rust, Tauri 2, rusqlite, candle (BGE-small embedder), tokio, chrono.

## Global Constraints

- Component: `desktop-app-v3/src-tauri`. All paths below are relative to repo root.
- `EMBEDDING_DIM = 384` (BGE-small). Never hardcode another width.
- Indexing is **best-effort**: it MUST NOT fail or delay the `session_end` user action. Errors are logged via `tracing` and swallowed.
- Index only when labs flag (`ai.labs.enabled` in `settings.json`) is true AND model status is `Ready`. Otherwise no-op before any model load.
- Idempotency: a chunk's row id is `stable_chunk_id(source, source_ref)`; re-indexing replaces (store already uses `INSERT OR REPLACE`).
- Run all tests from `desktop-app-v3/src-tauri`: `cargo test --lib <filter>`.
- Match existing style: `nullable`/Result-returning, `tracing` for logs, no `unwrap` in non-test code.

---

### Task 1: `ai/indexer.rs` — `index_chunk` + `stable_chunk_id`

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/indexer.rs`
- Modify: `desktop-app-v3/src-tauri/src/ai/mod.rs` (add `pub mod indexer;`)
- Modify: `desktop-app-v3/src-tauri/src/store/ai.rs` (make `ChunkSource::as_str` public)

**Interfaces:**
- Consumes: `store::ai::{Chunk, ChunkSource, insert_chunk, count_chunks}`, `ai::embedder::Embedder`, `store::Db`.
- Produces:
  - `pub fn stable_chunk_id(source: ChunkSource, source_ref: &str) -> String`
  - `pub async fn index_chunk<E: Embedder + ?Sized>(db: &Db, embedder: &E, source: ChunkSource, source_ref: &str, created_at: &str, text: String) -> Result<(), AppError>`

- [ ] **Step 1: Make `ChunkSource::as_str` public**

In `desktop-app-v3/src-tauri/src/store/ai.rs`, change the impl method visibility:

```rust
impl ChunkSource {
    pub fn as_str(self) -> &'static str {
        match self {
            ChunkSource::Session => "session",
            ChunkSource::ActivityDay => "activity_day",
            ChunkSource::Reflection => "reflection",
        }
    }
```

(Leave `parse` unchanged.)

- [ ] **Step 2: Register the module**

In `desktop-app-v3/src-tauri/src/ai/mod.rs`, add the declaration in alphabetical position (after `pub mod embedder;`):

```rust
pub mod indexer;
```

- [ ] **Step 3: Write the failing test**

Create `desktop-app-v3/src-tauri/src/ai/indexer.rs` with only the test module first:

```rust
//! Shared corpus indexing: embed chunk text and upsert it as one ai_chunks
//! row. Idempotent via a deterministic id derived from (source, source_ref).

use crate::ai::embedder::Embedder;
use crate::error::AppError;
use crate::store::ai::{self as store_ai, Chunk, ChunkSource};
use crate::store::Db;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::embedder::MockEmbedder;
    use crate::store;

    fn open_test_db() -> Db {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("test.sqlite");
        let db = store::open(&path).expect("open db");
        std::mem::forget(tmp);
        db
    }

    #[test]
    fn stable_id_is_deterministic_and_source_scoped() {
        let a = stable_chunk_id(ChunkSource::Session, "sid-1");
        let b = stable_chunk_id(ChunkSource::Session, "sid-1");
        let c = stable_chunk_id(ChunkSource::ActivityDay, "sid-1");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[tokio::test]
    async fn index_chunk_inserts_one_row() {
        let db = open_test_db();
        let emb = MockEmbedder::default();
        index_chunk(&db, &emb, ChunkSource::Session, "sid-1", "2026-06-23T10:00:00Z", "[Session] text".into())
            .await
            .unwrap();
        let conn = db.lock().unwrap();
        assert_eq!(store_ai::count_chunks(&conn).unwrap(), 1);
    }

    #[tokio::test]
    async fn index_chunk_is_idempotent_for_same_source_ref() {
        let db = open_test_db();
        let emb = MockEmbedder::default();
        for _ in 0..3 {
            index_chunk(&db, &emb, ChunkSource::Session, "sid-1", "2026-06-23T10:00:00Z", "[Session] text".into())
                .await
                .unwrap();
        }
        let conn = db.lock().unwrap();
        assert_eq!(store_ai::count_chunks(&conn).unwrap(), 1, "same source_ref must not duplicate");
    }
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: FAIL — `cannot find function stable_chunk_id` / `index_chunk` in this scope.

- [ ] **Step 5: Write the minimal implementation**

Insert above the `#[cfg(test)]` module in `indexer.rs`:

```rust
/// Deterministic row id for an indexed chunk. Same (source, source_ref) →
/// same id → `INSERT OR REPLACE` overwrites instead of duplicating.
pub fn stable_chunk_id(source: ChunkSource, source_ref: &str) -> String {
    format!("{}:{}", source.as_str(), source_ref)
}

/// Embed `text` and upsert it as one ai_chunks row. Best-effort callers
/// should log and swallow the error; the function itself surfaces it so
/// tests can assert success.
pub async fn index_chunk<E: Embedder + ?Sized>(
    db: &Db,
    embedder: &E,
    source: ChunkSource,
    source_ref: &str,
    created_at: &str,
    text: String,
) -> Result<(), AppError> {
    let embedding = embedder.embed(&text).await?; // AiError -> AppError via From
    let chunk = Chunk {
        id: stable_chunk_id(source, source_ref),
        source,
        source_ref: source_ref.to_string(),
        text,
        embedding,
        created_at: created_at.to_string(),
        embedded_at: chrono::Utc::now().to_rfc3339(),
    };
    let conn = db
        .lock()
        .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
    store_ai::insert_chunk(&conn, &chunk)
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: PASS — 3 passed.

- [ ] **Step 7: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/indexer.rs desktop-app-v3/src-tauri/src/ai/mod.rs desktop-app-v3/src-tauri/src/store/ai.rs
git commit -m "feat(desktop-v3): corpus index_chunk + stable id (1.6a)"
```

---

### Task 2: Session → chunk-input builders (`top_apps` + `SessionChunkInput`)

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/indexer.rs`

**Interfaces:**
- Consumes: `tracker::ActivitySample` (`application_name: String`, `duration_seconds: u64`), `api::Session`, `ai::corpus::SessionChunkInput`.
- Produces:
  - `pub fn aggregate_top_apps(samples: &[crate::tracker::ActivitySample]) -> Vec<(String, i32)>`
  - `pub fn session_chunk_input(session: &crate::api::Session, productivity_score: Option<i32>, samples: &[crate::tracker::ActivitySample]) -> crate::ai::corpus::SessionChunkInput`

- [ ] **Step 1: Write the failing test**

Add these tests inside the existing `#[cfg(test)] mod tests` in `indexer.rs`:

```rust
    use crate::api::Session;
    use crate::tracker::ActivitySample;

    fn sample(app: &str, secs: u64) -> ActivitySample {
        ActivitySample {
            application_name: app.into(),
            process_name: app.into(),
            window_title: "w".into(),
            timestamp: "2026-06-23T09:10:00Z".into(),
            duration_seconds: secs,
        }
    }

    fn sample_session() -> Session {
        Session {
            id: "sid-1".into(),
            user_id: None,
            start_time: "2026-06-23T09:00:00Z".into(),
            end_time: Some("2026-06-23T09:55:00Z".into()),
            planned_duration: 60,
            actual_duration: Some(55),
            session_type: "WORK".into(),
            productivity_score: None,
            completed: true,
            is_paused: false,
            paused_at: None,
            project_id: Some("proj-1".into()),
        }
    }

    #[test]
    fn aggregate_top_apps_sums_and_sorts_desc_in_minutes() {
        let samples = vec![sample("Code", 600), sample("Chrome", 120), sample("Code", 300)];
        let top = aggregate_top_apps(&samples);
        assert_eq!(top[0], ("Code".to_string(), 15)); // 900s -> 15m
        assert_eq!(top[1], ("Chrome".to_string(), 2)); // 120s -> 2m
    }

    #[test]
    fn session_chunk_input_maps_fields_and_parses_times() {
        let samples = vec![sample("Code", 600)];
        let input = session_chunk_input(&sample_session(), Some(80), &samples);
        assert_eq!(input.id, "sid-1");
        assert_eq!(input.planned_duration, 60);
        assert_eq!(input.actual_duration, Some(55));
        assert_eq!(input.productivity_score, Some(80));
        assert_eq!(input.project_name, None); // Session has no project name, only id (1.6a)
        assert_eq!(input.start_time.format("%H:%M").to_string(), "09:00");
        assert_eq!(input.end_time.unwrap().format("%H:%M").to_string(), "09:55");
        assert_eq!(input.top_apps[0], ("Code".to_string(), 10));
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: FAIL — `cannot find function aggregate_top_apps` / `session_chunk_input`.

- [ ] **Step 3: Write the minimal implementation**

Add to the top of `indexer.rs` (after the existing `use` lines, extend imports as shown):

```rust
use crate::ai::corpus::SessionChunkInput;
use crate::api::Session;
use crate::tracker::ActivitySample;
use std::collections::HashMap;

/// Sum tracker samples by application, convert seconds → whole minutes, and
/// return `(app, minutes)` sorted by minutes descending (ties broken by name
/// for a stable order).
pub fn aggregate_top_apps(samples: &[ActivitySample]) -> Vec<(String, i32)> {
    let mut by_app: HashMap<String, u64> = HashMap::new();
    for s in samples {
        *by_app.entry(s.application_name.clone()).or_insert(0) += s.duration_seconds;
    }
    let mut out: Vec<(String, i32)> = by_app
        .into_iter()
        .map(|(app, secs)| (app, (secs / 60) as i32))
        .collect();
    out.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    out
}

/// Build the corpus input for one completed session. Times come off the API
/// `Session` as RFC 3339 strings; unparseable values fall back to "now" /
/// `None` rather than failing the index. `project_name` is `None` in 1.6a —
/// the API `Session` carries only `project_id`; name enrichment is later work.
pub fn session_chunk_input(
    session: &Session,
    productivity_score: Option<i32>,
    samples: &[ActivitySample],
) -> SessionChunkInput {
    let start_time = chrono::DateTime::parse_from_rfc3339(&session.start_time)
        .map(|d| d.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now());
    let end_time = session
        .end_time
        .as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&chrono::Utc));

    SessionChunkInput {
        id: session.id.clone(),
        start_time,
        end_time,
        planned_duration: session.planned_duration,
        actual_duration: session.actual_duration,
        project_name: None,
        productivity_score: productivity_score.or(session.productivity_score),
        top_apps: aggregate_top_apps(samples),
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: PASS — 5 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/indexer.rs
git commit -m "feat(desktop-v3): session_chunk_input + top_apps aggregation (1.6a)"
```

---

### Task 3: Extract shared `get_or_load` embedder helper

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/candle_embedder.rs`
- Modify: `desktop-app-v3/src-tauri/src/ai/briefing.rs:165-171`

**Interfaces:**
- Produces: `pub fn get_or_load(slot: &std::sync::OnceLock<std::sync::Arc<CandleEmbedder>>, model_dir: &std::path::Path) -> Result<std::sync::Arc<CandleEmbedder>, AiError>` in `candle_embedder.rs`.
- Consumes (refactor): replaces the inline load-or-get block in `briefing::generate_with_real_models`.

This is a pure extraction — no behavior change. Verified by compile + existing briefing tests.

- [ ] **Step 1: Add the helper**

In `desktop-app-v3/src-tauri/src/ai/candle_embedder.rs`, add inside `impl CandleEmbedder` (or as a free fn in the module — keep it an associated fn `CandleEmbedder::get_or_load` to match the callsite below):

```rust
/// Return the cached embedder, loading it from `model_dir/bge-small-en-v1.5`
/// on first use. The embedder is stateless and ~135 MB; both the briefing
/// pipeline and the corpus indexer share this one instance.
pub fn get_or_load(
    slot: &std::sync::OnceLock<std::sync::Arc<CandleEmbedder>>,
    model_dir: &std::path::Path,
) -> Result<std::sync::Arc<CandleEmbedder>, crate::error::AiError> {
    if let Some(e) = slot.get() {
        return Ok(e.clone());
    }
    let loaded = std::sync::Arc::new(CandleEmbedder::load(&model_dir.join("bge-small-en-v1.5"))?);
    let _ = slot.set(loaded.clone());
    Ok(slot.get().cloned().unwrap_or(loaded))
}
```

- [ ] **Step 2: Refactor briefing to use it**

In `desktop-app-v3/src-tauri/src/ai/briefing.rs`, replace the inline block (currently lines ~165-171):

```rust
    let embedder = if let Some(e) = embedder_slot.get() {
        e.clone()
    } else {
        let loaded = Arc::new(CandleEmbedder::load(&model_dir.join("bge-small-en-v1.5"))?);
        let _ = embedder_slot.set(loaded.clone());
        embedder_slot.get().cloned().unwrap_or(loaded)
    };
```

with:

```rust
    let embedder = CandleEmbedder::get_or_load(embedder_slot, model_dir)?;
```

- [ ] **Step 3: Verify build + existing tests pass**

Run: `cargo test --lib ai::briefing 2>&1 | tail -15`
Expected: PASS — existing briefing tests still pass. If `Arc` or `CandleEmbedder::load` become unused imports in `briefing.rs`, remove only those now-orphaned imports (do not touch unrelated imports).

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/candle_embedder.rs desktop-app-v3/src-tauri/src/ai/briefing.rs
git commit -m "refactor(desktop-v3): shared CandleEmbedder::get_or_load (1.6a)"
```

---

### Task 4: Wire `session_end` indexing hook + `should_index` gate

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/indexer.rs` (add `should_index` + `index_session_background`)
- Modify: `desktop-app-v3/src-tauri/src/commands/ai.rs` (rename `read_labs_flag` → `pub(crate) labs_enabled`)
- Modify: `desktop-app-v3/src-tauri/src/commands/sessions.rs:79` (add `app` param + hook)

**Interfaces:**
- Consumes: `store::ai::{get_model_state, ModelStatus}`, `commands::ai::labs_enabled`, `AppState.embedder`, `AppState.db`.
- Produces:
  - `pub fn should_index(labs_enabled: bool, status: ModelStatus) -> bool`
  - `pub fn index_session_background(app: tauri::AppHandle, state_db: Db, embedder_slot: std::sync::Arc<std::sync::OnceLock<std::sync::Arc<CandleEmbedder>>>, model_dir: std::path::PathBuf, input: SessionChunkInput)`

- [ ] **Step 1: Write the failing test for the gate**

Add to the `#[cfg(test)] mod tests` in `indexer.rs`:

```rust
    use crate::store::ai::ModelStatus;

    #[test]
    fn should_index_only_when_labs_on_and_ready() {
        assert!(should_index(true, ModelStatus::Ready));
        assert!(!should_index(false, ModelStatus::Ready));
        assert!(!should_index(true, ModelStatus::Downloading));
        assert!(!should_index(true, ModelStatus::NotStarted));
        assert!(!should_index(true, ModelStatus::Error));
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: FAIL — `cannot find function should_index`.

- [ ] **Step 3: Implement the gate + background indexer**

Add to `indexer.rs` (extend imports with `use crate::ai::candle_embedder::CandleEmbedder; use crate::store::ai::ModelStatus; use std::sync::{Arc, OnceLock}; use std::path::PathBuf;`):

```rust
/// Gate for session indexing. Index only when the user enabled Local AI and
/// the model finished downloading.
pub fn should_index(labs_enabled: bool, status: ModelStatus) -> bool {
    labs_enabled && matches!(status, ModelStatus::Ready)
}

/// Spawn a best-effort background task that renders + indexes one session
/// chunk. Never blocks or fails the caller. Reads the labs flag and model
/// status itself, loads the shared embedder, and indexes the chunk.
pub fn index_session_background(
    app: tauri::AppHandle,
    state_db: Db,
    embedder_slot: Arc<OnceLock<Arc<CandleEmbedder>>>,
    model_dir: PathBuf,
    input: SessionChunkInput,
) {
    tauri::async_runtime::spawn(async move {
        let labs = crate::commands::ai::labs_enabled(&app);
        let status = {
            let conn = match state_db.lock() {
                Ok(c) => c,
                Err(_) => return,
            };
            store_ai::get_model_state(&conn)
                .ok()
                .flatten()
                .map(|s| s.status)
                .unwrap_or(ModelStatus::NotStarted)
        };
        if !should_index(labs, status) {
            return;
        }

        let embedder = match CandleEmbedder::get_or_load(&embedder_slot, &model_dir) {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!(?e, "session index skipped: embedder load failed");
                return;
            }
        };

        let created_at = input
            .end_time
            .unwrap_or_else(chrono::Utc::now)
            .to_rfc3339();
        let text = crate::ai::corpus::render_session_chunk(&input);
        if let Err(e) = index_chunk(
            &state_db,
            embedder.as_ref(),
            ChunkSource::Session,
            &input.id,
            &created_at,
            text,
        )
        .await
        {
            tracing::warn!(?e, session = %input.id, "session chunk index failed");
        } else {
            tracing::info!(session = %input.id, "indexed session chunk");
        }
    });
}
```

- [ ] **Step 4: Expose the labs-flag reader**

In `desktop-app-v3/src-tauri/src/commands/ai.rs`, the file defines a private `fn read_labs_flag(app: &AppHandle) -> bool`. Rename it to `pub(crate) fn labs_enabled(app: &AppHandle) -> bool` (body unchanged) and update every in-file caller (search `read_labs_flag` — callers are in `ai_briefing_today`, `ai_settings`, `ai_labs_get_enabled`) to `labs_enabled`.

- [ ] **Step 5: Run the gate test to verify it passes**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: PASS — 6 passed.

- [ ] **Step 6: Add the `session_end` hook**

In `desktop-app-v3/src-tauri/src/commands/sessions.rs`, change the `session_end` signature to inject the app handle:

```rust
pub async fn session_end(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    session_id: String,
    productivity_score: Option<i32>,
) -> AppResult<Session> {
```

Then, immediately before the final `Ok(session)` return (after the device re-register block), add:

```rust
    // Phase 1.6a — index this completed session into the AI corpus.
    // Best-effort, backgrounded: never blocks or fails the session end.
    if let Some(db) = state.db.get().cloned() {
        use tauri::Manager;
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            let input = crate::ai::indexer::session_chunk_input(
                &session,
                productivity_score,
                &samples,
            );
            crate::ai::indexer::index_session_background(
                app.clone(),
                db,
                state.embedder.clone(),
                app_data_dir.join("models"),
                input,
            );
        }
    }
```

Note: `samples` (`Vec<ActivitySample>`) is already in scope from the drain block above and is only borrowed by the earlier `sync_activity(&state.http, &token, &session_id, &samples)` call, so it is still owned here. The frontend `invoke('session_end', { sessionId, productivityScore })` call is unaffected — Tauri injects `app` automatically; it is not passed from JS.

- [ ] **Step 7: Verify build + full lib tests pass**

Run: `cargo test --lib 2>&1 | tail -15`
Expected: PASS — all lib tests green (existing + new indexer tests).

- [ ] **Step 8: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/indexer.rs desktop-app-v3/src-tauri/src/commands/ai.rs desktop-app-v3/src-tauri/src/commands/sessions.rs
git commit -m "feat(desktop-v3): index session chunk on session_end (1.6a)"
```

---

## Manual Verification (after Task 4)

The hook itself can't be unit-tested end-to-end (real embedder + Tauri runtime). Verify in the running app:

1. `cd desktop-app-v3 && npm run tauri:dev`.
2. Enable Local AI (Beta) in `/settings/ai`; wait for Status `ready`.
3. Start and end 5 short focus sessions.
4. Reopen `/settings/ai` → **Indexed chunks** should now read ≥ 5 (was 0).
5. Reload the dashboard → the briefing should leave empty-state and generate (may take a few seconds for the first LLM load).

If chunks stay 0: check the dev log for `session chunk index failed` / `embedder load failed` warnings.

---

## Self-Review Notes

- **Spec coverage (1.6a section):** session-end trigger ✓ (Task 4), `SessionChunkInput` from session+score+samples ✓ (Task 2), `top_apps` from samples ✓ (Task 2), background/best-effort/gated ✓ (Task 4), shared `index_chunk` + stable id ✓ (Task 1), shared `get_or_load` ✓ (Task 3).
- **Deferred (correctly out of 1.6a):** day rollups (1.6b), reflections (1.6c), `project_name` enrichment.
- **Type consistency:** `index_chunk` returns `AppError`; `should_index(bool, ModelStatus)`; `session_chunk_input(&Session, Option<i32>, &[ActivitySample]) -> SessionChunkInput`; `get_or_load(&OnceLock<Arc<CandleEmbedder>>, &Path) -> Result<Arc<CandleEmbedder>, AiError>` — used consistently across tasks.
