# FlowShield Local AI — Briefing Pipeline + UI (Phase 1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `CandleEmbedder` (Plan 1.3) + `CandleLlmRuntime` (Plan 1.4) into a user-visible daily briefing on the desktop dashboard, gated behind a labs flag, with a settings page for lifecycle controls.

**Architecture:** A single tokio scheduler ticks every 60s and fires `briefing::generate` at 5am local (or any time after, post-sleep), provided labs is enabled, model is Ready, and ≥5 completed sessions exist in the last 7 days. The pipeline embeds a date-aware query, retrieves top-15 chunks via cosine, renders the briefing prompt, generates 80 tokens via a freshly-loaded `CandleLlmRuntime` (loaded → used → dropped to free RAM and sidestep Plan 1.4's KV-cache constraint), and caches the result in `ai_briefings`. Lazy fallback path covers laptops asleep at 5am: dashboard-mount calls `ai_briefing_today` which spawns the same pipeline if no row exists. Frontend renders a top-of-dashboard `BriefingCard` (skeleton/ready/error states) and a `/settings/ai` page (labs toggle + status + re-download + delete).

**Tech Stack:** Rust 2021, Tauri 2 (existing), `candle-core/-nn/-transformers = 0.8` (existing), `tokenizers = 0.20` (existing), `tokio` (existing), `chrono = 0.4` (existing), `tauri-plugin-store = 2` (existing), `react`, `zustand` (existing), `react-router-dom` (existing). **No new deps.**

**Reference parent spec:** [/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md](/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md).
**Design doc:** [docs/superpowers/specs/2026-05-07-local-ai-briefing-phase-1.5-design.md](../specs/2026-05-07-local-ai-briefing-phase-1.5-design.md).
**Predecessor plans:** PR #70 (substrate), PR #72 (downloader), PR #74 (embedder), PR #75 (LLM).

---

## File structure

**New backend files:**
- `desktop-app-v3/src-tauri/src/ai/empty_state.rs` — `pub fn has_minimum_data(db) -> bool`
- `desktop-app-v3/src-tauri/src/ai/scheduler.rs` — `pub fn should_fire(...)` + `pub fn spawn(...)`
- `desktop-app-v3/src-tauri/src/ai/briefing.rs` — `pub async fn generate(...)`

**Modified backend files:**
- `desktop-app-v3/src-tauri/src/ai/mod.rs` — declare new modules
- `desktop-app-v3/src-tauri/src/lib.rs` — extend `AppState`, spawn scheduler, register new commands
- `desktop-app-v3/src-tauri/src/commands/ai.rs` — add 4 new commands
- `desktop-app-v3/src-tauri/src/ai/prompts.rs` — extend the briefing prompt template (only if it doesn't already cover the rendering path the orchestrator needs)

**New frontend files:**
- `desktop-app-v3/src/lib/ai.ts` — Zustand store + Tauri event listeners
- `desktop-app-v3/src/components/BriefingCard.tsx`
- `desktop-app-v3/src/routes/SettingsAiPage.tsx`

**Modified frontend files:**
- `desktop-app-v3/src/App.tsx` — add `/settings/ai` route + bootstrap `useAIStore`
- `desktop-app-v3/src/routes/DashboardPage.tsx` — mount `<BriefingCard />`

---

## Tasks

### Task 1: Branch from main

**Files:** none.

- [ ] **Step 1: Branch**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git checkout main
git pull --ff-only
git checkout -b feat/local-ai-briefing
```

No commit at this step.

---

### Task 2: Extend `AppState` with `embedder` + `briefing_in_flight`

**Files:** Modify `desktop-app-v3/src-tauri/src/lib.rs`.

- [ ] **Step 1: Add imports**

In the existing `use std::sync::Arc;` area near the top of `lib.rs`, add a sibling line:

```rust
use std::sync::atomic::AtomicBool;
```

- [ ] **Step 2: Add fields to `AppState`**

In `lib.rs`, find the `pub struct AppState { ... }` block. After the existing `pub latest_update: ...` line, add two fields:

```rust
    /// `OnceLock` because `CandleEmbedder` is loaded lazily on first
    /// briefing generation and reused for the process lifetime (~135 MB
    /// resident; cheap to keep around).
    pub embedder: Arc<std::sync::OnceLock<Arc<crate::ai::candle_embedder::CandleEmbedder>>>,
    /// Set true while `briefing::generate` is running; prevents the 5am
    /// scheduler tick and the lazy-fallback dashboard mount from racing.
    pub briefing_in_flight: Arc<AtomicBool>,
```

- [ ] **Step 3: Initialize in `AppState::new`**

In the existing `impl AppState { fn new() -> Self { ... } }`, add to the `Self { ... }` initializer block:

```rust
            embedder: Arc::new(std::sync::OnceLock::new()),
            briefing_in_flight: Arc::new(AtomicBool::new(false)),
```

- [ ] **Step 4: Verify build**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -5
```

Expected: clean build (47 pre-existing warnings, 0 errors).

- [ ] **Step 5: Commit**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git add desktop-app-v3/src-tauri/src/lib.rs
git commit -m "feat(desktop-v3): extend AppState with embedder + briefing_in_flight"
```

---

### Task 3: Create `empty_state.rs` (TDD)

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/empty_state.rs`
- Modify: `desktop-app-v3/src-tauri/src/ai/mod.rs`

- [ ] **Step 1: Declare module**

Add to `desktop-app-v3/src-tauri/src/ai/mod.rs` alphabetically (between `corpus` and `embedder`):

```rust
pub mod empty_state;
```

- [ ] **Step 2: Create `empty_state.rs` with implementation + tests**

```rust
//! Whether the user has enough recent activity for a useful briefing.
//! Both the 5am scheduler and the lazy `ai_briefing_today` fallback gate
//! on this — a briefing built from < 5 sessions reads generic and erodes
//! trust.

use crate::store::Db;

/// Threshold matching the parent design's "complete a few more focus
/// sessions to unlock your AI briefing" copy. ≥5 completed sessions in
/// the last 7 days. "Completed" = `ended_at` is non-NULL.
const MIN_COMPLETED_SESSIONS_LAST_7D: i64 = 5;

pub fn has_minimum_data(db: &Db) -> bool {
    let conn = match db.lock() {
        Ok(g) => g,
        Err(_) => return false, // poisoned mutex → fail closed
    };
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sessions \
             WHERE ended_at IS NOT NULL \
               AND started_at >= datetime('now', '-7 days')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    count >= MIN_COMPLETED_SESSIONS_LAST_7D
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store;
    use rusqlite::params;
    use tempfile::tempdir;

    fn open_test_db() -> Db {
        let tmp = tempdir().expect("tempdir");
        let path = tmp.path().join("test.sqlite");
        let db = store::open(&path).expect("open db");
        std::mem::forget(tmp);
        db
    }

    fn insert_session(db: &Db, started_at: &str, ended_at: Option<&str>) {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions (id, started_at, ended_at, kind, planned_minutes, source) \
             VALUES (?, ?, ?, 'work', 60, 'desktop')",
            params![uuid_like(), started_at, ended_at],
        )
        .expect("insert session");
    }

    fn uuid_like() -> String {
        format!("test-{}", chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0))
    }

    #[test]
    fn has_minimum_data_returns_false_below_threshold() {
        let db = open_test_db();
        for i in 0..4 {
            insert_session(
                &db,
                &format!("2026-05-0{} 09:00:00", i + 1),
                Some(&format!("2026-05-0{} 10:00:00", i + 1)),
            );
        }
        assert!(!has_minimum_data(&db));
    }

    #[test]
    fn has_minimum_data_returns_true_at_threshold() {
        let db = open_test_db();
        let now = chrono::Utc::now();
        for i in 0..5 {
            let dt = now - chrono::Duration::days(i);
            insert_session(
                &db,
                &dt.format("%Y-%m-%d %H:%M:%S").to_string(),
                Some(&(dt + chrono::Duration::hours(1)).format("%Y-%m-%d %H:%M:%S").to_string()),
            );
        }
        assert!(has_minimum_data(&db));
    }

    #[test]
    fn has_minimum_data_excludes_old_sessions() {
        let db = open_test_db();
        for i in 0..5 {
            insert_session(
                &db,
                &format!("2025-01-0{} 09:00:00", i + 1),
                Some(&format!("2025-01-0{} 10:00:00", i + 1)),
            );
        }
        assert!(!has_minimum_data(&db));
    }

    #[test]
    fn has_minimum_data_excludes_in_progress_sessions() {
        let db = open_test_db();
        let now = chrono::Utc::now();
        for i in 0..5 {
            let dt = now - chrono::Duration::days(i);
            insert_session(&db, &dt.format("%Y-%m-%d %H:%M:%S").to_string(), None);
        }
        assert!(!has_minimum_data(&db));
    }
}
```

> **Note on the test schema:** the `sessions` table is created by `store::open` (Plan 1.1 substrate). If the test fails because column names mismatch (e.g. `started_at` vs `start_time`), open `desktop-app-v3/src-tauri/src/store/mod.rs` and adapt the INSERT to match the actual columns. The query in `has_minimum_data` itself must also match.

- [ ] **Step 3: Run tests**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::empty_state 2>&1 | tail -15
```

Expected: 4 tests pass. If column-mismatch errors, adapt SQL to actual schema.

- [ ] **Step 4: Run full lib suite (no regressions)**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib 2>&1 | tail -3
```

Expected: 82 (Plan 1.4 baseline) + 4 = 86 tests.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/empty_state.rs \
        desktop-app-v3/src-tauri/src/ai/mod.rs
git commit -m "feat(desktop-v3): empty_state module gates briefing on min recent sessions"
```

---

### Task 4: Create `scheduler.rs::should_fire` (TDD pure function)

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/scheduler.rs`
- Modify: `desktop-app-v3/src-tauri/src/ai/mod.rs`

This task only ships the pure `should_fire` predicate. The `spawn` function lands in Task 6.

- [ ] **Step 1: Declare module**

Add to `ai/mod.rs` alphabetically:

```rust
pub mod scheduler;
```

- [ ] **Step 2: Create `scheduler.rs`**

```rust
//! Briefing scheduler. Ticks every 60s; fires `briefing::generate` when
//! local time has crossed 5am AND no row in `ai_briefings` exists for
//! today's date AND labs are enabled AND the model is `Ready` AND there's
//! enough recent activity.
//!
//! The "≥5am" rather than "==5am" guard handles laptops asleep through
//! 5am — the first tick after wake fires the pipeline.

use chrono::{DateTime, Datelike, Local, Timelike};

use crate::ai::empty_state;
use crate::store::ai::{get_briefing_for, ModelStatus};
use crate::store::Db;

const FIRE_FROM_HOUR_LOCAL: u32 = 5;

pub fn should_fire(
    now_local: DateTime<Local>,
    db: &Db,
    labs_enabled: bool,
    model_status: ModelStatus,
) -> bool {
    if !labs_enabled {
        return false;
    }
    if !matches!(model_status, ModelStatus::Ready) {
        return false;
    }
    if now_local.hour() < FIRE_FROM_HOUR_LOCAL {
        return false;
    }
    let today = now_local.date_naive().to_string();
    if get_briefing_for(db, &today).is_some() {
        return false;
    }
    if !empty_state::has_minimum_data(db) {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store;
    use chrono::TimeZone;
    use rusqlite::params;
    use tempfile::tempdir;

    fn open_test_db() -> Db {
        let tmp = tempdir().expect("tempdir");
        let path = tmp.path().join("test.sqlite");
        let db = store::open(&path).expect("open db");
        std::mem::forget(tmp);
        db
    }

    fn seed_min_sessions(db: &Db) {
        let conn = db.lock().unwrap();
        let now = chrono::Utc::now();
        for i in 0..5 {
            let dt = now - chrono::Duration::days(i);
            conn.execute(
                "INSERT INTO sessions (id, started_at, ended_at, kind, planned_minutes, source) \
                 VALUES (?, ?, ?, 'work', 60, 'desktop')",
                params![
                    format!("seed-{}", i),
                    dt.format("%Y-%m-%d %H:%M:%S").to_string(),
                    (dt + chrono::Duration::hours(1)).format("%Y-%m-%d %H:%M:%S").to_string(),
                ],
            )
            .unwrap();
        }
    }

    #[test]
    fn fires_at_5am_with_no_cached_row_and_enough_data() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 5, 30, 0).unwrap();
        assert!(should_fire(now, &db, true, ModelStatus::Ready));
    }

    #[test]
    fn fires_after_5am_post_sleep() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 9, 15, 0).unwrap();
        assert!(should_fire(now, &db, true, ModelStatus::Ready));
    }

    #[test]
    fn skips_before_5am() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 4, 59, 0).unwrap();
        assert!(!should_fire(now, &db, true, ModelStatus::Ready));
    }

    #[test]
    fn skips_when_labs_disabled() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 6, 0, 0).unwrap();
        assert!(!should_fire(now, &db, false, ModelStatus::Ready));
    }

    #[test]
    fn skips_when_model_not_ready() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 6, 0, 0).unwrap();
        assert!(!should_fire(now, &db, true, ModelStatus::Downloading));
        assert!(!should_fire(now, &db, true, ModelStatus::NotStarted));
        assert!(!should_fire(now, &db, true, ModelStatus::Error));
        assert!(!should_fire(now, &db, true, ModelStatus::Disabled));
    }

    #[test]
    fn skips_when_briefing_already_cached_today() {
        let db = open_test_db();
        seed_min_sessions(&db);
        let now = Local.with_ymd_and_hms(2026, 5, 8, 6, 0, 0).unwrap();
        let today = now.date_naive().to_string();
        crate::store::ai::upsert_briefing(
            &db,
            &today,
            "cached briefing",
            "phi-3-mini-4k-instruct-q4",
        )
        .unwrap();
        assert!(!should_fire(now, &db, true, ModelStatus::Ready));
    }

    #[test]
    fn skips_when_below_data_threshold() {
        let db = open_test_db();
        let now = Local.with_ymd_and_hms(2026, 5, 8, 6, 0, 0).unwrap();
        assert!(!should_fire(now, &db, true, ModelStatus::Ready));
    }
}
```

> **Note:** the tests reference `crate::store::ai::{get_briefing_for, upsert_briefing, ModelStatus}` from Plan 1.1's `store/ai.rs`. If function/variant names differ, adapt the calls — don't add a wrapper.

- [ ] **Step 3: Run tests**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::scheduler 2>&1 | tail -15
```

Expected: 7 tests pass.

- [ ] **Step 4: Full suite check**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib 2>&1 | tail -3
```

Expected: 86 + 7 = 93 tests.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/scheduler.rs \
        desktop-app-v3/src-tauri/src/ai/mod.rs
git commit -m "feat(desktop-v3): scheduler::should_fire predicate for briefing pipeline"
```

---

### Task 5: Create `briefing.rs` orchestrator (TDD with mocks)

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/briefing.rs`
- Modify: `desktop-app-v3/src-tauri/src/ai/mod.rs`

- [ ] **Step 1: Declare module**

Add to `ai/mod.rs` alphabetically:

```rust
pub mod briefing;
```

- [ ] **Step 2: Inspect what `prompts.rs` already exposes**

```bash
grep -n "^pub" desktop-app-v3/src-tauri/src/ai/prompts.rs
```

The orchestrator needs a function that renders the briefing prompt from chunks + optional reflection + today's date. If `prompts.rs` already exposes one, use it. If not, add a minimal pub function in `prompts.rs`:

```rust
/// Render the briefing prompt from retrieved chunks + optional yesterday
/// reflection + today's date. The output is fed verbatim to LlmRuntime::generate.
pub fn render_briefing_prompt(
    chunks: &[&crate::ai::corpus::ChunkRow],
    reflection: Option<&crate::store::ai::ReflectionRow>,
    today: chrono::NaiveDate,
) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "You are FlowShield's productivity coach. Today is {}.\n\nRecent context:\n",
        today.format("%A %Y-%m-%d")
    ));
    for chunk in chunks {
        out.push_str(&format!("- {}\n", chunk.text));
    }
    if let Some(r) = reflection {
        out.push_str(&format!("\nYesterday's reflection: {}\n", r.answer));
    }
    out.push_str(
        "\nWrite a 2-3 sentence briefing for today: highlight one pattern from the context, \
         note one specific thing they paused on, and suggest one concrete action for today. \
         Be specific (cite times/apps/projects from the context). No fluff.\n",
    );
    out
}
```

- [ ] **Step 3: Create `briefing.rs`**

```rust
//! Briefing pipeline orchestrator. The single entry point for both the
//! 5am scheduler tick and the lazy dashboard-mount fallback.
//!
//! Design constraints:
//! - **One generation at a time.** `briefing_in_flight: AtomicBool` on
//!   AppState gates entry; second concurrent call returns Ok early.
//! - **LLM is loaded fresh, used once, dropped.** Plan 1.4's KV cache
//!   isn't resettable in candle 0.8.4, so the runtime is single-use.
//! - **Drop-guard for in-flight flag.** A panic anywhere inside the
//!   orchestrator must reset `briefing_in_flight` so the next tick can
//!   try again.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::ai::candle_embedder::CandleEmbedder;
use crate::ai::candle_llm::CandleLlmRuntime;
use crate::ai::corpus::ChunkRow;
use crate::ai::embedder::Embedder;
use crate::ai::registry::LLM_ID;
use crate::ai::retriever::top_k_by_cosine;
use crate::ai::runtime::LlmRuntime;
use crate::error::AppError;
use crate::store::ai as store_ai;
use crate::store::Db;

const BRIEFING_MAX_TOKENS: usize = 80;
const RETRIEVAL_K: usize = 15;
const RETRIEVAL_WINDOW_DAYS: i64 = 7;

struct InFlightGuard<'a>(&'a AtomicBool);
impl<'a> Drop for InFlightGuard<'a> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

pub async fn generate<E, L>(
    db: &Db,
    in_flight: &AtomicBool,
    embedder: &E,
    runtime: &L,
    today: chrono::NaiveDate,
) -> Result<(), AppError>
where
    E: Embedder + ?Sized,
    L: LlmRuntime + ?Sized,
{
    if in_flight
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }
    let _guard = InFlightGuard(in_flight);

    let query = format!(
        "Today is {}. Recent focus patterns, blockers, and baselines.",
        today.format("%A %Y-%m-%d")
    );
    let q_vec = embedder.embed(&query).await?;

    let since = today
        .checked_sub_signed(chrono::Duration::days(RETRIEVAL_WINDOW_DAYS))
        .map(|d| d.to_string())
        .unwrap_or_else(|| "1970-01-01".into());
    let chunks: Vec<ChunkRow> = store_ai::list_chunks_since(db, &since)?;

    let scored: Vec<(Vec<f32>, ChunkRow)> = chunks
        .into_iter()
        .map(|c| (c.embedding.clone(), c))
        .collect();
    let top: Vec<&ChunkRow> = top_k_by_cosine(&q_vec, &scored, RETRIEVAL_K)
        .into_iter()
        .map(|(_, c)| c)
        .collect();

    let yesterday = today
        .checked_sub_signed(chrono::Duration::days(1))
        .map(|d| d.to_string())
        .unwrap_or_default();
    let reflection = store_ai::get_reflection_by_date(db, &yesterday).ok().flatten();

    let prompt = crate::ai::prompts::render_briefing_prompt(&top, reflection.as_ref(), today);

    let text = runtime.generate(&prompt, BRIEFING_MAX_TOKENS).await?;
    let trimmed = text.trim();

    if trimmed.len() < 5 {
        tracing::warn!(len = trimmed.len(), "briefing output too short, skipping cache");
        return Ok(());
    }

    store_ai::upsert_briefing(db, &today.to_string(), trimmed, LLM_ID)?;
    tracing::info!(date = %today, len = trimmed.len(), "briefing cached");

    Ok(())
}

pub async fn generate_with_real_models(
    db: &Db,
    in_flight: &AtomicBool,
    embedder_slot: &std::sync::OnceLock<Arc<CandleEmbedder>>,
    model_dir: &Path,
    today: chrono::NaiveDate,
) -> Result<(), AppError> {
    let embedder = if let Some(e) = embedder_slot.get() {
        e.clone()
    } else {
        let e = Arc::new(
            CandleEmbedder::load(&model_dir.join("bge-small-en-v1.5"))
                .map_err(AppError::from)?,
        );
        let _ = embedder_slot.set(e.clone());
        embedder_slot.get().cloned().unwrap_or(e)
    };

    let runtime = CandleLlmRuntime::load(&model_dir.join("phi-3-mini-4k-instruct"))
        .map_err(AppError::from)?;

    let result = generate(db, in_flight, embedder.as_ref(), &runtime, today).await;
    drop(runtime);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::embedder::MockEmbedder;
    use crate::ai::runtime::MockLlmRuntime;
    use crate::store;
    use tempfile::tempdir;

    fn open_test_db() -> Db {
        let tmp = tempdir().expect("tempdir");
        let path = tmp.path().join("test.sqlite");
        let db = store::open(&path).expect("open db");
        std::mem::forget(tmp);
        db
    }

    #[tokio::test]
    async fn generate_writes_to_ai_briefings() {
        let db = open_test_db();
        let in_flight = AtomicBool::new(false);
        let emb = MockEmbedder::default();
        let llm = MockLlmRuntime::default();
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();

        generate(&db, &in_flight, &emb, &llm, today).await.expect("ok");

        let row = store::ai::get_briefing_for(&db, &today.to_string());
        assert!(row.is_some());
        let row = row.unwrap();
        assert!(row.text.contains("mock briefing"));
        assert_eq!(row.model_id, "phi-3-mini-4k-instruct-q4");
    }

    #[tokio::test]
    async fn generate_returns_ok_when_in_flight_already_true() {
        let db = open_test_db();
        let in_flight = AtomicBool::new(true);
        let emb = MockEmbedder::default();
        let llm = MockLlmRuntime::default();
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();

        generate(&db, &in_flight, &emb, &llm, today).await.expect("ok");

        assert!(store::ai::get_briefing_for(&db, &today.to_string()).is_none());
        assert!(in_flight.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn generate_resets_in_flight_on_success() {
        let db = open_test_db();
        let in_flight = AtomicBool::new(false);
        let emb = MockEmbedder::default();
        let llm = MockLlmRuntime::default();
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();

        generate(&db, &in_flight, &emb, &llm, today).await.expect("ok");

        assert!(!in_flight.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn generate_skips_cache_for_empty_output() {
        let db = open_test_db();
        let in_flight = AtomicBool::new(false);
        let emb = MockEmbedder::default();
        let llm = MockLlmRuntime {
            canned_response: "".to_string(),
            id: "mock-llm-v0",
        };
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();

        generate(&db, &in_flight, &emb, &llm, today).await.expect("ok");

        assert!(store::ai::get_briefing_for(&db, &today.to_string()).is_none());
    }
}
```

> **Adaptation notes (compile errors expected at first try):**
> - `MockEmbedder::default()` may not exist; check `embedder.rs` and use whatever constructor it provides.
> - `MockLlmRuntime` field names may differ slightly.
> - `top_k_by_cosine` signature in `retriever.rs` may take `&[Vec<f32>]` instead of `&[(Vec<f32>, T)]`. Adapt the call site.
> - `AppError::from` for `AiError` may not be `impl From<AiError>` — check `error.rs` and use the correct conversion.
> - `ChunkRow.embedding` field name may differ — check `corpus.rs` / `store/ai.rs`.

- [ ] **Step 4: Run tests**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::briefing 2>&1 | tail -20
```

Expected: 4 tests pass.

- [ ] **Step 5: Full suite check**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib 2>&1 | tail -3
```

Expected: 93 + 4 = 97 tests.

- [ ] **Step 6: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/briefing.rs \
        desktop-app-v3/src-tauri/src/ai/mod.rs \
        desktop-app-v3/src-tauri/src/ai/prompts.rs
git commit -m "feat(desktop-v3): briefing.rs orchestrator with drop-guard + empty-output skip"
```

---

### Task 6: Wire `scheduler::spawn` into `lib.rs::setup`

**Files:** Modify `desktop-app-v3/src-tauri/src/ai/scheduler.rs` and `desktop-app-v3/src-tauri/src/lib.rs`.

- [ ] **Step 1: Add `spawn` to `scheduler.rs`**

Append above the `#[cfg(test)]` block:

```rust
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};

pub fn spawn(
    app_handle: AppHandle,
    db: crate::store::Db,
    embedder_slot: Arc<std::sync::OnceLock<Arc<crate::ai::candle_embedder::CandleEmbedder>>>,
    in_flight: Arc<std::sync::atomic::AtomicBool>,
    model_dir: PathBuf,
) {
    tauri::async_runtime::spawn(async move {
        // 60s warmup so we don't fire on the literal first tick.
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;

            let now = chrono::Local::now();
            let labs = read_labs_flag(&app_handle);
            let status = match crate::store::ai::get_model_state(&db) {
                Ok(Some(state)) => state.status,
                _ => crate::store::ai::ModelStatus::NotStarted,
            };

            if !should_fire(now, &db, labs, status) {
                continue;
            }

            let today = now.date_naive();
            tracing::info!(date = %today, "scheduler firing briefing pipeline");

            match crate::ai::briefing::generate_with_real_models(
                &db,
                &in_flight,
                &embedder_slot,
                &model_dir,
                today,
            )
            .await
            {
                Ok(()) => {
                    let _ = app_handle.emit("ai-briefing-ready", today.to_string());
                }
                Err(e) => {
                    tracing::warn!(?e, "briefing generation failed");
                    let _ = app_handle.emit("ai-briefing-error", e.to_string());
                }
            }
        }
    });
}

fn read_labs_flag(app: &AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    match app.store("settings.json") {
        Ok(store) => store
            .get("ai.labs.enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        Err(_) => false,
    }
}
```

> **Note:** if `tauri_plugin_store::StoreExt::store()` returns a different shape in this codebase's version, look at how `lib/auth.ts` or `lib/preferences.ts` opens stores from the frontend and mirror the path. The filename `settings.json` is a Plan 1.5 standardization choice — if the codebase already uses `.flowshield.json` or similar, mirror that.

- [ ] **Step 2: Wire `spawn` into `setup` in `lib.rs`**

In `lib.rs`, find the `tauri::Builder::default() ... .setup(|app| { ... })` block. After the existing periodic-update-check spawn block (the one that calls `update::check_and_publish`), add (still inside `setup`):

```rust
            // Phase 1.5 — briefing scheduler. Re-checks labs flag and
            // model status every 60s; fires the pipeline at 5am local
            // (or any post-5am tick if the laptop slept through).
            {
                let state: tauri::State<'_, AppState> = app.state();
                let app_handle = app.handle().clone();
                if let Some(db) = state.db.get().cloned() {
                    let embedder = state.embedder.clone();
                    let in_flight = state.briefing_in_flight.clone();
                    let model_dir = app_data_dir.join("models");
                    crate::ai::scheduler::spawn(
                        app_handle,
                        db,
                        embedder,
                        in_flight,
                        model_dir,
                    );
                } else {
                    tracing::warn!("local store unavailable; briefing scheduler disabled");
                }
            }
```

- [ ] **Step 3: Verify build**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 4: Run full lib suite**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib 2>&1 | tail -3
```

Expected: 97 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/scheduler.rs \
        desktop-app-v3/src-tauri/src/lib.rs
git commit -m "feat(desktop-v3): wire briefing scheduler into Tauri setup"
```

---

### Task 7: Add Tauri commands `ai_briefing_today`, `ai_labs_*_enabled`, `ai_settings`

**Files:** Modify `desktop-app-v3/src-tauri/src/commands/ai.rs` and `desktop-app-v3/src-tauri/src/lib.rs`. Possibly add `count_chunks` to `desktop-app-v3/src-tauri/src/store/ai.rs`.

- [ ] **Step 1: Append the four new commands to `commands/ai.rs`**

```rust
// ---------- Plan 1.5 commands: briefing + labs flag + settings ----------

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::ai::briefing;
use crate::store::ai as store_ai;

#[derive(Serialize, Debug)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BriefingState {
    Ready { text: String, generated_at: String },
    Generating,
    EmptyState,
    Hidden,
    Error { message: String },
}

#[tauri::command]
pub async fn ai_briefing_today(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<BriefingState, String> {
    let db = match state.db.get() {
        Some(d) => d.clone(),
        None => return Ok(BriefingState::Hidden),
    };

    let today = chrono::Local::now().date_naive();
    let today_s = today.to_string();

    if let Some(row) = store_ai::get_briefing_for(&db, &today_s) {
        return Ok(BriefingState::Ready {
            text: row.text,
            generated_at: row.generated_at,
        });
    }

    let labs = read_labs_flag(&app);
    if !labs {
        return Ok(BriefingState::Hidden);
    }

    let status = store_ai::get_model_state(&db)
        .ok()
        .flatten()
        .map(|s| s.status)
        .unwrap_or(store_ai::ModelStatus::NotStarted);
    if !matches!(status, store_ai::ModelStatus::Ready) {
        return Ok(BriefingState::Hidden);
    }

    if !crate::ai::empty_state::has_minimum_data(&db) {
        return Ok(BriefingState::EmptyState);
    }

    let _ = app.emit("ai-briefing-generating", today_s.clone());
    let app_handle = app.clone();
    let db_clone = db.clone();
    let embedder = state.embedder.clone();
    let in_flight = state.briefing_in_flight.clone();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let model_dir = app_data_dir.join("models");

    tauri::async_runtime::spawn(async move {
        match briefing::generate_with_real_models(&db_clone, &in_flight, &embedder, &model_dir, today)
            .await
        {
            Ok(()) => {
                let _ = app_handle.emit("ai-briefing-ready", today.to_string());
            }
            Err(e) => {
                let _ = app_handle.emit("ai-briefing-error", e.to_string());
            }
        }
    });

    Ok(BriefingState::Generating)
}

#[tauri::command]
pub async fn ai_labs_set_enabled(enabled: bool, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("ai.labs.enabled", serde_json::Value::Bool(enabled));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn ai_labs_get_enabled(app: AppHandle) -> Result<bool, String> {
    Ok(read_labs_flag(&app))
}

#[derive(Serialize, Debug)]
pub struct AiSettings {
    pub labs_enabled: bool,
    pub model_id: String,
    pub embedder_id: String,
    pub status: String,
    pub disk_usage_bytes: u64,
    pub indexed_chunk_count: i64,
}

#[tauri::command]
pub async fn ai_settings(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<AiSettings, String> {
    let db = state.db.get().ok_or_else(|| "store unavailable".to_string())?;

    let labs_enabled = read_labs_flag(&app);

    let model_state = store_ai::get_model_state(db).ok().flatten();
    let status = match model_state.as_ref().map(|s| &s.status) {
        Some(store_ai::ModelStatus::Ready) => "ready",
        Some(store_ai::ModelStatus::Downloading) => "downloading",
        Some(store_ai::ModelStatus::Error) => "error",
        Some(store_ai::ModelStatus::Disabled) => "disabled",
        _ => "not_started",
    }
    .to_string();

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let models_dir = app_data_dir.join("models");
    let disk_usage_bytes = dir_size_bytes(&models_dir).unwrap_or(0);

    let indexed_chunk_count = store_ai::count_chunks(db).unwrap_or(0);

    Ok(AiSettings {
        labs_enabled,
        model_id: crate::ai::registry::LLM_ID.to_string(),
        embedder_id: crate::ai::registry::EMBEDDER_ID.to_string(),
        status,
        disk_usage_bytes,
        indexed_chunk_count,
    })
}

fn read_labs_flag(app: &AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    match app.store("settings.json") {
        Ok(store) => store
            .get("ai.labs.enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn dir_size_bytes(dir: &std::path::Path) -> std::io::Result<u64> {
    use std::fs;
    let mut total = 0u64;
    if !dir.exists() {
        return Ok(0);
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        if meta.is_file() {
            total += meta.len();
        } else if meta.is_dir() {
            total += dir_size_bytes(&entry.path()).unwrap_or(0);
        }
    }
    Ok(total)
}
```

- [ ] **Step 2: Add `count_chunks` to `store/ai.rs` if it doesn't exist**

```bash
grep -n "count_chunks" desktop-app-v3/src-tauri/src/store/ai.rs
```

If absent, append to `store/ai.rs`:

```rust
pub fn count_chunks(db: &Db) -> rusqlite::Result<i64> {
    let conn = db.lock().map_err(|_| {
        rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_INTERNAL),
            Some("mutex poisoned".into()),
        )
    })?;
    conn.query_row("SELECT COUNT(*) FROM ai_chunks", [], |r| r.get(0))
}
```

- [ ] **Step 3: Register the new commands in `lib.rs`**

In the existing `invoke_handler!` list, add:

```rust
            commands::ai::ai_briefing_today,
            commands::ai::ai_labs_get_enabled,
            commands::ai::ai_labs_set_enabled,
            commands::ai::ai_settings,
```

(Place with the other `commands::ai::*` lines.)

- [ ] **Step 4: Verify build**

```bash
cd desktop-app-v3/src-tauri && cargo check 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 5: Run full suite (no regressions)**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib 2>&1 | tail -3
```

Expected: 97 still pass.

- [ ] **Step 6: Commit**

```bash
git add desktop-app-v3/src-tauri/src/commands/ai.rs \
        desktop-app-v3/src-tauri/src/lib.rs \
        desktop-app-v3/src-tauri/src/store/ai.rs
git commit -m "feat(desktop-v3): briefing + labs + settings Tauri commands"
```

---

### Task 8: Frontend `lib/ai.ts` Zustand store

**Files:** Create `desktop-app-v3/src/lib/ai.ts`.

- [ ] **Step 1: Create the store file**

```typescript
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// Mirrors the Rust `BriefingState` enum (serde tagged on `status`).
export type BriefingState =
  | { status: 'ready'; text: string; generated_at: string }
  | { status: 'generating' }
  | { status: 'empty_state' }
  | { status: 'hidden' }
  | { status: 'error'; message: string };

export interface AiSettings {
  labs_enabled: boolean;
  model_id: string;
  embedder_id: string;
  status: 'ready' | 'downloading' | 'error' | 'not_started' | 'disabled';
  disk_usage_bytes: number;
  indexed_chunk_count: number;
}

interface AiStore {
  briefing: BriefingState;
  settings: AiSettings | null;
  refreshBriefing: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setLabsEnabled: (enabled: boolean) => Promise<void>;
  bootstrap: () => Promise<UnlistenFn>;
}

export const useAIStore = create<AiStore>((set, get) => ({
  briefing: { status: 'hidden' },
  settings: null,

  refreshBriefing: async () => {
    try {
      const state = await invoke<BriefingState>('ai_briefing_today');
      set({ briefing: state });
    } catch (e) {
      set({ briefing: { status: 'error', message: String(e) } });
    }
  },

  refreshSettings: async () => {
    try {
      const settings = await invoke<AiSettings>('ai_settings');
      set({ settings });
    } catch (e) {
      console.error('ai_settings failed:', e);
    }
  },

  setLabsEnabled: async (enabled) => {
    await invoke('ai_labs_set_enabled', { enabled });
    await get().refreshSettings();
    await get().refreshBriefing();
  },

  bootstrap: async () => {
    await get().refreshSettings();
    await get().refreshBriefing();

    const unReady = await listen<string>('ai-briefing-ready', () => {
      void get().refreshBriefing();
    });
    const unGenerating = await listen<string>('ai-briefing-generating', () => {
      set({ briefing: { status: 'generating' } });
    });
    const unError = await listen<string>('ai-briefing-error', (evt) => {
      set({ briefing: { status: 'error', message: String(evt.payload) } });
    });

    return () => {
      unReady();
      unGenerating();
      unError();
    };
  },
}));

export const selectBriefingVisible = (s: AiStore) =>
  s.briefing.status !== 'hidden';
```

- [ ] **Step 2: Type-check**

```bash
cd desktop-app-v3 && npx tsc --noEmit 2>&1 | tail -10
```

Expected: clean (or pre-existing unrelated errors only).

- [ ] **Step 3: Commit**

```bash
git add desktop-app-v3/src/lib/ai.ts
git commit -m "feat(desktop-v3): Zustand store + Tauri event listeners for AI briefing"
```

---

### Task 9: Frontend `BriefingCard.tsx`

**Files:** Create `desktop-app-v3/src/components/BriefingCard.tsx`.

- [ ] **Step 1: Read `UpdateBanner.tsx` for style + Tailwind class conventions**

```bash
cat desktop-app-v3/src/components/UpdateBanner.tsx
```

- [ ] **Step 2: Create `BriefingCard.tsx`**

```tsx
import { useEffect } from 'react';
import { useAIStore, selectBriefingVisible } from '../lib/ai';

/**
 * Top-of-dashboard card that renders the day's AI briefing. Four render
 * states: skeleton (generating), ready (text), error (with retry hint),
 * hidden (no labs / no model / empty state). The store decides which
 * state we're in; this component just renders.
 */
export function BriefingCard() {
  const briefing = useAIStore((s) => s.briefing);
  const visible = useAIStore(selectBriefingVisible);
  const refresh = useAIStore((s) => s.refreshBriefing);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!visible) return null;

  if (briefing.status === 'generating') {
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 mb-4 animate-pulse">
        <div className="flex items-center gap-2 text-sm text-sky-700">
          <span>✨</span>
          <span>Generating today's briefing… ~30s</span>
        </div>
      </div>
    );
  }

  if (briefing.status === 'empty_state') {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4">
        <div className="text-sm text-slate-600">
          ✨ Complete a few more focus sessions to unlock your AI briefing.
        </div>
      </div>
    );
  }

  if (briefing.status === 'error') {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 mb-4">
        <div className="text-sm text-rose-700">
          ✨ Briefing unavailable: {briefing.message}
        </div>
      </div>
    );
  }

  // status === 'ready'
  const generatedAt = new Date(briefing.generated_at);
  const generatedAtLabel = isNaN(generatedAt.getTime())
    ? ''
    : ` · generated ${generatedAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 mb-4">
      <div className="text-xs text-sky-600 mb-1">
        ✨ Today's briefing{generatedAtLabel}
      </div>
      <p className="text-sm text-slate-800 whitespace-pre-wrap">{briefing.text}</p>
    </div>
  );
}
```

> **Tailwind class note:** Use whatever palette `UpdateBanner.tsx` uses. Adapt shades to match that file.

- [ ] **Step 3: Type-check**

```bash
cd desktop-app-v3 && npx tsc --noEmit 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src/components/BriefingCard.tsx
git commit -m "feat(desktop-v3): BriefingCard component with skeleton/ready/error/empty states"
```

---

### Task 10: Frontend `SettingsAiPage.tsx` + route

**Files:**
- Create: `desktop-app-v3/src/routes/SettingsAiPage.tsx`
- Modify: `desktop-app-v3/src/App.tsx`

- [ ] **Step 1: Create `SettingsAiPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { useAIStore } from '../lib/ai';
import { Button } from '../components/Button';

/**
 * Settings page for the Local AI substrate. Three sections:
 *  - Beta toggle (`ai.labs.enabled` flag)
 *  - Status (model id + ready/downloading/error + disk usage + chunk count)
 *  - Actions (Re-download, Delete AI data)
 */
export function SettingsAiPage() {
  const navigate = useNavigate();
  const settings = useAIStore((s) => s.settings);
  const refreshSettings = useAIStore((s) => s.refreshSettings);
  const setLabsEnabled = useAIStore((s) => s.setLabsEnabled);

  const [busy, setBusy] = useState<null | 'redownload' | 'delete'>(null);
  const [busyMessage, setBusyMessage] = useState<string>('');

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  if (!settings) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  const diskMB = (settings.disk_usage_bytes / (1024 * 1024)).toFixed(1);

  const handleRedownload = async () => {
    setBusy('redownload');
    setBusyMessage('Starting download…');
    try {
      await invoke('ai_model_download_start');
      setBusyMessage('Download started — see status above.');
      await refreshSettings();
    } catch (e) {
      setBusyMessage(`Failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete all local AI data? This wipes embeddings, briefings, and model files.')) {
      return;
    }
    setBusy('delete');
    setBusyMessage('Deleting…');
    try {
      await invoke('ai_data_delete');
      setBusyMessage('Deleted.');
      await refreshSettings();
    } catch (e) {
      setBusyMessage(`Failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Local AI</h1>
        <Button onClick={() => navigate('/')}>Back</Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-700">Beta</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.labs_enabled}
            onChange={(e) => void setLabsEnabled(e.target.checked)}
          />
          <span className="text-sm text-slate-700">
            Enable Local AI (Beta) — runs Phi-3-mini + BGE-small entirely on this device
          </span>
        </label>
      </section>

      <section className="space-y-1 text-sm text-slate-700">
        <h2 className="text-sm font-medium text-slate-700">Status</h2>
        <div>Model: {settings.model_id}</div>
        <div>Embedder: {settings.embedder_id}</div>
        <div>Status: <span className="font-mono">{settings.status}</span></div>
        <div>Disk usage: {diskMB} MB</div>
        <div>Indexed chunks: {settings.indexed_chunk_count}</div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-700">Actions</h2>
        <div className="flex gap-2">
          <Button onClick={handleRedownload} disabled={busy !== null}>
            Re-download
          </Button>
          <Button onClick={handleDelete} disabled={busy !== null}>
            Delete AI data
          </Button>
        </div>
        {busyMessage && (
          <div className="text-xs text-slate-500">{busyMessage}</div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Add route + bootstrap in `App.tsx`**

In `desktop-app-v3/src/App.tsx`, add the new imports near the existing route imports:

```tsx
import { SettingsAiPage } from './routes/SettingsAiPage';
import { useAIStore } from './lib/ai';
```

Find the existing `<Routes>` block and insert the new route before the catch-all:

```tsx
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<DashboardPage />} />
      <Route path="/settings/ai" element={<SettingsAiPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
```

Find the existing `useUpdateStore.getState().bootstrap()` `useEffect` block. Add a sibling block:

```tsx
  useEffect(() => {
    const unlistenPromise = useAIStore.getState().bootstrap();
    return () => {
      void unlistenPromise.then((fn) => fn());
    };
  }, []);
```

- [ ] **Step 3: Type-check**

```bash
cd desktop-app-v3 && npx tsc --noEmit 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src/routes/SettingsAiPage.tsx \
        desktop-app-v3/src/App.tsx
git commit -m "feat(desktop-v3): /settings/ai page with labs toggle + status + actions"
```

---

### Task 11: Mount `<BriefingCard />` on `DashboardPage`

**Files:** Modify `desktop-app-v3/src/routes/DashboardPage.tsx`.

- [ ] **Step 1: Read the existing dashboard layout**

```bash
cat desktop-app-v3/src/routes/DashboardPage.tsx | head -80
```

Look for where `<UpdateBanner />` (or equivalent top-of-page card) is mounted. The briefing card goes immediately after.

- [ ] **Step 2: Insert `<BriefingCard />`**

Add the import at the top:

```tsx
import { BriefingCard } from '../components/BriefingCard';
import { Link } from 'react-router-dom';
```

In the JSX, find the spot where `<UpdateBanner />` is rendered and insert directly below:

```tsx
        <BriefingCard />
```

If `<UpdateBanner />` is mounted in `App.tsx` instead of `DashboardPage`, mount `<BriefingCard />` between the dashboard header and main content section.

- [ ] **Step 3: Add a "AI Settings" link from the dashboard header**

In the dashboard header area (next to existing controls), add:

```tsx
<Link to="/settings/ai" className="text-xs text-slate-500 hover:text-slate-700">
  AI Settings
</Link>
```

If there's no header pattern for settings links, put it in a small footer area — it just needs to be reachable from the dashboard.

- [ ] **Step 4: Type-check**

```bash
cd desktop-app-v3 && npx tsc --noEmit 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src/routes/DashboardPage.tsx
git commit -m "feat(desktop-v3): mount BriefingCard + AI settings link on dashboard"
```

---

### Task 12: Gated end-to-end integration test

**Files:** Append to `desktop-app-v3/src-tauri/src/ai/briefing.rs` `tests` block.

- [ ] **Step 1: Append the gated test inside the existing `mod tests { ... }` block, before the closing `}`**

```rust
    /// End-to-end pipeline against real BGE + Phi-3 weights. Skipped
    /// unless FLOWSHIELD_AI_TESTS=1 + FLOWSHIELD_AI_TEST_MODELS_DIR is set.
    #[test]
    fn briefing_pipeline_with_real_models() {
        if std::env::var("FLOWSHIELD_AI_TESTS").ok().as_deref() != Some("1") {
            eprintln!("skipped: FLOWSHIELD_AI_TESTS != 1");
            return;
        }
        let base = match std::env::var("FLOWSHIELD_AI_TEST_MODELS_DIR") {
            Ok(p) => std::path::PathBuf::from(p),
            Err(_) => {
                eprintln!("skipped: FLOWSHIELD_AI_TEST_MODELS_DIR unset");
                return;
            }
        };

        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("rt");

        // Seed enough sessions for has_minimum_data to pass.
        let db = open_test_db();
        {
            let conn = db.lock().unwrap();
            let now = chrono::Utc::now();
            for i in 0..6 {
                let dt = now - chrono::Duration::days(i);
                conn.execute(
                    "INSERT INTO sessions (id, started_at, ended_at, kind, planned_minutes, source) \
                     VALUES (?, ?, ?, 'work', 60, 'desktop')",
                    rusqlite::params![
                        format!("eval-{}", i),
                        dt.format("%Y-%m-%d %H:%M:%S").to_string(),
                        (dt + chrono::Duration::hours(1))
                            .format("%Y-%m-%d %H:%M:%S")
                            .to_string(),
                    ],
                )
                .unwrap();
            }
        }

        let in_flight = std::sync::atomic::AtomicBool::new(false);
        let embedder_slot = std::sync::OnceLock::new();
        let today = chrono::Local::now().date_naive();

        rt.block_on(async {
            super::generate_with_real_models(&db, &in_flight, &embedder_slot, &base, today)
                .await
                .expect("generate");
        });

        let row = crate::store::ai::get_briefing_for(&db, &today.to_string());
        assert!(row.is_some(), "expected a briefing row to be cached");
        let row = row.unwrap();
        eprintln!("Briefing generated: {:?}", row.text);
        assert!(!row.text.is_empty());
        assert!(row.text.len() <= 400, "text too long: {} chars", row.text.len());
    }
```

- [ ] **Step 2: Run the gated test**

```bash
cd desktop-app-v3/src-tauri
FLOWSHIELD_AI_TESTS=1 \
  FLOWSHIELD_AI_TEST_MODELS_DIR=$HOME/flowshield-test-models \
  cargo test --release --lib ai::briefing::tests::briefing_pipeline_with_real_models -- --nocapture 2>&1 | tail -20
```

Expected: 1 passing test, 30-60s. Print the actual generated briefing text.

- [ ] **Step 3: Verify the gate keeps default test runs silent**

```bash
cd desktop-app-v3/src-tauri && cargo test --lib ai::briefing 2>&1 | tail -3
```

Expected: 5 tests run; the gated one prints "skipped" and passes.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/briefing.rs
git commit -m "test(desktop-v3): gated end-to-end briefing pipeline with real models"
```

---

### Task 13: Push branch + open PR

- [ ] **Step 1: Push branch**

```bash
cd /home/asifchowdhury/Projects/ag-projects/FlowShield
git push -u origin feat/local-ai-briefing
```

- [ ] **Step 2: Open PR via `gh`**

```bash
gh pr create --title "feat(desktop-v3): Local AI briefing pipeline + UI (Phase 1.5)" \
  --body "$(cat <<'EOF'
## Summary

Phase 1.5 of the Local AI rollout. Wires the BGE-small embedder (PR #74) and Phi-3-mini LLM (PR #75) into a user-visible daily briefing on the desktop dashboard, gated behind a labs flag.

**Predecessor plans:** PR #70 (substrate), PR #72 (downloader), PR #74 (embedder), PR #75 (LLM).
**Spec:** \`docs/superpowers/specs/2026-05-07-local-ai-briefing-phase-1.5-design.md\`.
**Plan:** \`docs/superpowers/plans/2026-05-07-local-ai-briefing-phase-1.5.md\`.

## What's in

- **Backend modules:** \`ai/empty_state.rs\` (≥5-completed-sessions threshold), \`ai/scheduler.rs\` (5am tick + post-sleep recovery), \`ai/briefing.rs\` (orchestrator with drop-guard for in-flight flag), 4 new Tauri commands.
- **Frontend:** \`lib/ai.ts\` Zustand store, \`BriefingCard.tsx\` (skeleton/ready/error/empty states), \`SettingsAiPage.tsx\` (\`/settings/ai\` route — labs toggle + status + re-download + delete).
- **AppState extensions:** \`embedder: OnceLock<Arc<CandleEmbedder>>\` (long-lived, lazy) + \`briefing_in_flight: AtomicBool\` (race guard).
- **Tauri events:** \`ai-briefing-ready\`, \`ai-briefing-generating\`, \`ai-briefing-error\`.
- **15 new unit tests** + 1 gated integration test against real BGE + Phi-3 weights.

## Architecture decisions (locked during brainstorming)

| | |
|---|---|
| Latency | Pre-compute at 5am local + lazy fallback if no cached row exists when dashboard opens. |
| Scope | Briefing only; reflection deferred to Plan 1.6. |
| Gating | Labs flag (\`ai.labs.enabled\`, defaults \`false\`). Promote to default-visible after 1-2 weeks of dogfood. |
| Length | 80-token cap (~16-25s on commodity CPU). |
| Schedule | Fixed 5am local (no per-user picker in v1). |
| LLM lifecycle | Loaded fresh per generation, dropped to free RAM and sidestep Plan 1.4's KV-cache constraint. |
| Embedder lifecycle | \`OnceLock\` — long-lived, ~135 MB resident. |

## What's out (deferred)

- Evening reflection prompt + dialog → Plan 1.6
- Tray menu entries → Plan 1.6
- "↻ Regenerate" button → Plan 1.6
- Reflection-time picker setting → Plan 1.6
- Streaming token callback → deferred unless 1.6 demands it
- Frontend Vitest setup → out of scope, separate tooling task

## Test plan

- [ ] \`cargo check\` clean
- [ ] \`cargo test --lib\` — 97 tests pass (82 baseline + 15 new)
- [ ] With \`FLOWSHIELD_AI_TESTS=1\`: gated \`briefing_pipeline_with_real_models\` produces a coherent briefing in 30-60s (release mode)
- [ ] Manual smoke (\`npm run tauri:dev\`): toggle labs ON in \`/settings/ai\` → consent card appears → re-download flow → BriefingCard renders skeleton then ready
- [ ] Empty state: with <5 sessions in DB, BriefingCard shows "Complete a few more focus sessions to unlock your AI briefing"

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Capture the PR URL** and paste it back so the human reviewer can find it.

---

## Risk callouts

| Risk | Mitigation |
|---|---|
| `prompts.rs` may not have a `render_briefing_prompt` function with the expected signature | Task 5 Step 2 inspects + adapts. If absent, add the minimal pub function shown there. |
| `top_k_by_cosine` may take payload-less vectors | Task 5 adapts the orchestrator's call site rather than restructuring `retriever.rs`. |
| Schema column names in `sessions` may differ from `started_at`/`ended_at` | Tasks 3, 4, 12 mention this — adapt SQL to actual schema in `store/mod.rs`. |
| `tauri-plugin-store` API may differ slightly (sync vs async, store filename) | Tasks 6, 7 use `app.store("settings.json")` — if the codebase uses a different filename or API shape, mirror that. |
| `MockEmbedder::default()` may not exist | Task 5 notes this; constructor adaptation is mechanical. |
| Lazy fallback + 5am scheduler racing | `briefing_in_flight: AtomicBool` + `compare_exchange` resolves; first call wins, second returns Ok early. |
| 60s warmup before first scheduler tick masks bugs during dev | Acceptable — matches the existing `update::check_and_publish` warmup pattern. Manual smoke test in Tasks 11, 12 catches this. |
| Frontend bootstrap fires before Tauri backend is ready, `ai_settings` errors on first call | `refreshSettings`'s catch swallows the error and leaves `settings: null` → page shows "Loading…" until the next call succeeds. Acceptable. |

---

## Verification (post-merge, optional manual smoke)

```bash
# 1. Start the dev build
cd desktop-app-v3 && npm run tauri:dev

# 2. In the UI:
#    - Open /settings/ai (via dashboard "AI Settings" link)
#    - Toggle "Enable Local AI (Beta)" ON
#    - Click "Re-download" → wait for "ready" status (~5 min on first install)
#    - Navigate back to /
#    - BriefingCard should appear; skeleton if generating, ready if cached

# 3. Force-trigger a briefing (dev only):
sqlite3 ~/.local/share/app.flowshield.desktop/local.sqlite \
  "DELETE FROM ai_briefings WHERE date = date('now');"
# Then reload the dashboard; BriefingCard renders skeleton, then ready.

# 4. Inspect the cached briefing:
sqlite3 ~/.local/share/app.flowshield.desktop/local.sqlite \
  "SELECT date, length(text), text FROM ai_briefings;"
```

**Phase 1.5 → Phase 1.6 graduation criteria:**
- 1-2 weeks of labs-flag dogfood with no P0/P1 bugs
- Manual eval (`eval/briefings.md`) shows on-topic outputs across diverse session shapes
- RAM peak measured (<3.5 GB target)
- Settings page Delete + Re-download buttons verified working end-to-end

Plan 1.6 (reflection prompt + dialog + scheduler + tray menu) is the next step after this lands.
