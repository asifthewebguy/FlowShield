# Briefing Control + Full Output Design

**Date:** 2026-06-24
**Status:** Approved design — pending implementation plan
**Component:** `desktop-app-v3`

## Problem

Two issues with the AI briefing, both observed in the running app:

1. **Truncated output.** The briefing stops mid-sentence ("…30 minutes and").
   This is **generation** truncation — `BRIEFING_MAX_TOKENS = 80` cuts the model
   off before it finishes 2-3 sentences. (The card already renders the full stored
   text — `whitespace-pre-wrap`, no clamp — so it is not a display issue.)
2. **Unprompted resource spikes.** `ai_briefing_today` *triggers* generation as a
   side effect, so merely mounting the dashboard fires the LLM — pegging CPU and
   filling RAM/swap with no user action. The user wants to control when the heavy
   AI runs.

## Decisions

- **Fully manual** generation: nothing runs the LLM until the user clicks
  "Generate". Remove both auto-triggers — the dashboard-mount fire and the 5am
  scheduler briefing run.
- **Stop/cancel deferred** to a later phase (needs cooperative cancellation in the
  candle inference loop). This phase delivers manual **Start** + full output only.
- Token cap raised to **200** (fits 2-3 sentences with margin; the prompt's
  "2-3 sentences max" instruction keeps it from rambling).

## Architecture

### Backend

- **`ai/briefing.rs`:** `BRIEFING_MAX_TOKENS` `80 → 200`.
- **`commands/ai.rs` — split query from command:**
  - `ai_briefing_today` becomes **read-only**. It returns the current state with
    **no generation side effect**:
    - `Ready { text, generated_at }` — a cached briefing row exists for today.
    - `Hidden` — labs off, or model not `Ready`.
    - `EmptyState { sessions, needed }` — fewer than the minimum session chunks.
    - **`Idle`** (new variant) — eligible (labs on, model `Ready`,
      `≥ MIN_SESSION_CHUNKS_LAST_7D`) but no cached briefing yet. The card shows the
      Generate button.
  - New command **`ai_briefing_generate`** — performs the run the old
    `ai_briefing_today` did inline: re-validate eligibility (labs + `Ready` +
    `≥ MIN`), emit `ai-briefing-generating`, spawn `generate_with_real_models`
    (which emits `ai-briefing-ready` / `ai-briefing-error` on completion), return
    `Generating`. If called while ineligible it returns the corresponding state
    (`Hidden` / `EmptyState`) without spawning.
  - Register `ai_briefing_generate` in `lib.rs`'s `generate_handler!`.
- **`ai/scheduler.rs` — remove the 5am briefing branch:** delete the `should_fire`
  call + the `generate_with_real_models` block from the loop, and the now-orphaned
  `should_fire` function and its unit tests. **Keep** the Phase 1.6b day-rollup and
  1.6c reflection branches untouched.

### Frontend

- **`lib/ai.ts`:** add `{ status: 'idle' }` to the `BriefingState` union; add a
  `generateBriefing()` store action that `invoke`s `ai_briefing_generate` and
  refreshes. The mount-time `refreshBriefing` now calls the read-only command, so
  it never triggers generation.
- **`components/BriefingCard.tsx`:** add the `idle` branch — a short line + a
  **"Generate today's briefing"** button calling `generateBriefing()`. Existing
  `generating` (skeleton), `ready` (full text), `empty_state` (counter), and
  hidden branches are unchanged. Generation flow: click → `generating` → on
  `ai-briefing-ready` event → refresh → `ready` with the full (200-token) text.

## State machine

```
Hidden ─ labs on + model Ready ─▶ EmptyState{n,5} ─ n≥5 ─▶ Idle ─[Generate]─▶ Generating ─▶ Ready{full text}
                                                            ▲                                   │
                                                            └────────── (next day, no cache) ───┘
```

## Out of scope (deferred)

- **Stop/cancel** mid-generation — needs a cancel flag threaded through the candle
  generate loop. Phase 2.
- **Evening reflection-question generation (1.6c)** still auto-fires the LLM at
  ≥18:00. It is the same class of unprompted-heavy-AI but is left as-is here;
  making it manual is a separate change (a future "AI runs only on demand" setting,
  likely bundled with the deferred GPU work).
- **GPU/CUDA acceleration** — separate deferred feature; this work makes generation
  manual, which mitigates (but doesn't remove) the CPU cost.

## Error handling

- `ai_briefing_today` is pure-read; DB/lock errors map to the existing `String`
  error return; no generation can fail because none is triggered.
- `ai_briefing_generate` errors (ineligible, lock) return the appropriate state /
  error string; generation failures still surface via the `ai-briefing-error`
  event as today.

## Testing

- `commands/ai.rs`: extract the eligibility/state decision into a pure helper if it
  aids testing; assert `ai_briefing_today` returns `Idle` when eligible-with-no-cache
  and never spawns (no side effect). The token constant and the new variant are
  compile-checked.
- `ai/briefing.rs`: `BRIEFING_MAX_TOKENS == 200` (guard, cheap) — documents intent.
- `ai/scheduler.rs`: the briefing branch and `should_fire` (+ its tests) are
  removed; the suite still compiles and passes; day-rollup / reflection tests remain.
- Frontend: `npm run typecheck` clean; the `idle` branch renders the Generate
  button; clicking moves to `generating`.

## Affected files

| File | Change |
|------|--------|
| `desktop-app-v3/src-tauri/src/ai/briefing.rs` | token cap 80→200 |
| `desktop-app-v3/src-tauri/src/commands/ai.rs` | read-only `ai_briefing_today` + `Idle`; new `ai_briefing_generate` |
| `desktop-app-v3/src-tauri/src/lib.rs` | register `ai_briefing_generate` |
| `desktop-app-v3/src-tauri/src/ai/scheduler.rs` | remove 5am briefing branch + `should_fire` (+ tests) |
| `desktop-app-v3/src/lib/ai.ts` | `idle` variant + `generateBriefing` action |
| `desktop-app-v3/src/components/BriefingCard.tsx` | `idle` Generate-button branch |
