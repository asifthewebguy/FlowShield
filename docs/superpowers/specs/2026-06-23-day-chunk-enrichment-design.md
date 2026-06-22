# Day-Chunk Enrichment — best_window + lowest_productivity_label Design

**Date:** 2026-06-23
**Status:** Approved design — pending implementation plan
**Component:** `desktop-app-v3`

## Problem

Phase 1.6b's `aggregate_day` (in `ai/indexer.rs`) builds a `DayChunkInput` from a
day's `SessionFacts`, but deferred two fields as `None` because their definitions
were squishy product judgment:

- `best_window: Option<String>` — rendered by `render_day_chunk` as `" Best window {w}."`
- `lowest_productivity_label: Option<String>` — rendered as `" Lowest productivity: {l}."`

Filling them gives the morning briefing richer, more specific signal (e.g. "your
best focus was 09:30–10:55; the afternoon dipped"). This phase computes both from
data already present in `ai_session_facts`.

## Definitions (decided)

Both consider only sessions **with** a `productivity` score (`SessionFacts.productivity`
is `Option<i32>`).

- **best_window** — the highest-`productivity` session that day (tie → larger
  `actual_min`), rendered as its clock span `"HH:MM-HH:MM"` in **local** time.
  `end_time` absent → `"HH:MM-??"`. `None` when no session has a score.
- **lowest_productivity_label** — requires **≥2** scored sessions (so a single
  session is never both "best" and "lowest"). Among scored sessions pick the
  lowest `productivity` (tie → smaller `actual_min`), and label the **local**
  part-of-day of its start time: `hour < 12 → "morning"`, `12 ≤ hour < 17 →
  "afternoon"`, `hour ≥ 17 → "evening"`. `None` when fewer than 2 scored sessions.

## Timezone

`SessionFacts.start_time`/`end_time` are RFC 3339 strings persisted from
`DateTime<Utc>` (so UTC, `+00:00` offset). Both new fields parse those and convert
to **local** time before formatting, so clock spans and part-of-day buckets match
the user's wall clock (a UTC+6 user sees `09:30-10:55`, not `03:30-04:55`).

Note: the existing `render_session_chunk` shows UTC clock times — a pre-existing
quirk. This phase does **not** change that (out of scope); only the new day-chunk
output is local-correct.

## Architecture

One file: `ai/indexer.rs`. `aggregate_day` already filters/sorts the day's facts;
it gains two computed fields via small pure helpers, kept separate so the
selection logic is unit-testable independent of the timezone-dependent formatting.

- `pick_best(facts: &[SessionFacts]) -> Option<&SessionFacts>` — max productivity,
  tie → max actual_min; only scored sessions; `None` if none scored.
- `pick_lowest(facts: &[SessionFacts]) -> Option<&SessionFacts>` — min productivity,
  tie → min actual_min; only scored sessions; `None` if fewer than 2 scored.
- `part_of_day(hour: u32) -> &'static str` — pure hour → bucket.
- `format_window(f: &SessionFacts) -> Option<String>` — parse start/end RFC 3339 →
  local → `"HH:MM-HH:MM"` (end absent → `"HH:MM-??"`); `None` if start unparseable.
- `local_part_of_day(f: &SessionFacts) -> Option<String>` — parse start → local
  hour → `part_of_day`; `None` if unparseable.
- `aggregate_day` sets `best_window = pick_best(&facts).and_then(format_window)`
  and `lowest_productivity_label = pick_lowest(&facts).and_then(local_part_of_day)`.

## Error handling

- No scored sessions → both `None` (unchanged graceful behavior; `render_day_chunk`
  already omits the segments on `None`).
- Unparseable timestamp → that field degrades to `None`, never panics.
- All-`None` productivity is common early on; the day chunk still renders its
  count/focus/top-apps segments.

## Testing

- `pick_best` / `pick_lowest` — TZ-independent, asserted by returned `session_id`:
  highest/lowest selection, tie-breaks (actual_min), `None` when no scores,
  `lowest` returns `None` with exactly one scored session.
- `part_of_day(hour)` — `9 → "morning"`, `12 → "afternoon"`, `16 → "afternoon"`,
  `17 → "evening"`, `21 → "evening"`.
- `format_window` — shape assertion (`matches "HH:MM-HH:MM"` / ends `-??` when end
  absent); exact clock value is TZ-dependent so not asserted (mirrors the 1.6c
  date-length test convention).
- `aggregate_day` — with 3 scored sessions, `best_window` is `Some(_)` and
  `lowest_productivity_label` is `Some("morning"|"afternoon"|"evening")`; with one
  scored session, `best_window` is `Some(_)` and `lowest_productivity_label` is
  `None`.

## Out of scope

- Fixing the UTC clock in `render_session_chunk`.
- Backfill — applies only to day rollups generated after this ships.
- Frontend, schema, scheduler — unchanged; day chunks already flow through
  retrieval into briefings.

## Affected files

| File | Change |
|------|--------|
| `desktop-app-v3/src-tauri/src/ai/indexer.rs` | add the 5 helpers; wire into `aggregate_day`; tests |
