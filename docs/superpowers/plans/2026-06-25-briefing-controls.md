# Briefing Controls (Delete + Regenerate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **✕ delete** and a **Regenerate** control to the dashboard briefing card's `ready` state so the user can clear or refresh the day's AI briefing in-app, instead of deleting the SQLite row by hand.

**Architecture:** A new `delete_briefing_for(date)` store helper + an `ai_briefing_delete` Tauri command (delete today's row, return the recomputed `BriefingState` → `Idle`). The recompute logic shared with `ai_briefing_today` is extracted into one `current_briefing_state` helper (no copy-paste). Frontend gets a `deleteBriefing` store action and two buttons in the `ready` render; Regenerate reuses the existing `generateBriefing`.

**Tech Stack:** Rust (Tauri 2 commands, rusqlite), TypeScript/React (Zustand store).

## Global Constraints

- Components: `desktop-app-v3/src-tauri` (Rust) + `desktop-app-v3/src` (frontend). Rust commands from `desktop-app-v3/src-tauri`; frontend from `desktop-app-v3`.
- Delete query MUST be parameterized (`params![date]`) — no string interpolation. Match the existing `store/ai.rs` error style: `AppError::Storage(format!("delete_briefing_for: {e}"))`.
- Regenerate reuses the existing `generateBriefing()` / `ai_briefing_generate`; do NOT add new generation logic.
- Only the `ready` render of `BriefingCard.tsx` changes — leave `idle`, `generating`, `empty_state`, `error`, `hidden` untouched (`idle` is where delete returns to).
- No `capabilities/default.json` change (briefing commands are not per-command gated).
- Default `cargo test --lib` stays green, zero new warnings; `npm run typecheck` passes.
- Out of scope: the briefing prompt-leak bug; any threshold/generation changes.

## Reference — current code

`src-tauri/src/store/ai.rs`:
- `use crate::error::AppError;` and `use rusqlite::{params, Connection};` at top.
- `pub fn upsert_briefing(conn, b: &Briefing)`, `pub fn get_briefing_for(conn, date, current_model_id) -> Result<Option<Briefing>, AppError>`, `pub fn delete_all_briefings(conn) -> Result<(), AppError>` (the pattern to mirror).
- `struct Briefing { date, text, generated_at, model_id }` (all `String`).
- Test module `#[cfg(test)] mod tests` has `fn fresh_conn() -> Connection` (open_in_memory + migrate) and `fn sample_briefing(date, model_id) -> Briefing`, plus `upsert_and_get_briefing_round_trips`.

`src-tauri/src/commands/ai.rs`:
- `ai_briefing_today(state: State<'_, crate::AppState>, app: AppHandle) -> Result<BriefingState, String>` (lines ~134-167) does: `let db = match state.db.get() { Some(d) => d.clone(), None => return Ok(BriefingState::Hidden) };` then computes `cached` (`store_ai::get_briefing_for(&conn, &today_s, crate::ai::registry::LLM_ID).ok().flatten()`), `labs = labs_enabled(&app)`, `model_ready` (`store_ai::get_model_state` → `ModelStatus::Ready`), `sessions = crate::ai::empty_state::session_chunk_count_last_7d(&db)`, `needed = crate::ai::empty_state::MIN_SESSION_CHUNKS_LAST_7D`, returns `briefing_state(cached, labs, model_ready, sessions, needed)`.
- `pub(crate) fn briefing_state(...)` and `pub(crate) fn labs_enabled(app: &AppHandle) -> bool` already exist.
- `AppState.db` is `Arc<std::sync::OnceLock<store::Db>>`; `db.lock()` yields the conn guard; `session_chunk_count_last_7d(db: &store::Db)`.

`src-tauri/src/lib.rs` (~line 280): invoke_handler lists `commands::ai::ai_briefing_today, commands::ai::ai_briefing_generate, …`.

`src/lib/ai.ts`: `BriefingState` union; `AiStore` interface with `generateBriefing: () => Promise<void>`; `generateBriefing` impl invokes `ai_briefing_generate`; `refreshBriefing` sets state from `invoke<BriefingState>('ai_briefing_today')`.

`src/components/BriefingCard.tsx`: pulls `generate = useAIStore((s) => s.generateBriefing)`; the `ready` return (lines ~93-100) renders the "✨ Today's briefing …" label + the text `<p>`.

---

### Task 1: Backend — delete helper, shared state helper, `ai_briefing_delete` command

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/store/ai.rs` (add `delete_briefing_for` after `delete_all_briefings` ~line 326; add a test in the `tests` module)
- Modify: `desktop-app-v3/src-tauri/src/commands/ai.rs` (extract `current_briefing_state`; refactor `ai_briefing_today`; add `ai_briefing_delete`)
- Modify: `desktop-app-v3/src-tauri/src/lib.rs` (register `ai_briefing_delete`)

**Interfaces:**
- Produces: `store_ai::delete_briefing_for(conn: &Connection, date: &str) -> Result<(), AppError>`; Tauri command `ai_briefing_delete(state, app) -> Result<BriefingState, String>` invoked from the frontend as `ai_briefing_delete`.

- [ ] **Step 1: Write the failing store test**

In `src-tauri/src/store/ai.rs`, inside `#[cfg(test)] mod tests` (after the existing `upsert_*_briefing` tests, e.g. after `upsert_replaces_existing_briefing_for_same_date`), add:

```rust
    #[test]
    fn delete_briefing_for_removes_only_that_date() {
        let conn = fresh_conn();
        upsert_briefing(&conn, &sample_briefing("2026-05-05", "gemma-2-2b")).unwrap();
        upsert_briefing(&conn, &sample_briefing("2026-05-06", "gemma-2-2b")).unwrap();
        delete_briefing_for(&conn, "2026-05-05").unwrap();
        assert!(get_briefing_for(&conn, "2026-05-05", "gemma-2-2b").unwrap().is_none());
        assert!(get_briefing_for(&conn, "2026-05-06", "gemma-2-2b").unwrap().is_some());
        // idempotent: deleting a missing row is Ok (0 rows affected)
        delete_briefing_for(&conn, "2026-05-05").unwrap();
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd desktop-app-v3/src-tauri && cargo test --lib store::ai::tests::delete_briefing_for_removes_only_that_date 2>&1 | tail -15`
Expected: FAIL — `cannot find function delete_briefing_for`.

- [ ] **Step 3: Add `delete_briefing_for`**

In `src-tauri/src/store/ai.rs`, immediately after `delete_all_briefings` (the `}` ~line 326), add:

```rust
pub fn delete_briefing_for(conn: &Connection, date: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM ai_briefings WHERE date = ?", params![date])
        .map_err(|e| AppError::Storage(format!("delete_briefing_for: {e}")))?;
    Ok(())
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd desktop-app-v3/src-tauri && cargo test --lib store::ai::tests::delete_briefing_for_removes_only_that_date 2>&1 | tail -10`
Expected: PASS (1 passed).

- [ ] **Step 5: Extract the shared `current_briefing_state` helper**

In `src-tauri/src/commands/ai.rs`, add this helper (place it directly above `ai_briefing_today`). It is the body of `ai_briefing_today` after the db is obtained:

```rust
/// Compute the current `BriefingState` from the DB + labs/model status. Shared
/// by `ai_briefing_today` and `ai_briefing_delete` so the state machine lives
/// in one place.
pub(crate) fn current_briefing_state(
    db: &crate::store::Db,
    app: &AppHandle,
) -> Result<BriefingState, String> {
    let today_s = chrono::Local::now().date_naive().to_string();
    let cached = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        store_ai::get_briefing_for(&conn, &today_s, crate::ai::registry::LLM_ID)
            .ok()
            .flatten()
    };
    let labs = labs_enabled(app);
    let model_ready = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        matches!(
            store_ai::get_model_state(&conn).ok().flatten().map(|s| s.status),
            Some(store_ai::ModelStatus::Ready)
        )
    };
    let sessions = crate::ai::empty_state::session_chunk_count_last_7d(db);
    let needed = crate::ai::empty_state::MIN_SESSION_CHUNKS_LAST_7D;
    Ok(briefing_state(cached, labs, model_ready, sessions, needed))
}
```

If `store_ai::ModelStatus` is not already imported in this file, reference it as written (`store_ai::ModelStatus::Ready`) — it resolves through the existing `use crate::store::ai::{self as store_ai, ModelState}`.

- [ ] **Step 6: Refactor `ai_briefing_today` to use the helper**

Replace the body of `ai_briefing_today` (everything inside the function) with:

```rust
    let db = match state.db.get() {
        Some(d) => d.clone(),
        None => return Ok(BriefingState::Hidden),
    };
    current_briefing_state(&db, &app)
```

Leave the function signature unchanged. This must produce the identical result the old inline body did.

- [ ] **Step 7: Add the `ai_briefing_delete` command**

In `src-tauri/src/commands/ai.rs`, directly after `ai_briefing_generate`, add:

```rust
/// Delete today's cached briefing and return the recomputed state (resolves to
/// `Idle` when eligible). Lets the user clear the card and regenerate at will.
#[tauri::command]
pub async fn ai_briefing_delete(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<BriefingState, String> {
    let db = match state.db.get() {
        Some(d) => d.clone(),
        None => return Ok(BriefingState::Hidden),
    };
    let today_s = chrono::Local::now().date_naive().to_string();
    {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        store_ai::delete_briefing_for(&conn, &today_s).map_err(|e| e.to_string())?;
    }
    current_briefing_state(&db, &app)
}
```

(Match the `State` / `AppHandle` import style already used by `ai_briefing_today` in this file.)

- [ ] **Step 8: Register the command**

In `src-tauri/src/lib.rs`, in the `invoke_handler![ … ]` list, add after `commands::ai::ai_briefing_generate,`:

```rust
            commands::ai::ai_briefing_delete,
```

- [ ] **Step 9: Build + full test + warning check**

Run:
```bash
cd desktop-app-v3/src-tauri
cargo test --lib 2>&1 | tail -6
cargo build --lib 2>&1 | grep -iE "warning|error" | grep -v "generated.*warning" || echo "clean"
```
Expected: full suite green (including the new test); clean build, no new warnings.

- [ ] **Step 10: Commit**

```bash
git add desktop-app-v3/src-tauri/src/store/ai.rs desktop-app-v3/src-tauri/src/commands/ai.rs desktop-app-v3/src-tauri/src/lib.rs
git commit -m "feat(desktop-v3): ai_briefing_delete command + shared briefing-state helper"
```

---

### Task 2: Frontend — `deleteBriefing` store action + ✕/Regenerate controls

**Files:**
- Modify: `desktop-app-v3/src/lib/ai.ts` (add `deleteBriefing` to the interface + store)
- Modify: `desktop-app-v3/src/components/BriefingCard.tsx` (controls in the `ready` render)

**Interfaces:**
- Consumes: the `ai_briefing_delete` Tauri command from Task 1 (returns `BriefingState`); the existing `generateBriefing` store action.
- Produces: `deleteBriefing: () => Promise<void>` on `useAIStore`.

- [ ] **Step 1: Add `deleteBriefing` to the store interface**

In `src/lib/ai.ts`, in the `AiStore` interface, add directly after `generateBriefing: () => Promise<void>;`:

```ts
  deleteBriefing: () => Promise<void>;
```

- [ ] **Step 2: Implement `deleteBriefing`**

In `src/lib/ai.ts`, in the `create<AiStore>(...)` object, add directly after the `generateBriefing` action (after its closing `},`):

```ts
  deleteBriefing: async () => {
    try {
      const state = await invoke<BriefingState>('ai_briefing_delete');
      set({ briefing: state });
    } catch (e) {
      set({ briefing: { status: 'error', message: String(e) } });
    }
  },
```

- [ ] **Step 3: Wire the store action into the card**

In `src/components/BriefingCard.tsx`, after `const generate = useAIStore((s) => s.generateBriefing);` (~line 14), add:

```tsx
  const deleteBriefing = useAIStore((s) => s.deleteBriefing);
```

- [ ] **Step 4: Add the ✕ + Regenerate controls to the `ready` render**

In `src/components/BriefingCard.tsx`, replace the final `ready` return block:

```tsx
  return (
    <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4 mb-4">
      <div className="text-xs text-primary-600 dark:text-primary-400 mb-1">
        ✨ Today's briefing{generatedAtLabel}
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{briefing.text}</p>
    </div>
  );
```

with:

```tsx
  return (
    <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-primary-600 dark:text-primary-400">
          ✨ Today's briefing{generatedAtLabel}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded px-2 py-0.5 text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-500/20"
            onClick={() => void generate()}
          >
            Regenerate
          </button>
          <button
            aria-label="Dismiss briefing"
            className="rounded px-1.5 py-0.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-primary-500/20"
            onClick={() => void deleteBriefing()}
          >
            ✕
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{briefing.text}</p>
    </div>
  );
```

- [ ] **Step 5: Typecheck**

Run:
```bash
cd desktop-app-v3
npm run typecheck 2>&1 | tail -10
```
Expected: no TypeScript errors. (If an ESLint script exists and is part of the project's gate, also run it; `typecheck` is the floor.)

- [ ] **Step 6: Commit**

```bash
git add desktop-app-v3/src/lib/ai.ts desktop-app-v3/src/components/BriefingCard.tsx
git commit -m "feat(desktop-v3): briefing card delete (X) + regenerate controls"
```

---

## Self-Review Notes

- **Spec coverage:** `delete_briefing_for` parameterized ✓ (T1 S3); `ai_briefing_delete` returns recomputed state ✓ (T1 S7); shared `current_briefing_state` (no copy-paste) ✓ (T1 S5-6); registration ✓ (T1 S8); store `deleteBriefing` set-from-return + error path ✓ (T2 S2); ✕ + Regenerate in `ready` only ✓ (T2 S4); idempotent delete ✓ (covered by test S1); rust test ✓ (T1 S1), frontend manual ✓ (matches posture).
- **Placeholder scan:** none — every step has complete code/commands.
- **Type consistency:** `delete_briefing_for(conn, date)` and `current_briefing_state(db: &crate::store::Db, app: &AppHandle) -> Result<BriefingState, String>` are used identically across T1; `deleteBriefing: () => Promise<void>` matches between the interface (T2 S1), impl (T2 S2), and the card call (T2 S4); the command name string `ai_briefing_delete` matches between the Rust `#[tauri::command]` fn, the `lib.rs` registration, and the `invoke<BriefingState>('ai_briefing_delete')` call.
- **Deferred:** prompt-leak bug; reflection card; generation/threshold logic.
