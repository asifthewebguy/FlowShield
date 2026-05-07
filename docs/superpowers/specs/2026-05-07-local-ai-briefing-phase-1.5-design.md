# Local AI Briefing Pipeline + UI (Phase 1.5) Design

**Status:** Approved 2026-05-07. Ready for implementation plan.

**Parent design:** [/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md](/home/asifchowdhury/.claude/plans/ethereal-purring-canyon.md) (approved 2026-05-05).

**Predecessor sub-plans (all merged):**
- Plan 1.1 — substrate (PR #70): traits, schema, corpus, retriever, prompts.
- Plan 1.2 — model download infra (PR #72): sha256-verified resumable downloader, lifecycle.
- Plan 1.3 — BGE-small embedder via candle (PR #74).
- Plan 1.4 — Phi-3-mini Q4 LLM via candle (PR #75).

This phase wires those pieces into a user-visible briefing on the desktop dashboard.

---

## Scope

**In:**
- Daily briefing pipeline (5am scheduler + lazy fallback) producing 80-token completions cached in `ai_briefings`.
- Top-of-dashboard `BriefingCard` component with skeleton / ready / error / hidden states.
- Settings page at `/settings/ai` with: labs toggle, model status + disk usage + chunk count, "Re-download" + "Delete AI data" buttons.
- Three new Tauri commands: `ai_briefing_today`, `ai_labs_set_enabled` / `ai_labs_get_enabled`, `ai_settings`.
- Tauri events: `ai-briefing-ready`, `ai-briefing-generating`, `ai-briefing-error`.

**Out — deferred to Plan 1.6+:**
- Evening reflection prompt + dialog + scheduler.
- Tray menu entries ("Today's briefing", "Reflect on today").
- "↻ Regenerate" button on the briefing card.
- Reflection-time picker setting.
- Cross-device sync of reflections.
- Streaming token callback.
- Conversational mode.

---

## Product decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| When does briefing generate? | Pre-compute at fixed **5am local**; lazy fallback if no cached row exists when dashboard opens (machine asleep at 5am case). |
| Plan scope | Briefing only; reflection deferred to Plan 1.6. |
| First-run gating | **Labs flag** (`enable_local_ai_beta`, defaults `false`). Promote to default-visible in a follow-up minor release after 1–2 weeks of dogfood. |
| Briefing length | **80-token cap** (~16–25s on commodity CPU). Matches the parent design's 3-sentence mockup with headroom. |
| Schedule time | **Fixed 5am local** (not user-configurable in v1; YAGNI until users ask). |
| UI surface | Approach **B**: settings page with labs toggle + status + re-download + delete. No tray entry, no regenerate button (deferred to 1.6). |

---

## Architecture

**New backend modules under `desktop-app-v3/src-tauri/src/ai/`:**

- `scheduler.rs` — single tokio task, ticks once per minute. Calls `briefing::generate` when local time has crossed 5am AND no row exists in `ai_briefings` for today's date AND labs are enabled AND model is `Ready` AND `empty_state::has_minimum_data` returns true.
- `briefing.rs` — orchestrates generation: load embedder + LLM → embed query → retrieve top-k chunks → render prompt via existing `prompts.rs` → generate 80 tokens → upsert `ai_briefings`. Pure orchestration; no Tauri-specific code beyond emitting events through a passed-in `app_handle`.
- `empty_state.rs` — `has_minimum_data(db)` returns `true` if ≥5 sessions with non-NULL `ended_at` (completed sessions, not in-progress or cancelled) exist in the last 7 days. Both the scheduler and the lazy fallback gate on this.

**Extended modules:**

- `commands/ai.rs` — three new commands: `ai_briefing_today`, `ai_labs_set_enabled` / `ai_labs_get_enabled`, `ai_settings`.
- `lib.rs` — extend `AppState` with two fields:
  - `embedder: OnceLock<Arc<CandleEmbedder>>` — long-lived, set on first need.
  - `briefing_in_flight: AtomicBool` — prevents concurrent 5am scheduler + lazy fallback runs.

The LLM is **not** held on `AppState` — `briefing::generate` constructs a fresh `CandleLlmRuntime` as a local variable each call and drops it before return. `briefing_in_flight` is sufficient to serialize generations, so no mutex on a stored slot is needed.

**New frontend files under `desktop-app-v3/src/`:**

- `components/BriefingCard.tsx` — top-of-dashboard card. Mirrors `UpdateBanner.tsx` placement convention.
- `routes/SettingsAiPage.tsx` — new `/settings/ai` route.
- `lib/ai.ts` — Zustand store + Tauri event listeners (`ai-briefing-ready`, `ai-briefing-generating`, `ai-briefing-error`).
- Router setup if not already present (the desktop currently routes manually between Login/Dashboard).

**Two key non-obvious lifecycle decisions:**

1. **LLM lifecycle is per-call** (load → generate → drop). RAM-efficient (idle = 0 GB resident from LLM) and sidesteps the KV-cache reset bug from Plan 1.4. Cold-load adds ~1–2s per generation — acceptable for a daily event.
2. **Embedder lifecycle is process-long** (`OnceLock`). It's small (~135 MB), idempotent, and called at indexing time too (Plan 1.6 reflection re-embed flows through here).

---

## Components

| Module | Public surface | Responsibility |
|---|---|---|
| `ai/scheduler.rs` | `pub fn spawn(app_handle, db, http)`, `pub fn should_fire(now, db, labs_enabled, model_ready) -> bool` (testable, deterministic) | One spawned task; ticks every 60s; calls `briefing::generate` when `should_fire` returns true. Holds no state — re-checks DB each tick. |
| `ai/briefing.rs` | `pub async fn generate(state, db, app_handle) -> Result<(), AiError>` | Sets `briefing_in_flight=true` (returns Ok early if already true). Loads embedder via `OnceLock`. Embeds query. Retrieves top-15 chunks (last 7d). Renders prompt. Loads `CandleLlmRuntime` fresh. Generates 80 tokens. Upserts `ai_briefings` row. Drops LLM. Emits `ai-briefing-ready`. Sets `briefing_in_flight=false`. |
| `ai/empty_state.rs` | `pub fn has_minimum_data(db) -> bool` | Counts completed sessions in last 7d. Returns `true` if ≥5. |
| `commands/ai.rs` (extended) | `ai_briefing_today`, `ai_labs_set_enabled`, `ai_labs_get_enabled`, `ai_settings` | `ai_briefing_today` returns the cached `ai_briefings` row for today; if missing AND model ready AND data sufficient, spawns the lazy fallback. Returns one of `{status: "ready", text}`, `{status: "generating"}`, `{status: "empty_state"}`, `{status: "hidden"}`, `{status: "error", message}`. |
| `BriefingCard.tsx` | Default-exported component | 4 render states: skeleton (generating), ready (text + relative timestamp), error (message + retry hint), hidden (no labs / no model / empty state). Mounted on `DashboardPage` between header and main. |
| `SettingsAiPage.tsx` | Default-exported component | Sections: (a) **Beta toggle** "Enable Local AI (Beta)" with one-line description; (b) **Status** model id + ready/downloading/error + disk usage MB + indexed chunk count; (c) **Actions** "Re-download" button (re-runs `ai_model_download_start`), "Delete AI data" button (calls `ai_data_delete` from Plan 1.2). |
| `lib/ai.ts` | Zustand store: `useAIStore` with state `{enabled, status, briefing}` + actions `{toggleBeta, refresh, deleteData, redownload}` | Subscribes to backend Tauri events ONCE at store-module load (via a side-effecting `subscribe()` call at file scope), not per-component-mount. Components just read state. |

**One key constraint encoded above:** `briefing::generate` is the SINGLE entry point. Both the 5am scheduler and the lazy `ai_briefing_today` fallback call it. The `briefing_in_flight` `AtomicBool` prevents the race when both fire within ~30s of each other (e.g., user opens dashboard at 4:59:50am).

---

## Data flow

### Pre-compute path (5am scheduler)

```
scheduler.rs tick (every 60s)
  → labs.enabled? → no → skip
  → model status == Ready? → no → skip
  → now.local().hour ≥ 5? → no → skip
  → ai_briefings has row WHERE date = today? → yes → skip
  → empty_state::has_minimum_data(db)? → no → skip
  → briefing::generate(state, db, app_handle).await
```

The "≥ 5" rather than "== 5" guard handles the laptop-asleep-through-5am case: any tick after 5am with no cached row will fire.

### Lazy fallback path (dashboard mount)

```
DashboardPage mounts
  → useAIStore.bootstrap() invokes ai_briefing_today
  → backend: SELECT * FROM ai_briefings WHERE date = today
    ↓ row exists → return {status: "ready", text}
    ↓ no row + labs off → return {status: "hidden"}
    ↓ no row + model not Ready → return {status: "hidden"}
    ↓ no row + insufficient data → return {status: "empty_state"}
    ↓ no row + everything ok:
         emit ai-briefing-generating
         tauri::spawn(briefing::generate(...))
         return {status: "generating"}
  → frontend re-renders BriefingCard based on response
  → on ai-briefing-ready event, store re-fetches and renders text
```

### `briefing::generate` internals

```
1. briefing_in_flight.compare_exchange(false → true) failed? → return Ok (already running)
2. embedder = state.embedder.get_or_try_init(|| CandleEmbedder::load(...))
3. query = format!("Today is {weekday} {date}. Recent patterns, blockers, baselines.", ...)
4. q_vec = embedder.embed(&query).await?
5. chunks = store::ai::list_chunks_since(db, now - 7d).await?
6. top_15 = retriever::top_k_by_cosine(q_vec, chunks, 15)
7. yesterday_reflection = store::ai::get_reflection_by_date(db, now - 1d) // None for now (Plan 1.6 lands reflection capture)
8. prompt = prompts::render_briefing_prompt(top_15, yesterday_reflection, today)
9. llm = CandleLlmRuntime::load(model_dir)?  // ~1-2s cold load
10. text = llm.generate(&prompt, 80).await?  // ~16-25s
11. drop(llm)  // release ~3 GB RAM
12. store::ai::upsert_briefing(db, today, text, llm_id).await?
13. app_handle.emit("ai-briefing-ready", today)?
14. briefing_in_flight.store(false)
```

### Settings page flow (consent → download → ready)

```
User opens /settings/ai
  → toggle "Enable Local AI (Beta)" → ON
  → ai_labs_set_enabled(true) writes to tauri-plugin-store
  → BriefingCard.bootstrap re-runs → ai_settings returns status: NotStarted
  → frontend renders consent card "✨ Enable daily AI briefing — needs 3.0 GB free"
  → user clicks Download
  → ai_model_download_start (Plan 1.2 command) kicks off background download
  → ai-model-progress events stream → progress bar updates
  → on Ready: ai_settings returns status: Ready
  → first scheduler tick or first dashboard mount triggers briefing::generate
```

---

## Error handling

Each failure mode maps to a user-visible behavior + recovery path. No silent failures.

| Failure | User sees | Recovery |
|---|---|---|
| Embedder load fails (corrupt safetensors) | Settings: "Status: Error — embedder corrupted". BriefingCard hidden. | "Re-download" button clears local files and re-runs the Plan 1.2 downloader. |
| LLM load fails (corrupt GGUF) | Same as above; status text reads "LLM corrupted". | "Re-download". |
| Out-of-memory during generation | Settings: "Error — generation failed: out of memory". Briefing skipped this day. | Manual button "Try again" runs `briefing::generate` once. Settings copy: "≥4 GB free RAM recommended". No automatic retry — would just OOM again. |
| `briefing::generate` panics (shouldn't, but candle FFI surface) | `tokio::spawn` crashes silently into log; without mitigation, `briefing_in_flight` stays `true` permanently. | **Mitigation:** wrap the spawned task body with a drop-guard struct (hand-rolled or `scopeguard` crate) that resets `briefing_in_flight=false` on drop. |
| Generated text is empty / under 5 chars | Card hidden for the day; `ai_briefings` row NOT cached, so tomorrow's pre-compute retries. | None needed — natural retry next day. |
| Disk full mid-download | Plan 1.2 downloader returns `AiError::DiskFull`. Settings shows status "Error — disk full". | "Re-download" after user frees space. |
| User toggles labs OFF mid-generation | Generation completes; row writes to DB; event emitted. BriefingCard ignores the event because `enabled=false`. Row stays cached for re-enable. | None — re-enabling labs surfaces the cached briefing immediately. |
| User clicks "Delete AI data" mid-generation | `ai_data_delete` blocks waiting on `briefing_in_flight=false` (60s timeout); if timeout, returns error "Wait for briefing to finish or quit the app". | Sequential by design. |
| Scheduler clock skew (laptop sleeps through 5am, wakes at 9am) | First scheduler tick after wake hits the "now.local().hour ≥ 5 AND no row for today" branch → fires immediately. | Built in. |
| User changes timezone (travel) | If new local time has already crossed 5am for the new "today's date", scheduler fires. If briefing for the OLD date already exists, it's keyed by date so no double-write. | Built in via date-keyed cache. |
| Concurrent 5am tick + lazy fallback both call `briefing::generate` | First call wins via `compare_exchange`. Second returns Ok early. | Built in. |

**Logging:** every error path uses `tracing::warn!` with structured fields (`error_kind`, `model_id`, `db_path`). Sentry counters increment on the categories per the parent design's observability spec — but no content (no prompt text, no output text, no chunk text).

---

## Testing

### Unit tests (pure Rust, fast, run on every `cargo test`)

| Module | Tests |
|---|---|
| `ai/scheduler.rs` | (a) `should_fire_at_5am_with_no_cached_row` — `now=05:30` + empty DB → `true`; (b) `should_skip_if_briefing_cached_today`; (c) `should_skip_if_labs_disabled`; (d) `should_skip_if_model_not_ready`; (e) `should_skip_if_below_data_threshold`; (f) `should_fire_after_5am_post_sleep` — `now=09:00` + no cached row → `true`. The function is `pub fn should_fire(...) -> bool`, deterministic — no spawned task in tests. |
| `ai/briefing.rs` | Uses `MockEmbedder` + `MockLlmRuntime` from Plan 1.1. Tests: (a) `generate_writes_to_ai_briefings`; (b) `generate_emits_event` (Tauri MockApp captures); (c) `generate_is_idempotent_for_same_day`; (d) `generate_returns_early_when_in_flight`; (e) `generate_recovers_in_flight_on_panic` — drop-guard verified by panicking in mock. |
| `ai/empty_state.rs` | (a) `has_minimum_data_returns_false_below_threshold` (4 sessions); (b) `has_minimum_data_returns_true_at_threshold` (5 sessions); (c) `has_minimum_data_excludes_old_sessions` (5 sessions all > 7d ago → false). |
| `commands/ai.rs` | (a) `ai_briefing_today_returns_cached`; (b) `ai_briefing_today_triggers_lazy_when_missing`; (c) `ai_briefing_today_returns_empty_state_when_insufficient_data`; (d) `ai_labs_set_enabled_persists` (round-trip via tauri-plugin-store mock). |

### Integration test (gated)

`briefing_pipeline_with_real_models` (gated by `FLOWSHIELD_AI_TESTS=1`) — runs the full pipeline against real BGE + real Phi-3. Asserts: row exists, text non-empty, length ≤ 400 chars (80 tokens × 5 char/tok upper bound), generation completes in ≤ 60s.

### Frontend tests

Vitest is not currently set up in the desktop Tauri React app (only in `web-app`). Spinning up Vitest is out of scope for Plan 1.5 — defer to a tooling task. Manual verification via `npm run tauri:dev` is the gate (toggle labs on, click through the flow).

### Manual quality eval

Maintain `eval/briefings.md` in the repo with ~20 sample briefing outputs across data shapes (heavy day, sparse day, weekend, mostly-meeting day). Re-run weekly during alpha. Flag drift if outputs become generic, hallucinate stats not in the chunks, or repeat across days. Human-in-the-loop checkpoint — the test suite can't catch quality regressions.

### Performance budgets (validated post-merge on dev hardware, recorded in PR description)

| Operation | Budget | Notes |
|---|---|---|
| Cold LLM load | < 3s | Disk read + GGUF parse + tokenizer |
| Briefing generation end-to-end (with cold load) | < 30s | Lazy fallback target |
| Embedder load (cold) | < 1s | OnceLock — paid once per process |
| RAM peak during generation | < 3.5 GB | If exceeded, settings shows "low RAM" warning |
| Embedding throughput (background indexer) | > 50 chunks/s | Plan 1.6 stress-tests this |

---

## Out of scope summary

For implementation-plan reviewers: do not let scope creep into 1.5. Anything not listed in **Scope: In** above is deferred. The most common temptation will be adding the tray menu entry "Today's briefing" — resist; Plan 1.6 lands it alongside "Reflect on today" so they're a coherent pair.
