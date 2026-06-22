# Empty-State Session Progress Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static "complete a few more focus sessions" empty-state with a live "N of 5 focus sessions" counter + progress bar, driven by the real session-chunk count.

**Architecture:** Extract the existing session-chunk count query in `ai/empty_state.rs` into a public `session_chunk_count_last_7d` (with `has_minimum_data` delegating to it); attach `{ sessions, needed }` to the `EmptyState` briefing state in `commands/ai.rs`; render a bar + counter in `BriefingCard.tsx`. Forward-only — the count reflects indexed session chunks, which is the actual gate.

**Tech Stack:** Rust, Tauri 2, rusqlite, chrono; React 19 + Tailwind (frontend).

## Global Constraints

- Component: `desktop-app-v3`. Rust under `src-tauri/`, frontend under `src/`. Paths relative to repo root.
- The gate is **≥5 session chunks in the last 7 days** (`ai_chunks` where `source='session'`); threshold constant = `MIN_SESSION_CHUNKS_LAST_7D = 5`.
- The counter reflects **indexed session chunks** (the real gate input), not raw sessions. Forward-only; no backfill.
- Count fails closed to `0` on a poisoned mutex / DB error (same as today's `has_minimum_data`).
- Rust tests from `desktop-app-v3/src-tauri`: `cargo test --lib <filter>`. Frontend: `cd desktop-app-v3 && npm run typecheck`. No `unwrap` in non-test production code.

---

### Task 1: `session_chunk_count_last_7d` helper

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/empty_state.rs`

**Interfaces:**
- Produces:
  - `pub const MIN_SESSION_CHUNKS_LAST_7D: i64` (= 5)
  - `pub fn session_chunk_count_last_7d(db: &Db) -> i64`
  - `has_minimum_data(db: &Db) -> bool` now delegates to the count.

- [ ] **Step 1: Write the failing tests**

Add to the `#[cfg(test)] mod tests` in `empty_state.rs`. The module already has `open_test_db()` and `insert_session_chunk(&db, created_at: &str)` helpers (used by the existing `has_minimum_data` tests), plus `rusqlite::params` and `chrono` in scope — reuse them.

```rust
    #[test]
    fn count_is_zero_when_no_chunks() {
        let db = open_test_db();
        assert_eq!(session_chunk_count_last_7d(&db), 0);
    }

    #[test]
    fn count_matches_recent_session_chunks() {
        let db = open_test_db();
        let now = chrono::Utc::now();
        for i in 0..4i64 {
            let dt = now - chrono::Duration::days(i);
            insert_session_chunk(&db, &dt.format("%Y-%m-%d %H:%M:%S").to_string());
        }
        assert_eq!(session_chunk_count_last_7d(&db), 4);
    }

    #[test]
    fn count_excludes_old_and_non_session_chunks() {
        let db = open_test_db();
        // Old session chunk (outside the 7-day window).
        insert_session_chunk(&db, "2025-01-01 09:00:00");
        // Recent non-session chunk (activity_day) — must not be counted.
        {
            let conn = db.lock().unwrap();
            let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
            conn.execute(
                "INSERT INTO ai_chunks \
                 (id, source, source_ref, text, embedding, created_at, embedded_at) \
                 VALUES (?, 'activity_day', 'ref', 'day', zeroblob(1536), ?, ?)",
                params![format!("act-{now}"), now, now],
            )
            .unwrap();
        }
        assert_eq!(session_chunk_count_last_7d(&db), 0);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --lib ai::empty_state 2>&1 | tail -20`
Expected: FAIL — `cannot find function session_chunk_count_last_7d`.

- [ ] **Step 3: Implement — extract the count, delegate `has_minimum_data`, make the const public**

In `empty_state.rs`, change the const to public:

```rust
pub const MIN_SESSION_CHUNKS_LAST_7D: i64 = 5;
```

Add the count function (place it directly above `has_minimum_data`):

```rust
/// Count of `source='session'` chunks in `ai_chunks` from the last 7 days —
/// the input to both `has_minimum_data` and the empty-state progress counter.
/// Fails closed to 0 on a poisoned mutex or any DB error.
pub fn session_chunk_count_last_7d(db: &Db) -> i64 {
    let conn = match db.lock() {
        Ok(g) => g,
        Err(_) => return 0, // poisoned mutex → fail closed
    };
    conn.query_row(
        "SELECT COUNT(*) FROM ai_chunks \
         WHERE source = 'session' \
           AND created_at >= datetime('now', '-7 days')",
        [],
        |row| row.get(0),
    )
    .unwrap_or(0)
}
```

Replace the body of `has_minimum_data` so it delegates (remove its own query):

```rust
pub fn has_minimum_data(db: &Db) -> bool {
    session_chunk_count_last_7d(db) >= MIN_SESSION_CHUNKS_LAST_7D
}
```

(Keep the existing `has_minimum_data` doc comment.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --lib ai::empty_state 2>&1 | tail -20`
Expected: PASS — the 3 new tests plus the existing `has_minimum_data` tests green (those still exercise the same query via delegation).

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/empty_state.rs
git commit -m "feat(desktop-v3): session_chunk_count_last_7d + pub threshold"
```

---

### Task 2: `EmptyState` carries `{ sessions, needed }`

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/commands/ai.rs`

**Interfaces:**
- Consumes: `empty_state::{session_chunk_count_last_7d, MIN_SESSION_CHUNKS_LAST_7D}` (Task 1).
- Produces: `BriefingState::EmptyState { sessions: i64, needed: i64 }` (serde tag `status: "empty_state"`).

- [ ] **Step 1: Change the enum variant**

In `desktop-app-v3/src-tauri/src/commands/ai.rs`, in the `BriefingState` enum, change:

```rust
    EmptyState,
```

to:

```rust
    EmptyState { sessions: i64, needed: i64 },
```

- [ ] **Step 2: Wire the count into the return**

In `ai_briefing_today`, replace:

```rust
    if !crate::ai::empty_state::has_minimum_data(&db) {
        return Ok(BriefingState::EmptyState);
    }
```

with:

```rust
    let sessions = crate::ai::empty_state::session_chunk_count_last_7d(&db);
    if sessions < crate::ai::empty_state::MIN_SESSION_CHUNKS_LAST_7D {
        return Ok(BriefingState::EmptyState {
            sessions,
            needed: crate::ai::empty_state::MIN_SESSION_CHUNKS_LAST_7D,
        });
    }
```

(The `sessions < MIN` check is the same gate as `!has_minimum_data` — `has_minimum_data` stays for the scheduler's `should_fire`.)

- [ ] **Step 3: Verify build + full suite**

Run: `cargo test --lib 2>&1 | tail -15` then `cargo build --lib 2>&1 | grep -iE "warning.*(commands/ai|empty_state)" || echo "no new warnings"`
Expected: all lib tests pass; no new warnings from the changed files. (Serde derives the new payload automatically; the `EmptyState` variant is now constructed, so no dead-variant warning.)

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src-tauri/src/commands/ai.rs
git commit -m "feat(desktop-v3): EmptyState briefing state carries sessions/needed"
```

---

### Task 3: Frontend — counter + progress bar

**Files:**
- Modify: `desktop-app-v3/src/lib/ai.ts`
- Modify: `desktop-app-v3/src/components/BriefingCard.tsx`

**Interfaces:**
- Consumes: `BriefingState` `empty_state` now carries `sessions` + `needed` (Task 2).

- [ ] **Step 1: Extend the TS `BriefingState` union**

In `desktop-app-v3/src/lib/ai.ts`, change:

```ts
  | { status: 'empty_state' }
```

to:

```ts
  | { status: 'empty_state'; sessions: number; needed: number }
```

- [ ] **Step 2: Render the bar + counter in `BriefingCard`**

In `desktop-app-v3/src/components/BriefingCard.tsx`, replace the entire `empty_state` branch:

```tsx
  if (briefing.status === 'empty_state') {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 mb-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          ✨ Complete a few more focus sessions to unlock your AI briefing.
        </div>
      </div>
    );
  }
```

with:

```tsx
  if (briefing.status === 'empty_state') {
    const { sessions, needed } = briefing;
    const remaining = Math.max(0, needed - sessions);
    const pct = needed > 0 ? Math.min(100, (sessions / needed) * 100) : 0;
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 mb-4">
        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          ✨ {sessions} of {needed} focus sessions
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full bg-primary-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
          Complete {remaining} more to unlock your AI briefing · counts sessions completed since Local AI was enabled
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd desktop-app-v3 && npm run typecheck 2>&1 | tail -20`
Expected: no errors (TS narrows `sessions`/`needed` inside the `empty_state` branch).

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src/lib/ai.ts desktop-app-v3/src/components/BriefingCard.tsx
git commit -m "feat(desktop-v3): empty-state session progress bar + counter"
```

---

## Manual Verification

With Local AI enabled and the model `Ready`, the dashboard `BriefingCard` (when under the threshold) should show `"N of 5 focus sessions"` with a bar at `N/5`, plus the muted clarifier. Completing a focus session (which indexes a chunk) bumps `N` on the next `refreshBriefing`. At 5 the gate flips and the card switches to the generating/ready briefing. Confirm the bar width tracks `N/5` and the "Complete {remaining} more" text decrements.

---

## Self-Review Notes

- **Spec coverage:** counter `"N of 5"` ✓ (Task 3); progress bar `sessions/needed` ✓ (Task 3); muted forward-only hint ✓ (Task 3); count = indexed session chunks (real gate) ✓ (Task 1); `EmptyState` payload ✓ (Task 2); fails closed to 0 ✓ (Task 1); `has_minimum_data` unchanged behavior via delegation ✓ (Task 1).
- **Type consistency:** Rust `EmptyState { sessions: i64, needed: i64 }` ↔ TS `{ status: 'empty_state'; sessions: number; needed: number }`; `session_chunk_count_last_7d(&Db) -> i64`; `MIN_SESSION_CHUNKS_LAST_7D: i64`.
- **Out of scope (unchanged):** backfill, threshold value, scheduler/briefing-generation paths.
