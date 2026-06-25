# Briefing Controls — Delete (X) + Regenerate Design

**Date:** 2026-06-25
**Status:** Approved design — pending implementation plan
**Component:** `desktop-app-v3`

## Context

The dashboard `BriefingCard` renders the day's AI briefing in a `ready` state with
no controls. Today's briefing is cached one row per `date` in SQLite `ai_briefings`
(upserted). Once a row exists for today, the card shows the briefing and there is no
in-app way to clear it or generate a fresh one — the only way to re-trigger generation
was to delete the row manually with `sqlite3`. This feature adds two controls to the
`ready` card so the user can dismiss or regenerate the briefing at will.

## Decisions (locked during brainstorming)

- **Both controls.** A delete (**✕**) that removes today's cached row and returns the
  card to its `idle` state (with the existing "Generate today's briefing" button), AND
  a **Regenerate** button that overwrites the briefing in place.
- Regenerate reuses the existing `generateBriefing()` / `ai_briefing_generate` path
  (which already upserts/overwrites today's row). No new generation logic.
- Delete needs a new backend command + a store action; it permanently removes the
  manual-`sqlite`-delete pain.

## Architecture

### Backend

- **`store/ai.rs`** — add a delete helper next to `upsert_briefing`/`get_briefing_for`:
  ```rust
  pub fn delete_briefing_for(conn: &Connection, date: &str) -> Result<(), AppError> {
      conn.execute("DELETE FROM ai_briefings WHERE date = ?", params![date])?;
      Ok(())
  }
  ```
  Parameterized query (matches the existing store style; no string interpolation).

- **`commands/ai.rs`** — add a command that deletes today's row and returns the
  recomputed state:
  ```rust
  #[tauri::command]
  pub async fn ai_briefing_delete(
      state: State<'_, crate::AppState>,
      app: AppHandle,
  ) -> Result<BriefingState, String>
  ```
  Behavior: get the db (return `Hidden` if absent, as `ai_briefing_today` does);
  `today_s = chrono::Local::now().date_naive().to_string()`; under the db lock call
  `store_ai::delete_briefing_for(&conn, &today_s)`; then recompute and return the
  `BriefingState` exactly as `ai_briefing_today` does (cached lookup now `None` →
  resolves to `Idle` when labs+model are ready and sessions ≥ needed, or the
  appropriate `empty_state`/`hidden`). The frontend sets the returned state directly,
  so no event emission is required.

- **`lib.rs`** — register `commands::ai::ai_briefing_delete` in the `invoke_handler`
  list (alongside `ai_briefing_today`, `ai_briefing_generate`). No `capabilities`
  change — briefing commands are not per-command gated in `capabilities/default.json`.

### Frontend

- **`lib/ai.ts`** — add to the store:
  ```ts
  deleteBriefing: () => Promise<void>;
  ```
  Implementation: `const state = await invoke<BriefingState>('ai_briefing_delete');
  set({ briefing: state });` (mirrors `refreshBriefing`'s set-from-return; on error,
  set `{ status: 'error', message: String(e) }`).

- **`components/BriefingCard.tsx`** — in the `ready` render only, add a header row:
  the existing "✨ Today's briefing · generated HH:MM" label on the left, and on the
  right a small **Regenerate** button (calls `generateBriefing()`) and a **✕** icon
  button (calls `deleteBriefing()`). The briefing text stays below. No change to the
  `idle`, `generating`, `empty_state`, `error`, or `hidden` renders — `idle` already
  has the Generate button the delete flow returns to.

## Data flow

- **Delete:** ✕ → `deleteBriefing()` → `ai_briefing_delete` deletes the row →
  returns `Idle` → store sets it → card shows the idle "Generate today's briefing"
  button.
- **Regenerate:** Regenerate → `generateBriefing()` (unchanged) → optimistic
  `generating` → `ai_briefing_generate` overwrites the row → `ai-briefing-ready`
  event → `refreshBriefing` → new `ready` briefing.

## Error handling

- `ai_briefing_delete` returns `Err(String)` on db-lock poisoning / delete failure;
  the store catches and sets `{ status: 'error', message }`, matching `refreshBriefing`.
- Delete is idempotent: deleting when no row exists is a no-op (0 rows affected, `Ok`).

## Testing

- **Rust unit test** (in `store/ai.rs` tests): open an in-memory/temp db with the
  `ai_briefings` schema, `upsert_briefing` a row, `delete_briefing_for(today)`, assert
  `get_briefing_for` returns `None`. A second assert: `delete_briefing_for` on an empty
  table returns `Ok` (idempotent).
- **Frontend:** manual — matches the existing posture (BriefingCard has no unit tests).

## Out of scope

- The briefing **prompt-leak bug** (the `ready` output echoing the instruction template
  / few-shot scaffold) — a separate `briefing.rs`/`prompts.rs` issue, flagged separately.
- Any change to generation logic, the empty-state/idle thresholds, or the reflection card.

## Affected files

| File | Change |
|------|--------|
| `desktop-app-v3/src-tauri/src/store/ai.rs` | add `delete_briefing_for` + unit test |
| `desktop-app-v3/src-tauri/src/commands/ai.rs` | add `ai_briefing_delete` command |
| `desktop-app-v3/src-tauri/src/lib.rs` | register `ai_briefing_delete` in invoke_handler |
| `desktop-app-v3/src/lib/ai.ts` | add `deleteBriefing` store action |
| `desktop-app-v3/src/components/BriefingCard.tsx` | ✕ + Regenerate controls in `ready` state |
