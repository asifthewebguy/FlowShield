# FlowShield Local AI — Corpus Indexer (Phase 1.6) Design

**Date:** 2026-06-23
**Status:** Approved design — pending implementation plans
**Component:** `desktop-app-v3`

## Problem

The Local AI substrate (Phases 1.1–1.5) is fully built and shipping: model
download works, the BGE-small embedder and Phi-3-mini LLM runtimes are real,
the briefing scheduler fires at 5am and a lazy dashboard fallback exists.

But the corpus is empty. Every chunk-producing function — `render_session_chunk`,
`render_day_chunk`, `render_reflection_chunk`, `embed_batch`, `insert_chunk`,
`upsert_reflection`, `render_reflection_prompt` — exists with **zero production
callers** (each is exercised only by its own `#[cfg(test)]` tests). Nothing ever
writes to `ai_chunks`.

Consequences:
- `ai_settings` reports **Indexed chunks: 0** even after the model is `Ready`.
- `empty_state::has_minimum_data` requires ≥5 `source='session'` chunks in the
  last 7 days; with nothing writing chunks it is permanently `false`.
- The briefing pipeline runs but retrieves over an empty `ai_chunks`, so it
  always lands in `EmptyState` ("complete a few more focus sessions").

Phase 1.6 wires the existing building blocks into live indexing so the AI
feature produces real briefings.

## Non-goals (out of scope)

- Re-embedding existing chunks when the model changes.
- Chunk garbage collection / retention windows.
- Vector-index optimization — linear cosine over a 7-day window is fine at this
  scale (tens to low-hundreds of chunks).

## Decomposition

The full corpus is three subsystems with different triggers and risk profiles.
This single design covers the shared architecture; implementation ships as three
sequenced phases, each its own plan + PR, each independently shippable and
verifiable:

| Sub-phase | Chunk type | Trigger | Surface |
|-----------|-----------|---------|---------|
| **1.6a** | `Session` | `session_end` (online) | backend only |
| **1.6b** | `ActivityDay` | nightly scheduler tick | backend only |
| **1.6c** | `Reflection` | evening tick + user answer | backend + frontend |

1.6a alone unblocks `has_minimum_data` and real briefings.

## Shared pipeline — new `ai/indexer.rs`

A single indexing service reused by all three sub-phases. No business logic about
*what* to index — just render-text → embed → persist.

```rust
/// Embed `text` and upsert it as one ai_chunks row. Idempotent: the row id is
/// derived from (source, source_ref), so re-indexing the same logical item
/// replaces rather than duplicates (INSERT OR REPLACE in insert_chunk).
pub async fn index_chunk(
    db: &Db,
    embedder: &CandleEmbedder,
    source: ChunkSource,
    source_ref: &str,
    created_at: &str,   // RFC 3339
    text: String,
) -> Result<(), AiError>;
```

- **Stable id:** `stable_chunk_id(source, source_ref)` — deterministic (e.g.
  `"{source}:{source_ref}"`), so a re-ended session or a re-run nightly job
  overwrites its prior row instead of duplicating. `insert_chunk` already uses
  `INSERT OR REPLACE`.
- **Embedder access:** extract the briefing's existing load-or-get logic into a
  shared `embedder::get_or_load(slot: &OnceLock<Arc<CandleEmbedder>>, model_dir:
  &Path) -> Result<Arc<CandleEmbedder>, AiError>`. `state.embedder` is already
  `Arc<OnceLock<Arc<CandleEmbedder>>>`; both the indexer and briefing share the
  one cached ~135 MB embedder.
- **Gating:** callers index only when the labs flag is enabled **and** model
  status is `Ready`. When AI is disabled or not downloaded, indexing is a no-op.
- **Best-effort:** indexing never fails the user action that triggered it.
  Errors are logged via `tracing` and swallowed.

## 1.6a — Session chunks (online)

**Trigger:** `commands::sessions::session_end`, after the existing
activity-sync block.

**Available data at the hook (no extra fetch needed):**
- `session: Session` — id, start/end times, planned/actual duration, project.
- `productivity_score: Option<i32>` — command parameter.
- `samples: Vec<ActivitySample>` — drained tracker buffer. Each sample has
  `application_name`, `process_name`, `window_title`, `timestamp`,
  `duration_seconds`.

**Flow:**
1. Build `top_apps`: aggregate `samples` by `application_name`, summing
   `duration_seconds`, convert to minutes, sort desc.
2. Build `SessionChunkInput { id, start_time, end_time, planned_duration,
   actual_duration, project_name, productivity_score, top_apps }`.
3. **Spawn a background task** (`tauri::async_runtime::spawn`, fire-and-forget —
   mirrors the device re-register already at the end of `session_end`) so the
   "End session" action stays snappy. The task:
   - returns early if labs off or model not `Ready`;
   - `get_or_load`s the embedder;
   - `render_session_chunk` → `index_chunk(source=Session,
     source_ref=session_id, created_at=session.end_time)`.

**Outcome:** after 5 completed sessions in 7 days, `has_minimum_data` flips
true and the briefing leaves empty-state.

## 1.6b — Day rollups (nightly)

**Trigger:** extend the existing 60s scheduler in `ai/scheduler.rs` with a
"once per local day" guard (fire after local midnight for the *previous*
calendar day, analogous to the 5am briefing guard).

**Flow:**
1. For yesterday's date, read that day's `Session` chunks from `ai_chunks`
   (single source of truth — no re-fetch from the web API).
2. Aggregate into `DayChunkInput { date, session_count, total_focus_minutes,
   best_window, top_apps, lowest_productivity_label }`.
3. `render_day_chunk` → `index_chunk(source=ActivityDay, source_ref=date)`.
   Keyed by date → idempotent across re-runs.

## 1.6c — Reflections (evening question + user answer)

The reflection template generates a **question**, not an answer
(`REFLECTION_TEMPLATE`: "Generate ONE short, specific question…"). The user
answers it; the answer feeds the next morning's briefing
(`generate_with_real_models` already reads yesterday's `reflection.answer`).

**Backend:**
- **Evening tick** (≥18:00 local, once/day, scheduler guard): if labs on +
  model `Ready` + no reflection row for today, `render_reflection_prompt(today's
  session chunks)` → LLM `generate` → today's question. Persist as a pending
  reflection (row keyed by date with an empty/absent answer).
- **New Tauri commands:**
  - `ai_reflection_today() -> ReflectionState` — `{ question, answered }` or
    `Hidden` when labs off / not ready / no question yet.
  - `ai_reflection_answer(answer: String)` — `upsert_reflection` (date,
    questions, answer) then `render_reflection_chunk` →
    `index_chunk(source=Reflection, source_ref=date)`.

**Frontend:**
- `ReflectionCard` on the dashboard, shown only when a question exists and is
  unanswered: renders the question, a textarea, and a submit button calling
  `ai_reflection_answer`. Follows the existing `BriefingCard` pattern and the
  `useAIStore` event/store conventions.

## Data flow

```
session_end        ──[1.6a]──▶ Session chunk
nightly tick       ──[1.6b]──▶ ActivityDay chunk
evening tick + UI  ──[1.6c]──▶ LLM question → user answer → Reflection chunk
                                      │
                          all rows in ai_chunks
                                      │
                       top_k_by_cosine retrieval (7-day window)
                                      │
                          5am / lazy briefing generation
```

## Error handling

- All indexing is best-effort and never fails the triggering user action.
- Embedder/LLM load failure → skip indexing for that tick, log via `tracing`.
- AI disabled or model not `Ready` → no-op (the gate runs before any model load).
- Idempotent writes (stable chunk id for sessions; date key for day/reflection)
  → safe to re-run a tick or re-end a session.

## Testing

- **indexer:** render→embed→insert round-trip with `MockEmbedder`; stable-id
  idempotency (indexing the same source_ref twice yields one row).
- **1.6a:** `samples → top_apps` aggregation; `SessionChunkInput` construction
  from a sample `Session` + samples; `has_minimum_data` returns true after 5
  indexed session chunks.
- **1.6b:** day aggregation from N session chunks; idempotent by date.
- **1.6c:** question generation with `MockLlmRuntime`; `ai_reflection_answer`
  writes both the reflection row and a `Reflection` chunk; command round-trip.

## Affected files

| File | Change |
|------|--------|
| `ai/indexer.rs` | **new** — shared `index_chunk` + `stable_chunk_id` |
| `ai/embedder.rs` (or `candle_embedder.rs`) | extract `get_or_load` helper |
| `ai/briefing.rs` | use shared `get_or_load` (replace inline load-or-get) |
| `commands/sessions.rs` | 1.6a — session-end indexing hook |
| `tracker/mod.rs` | (read only) `ActivitySample` shape for top_apps |
| `ai/scheduler.rs` | 1.6b nightly + 1.6c evening guards |
| `commands/ai.rs` | 1.6c reflection commands |
| `src/components/ReflectionCard.tsx`, `src/lib/ai.ts` | 1.6c frontend |
