# Local AI Corpus Indexer — Phase 1.6b (Day Rollups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once per local day, roll up the previous day's sessions into one `[Day]` chunk in `ai_chunks`, so briefings can retrieve day-level context.

**Architecture:** 1.6a's session-indexing path is extended to also persist a structured `ai_session_facts` row per session (the fields it already has in hand). A once-per-day scheduler guard reads yesterday's facts, aggregates them into a `DayChunkInput`, renders it, and indexes an `ActivityDay` chunk — idempotent by date. `ai_chunks` carries only rendered text + embeddings, so the structured facts table is the source of truth for aggregation; this keeps Local AI fully on-device (no list-sessions API exists).

**Tech Stack:** Rust, Tauri 2, rusqlite, candle (BGE-small embedder), tokio, chrono, serde_json.

## Global Constraints

- Component: `desktop-app-v3/src-tauri`. Paths are relative to repo root.
- `EMBEDDING_DIM = 384`. Day chunks embed through the same `index_chunk` path.
- Rollups are **best-effort**: never panic; errors logged via `tracing` and swallowed. They run inside the existing scheduler's spawned task.
- Gate: roll up only when labs flag is true AND model status is `Ready`.
- Idempotency: the day chunk id is `stable_chunk_id(ChunkSource::ActivityDay, date)`; the scheduler skips a day whose `ActivityDay:date` chunk already exists (don't re-embed every 60s tick).
- Day boundaries are **local time**. `date` strings are `YYYY-MM-DD`. Timestamps stored in facts are RFC 3339.
- `best_window` and `lowest_productivity_label` are `None` in 1.6b (deferred).
- Day rollups apply to sessions completed after 1.6b ships (no backfill).
- Run tests from `desktop-app-v3/src-tauri`: `cargo test --lib <filter>`. No `unwrap` in non-test code.

---

### Task 1: `ai_session_facts` table + `SessionFacts` CRUD + `chunk_exists`

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/store/ai.rs` (migration, struct, CRUD, `chunk_exists`, wipe)
- Modify: `desktop-app-v3/src-tauri/src/commands/ai.rs` (`ai_data_delete` wipes facts too)

**Interfaces:**
- Produces:
  - `pub struct SessionFacts { pub session_id: String, pub date: String, pub start_time: String, pub end_time: Option<String>, pub planned_min: i32, pub actual_min: Option<i32>, pub productivity: Option<i32>, pub top_apps: Vec<(String, i32)>, pub created_at: String }`
  - `pub fn upsert_session_facts(conn: &Connection, f: &SessionFacts) -> Result<(), AppError>`
  - `pub fn list_session_facts_for_date(conn: &Connection, date: &str) -> Result<Vec<SessionFacts>, AppError>`
  - `pub fn delete_all_session_facts(conn: &Connection) -> Result<(), AppError>`
  - `pub fn chunk_exists(conn: &Connection, id: &str) -> Result<bool, AppError>`

- [ ] **Step 1: Add the migration**

In `desktop-app-v3/src-tauri/src/store/ai.rs`, inside the `migrate` function's `execute_batch` string, append after the `ai_briefings` table block (keep it inside the same `r#"..."#` batch):

```sql
        CREATE TABLE IF NOT EXISTS ai_session_facts (
            session_id   TEXT PRIMARY KEY,
            date         TEXT NOT NULL,
            start_time   TEXT NOT NULL,
            end_time     TEXT,
            planned_min  INTEGER NOT NULL,
            actual_min   INTEGER,
            productivity INTEGER,
            top_apps     TEXT NOT NULL,
            created_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_session_facts_date ON ai_session_facts(date);
```

- [ ] **Step 2: Write the failing tests**

Add to the `#[cfg(test)] mod tests` in `store/ai.rs` (reuse the file's existing connection test helpers — match the style already there; the snippet below obtains an in-memory `conn` the way sibling tests do):

```rust
    fn sample_facts(id: &str, date: &str) -> SessionFacts {
        SessionFacts {
            session_id: id.into(),
            date: date.into(),
            start_time: "2026-06-23T09:00:00Z".into(),
            end_time: Some("2026-06-23T09:55:00Z".into()),
            planned_min: 60,
            actual_min: Some(55),
            productivity: Some(80),
            top_apps: vec![("Code".into(), 40), ("Chrome".into(), 15)],
            created_at: "2026-06-23T09:55:00Z".into(),
        }
    }

    #[test]
    fn session_facts_round_trip_and_list_by_date() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        upsert_session_facts(&conn, &sample_facts("s1", "2026-06-23")).unwrap();
        upsert_session_facts(&conn, &sample_facts("s2", "2026-06-23")).unwrap();
        upsert_session_facts(&conn, &sample_facts("s3", "2026-06-22")).unwrap();

        let day = list_session_facts_for_date(&conn, "2026-06-23").unwrap();
        assert_eq!(day.len(), 2);
        assert_eq!(day[0].top_apps[0], ("Code".to_string(), 40));
        assert_eq!(day[0].actual_min, Some(55));
    }

    #[test]
    fn session_facts_upsert_is_idempotent_by_session_id() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        upsert_session_facts(&conn, &sample_facts("s1", "2026-06-23")).unwrap();
        upsert_session_facts(&conn, &sample_facts("s1", "2026-06-23")).unwrap();
        assert_eq!(list_session_facts_for_date(&conn, "2026-06-23").unwrap().len(), 1);
    }

    #[test]
    fn chunk_exists_reflects_inserted_rows() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        assert!(!chunk_exists(&conn, "activity_day:2026-06-22").unwrap());
        insert_chunk(&conn, &sample_chunk("activity_day:2026-06-22", ChunkSource::ActivityDay)).unwrap();
        assert!(chunk_exists(&conn, "activity_day:2026-06-22").unwrap());
    }
```

(`sample_chunk` already exists in the test module from earlier work; it takes `(id, source)`.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cargo test --lib store::ai 2>&1 | tail -20`
Expected: FAIL — `cannot find type SessionFacts` / functions not found.

- [ ] **Step 4: Implement struct + CRUD + `chunk_exists`**

Add to `store/ai.rs` (near the other chunk/reflection CRUD; `serde::{Serialize, Deserialize}` is already imported in this file — match existing derives):

```rust
/// Structured facts for one completed session, persisted alongside the
/// rendered session chunk. The day-rollup aggregates these by `date`;
/// `ai_chunks` itself stores only text + embedding, so this table is the
/// source of truth for day-level numbers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionFacts {
    pub session_id: String,
    pub date: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub planned_min: i32,
    pub actual_min: Option<i32>,
    pub productivity: Option<i32>,
    pub top_apps: Vec<(String, i32)>,
    pub created_at: String,
}

pub fn upsert_session_facts(conn: &Connection, f: &SessionFacts) -> Result<(), AppError> {
    let top_apps_json = serde_json::to_string(&f.top_apps)
        .map_err(|e| AppError::Storage(format!("session_facts top_apps JSON: {e}")))?;
    conn.execute(
        "INSERT OR REPLACE INTO ai_session_facts
         (session_id, date, start_time, end_time, planned_min, actual_min, productivity, top_apps, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            f.session_id,
            f.date,
            f.start_time,
            f.end_time,
            f.planned_min,
            f.actual_min,
            f.productivity,
            top_apps_json,
            f.created_at,
        ],
    )
    .map_err(|e| AppError::Storage(format!("upsert_session_facts: {e}")))?;
    Ok(())
}

pub fn list_session_facts_for_date(
    conn: &Connection,
    date: &str,
) -> Result<Vec<SessionFacts>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT session_id, date, start_time, end_time, planned_min, actual_min, productivity, top_apps, created_at
             FROM ai_session_facts WHERE date = ? ORDER BY start_time",
        )
        .map_err(|e| AppError::Storage(format!("list_session_facts prepare: {e}")))?;
    let rows = stmt
        .query_map(params![date], |row| {
            let top_apps_json: String = row.get(7)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, Option<i32>>(5)?,
                row.get::<_, Option<i32>>(6)?,
                top_apps_json,
                row.get::<_, String>(8)?,
            ))
        })
        .map_err(|e| AppError::Storage(format!("list_session_facts query: {e}")))?;

    let mut out = Vec::new();
    for r in rows {
        let (session_id, date, start_time, end_time, planned_min, actual_min, productivity, top_apps_json, created_at) =
            r.map_err(|e| AppError::Storage(format!("list_session_facts row: {e}")))?;
        let top_apps: Vec<(String, i32)> = serde_json::from_str(&top_apps_json)
            .map_err(|e| AppError::Storage(format!("session_facts top_apps parse: {e}")))?;
        out.push(SessionFacts {
            session_id,
            date,
            start_time,
            end_time,
            planned_min,
            actual_min,
            productivity,
            top_apps,
            created_at,
        });
    }
    Ok(out)
}

pub fn delete_all_session_facts(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM ai_session_facts", [])
        .map_err(|e| AppError::Storage(format!("delete_all_session_facts: {e}")))?;
    Ok(())
}

/// Whether a chunk row with this exact id already exists. Used by the day
/// rollup to avoid re-embedding a day it already indexed.
pub fn chunk_exists(conn: &Connection, id: &str) -> Result<bool, AppError> {
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM ai_chunks WHERE id = ?", params![id], |r| r.get(0))
        .map_err(|e| AppError::Storage(format!("chunk_exists: {e}")))?;
    Ok(n > 0)
}
```

- [ ] **Step 5: Wipe facts on AI-data delete**

In `desktop-app-v3/src-tauri/src/commands/ai.rs`, the `ai_data_delete` command currently calls `delete_all_chunks` / `delete_all_reflections` / `delete_all_briefings` / `delete_model_state` inside the locked block. Add one line alongside them:

```rust
        store_ai::delete_all_session_facts(&conn)?;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cargo test --lib store::ai 2>&1 | tail -20`
Expected: PASS — the 3 new tests plus existing store tests green.

- [ ] **Step 7: Commit**

```bash
git add desktop-app-v3/src-tauri/src/store/ai.rs desktop-app-v3/src-tauri/src/commands/ai.rs
git commit -m "feat(desktop-v3): ai_session_facts table + CRUD (1.6b)"
```

---

### Task 2: Persist facts in the session-indexing path

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/indexer.rs`

**Interfaces:**
- Consumes: `ai::corpus::SessionChunkInput`, `store::ai::{SessionFacts, upsert_session_facts}`.
- Produces: `pub fn session_facts(input: &SessionChunkInput) -> SessionFacts`
- Modifies: `index_session_background` to upsert the facts row (no embedder needed) before indexing the chunk.

- [ ] **Step 1: Write the failing test**

Add to the `#[cfg(test)] mod tests` in `indexer.rs` (the `sample_session`/`sample` helpers already exist from 1.6a Task 2; build a `SessionChunkInput` via the existing `session_chunk_input`):

```rust
    #[test]
    fn session_facts_maps_from_chunk_input() {
        let samples = vec![sample("Code", 2400)]; // 40m
        let input = session_chunk_input(&sample_session(), Some(80), &samples);
        let facts = session_facts(&input);

        assert_eq!(facts.session_id, "sid-1");
        assert_eq!(facts.planned_min, 60);
        assert_eq!(facts.actual_min, Some(55));
        assert_eq!(facts.productivity, Some(80));
        assert_eq!(facts.top_apps[0], ("Code".to_string(), 40));
        // date is the LOCAL calendar day of the session's end time.
        assert_eq!(facts.date.len(), 10); // YYYY-MM-DD
        assert!(facts.end_time.is_some());
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: FAIL — `cannot find function session_facts`.

- [ ] **Step 3: Implement the builder**

Add to `indexer.rs` (extend imports with `use crate::store::ai::SessionFacts;`):

```rust
/// Build the structured facts row for one session from the same input used to
/// render its chunk. `date` is the LOCAL calendar day of the session's end
/// time (falls back to start time when end is absent) — day rollups group by
/// local day.
pub fn session_facts(input: &SessionChunkInput) -> SessionFacts {
    let anchor = input.end_time.unwrap_or(input.start_time);
    let date = anchor.with_timezone(&chrono::Local).date_naive().to_string();
    SessionFacts {
        session_id: input.id.clone(),
        date,
        start_time: input.start_time.to_rfc3339(),
        end_time: input.end_time.map(|t| t.to_rfc3339()),
        planned_min: input.planned_duration,
        actual_min: input.actual_duration,
        productivity: input.productivity_score,
        top_apps: input.top_apps.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Wire the facts write into `index_session_background`**

In `index_session_background`, after the `should_index` gate passes and BEFORE loading the embedder, write the facts row (it needs no model). Insert this block right after the `if !should_index(labs, status) { return; }` check:

```rust
        // Persist structured facts first — they need no model and power the
        // day rollup even if embedding later fails.
        {
            let facts = session_facts(&input);
            match state_db.lock() {
                Ok(conn) => {
                    if let Err(e) = store_ai::upsert_session_facts(&conn, &facts) {
                        tracing::warn!(?e, session = %input.id, "session facts upsert failed");
                    }
                }
                Err(_) => return,
            }
        }
```

- [ ] **Step 6: Verify build + full lib suite**

Run: `cargo test --lib 2>&1 | tail -15`
Expected: PASS — all green, no new warnings from `indexer.rs`.

- [ ] **Step 7: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/indexer.rs
git commit -m "feat(desktop-v3): persist session facts on index (1.6b)"
```

---

### Task 3: Day aggregation + `run_day_rollup`

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/indexer.rs`

**Interfaces:**
- Consumes: `store::ai::{SessionFacts, list_session_facts_for_date}`, `ai::corpus::{DayChunkInput, render_day_chunk}`, `ai::candle_embedder::CandleEmbedder`.
- Produces:
  - `pub fn aggregate_day(date: chrono::NaiveDate, facts: &[SessionFacts]) -> Option<crate::ai::corpus::DayChunkInput>`
  - `pub async fn run_day_rollup(db: &Db, embedder_slot: &OnceLock<Arc<CandleEmbedder>>, model_dir: &std::path::Path, date: chrono::NaiveDate) -> Result<bool, AppError>` (returns `Ok(true)` if a day chunk was written, `Ok(false)` if there were no sessions that day)

- [ ] **Step 1: Write the failing test**

Add to the `#[cfg(test)] mod tests` in `indexer.rs`:

```rust
    use crate::store::ai::SessionFacts;

    fn facts_row(id: &str, date: &str, actual: i32, top: Vec<(&str, i32)>) -> SessionFacts {
        SessionFacts {
            session_id: id.into(),
            date: date.into(),
            start_time: format!("{date}T09:00:00Z"),
            end_time: Some(format!("{date}T09:55:00Z")),
            planned_min: 60,
            actual_min: Some(actual),
            productivity: Some(70),
            top_apps: top.into_iter().map(|(n, m)| (n.to_string(), m)).collect(),
            created_at: format!("{date}T09:55:00Z"),
        }
    }

    #[test]
    fn aggregate_day_sums_sessions_focus_and_merges_top_apps() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 6, 23).unwrap();
        let facts = vec![
            facts_row("s1", "2026-06-23", 55, vec![("Code", 40), ("Chrome", 15)]),
            facts_row("s2", "2026-06-23", 25, vec![("Code", 20), ("Slack", 5)]),
        ];
        let day = aggregate_day(date, &facts).expect("non-empty day");
        assert_eq!(day.session_count, 2);
        assert_eq!(day.total_focus_minutes, 80); // 55 + 25
        assert_eq!(day.top_apps[0], ("Code".to_string(), 60)); // 40 + 20, merged
        assert_eq!(day.best_window, None);
        assert_eq!(day.lowest_productivity_label, None);
    }

    #[test]
    fn aggregate_day_returns_none_for_empty() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 6, 23).unwrap();
        assert!(aggregate_day(date, &[]).is_none());
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: FAIL — `cannot find function aggregate_day`.

- [ ] **Step 3: Implement `aggregate_day` + `run_day_rollup`**

Add to `indexer.rs` (extend imports with `use crate::ai::corpus::{DayChunkInput, render_day_chunk}; use crate::store::ai::list_session_facts_for_date;`):

```rust
/// Aggregate one day's session facts into a DayChunkInput. Returns None when
/// there were no sessions that day (nothing to roll up). `best_window` and
/// `lowest_productivity_label` are left None in 1.6b.
pub fn aggregate_day(
    date: chrono::NaiveDate,
    facts: &[SessionFacts],
) -> Option<DayChunkInput> {
    if facts.is_empty() {
        return None;
    }
    let session_count = facts.len() as i32;
    let total_focus_minutes: i32 = facts.iter().map(|f| f.actual_min.unwrap_or(0)).sum();

    let mut by_app: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    for f in facts {
        for (app, mins) in &f.top_apps {
            *by_app.entry(app.clone()).or_insert(0) += mins;
        }
    }
    let mut top_apps: Vec<(String, i32)> = by_app.into_iter().collect();
    top_apps.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    Some(DayChunkInput {
        date,
        session_count,
        total_focus_minutes,
        best_window: None,
        top_apps,
        lowest_productivity_label: None,
    })
}

/// Read `date`'s session facts, aggregate, render, and index one ActivityDay
/// chunk. Returns Ok(false) when there were no sessions that day. Idempotent:
/// the chunk id is stable per date.
pub async fn run_day_rollup(
    db: &Db,
    embedder_slot: &OnceLock<Arc<CandleEmbedder>>,
    model_dir: &std::path::Path,
    date: chrono::NaiveDate,
) -> Result<bool, AppError> {
    let date_str = date.to_string();
    let facts = {
        let conn = db
            .lock()
            .map_err(|_| AppError::Storage("db mutex poisoned".into()))?;
        list_session_facts_for_date(&conn, &date_str)?
    };
    let Some(day_input) = aggregate_day(date, &facts) else {
        return Ok(false);
    };

    let embedder = CandleEmbedder::get_or_load(embedder_slot, model_dir)?;
    let text = render_day_chunk(&day_input);
    let created_at = format!("{date_str}T23:59:59Z");
    index_chunk(
        db,
        embedder.as_ref(),
        ChunkSource::ActivityDay,
        &date_str,
        &created_at,
        text,
    )
    .await?;
    Ok(true)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/indexer.rs
git commit -m "feat(desktop-v3): day aggregation + run_day_rollup (1.6b)"
```

---

### Task 4: Scheduler daily-rollup tick + `should_roll_up` gate

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/indexer.rs` (add `should_roll_up`)
- Modify: `desktop-app-v3/src-tauri/src/ai/scheduler.rs` (rollup branch in the loop)

**Interfaces:**
- Consumes: `store::ai::{chunk_exists, ModelStatus}`, `ai::indexer::{run_day_rollup, stable_chunk_id, should_roll_up}`, `ChunkSource::ActivityDay`.
- Produces: `pub fn should_roll_up(labs_enabled: bool, status: ModelStatus, already_exists: bool) -> bool`

- [ ] **Step 1: Write the failing test for the gate**

Add to the `#[cfg(test)] mod tests` in `indexer.rs`:

```rust
    #[test]
    fn should_roll_up_only_when_ready_labs_on_and_not_yet_indexed() {
        assert!(should_roll_up(true, ModelStatus::Ready, false));
        assert!(!should_roll_up(true, ModelStatus::Ready, true)); // already done today
        assert!(!should_roll_up(false, ModelStatus::Ready, false));
        assert!(!should_roll_up(true, ModelStatus::Downloading, false));
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: FAIL — `cannot find function should_roll_up`.

- [ ] **Step 3: Implement the gate**

Add to `indexer.rs`:

```rust
/// Gate for the daily rollup: only when Local AI is on, the model is Ready,
/// and we have not already indexed this day's chunk.
pub fn should_roll_up(labs_enabled: bool, status: ModelStatus, already_exists: bool) -> bool {
    labs_enabled && matches!(status, ModelStatus::Ready) && !already_exists
}
```

- [ ] **Step 4: Run the gate test to verify it passes**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Add the rollup branch to the scheduler loop**

In `desktop-app-v3/src-tauri/src/ai/scheduler.rs`, the loop already computes `now`, `labs`, and `status` each tick (before the `should_fire` briefing check). Add a rollup attempt for *yesterday* right after `status` is computed and before the `should_fire` block. Insert:

```rust
            // Phase 1.6b — roll up yesterday into a [Day] chunk once per day.
            if let Some(yesterday) = now.date_naive().pred_opt() {
                let yday_id = crate::ai::indexer::stable_chunk_id(
                    crate::store::ai::ChunkSource::ActivityDay,
                    &yesterday.to_string(),
                );
                let already = {
                    match db.lock() {
                        Ok(conn) => crate::store::ai::chunk_exists(&conn, &yday_id).unwrap_or(true),
                        Err(_) => true, // fail closed — skip this tick
                    }
                };
                if crate::ai::indexer::should_roll_up(labs, status, already) {
                    match crate::ai::indexer::run_day_rollup(&db, &embedder_slot, &model_dir, yesterday).await {
                        Ok(true) => tracing::info!(date = %yesterday, "indexed day rollup chunk"),
                        Ok(false) => {} // no sessions that day
                        Err(e) => tracing::warn!(?e, date = %yesterday, "day rollup failed"),
                    }
                }
            }
```

Note: `status` is `ModelStatus` (Copy) and is read again by `should_fire` below — passing it by value here does not move it. `db`, `embedder_slot`, and `model_dir` are the loop's owned captures, used by reference.

- [ ] **Step 6: Verify build + full lib suite**

Run: `cargo test --lib 2>&1 | tail -15`
Expected: PASS — all green, no new warnings from `scheduler.rs` / `indexer.rs`.

- [ ] **Step 7: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/indexer.rs desktop-app-v3/src-tauri/src/ai/scheduler.rs
git commit -m "feat(desktop-v3): scheduler daily rollup tick (1.6b)"
```

---

## Manual Verification (after Task 4)

The scheduler tick + rollup can't be unit-tested end-to-end. Verify in the running app:

1. With Local AI `ready`, complete ≥1 focus session today.
2. Confirm a facts row exists (the session chunk also appears) — `/settings/ai` Indexed chunks increments per session.
3. To exercise the rollup without waiting for midnight, temporarily change the scheduler's `yesterday` target to `now.date_naive()` (today) in a dev build, or set the system clock forward a day. After the next 60s tick, `/settings/ai` Indexed chunks should increment by one more (the `[Day]` chunk).
4. Confirm idempotency: across several ticks, the day chunk count does not keep growing — the `chunk_exists` guard skips re-rolling.
5. Check the dev log for `indexed day rollup chunk` / `day rollup failed`.

Revert any temporary dev-only date change before committing.

---

## Self-Review Notes

- **Spec coverage (revised 1.6b):** facts table written on index ✓ (Tasks 1-2); aggregate from facts ✓ (Task 3); `session_count`/`total_focus_minutes`/`top_apps` populated, `best_window`/`lowest_productivity_label` = None ✓ (Task 3); render + index ActivityDay chunk idempotent by date ✓ (Task 3); once-per-day scheduler guard skipping existing day chunk ✓ (Task 4); facts wiped on AI-data delete ✓ (Task 1).
- **Deferred (correctly out of 1.6b):** `best_window`, `lowest_productivity_label`, backfill of pre-1.6b sessions, reflections (1.6c).
- **Type consistency:** `aggregate_day(NaiveDate, &[SessionFacts]) -> Option<DayChunkInput>`; `run_day_rollup(&Db, &OnceLock<Arc<CandleEmbedder>>, &Path, NaiveDate) -> Result<bool, AppError>`; `should_roll_up(bool, ModelStatus, bool) -> bool`; `chunk_exists(&Connection, &str) -> Result<bool, AppError>` — used consistently across tasks.
- **Best-effort / locks:** facts upsert and `run_day_rollup` lock briefly and drop the guard before the `.await` on embedding (same discipline as 1.6a); all rollup errors are logged and swallowed in the scheduler.
```
