# Local AI Corpus Indexer — Phase 1.6c (Reflections) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each evening, generate one specific reflection **question** from the day's sessions (local LLM); let the user answer it; persist the answer and index it as a `Reflection` chunk so the next morning's briefing references it.

**Architecture:** A new `ai/reflection.rs` gathers today's session-chunk texts, renders the existing `REFLECTION_TEMPLATE` prompt, runs the Phi-3 LLM once to produce a question, and stores it as a *pending* `ai_reflections` row (answer empty). The scheduler fires this after 18:00 local, once per day, sharing the briefing's `in_flight` guard so two LLM loads never overlap. Two Tauri commands expose the pending question and accept the answer; answering upserts the row and indexes a `Reflection` chunk. A `ReflectionCard` on the dashboard renders the question + a textarea, mirroring `BriefingCard`.

**Tech Stack:** Rust, Tauri 2, rusqlite, candle (Phi-3 LLM + BGE-small embedder), tokio, chrono, serde_json; React 19 + Zustand + Tailwind (frontend).

## Global Constraints

- Component: `desktop-app-v3`. Rust under `src-tauri/`, frontend under `src/`. Paths relative to repo root.
- A **pending** reflection is an `ai_reflections` row whose `answer` is the empty string `""`. `ai_reflections.answer` is `NOT NULL` and `date` is `UNIQUE`.
- Generation is **best-effort**: errors logged via `tracing` + swallowed; never panics; runs in the scheduler's spawned task. Answering, by contrast, MUST persist the answer even if the subsequent chunk-index fails (index is best-effort).
- Gate generation on: labs flag true AND model `Ready` AND local hour ≥ 18 AND no reflection row exists for today yet AND there is ≥1 session chunk today (nothing to ask about otherwise).
- LLM concurrency: reuse `state.briefing_in_flight: Arc<AtomicBool>` so reflection generation and briefing generation never run two Phi-3 loads at once.
- The LLM is loaded fresh, used once, dropped (candle 0.8 KV cache isn't resettable) — same as the briefing pipeline.
- No `std::sync::Mutex` guard held across `.await`. No `unwrap` in non-test production code. `EMBEDDING_DIM = 384`.
- Frontend: `npm run typecheck` (`tsc --noEmit`) must pass clean. Follow `BriefingCard` + `useAIStore` conventions.
- Run Rust tests from `desktop-app-v3/src-tauri`: `cargo test --lib <filter>`.

---

### Task 1: Store helper — today's session-chunk texts

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/store/ai.rs`

**Interfaces:**
- Produces: `pub fn list_chunk_texts_for_source_since(conn: &Connection, source: ChunkSource, since_rfc3339: &str) -> Result<Vec<String>, AppError>`

- [ ] **Step 1: Write the failing test**

Add to the `#[cfg(test)] mod tests` in `store/ai.rs` (use `Connection::open_in_memory()` + `migrate(&conn)` like the sibling tests; `sample_chunk(id, source)` exists and builds a `Chunk` with a fixed `created_at` — adapt the `created_at` fields directly as shown so the filter is exercised):

```rust
    #[test]
    fn list_chunk_texts_for_source_since_filters_by_source_and_time() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();

        let mut s = sample_chunk("session:1", ChunkSource::Session);
        s.text = "[Session] today A".into();
        s.created_at = "2026-06-23T09:00:00Z".into();
        insert_chunk(&conn, &s).unwrap();

        let mut s2 = sample_chunk("session:2", ChunkSource::Session);
        s2.text = "[Session] today B".into();
        s2.created_at = "2026-06-23T11:00:00Z".into();
        insert_chunk(&conn, &s2).unwrap();

        // Different source — must be excluded.
        let mut d = sample_chunk("activity_day:2026-06-23", ChunkSource::ActivityDay);
        d.created_at = "2026-06-23T23:59:59Z".into();
        insert_chunk(&conn, &d).unwrap();

        // Older session — before the cutoff, excluded.
        let mut old = sample_chunk("session:old", ChunkSource::Session);
        old.created_at = "2026-06-22T09:00:00Z".into();
        insert_chunk(&conn, &old).unwrap();

        let texts = list_chunk_texts_for_source_since(&conn, ChunkSource::Session, "2026-06-23T00:00:00Z").unwrap();
        assert_eq!(texts, vec!["[Session] today A".to_string(), "[Session] today B".to_string()]);
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --lib store::ai 2>&1 | tail -20`
Expected: FAIL — `cannot find function list_chunk_texts_for_source_since`.

- [ ] **Step 3: Implement**

Add to `store/ai.rs` (near `list_chunks_since`; `ChunkSource::as_str` is public):

```rust
/// Texts of chunks of one `source` whose `created_at` is at or after
/// `since_rfc3339`, ordered oldest-first. Used by reflection generation to
/// gather "today's sessions" for the prompt.
pub fn list_chunk_texts_for_source_since(
    conn: &Connection,
    source: ChunkSource,
    since_rfc3339: &str,
) -> Result<Vec<String>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT text FROM ai_chunks
             WHERE source = ? AND created_at >= ?
             ORDER BY created_at",
        )
        .map_err(|e| AppError::Storage(format!("list_chunk_texts prepare: {e}")))?;
    let rows = stmt
        .query_map(params![source.as_str(), since_rfc3339], |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Storage(format!("list_chunk_texts query: {e}")))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| AppError::Storage(format!("list_chunk_texts row: {e}")))?);
    }
    Ok(out)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test --lib store::ai 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/store/ai.rs
git commit -m "feat(desktop-v3): list_chunk_texts_for_source_since (1.6c)"
```

---

### Task 2: Reflection question generation (`ai/reflection.rs`)

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/reflection.rs`
- Modify: `desktop-app-v3/src-tauri/src/ai/mod.rs` (add `pub mod reflection;`)

**Interfaces:**
- Consumes: `ai::prompts::{render_reflection_prompt, ReflectionContext}`, `ai::runtime::LlmRuntime`, `ai::candle_llm::CandleLlmRuntime`, `store::ai::{Reflection, upsert_reflection, get_reflection_by_date, list_chunk_texts_for_source_since, ChunkSource}`, `store::Db`.
- Produces:
  - `pub async fn build_question<L: LlmRuntime + ?Sized>(llm: &L, session_texts: &[String]) -> Result<String, AiError>`
  - `pub fn pending_reflection(date: &str, question: String, now_rfc3339: String) -> Reflection`
  - `pub async fn generate_and_store_question(db: &Db, in_flight: &std::sync::atomic::AtomicBool, model_dir: &std::path::Path, today: chrono::NaiveDate) -> Result<bool, AppError>` (returns `Ok(true)` if a question was stored, `Ok(false)` if skipped — already present, no sessions, or a generation already in flight)

**Constant:** `REFLECTION_MAX_TOKENS: usize = 40` (a question, short).

- [ ] **Step 1: Write the failing tests**

Create `desktop-app-v3/src-tauri/src/ai/reflection.rs` with the test module first:

```rust
//! Evening reflection-question generation. Gathers today's session chunks,
//! prompts the local LLM for ONE specific question, and stores it as a
//! pending ai_reflections row (answer = "") for the user to answer.

use crate::ai::prompts::{render_reflection_prompt, ReflectionContext};
use crate::ai::runtime::LlmRuntime;
use crate::error::AiError;
use crate::store::ai::{self as store_ai, Reflection};
use crate::store::Db;

const REFLECTION_MAX_TOKENS: usize = 40;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::runtime::MockLlmRuntime;

    #[tokio::test]
    async fn build_question_renders_prompt_and_returns_trimmed_llm_output() {
        let llm = MockLlmRuntime {
            canned_response: "  What blocked your 9am session?  ".to_string(),
            id: "mock-llm-v0",
        };
        let texts = vec!["[Session] Tue 2026-06-23 09:00-09:20 (60min planned, 20min actual).".to_string()];
        let q = build_question(&llm, &texts).await.unwrap();
        assert_eq!(q, "What blocked your 9am session?");
    }

    #[test]
    fn pending_reflection_has_empty_answer_and_the_question() {
        let r = pending_reflection("2026-06-23", "What went well?".into(), "2026-06-23T18:05:00Z".into());
        assert_eq!(r.date, "2026-06-23");
        assert_eq!(r.questions, vec!["What went well?".to_string()]);
        assert_eq!(r.answer, "");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --lib ai::reflection 2>&1 | tail -20`
Expected: FAIL — `cannot find function build_question` / `pending_reflection`.

- [ ] **Step 3: Register the module + implement the pure helpers**

In `desktop-app-v3/src-tauri/src/ai/mod.rs`, add (alphabetical, after `pub mod prompts;` — adjust to actual ordering):

```rust
pub mod reflection;
```

Add the implementation to `reflection.rs` above the test module:

```rust
/// Render the reflection prompt over today's session texts and ask the LLM
/// for one short question. Returns the trimmed model output.
pub async fn build_question<L: LlmRuntime + ?Sized>(
    llm: &L,
    session_texts: &[String],
) -> Result<String, AiError> {
    let prompt = render_reflection_prompt(&ReflectionContext { chunks: session_texts });
    let raw = llm.generate(&prompt, REFLECTION_MAX_TOKENS).await?;
    Ok(raw.trim().to_string())
}

/// Build a *pending* reflection row (answer empty) for `date`.
pub fn pending_reflection(date: &str, question: String, now_rfc3339: String) -> Reflection {
    Reflection {
        id: format!("reflection-{date}"),
        date: date.to_string(),
        questions: vec![question],
        answer: String::new(),
        created_at: now_rfc3339,
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --lib ai::reflection 2>&1 | tail -20`
Expected: PASS — 2 passed.

- [ ] **Step 5: Implement the production wrapper**

Append to `reflection.rs` (extend imports with `use crate::ai::candle_llm::CandleLlmRuntime; use crate::store::ai::ChunkSource; use std::sync::atomic::{AtomicBool, Ordering};`):

```rust
/// RAII guard releasing the in-flight flag on drop (panic-safe).
struct InFlightGuard<'a>(&'a AtomicBool);
impl Drop for InFlightGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Evening pipeline: if today has no reflection row yet and has ≥1 session
/// chunk, prompt the LLM for a question and store it pending. Shares the
/// briefing `in_flight` flag so two Phi-3 loads never overlap. Returns
/// Ok(false) when skipped. Best-effort: the caller logs+swallows the error.
pub async fn generate_and_store_question(
    db: &Db,
    in_flight: &AtomicBool,
    model_dir: &std::path::Path,
    today: chrono::NaiveDate,
) -> Result<bool, AppError> {
    let today_s = today.to_string();

    // Skip if a row already exists for today.
    {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        if store_ai::get_reflection_by_date(&conn, &today_s)?.is_some() {
            return Ok(false);
        }
    }

    // Gather today's session texts (local-midnight cutoff, RFC 3339 Z form to
    // match how session chunks store created_at).
    let since = format!("{today_s}T00:00:00Z");
    let texts = {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        store_ai::list_chunk_texts_for_source_since(&conn, ChunkSource::Session, &since)?
    };
    if texts.is_empty() {
        return Ok(false); // nothing to reflect on
    }

    // Acquire the shared LLM in-flight flag; bail if a generation is running.
    if in_flight
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(false);
    }
    let _guard = InFlightGuard(in_flight);

    let runtime = CandleLlmRuntime::load(&model_dir.join("phi-3-mini-4k-instruct"))?;
    let question = build_question(&runtime, &texts).await?;
    drop(runtime);

    if question.is_empty() {
        return Ok(false);
    }

    let now = chrono::Utc::now().to_rfc3339();
    let row = pending_reflection(&today_s, question, now);
    {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        store_ai::upsert_reflection(&conn, &row)?;
    }
    Ok(true)
}
```

- [ ] **Step 6: Verify build + full lib suite**

Run: `cargo test --lib 2>&1 | tail -15`
Expected: PASS — all green. `generate_and_store_question` is unused until Task 4 wires it (transient `dead_code` warning is expected and clears in Task 4).

- [ ] **Step 7: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/reflection.rs desktop-app-v3/src-tauri/src/ai/mod.rs
git commit -m "feat(desktop-v3): reflection question generation (1.6c)"
```

---

### Task 3: Tauri commands — `ai_reflection_today` + `ai_reflection_answer`

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/commands/ai.rs`
- Modify: `desktop-app-v3/src-tauri/src/lib.rs` (register both commands)

**Interfaces:**
- Produces:
  - `pub enum ReflectionState { Pending { question: String }, Answered, Hidden }` (serde tagged `status`, snake_case)
  - `pub(crate) fn reflection_state_from(row: Option<store_ai::Reflection>, labs_enabled: bool) -> ReflectionState`
  - `#[tauri::command] pub async fn ai_reflection_today(state, app) -> Result<ReflectionState, String>`
  - `#[tauri::command] pub async fn ai_reflection_answer(state, app, answer: String) -> Result<(), String>`

- [ ] **Step 1: Write the failing test for the pure mapping**

Add to the `#[cfg(test)] mod tests` in `commands/ai.rs` (create the module if none exists; import what's needed):

```rust
    use super::*;
    use crate::store::ai::Reflection;

    fn row(answer: &str) -> Reflection {
        Reflection {
            id: "reflection-2026-06-23".into(),
            date: "2026-06-23".into(),
            questions: vec!["What blocked you?".into()],
            answer: answer.into(),
            created_at: "2026-06-23T18:05:00Z".into(),
        }
    }

    #[test]
    fn reflection_state_maps_pending_answered_hidden() {
        // labs off → always Hidden
        assert!(matches!(reflection_state_from(Some(row("")), false), ReflectionState::Hidden));
        // no row → Hidden
        assert!(matches!(reflection_state_from(None, true), ReflectionState::Hidden));
        // empty answer → Pending with the question
        match reflection_state_from(Some(row("")), true) {
            ReflectionState::Pending { question } => assert_eq!(question, "What blocked you?"),
            other => panic!("expected Pending, got {other:?}"),
        }
        // non-empty answer → Answered
        assert!(matches!(reflection_state_from(Some(row("it was fine")), true), ReflectionState::Answered));
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --lib commands::ai 2>&1 | tail -20`
Expected: FAIL — `cannot find type ReflectionState` / `reflection_state_from`.

- [ ] **Step 3: Implement the enum, mapping, and commands**

Add to `commands/ai.rs` (the file already imports `State`, `AppHandle`, `Manager`, `Emitter`, and aliases `store_ai`; it uses `crate::ai::...` paths elsewhere. Add `#[derive(Debug)]` so the test's `{other:?}` works):

```rust
#[derive(Serialize, Debug)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ReflectionState {
    Pending { question: String },
    Answered,
    Hidden,
}

/// Pure mapping from a stored reflection row (or none) + labs flag to the
/// UI state. Hidden when labs off, no row, or a row with no question.
pub(crate) fn reflection_state_from(
    row: Option<store_ai::Reflection>,
    labs_enabled: bool,
) -> ReflectionState {
    if !labs_enabled {
        return ReflectionState::Hidden;
    }
    match row {
        Some(r) => {
            if r.answer.is_empty() {
                match r.questions.into_iter().next() {
                    Some(question) => ReflectionState::Pending { question },
                    None => ReflectionState::Hidden,
                }
            } else {
                ReflectionState::Answered
            }
        }
        None => ReflectionState::Hidden,
    }
}

/// Today's reflection state for the dashboard card.
#[tauri::command]
pub async fn ai_reflection_today(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<ReflectionState, String> {
    let labs = labs_enabled(&app);
    let db = match state.db.get() {
        Some(d) => d.clone(),
        None => return Ok(ReflectionState::Hidden),
    };
    let today = chrono::Local::now().date_naive().to_string();
    let row = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        store_ai::get_reflection_by_date(&conn, &today).map_err(|e| e.to_string())?
    };
    Ok(reflection_state_from(row, labs))
}

/// Persist the user's answer to today's reflection, then index it as a
/// Reflection chunk (best-effort). The answer save is the contract; a
/// chunk-index failure is logged, not fatal.
#[tauri::command]
pub async fn ai_reflection_answer(
    state: State<'_, crate::AppState>,
    app: AppHandle,
    answer: String,
) -> Result<(), String> {
    let db = state
        .db
        .get()
        .cloned()
        .ok_or_else(|| "local DB not initialized".to_string())?;
    let today = chrono::Local::now().date_naive();
    let today_s = today.to_string();

    // Load today's pending row; update its answer; upsert.
    let updated = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        let mut row = store_ai::get_reflection_by_date(&conn, &today_s)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no reflection for today".to_string())?;
        row.answer = answer;
        store_ai::upsert_reflection(&conn, &row).map_err(|e| e.to_string())?;
        row
    };

    // Best-effort: index the answered reflection as a chunk for retrieval.
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let model_dir = app_data_dir.join("models");
        let questions = updated.questions.clone();
        let answer_text = updated.answer.clone();
        let embedder_slot = state.embedder.clone();
        let db2 = db.clone();
        let date_for_chunk = today;
        let today_for_chunk = today_s.clone();
        tauri::async_runtime::spawn(async move {
            let input = crate::ai::corpus::ReflectionChunkInput {
                date: date_for_chunk,
                questions,
                answer: answer_text,
            };
            let text = crate::ai::corpus::render_reflection_chunk(&input);
            match crate::ai::candle_embedder::CandleEmbedder::get_or_load(&embedder_slot, &model_dir) {
                Ok(embedder) => {
                    if let Err(e) = crate::ai::indexer::index_chunk(
                        &db2,
                        embedder.as_ref(),
                        crate::store::ai::ChunkSource::Reflection,
                        &today_for_chunk,
                        &format!("{today_for_chunk}T23:59:59Z"),
                        text,
                    )
                    .await
                    {
                        tracing::warn!(?e, "reflection chunk index failed");
                    }
                }
                Err(e) => tracing::warn!(?e, "reflection index skipped: embedder load failed"),
            }
        });
    }

    let _ = app.emit("ai-reflection-answered", today_s);
    Ok(())
}
```

- [ ] **Step 4: Register both commands**

In `desktop-app-v3/src-tauri/src/lib.rs`, inside the `tauri::generate_handler![ ... ]` list (alongside `commands::ai::ai_briefing_today` etc.), add:

```rust
            commands::ai::ai_reflection_today,
            commands::ai::ai_reflection_answer,
```

- [ ] **Step 5: Run the mapping test + full suite**

Run: `cargo test --lib commands::ai 2>&1 | tail -20` then `cargo test --lib 2>&1 | tail -15`
Expected: PASS — the mapping test plus all existing tests green; no new warnings from `commands/ai.rs`.

- [ ] **Step 6: Commit**

```bash
git add desktop-app-v3/src-tauri/src/commands/ai.rs desktop-app-v3/src-tauri/src/lib.rs
git commit -m "feat(desktop-v3): ai_reflection_today + answer commands (1.6c)"
```

---

### Task 4: Scheduler evening tick + `should_generate_reflection` gate

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/reflection.rs` (add `should_generate_reflection`)
- Modify: `desktop-app-v3/src-tauri/src/ai/scheduler.rs` (evening branch)

**Interfaces:**
- Produces: `pub fn should_generate_reflection(labs_enabled: bool, status: ModelStatus, local_hour: u32, already_has_row: bool) -> bool`

**Constant:** `REFLECTION_FROM_HOUR_LOCAL: u32 = 18`.

- [ ] **Step 1: Write the failing test for the gate**

Add to the `#[cfg(test)] mod tests` in `reflection.rs`:

```rust
    use crate::store::ai::ModelStatus;

    #[test]
    fn should_generate_reflection_gate() {
        assert!(should_generate_reflection(true, ModelStatus::Ready, 18, false));
        assert!(should_generate_reflection(true, ModelStatus::Ready, 21, false));
        assert!(!should_generate_reflection(true, ModelStatus::Ready, 17, false)); // before 18:00
        assert!(!should_generate_reflection(true, ModelStatus::Ready, 20, true));  // already has today's row
        assert!(!should_generate_reflection(false, ModelStatus::Ready, 20, false)); // labs off
        assert!(!should_generate_reflection(true, ModelStatus::Downloading, 20, false)); // not ready
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --lib ai::reflection 2>&1 | tail -20`
Expected: FAIL — `cannot find function should_generate_reflection`.

- [ ] **Step 3: Implement the gate**

Add to `reflection.rs` (extend imports with `use crate::store::ai::ModelStatus;`):

```rust
const REFLECTION_FROM_HOUR_LOCAL: u32 = 18;

/// Gate for evening reflection generation: Local AI on, model Ready, it is
/// past 18:00 local, and today has no reflection row yet.
pub fn should_generate_reflection(
    labs_enabled: bool,
    status: ModelStatus,
    local_hour: u32,
    already_has_row: bool,
) -> bool {
    labs_enabled
        && matches!(status, ModelStatus::Ready)
        && local_hour >= REFLECTION_FROM_HOUR_LOCAL
        && !already_has_row
}
```

- [ ] **Step 4: Run the gate test to verify it passes**

Run: `cargo test --lib ai::reflection 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Add the evening branch to the scheduler loop**

In `desktop-app-v3/src-tauri/src/ai/scheduler.rs`, the loop already computes `now` (`chrono::Local::now()`), `labs`, and `status` each tick. The loop captures `db`, `embedder_slot`, `in_flight`, `model_dir`, `app_handle`. Add this branch after `status` is computed and before the `should_fire` briefing block (the `.hour()` call needs `chrono::Timelike` — add `use chrono::Timelike;` to the file's imports if not present):

```rust
            // Phase 1.6c — evening reflection question (once per day, ≥18:00).
            {
                let today = now.date_naive();
                let already = {
                    match db.lock() {
                        Ok(conn) => crate::store::ai::get_reflection_by_date(&conn, &today.to_string())
                            .map(|r| r.is_some())
                            .unwrap_or(true),
                        Err(_) => true, // fail closed
                    }
                };
                if crate::ai::reflection::should_generate_reflection(labs, status.clone(), now.hour(), already) {
                    match crate::ai::reflection::generate_and_store_question(&db, &in_flight, &model_dir, today).await {
                        Ok(true) => {
                            tracing::info!(date = %today, "generated reflection question");
                            let _ = app_handle.emit("ai-reflection-ready", today.to_string());
                        }
                        Ok(false) => {}
                        Err(e) => tracing::warn!(?e, "reflection generation failed"),
                    }
                }
            }
```

Note: `status` is `ModelStatus` (`Clone`, not `Copy`) — pass `status.clone()` so the later `should_fire(now, &db, labs, status)` still receives it. `in_flight` is the loop's `Arc<AtomicBool>`; pass `&in_flight`. `app_handle.emit` needs `use tauri::Emitter;` (already imported in scheduler.rs for the briefing events).

- [ ] **Step 6: Verify build + full lib suite**

Run: `cargo test --lib ai::reflection 2>&1 | tail -20` then `cargo test --lib 2>&1 | tail -15`
Expected: PASS — all green. Confirm the `generate_and_store_question` dead_code warning from Task 2 is now gone: `cargo build --lib 2>&1 | grep -iE "generate_and_store_question|warning.*(reflection|scheduler)"` should print nothing.

- [ ] **Step 7: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/reflection.rs desktop-app-v3/src-tauri/src/ai/scheduler.rs
git commit -m "feat(desktop-v3): scheduler evening reflection tick (1.6c)"
```

---

### Task 5: Frontend — `ReflectionCard` + store wiring

**Files:**
- Modify: `desktop-app-v3/src/lib/ai.ts` (reflection state, store actions, event listener)
- Create: `desktop-app-v3/src/components/ReflectionCard.tsx`
- Modify: `desktop-app-v3/src/routes/DashboardPage.tsx` (render the card)

**Interfaces:**
- Produces (TS): `ReflectionState` type; store fields `reflection`, actions `refreshReflection()`, `submitReflectionAnswer(answer: string)`.

- [ ] **Step 1: Add reflection state + actions to the store**

In `desktop-app-v3/src/lib/ai.ts`:

(a) Add the type near `AiSettings`:

```ts
export type ReflectionState =
  | { status: 'pending'; question: string }
  | { status: 'answered' }
  | { status: 'hidden' };
```

(b) Add to the `AiStore` interface:

```ts
  reflection: ReflectionState;
  refreshReflection: () => Promise<void>;
  submitReflectionAnswer: (answer: string) => Promise<void>;
```

(c) Add to the store's initial state (next to `briefing` / `settings`):

```ts
  reflection: { status: 'hidden' },
```

(d) Add the actions (mirror `refreshBriefing` / `setLabsEnabled`):

```ts
  refreshReflection: async () => {
    try {
      const state = await invoke<ReflectionState>('ai_reflection_today');
      set({ reflection: state });
    } catch (e) {
      console.error('ai_reflection_today failed:', e);
      set({ reflection: { status: 'hidden' } });
    }
  },

  submitReflectionAnswer: async (answer) => {
    await invoke('ai_reflection_answer', { answer });
    await get().refreshReflection();
  },
```

(e) In `bootstrap`, fetch it on start and listen for both reflection events; extend the returned cleanup:

```ts
    await get().refreshReflection();
    // ... existing listeners ...
    const unReflectionReady = await listen<string>('ai-reflection-ready', () => {
      void get().refreshReflection();
    });
    const unReflectionAnswered = await listen<string>('ai-reflection-answered', () => {
      void get().refreshReflection();
    });
```

and add `unReflectionReady(); unReflectionAnswered();` to the returned cleanup function alongside the existing unlisten calls.

- [ ] **Step 2: Create `ReflectionCard.tsx`**

Create `desktop-app-v3/src/components/ReflectionCard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useAIStore } from '../lib/ai';

/**
 * Evening reflection prompt. Renders only when the backend has a pending
 * question (status === 'pending'). The user types an answer and submits;
 * the answer feeds tomorrow's briefing. Hidden once answered or when no
 * question exists. Mirrors BriefingCard's render-from-store pattern.
 */
export function ReflectionCard() {
  const reflection = useAIStore((s) => s.reflection);
  const refresh = useAIStore((s) => s.refreshReflection);
  const submit = useAIStore((s) => s.submitReflectionAnswer);

  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (reflection.status !== 'pending') return null;

  const onSubmit = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      await submit(answer.trim());
      setAnswer('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4 mb-4">
      <div className="text-xs text-primary-600 dark:text-primary-400 mb-2">
        🌙 Evening reflection
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">{reflection.question}</p>
      <textarea
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
        rows={2}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="A sentence or two…"
        disabled={busy}
      />
      <div className="mt-2 flex justify-end">
        <button
          className="rounded bg-primary-500 px-3 py-1 text-sm text-white disabled:opacity-50"
          onClick={() => void onSubmit()}
          disabled={busy || !answer.trim()}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render it on the dashboard**

In `desktop-app-v3/src/routes/DashboardPage.tsx`, add the import near the `BriefingCard` import:

```tsx
import { ReflectionCard } from '../components/ReflectionCard';
```

and render it directly below `<BriefingCard />` (currently line ~292):

```tsx
      <BriefingCard />
      <ReflectionCard />
```

- [ ] **Step 4: Typecheck**

Run: `cd desktop-app-v3 && npm run typecheck 2>&1 | tail -20`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src/lib/ai.ts desktop-app-v3/src/components/ReflectionCard.tsx desktop-app-v3/src/routes/DashboardPage.tsx
git commit -m "feat(desktop-v3): ReflectionCard + store wiring (1.6c)"
```

---

## Manual Verification (after Task 5)

The evening tick + LLM generation can't be unit-tested end-to-end. Verify in the running app:

1. `cd desktop-app-v3 && npm run tauri:dev`. Enable Local AI; wait `ready`. Complete ≥1 focus session today.
2. To exercise generation without waiting for 18:00, temporarily lower `REFLECTION_FROM_HOUR_LOCAL` to `0` in a dev build (or set the system clock past 18:00). Within ~60s the dev log shows `generated reflection question` and the dashboard shows the 🌙 Evening reflection card with a specific question.
3. Type an answer, click Save → the card disappears (status → answered) and `/settings/ai` Indexed chunks increments by one (the Reflection chunk).
4. Confirm idempotency: the card does not reappear for the same day; the scheduler skips because today's row now exists.
5. Next-morning check: the briefing prompt includes yesterday's reflection answer (the briefing already reads `get_reflection_by_date(yesterday)`).

Revert any temporary dev-only constant/clock change before committing.

---

## Self-Review Notes

- **Spec coverage (1.6c):** evening LLM question from today's session chunks ✓ (Task 2); pending row keyed by date, answer empty ✓ (Task 2); `ai_reflection_today` → Pending/Answered/Hidden ✓ (Task 3); `ai_reflection_answer` upserts + indexes Reflection chunk ✓ (Task 3); scheduler ≥18:00 once-per-day gate ✓ (Task 4); `ReflectionCard` mirrors `BriefingCard` ✓ (Task 5); briefing already reads yesterday's answer (unchanged) ✓.
- **Concurrency:** reflection generation shares `briefing_in_flight` via `compare_exchange` so two Phi-3 loads never overlap; the RAII guard releases on drop.
- **Best-effort vs contract:** generation is fully best-effort; answering MUST persist the answer (synchronous upsert) while the chunk-index is backgrounded best-effort.
- **Locks:** every DB read/write locks briefly and drops the guard before any `.await` (LLM generate, embed) — same discipline as 1.6a/1.6b.
- **Type consistency:** `build_question(&L, &[String]) -> Result<String, AiError>`; `pending_reflection(&str, String, String) -> Reflection`; `generate_and_store_question(&Db, &AtomicBool, &Path, NaiveDate) -> Result<bool, AppError>`; `should_generate_reflection(bool, ModelStatus, u32, bool) -> bool`; `reflection_state_from(Option<Reflection>, bool) -> ReflectionState`; TS `ReflectionState` union mirrors the Rust serde tags (`pending`/`answered`/`hidden`).
- **Deferred / out of scope:** multi-question reflections (single question only), editing a submitted answer, reflection retention/GC.
