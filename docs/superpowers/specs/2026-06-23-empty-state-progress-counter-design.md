# Empty-State Session Progress Counter Design

**Date:** 2026-06-23
**Status:** Approved design — pending implementation plan
**Component:** `desktop-app-v3`

## Problem

When Local AI lacks enough data, the dashboard `BriefingCard` shows a static line:
"✨ Complete a few more focus sessions to unlock your AI briefing." It gives no
sense of how many sessions remain, so a user who has completed several still sees
vague text and can't tell they're close (or why it isn't unlocking).

The gate (`empty_state::has_minimum_data`) is concrete: **≥5 session chunks in the
last 7 days** (`ai_chunks` where `source='session'`). This feature surfaces that
number as a progress counter + bar.

## Key constraint (shapes the design)

The gate counts **session chunks**, not raw sessions. A session becomes a chunk
only if Local AI was enabled **and the model was `Ready` when the session ended**
(Phase 1.6a indexes in `session_end`). So:

- Sessions completed before enabling Local AI / before the model was ready are
  **not** counted.
- The "Today's Sessions" list is sourced from the **web API**, a different source,
  so it can show "Completed" sessions that are not chunks.

The counter therefore reflects **indexed session chunks** (the real gate input), so
it honestly predicts when the briefing unlocks — even if that number is lower than
the visible session list. Copy clarifies this. **Forward-only**; backfilling past
sessions into chunks is out of scope (desktop-v3 has no session-history source — no
local sessions table, no list-sessions web endpoint — so backfill is a separate,
larger feature).

## Definitions (decided)

- **Counter** = current count of session chunks in the last 7 days, shown as
  `"{sessions} of {needed} focus sessions"` where `needed = 5`.
- **Progress bar** = `sessions / needed`, in the existing `BriefingCard` visual
  language (primary-tinted fill on a neutral track).
- **Muted hint** = a one-line clarifier: "counts sessions completed since Local AI
  was enabled" — sets the forward-only expectation.
- Shown only in the `empty_state` branch (i.e. `sessions < needed`); at `needed`
  the gate flips and the card renders the generating/ready briefing instead.

## Architecture

**Backend**

- `ai/empty_state.rs`:
  - Make `MIN_SESSION_CHUNKS_LAST_7D` `pub` (the threshold, 5).
  - Extract the count into `pub fn session_chunk_count_last_7d(db: &Db) -> i64`
    (the existing query, returning the number; fails closed to `0`).
  - `has_minimum_data` becomes `session_chunk_count_last_7d(db) >= MIN_SESSION_CHUNKS_LAST_7D`
    (DRY — single source of the query).
- `commands/ai.rs`:
  - `BriefingState::EmptyState` gains a payload: `EmptyState { sessions: i64, needed: i64 }`.
  - In `ai_briefing_today`, where it currently returns `EmptyState`, compute
    `let sessions = empty_state::session_chunk_count_last_7d(&db);` and return
    `EmptyState { sessions, needed: empty_state::MIN_SESSION_CHUNKS_LAST_7D }`.

**Frontend**

- `lib/ai.ts`: `BriefingState` `empty_state` variant →
  `{ status: 'empty_state'; sessions: number; needed: number }`.
- `components/BriefingCard.tsx`: the `empty_state` branch renders the progress bar +
  `"{sessions} of {needed} focus sessions"` + the muted hint, replacing the static
  copy. Keeps the ✨ affordance and the card's existing border/background.

## Data flow

```
session_end (AI ready) ──> session chunk in ai_chunks
            │
ai_briefing_today: count session chunks (7d) = sessions
            │  sessions < needed → EmptyState { sessions, needed }
            ▼
BriefingCard empty_state: bar (sessions/needed) + "N of 5 focus sessions"
            │  at sessions == needed → has_minimum_data true → briefing generates
```

## Error handling

- Count query fails (poisoned mutex / DB error) → `0` (fails closed, same as
  `has_minimum_data` today). The card shows "0 of 5" rather than crashing.
- No behavior change to the `Ready`/`Generating`/`Hidden`/`disabled` paths.

## Testing

- `ai/empty_state.rs`: `session_chunk_count_last_7d` returns the correct count using
  the existing test fixtures (0 chunks → 0; 4 recent session chunks → 4; ≥5 → ≥5;
  old/non-session chunks excluded). `has_minimum_data` still returns the right
  boolean (now delegating to the count).
- `commands/ai.rs`: the `EmptyState` payload mapping is trivial wiring over the
  tested helper; covered by the existing command shape (no new unit test required —
  the count logic lives in `empty_state`).
- Frontend: `npm run typecheck` clean; the `empty_state` branch renders the bar +
  counter for `sessions < needed`.

## Out of scope

- Backfilling past sessions into chunks (separate feature — needs a web
  list-sessions endpoint + desktop client).
- Changing the threshold (stays 5) or the 7-day window.
- Any change to the briefing generation / scheduler paths.

## Affected files

| File | Change |
|------|--------|
| `desktop-app-v3/src-tauri/src/ai/empty_state.rs` | pub threshold; `session_chunk_count_last_7d`; `has_minimum_data` delegates |
| `desktop-app-v3/src-tauri/src/commands/ai.rs` | `EmptyState { sessions, needed }` payload + wiring |
| `desktop-app-v3/src/lib/ai.ts` | `empty_state` variant gains `sessions`/`needed` |
| `desktop-app-v3/src/components/BriefingCard.tsx` | render bar + counter + hint |
