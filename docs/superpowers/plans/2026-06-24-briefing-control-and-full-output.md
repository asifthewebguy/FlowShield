# Briefing Control + Full Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI briefing generation fully manual (a Generate button; remove the dashboard-mount and 5am auto-fires) and raise the token cap so briefings finish.

**Architecture:** Split `ai_briefing_today` into a read-only status query (returns a new `Idle` state when eligible-but-not-generated, with no side effect) and a separate `ai_briefing_generate` command that actually runs the LLM. Remove the scheduler's 5am briefing branch. Raise `BRIEFING_MAX_TOKENS`. Frontend renders an `idle` Generate button that calls the new command; events drive the rest.

**Tech Stack:** Rust, Tauri 2, candle; React 19 + Zustand + Tailwind.

## Global Constraints

- Component: `desktop-app-v3`. Rust under `src-tauri/`, frontend under `src/`. Paths relative to repo root.
- **Fully manual:** no LLM generation may be triggered by `ai_briefing_today` (read-only) or by the scheduler. Only `ai_briefing_generate` (user-initiated) starts a briefing.
- `BRIEFING_MAX_TOKENS = 200`.
- Keep the scheduler's Phase 1.6b day-rollup and 1.6c reflection branches unchanged.
- Stop/cancel is out of scope. No `unwrap` in non-test production code.
- Rust tests from `desktop-app-v3/src-tauri`: `cargo test --lib <filter>`. Frontend: `cd desktop-app-v3 && npm run typecheck`.

## Reference — current code

`commands/ai.rs` `BriefingState` (serde tag `status`, snake_case):
```rust
pub enum BriefingState {
    Ready { text: String, generated_at: String },
    Generating,
    EmptyState { sessions: i64, needed: i64 },
    Hidden,
}
```
`ai_briefing_today` currently: returns cached `Ready` if a row exists; else `Hidden` if labs off; else `Hidden` if model not `Ready`; else `EmptyState` if `sessions < MIN`; else **emits `ai-briefing-generating`, spawns `generate_with_real_models`, returns `Generating`** (this spawn is the side effect to remove).

`ai/scheduler.rs` loop tail (to remove): `if !should_fire(now,&db,labs,status){continue;}` then a `generate_with_real_models` match emitting `ai-briefing-ready`/`-error`. `should_fire` is defined at the top (uses `FIRE_FROM_HOUR_LOCAL`, `get_briefing_for`, `LLM_ID`, `empty_state::has_minimum_data`) and is covered by the `mod tests` block (the `fires_*` / `skips_*` tests, all calling `should_fire`).

`lib/ai.ts` `BriefingState` union has `ready | generating | empty_state{sessions,needed} | hidden | error`. Bootstrap already listens to `ai-briefing-generating` (→ set `{status:'generating'}`), `ai-briefing-ready` (→ `refreshBriefing`), `ai-briefing-error` (→ set error).

`BriefingCard.tsx` renders `generating`, `empty_state`, then `ready`; `selectBriefingVisible = status !== 'hidden'`.

---

### Task 1: Raise the briefing token cap

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/briefing.rs`

- [ ] **Step 1: Write the failing guard test**

Add to the `#[cfg(test)] mod tests` in `briefing.rs`:

```rust
    #[test]
    fn briefing_token_cap_allows_full_output() {
        // 80 truncated 2-3 sentence briefings mid-word; 200 lets them finish.
        assert_eq!(super::BRIEFING_MAX_TOKENS, 200);
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cargo test --lib ai::briefing::tests::briefing_token_cap 2>&1 | tail -10`
Expected: FAIL — left `80`, right `200`.

- [ ] **Step 3: Change the constant**

In `briefing.rs`, change:
```rust
const BRIEFING_MAX_TOKENS: usize = 80;
```
to:
```rust
const BRIEFING_MAX_TOKENS: usize = 200;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cargo test --lib ai::briefing 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/briefing.rs
git commit -m "feat(desktop-v3): raise briefing token cap 80->200 for full output"
```

---

### Task 2: Split status query from generation command

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/commands/ai.rs`
- Modify: `desktop-app-v3/src-tauri/src/lib.rs`

**Interfaces:**
- Produces:
  - `BriefingState::Idle` (new variant).
  - `pub(crate) fn briefing_state(cached: Option<store_ai::Briefing>, labs_enabled: bool, model_ready: bool, sessions: i64, needed: i64) -> BriefingState` — pure decision.
  - `#[tauri::command] ai_briefing_generate(state, app) -> Result<BriefingState, String>`.
  - `ai_briefing_today` is now read-only (no spawn).

- [ ] **Step 1: Add the `Idle` variant**

In `commands/ai.rs`, add to the `BriefingState` enum (after `Generating`):
```rust
    Idle,
```

- [ ] **Step 2: Write the failing test for the pure decision**

Add to `commands/ai.rs`'s `#[cfg(test)] mod tests` (create the module if absent; import `super::*` and `store_ai::Briefing`):

```rust
    fn cached_row() -> store_ai::Briefing {
        store_ai::Briefing {
            date: "2026-06-24".into(),
            text: "hi".into(),
            generated_at: "2026-06-24T05:00:00Z".into(),
            model_id: "phi-3-mini-4k-instruct-q4".into(),
        }
    }

    #[test]
    fn briefing_state_decision_table() {
        // cached row → Ready regardless of other inputs
        assert!(matches!(briefing_state(Some(cached_row()), true, true, 9, 5), BriefingState::Ready { .. }));
        // labs off → Hidden
        assert!(matches!(briefing_state(None, false, true, 9, 5), BriefingState::Hidden));
        // model not ready → Hidden
        assert!(matches!(briefing_state(None, true, false, 9, 5), BriefingState::Hidden));
        // eligible but under threshold → EmptyState
        assert!(matches!(briefing_state(None, true, true, 3, 5), BriefingState::EmptyState { sessions: 3, needed: 5 }));
        // eligible, enough chunks, no cache → Idle
        assert!(matches!(briefing_state(None, true, true, 5, 5), BriefingState::Idle));
    }
```

(Confirm the `Briefing` struct field names by reading `store_ai::Briefing`; adjust the literal if they differ.)

- [ ] **Step 3: Run it to verify it fails**

Run: `cargo test --lib commands::ai 2>&1 | tail -15`
Expected: FAIL — `cannot find function briefing_state`.

- [ ] **Step 4: Implement the pure decision + make `ai_briefing_today` read-only**

Add the pure helper to `commands/ai.rs`:

```rust
/// Pure briefing-state decision. No I/O, no generation. A cached row always
/// wins; otherwise gate on labs + model-ready + session count, landing on
/// `Idle` when eligible but not yet generated.
pub(crate) fn briefing_state(
    cached: Option<store_ai::Briefing>,
    labs_enabled: bool,
    model_ready: bool,
    sessions: i64,
    needed: i64,
) -> BriefingState {
    if let Some(row) = cached {
        return BriefingState::Ready {
            text: row.text,
            generated_at: row.generated_at,
        };
    }
    if !labs_enabled || !model_ready {
        return BriefingState::Hidden;
    }
    if sessions < needed {
        return BriefingState::EmptyState { sessions, needed };
    }
    BriefingState::Idle
}
```

Rewrite `ai_briefing_today` to gather inputs and delegate — **remove the emit + spawn block entirely**:

```rust
#[tauri::command]
pub async fn ai_briefing_today(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<BriefingState, String> {
    let db = match state.db.get() {
        Some(d) => d.clone(),
        None => return Ok(BriefingState::Hidden),
    };
    let today_s = chrono::Local::now().date_naive().to_string();

    let cached = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        store_ai::get_briefing_for(&conn, &today_s, crate::ai::registry::LLM_ID)
            .ok()
            .flatten()
    };
    let labs = labs_enabled(&app);
    let model_ready = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        matches!(
            store_ai::get_model_state(&conn).ok().flatten().map(|s| s.status),
            Some(store_ai::ModelStatus::Ready)
        )
    };
    let sessions = crate::ai::empty_state::session_chunk_count_last_7d(&db);
    let needed = crate::ai::empty_state::MIN_SESSION_CHUNKS_LAST_7D;

    Ok(briefing_state(cached, labs, model_ready, sessions, needed))
}
```

- [ ] **Step 5: Add the `ai_briefing_generate` command**

Add to `commands/ai.rs` (uses the same imports `ai_briefing_today` had — `Emitter`, `Manager`, `briefing`, `tauri::async_runtime`):

```rust
/// User-initiated briefing generation. Re-checks eligibility; if eligible
/// (Idle), emits `ai-briefing-generating`, spawns generation, and returns
/// `Generating`. Otherwise returns the current non-Idle state without
/// spawning. This is the ONLY path that runs the briefing LLM.
#[tauri::command]
pub async fn ai_briefing_generate(
    state: State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<BriefingState, String> {
    let db = state
        .db
        .get()
        .cloned()
        .ok_or_else(|| "local DB not initialized".to_string())?;
    let today = chrono::Local::now().date_naive();
    let today_s = today.to_string();

    let cached = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        store_ai::get_briefing_for(&conn, &today_s, crate::ai::registry::LLM_ID)
            .ok()
            .flatten()
    };
    let labs = labs_enabled(&app);
    let model_ready = {
        let conn = db.lock().map_err(|_| "db lock poisoned".to_string())?;
        matches!(
            store_ai::get_model_state(&conn).ok().flatten().map(|s| s.status),
            Some(store_ai::ModelStatus::Ready)
        )
    };
    let sessions = crate::ai::empty_state::session_chunk_count_last_7d(&db);
    let needed = crate::ai::empty_state::MIN_SESSION_CHUNKS_LAST_7D;

    match briefing_state(cached, labs, model_ready, sessions, needed) {
        BriefingState::Idle => {}
        other => return Ok(other), // not eligible to generate (Hidden / EmptyState / Ready)
    }

    let _ = app.emit("ai-briefing-generating", today_s);
    let app_handle = app.clone();
    let db_clone = db.clone();
    let embedder = state.embedder.clone();
    let in_flight = state.briefing_in_flight.clone();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let model_dir = app_data_dir.join("models");

    tauri::async_runtime::spawn(async move {
        match briefing::generate_with_real_models(&db_clone, &in_flight, &embedder, &model_dir, today).await {
            Ok(()) => {
                let _ = app_handle.emit("ai-briefing-ready", today.to_string());
            }
            Err(e) => {
                let _ = app_handle.emit("ai-briefing-error", e.to_string());
            }
        }
    });

    Ok(BriefingState::Generating)
}
```

- [ ] **Step 6: Register the command**

In `desktop-app-v3/src-tauri/src/lib.rs`, in `tauri::generate_handler![ ... ]`, add after `commands::ai::ai_briefing_today,`:
```rust
            commands::ai::ai_briefing_generate,
```

- [ ] **Step 7: Run tests + build**

Run: `cargo test --lib commands::ai 2>&1 | tail -15` then `cargo test --lib 2>&1 | tail -5`
Expected: the decision-table test passes; full suite green. No new warnings from `commands/ai.rs`.

- [ ] **Step 8: Commit**

```bash
git add desktop-app-v3/src-tauri/src/commands/ai.rs desktop-app-v3/src-tauri/src/lib.rs
git commit -m "feat(desktop-v3): read-only ai_briefing_today + Idle + ai_briefing_generate"
```

---

### Task 3: Remove the 5am scheduler briefing auto-run

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/scheduler.rs`

- [ ] **Step 1: Remove the briefing branch from the loop**

In `scheduler.rs`, delete the block (after the reflection branch, before the loop's closing braces):
```rust
            if !should_fire(now, &db, labs, status) {
                continue;
            }

            let today = now.date_naive();
            tracing::info!(date = %today, "scheduler firing briefing pipeline");

            match crate::ai::briefing::generate_with_real_models(
                &db,
                &in_flight,
                &embedder_slot,
                &model_dir,
                today,
            )
            .await
            {
                Ok(()) => {
                    let _ = app_handle.emit("ai-briefing-ready", today.to_string());
                }
                Err(e) => {
                    tracing::warn!(?e, "briefing generation failed");
                    let _ = app_handle.emit("ai-briefing-error", e.to_string());
                }
            }
```

- [ ] **Step 2: Remove `should_fire`, its constant, and its tests**

Delete the `const FIRE_FROM_HOUR_LOCAL: u32 = 5;` line and the entire `pub fn should_fire(...) -> bool { ... }` function. In the `#[cfg(test)] mod tests`, delete every test that calls `should_fire` (the `fires_*` / `fires_after_5am_*` / `skips_*` / cached-row / threshold cases). If that empties the test module, delete the `#[cfg(test)] mod tests { ... }` block too.

- [ ] **Step 3: Remove now-orphaned imports**

After the deletions, these are no longer referenced in `scheduler.rs` — remove their `use` lines: `get_briefing_for`, `LLM_ID`, and `empty_state` (if `has_minimum_data` was its only use). Keep imports still used by the day-rollup / reflection branches (`Local`, `Timelike`, `ModelStatus`, `get_reflection_by_date`, `Emitter`, etc.). Let the compiler guide you: `cargo build --lib 2>&1 | grep -E "unused|never used"`.

- [ ] **Step 4: Verify build + suite (no briefing auto-run remains)**

Run: `cargo build --lib 2>&1 | grep -iE "warning.*scheduler|error" || echo "clean"` then `cargo test --lib 2>&1 | tail -5`
Expected: clean build, no warnings from `scheduler.rs`; all remaining tests pass. Confirm no `generate_with_real_models` reference remains in `scheduler.rs`: `grep -n generate_with_real_models src/ai/scheduler.rs` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/scheduler.rs
git commit -m "feat(desktop-v3): remove 5am scheduler briefing auto-run (fully manual)"
```

---

### Task 4: Frontend — Idle state + Generate button

**Files:**
- Modify: `desktop-app-v3/src/lib/ai.ts`
- Modify: `desktop-app-v3/src/components/BriefingCard.tsx`

- [ ] **Step 1: Add the `idle` variant + `generateBriefing` action**

In `desktop-app-v3/src/lib/ai.ts`:

(a) Add to the `BriefingState` union:
```ts
  | { status: 'idle' }
```

(b) Add to the `AiStore` interface (near `refreshBriefing`):
```ts
  generateBriefing: () => Promise<void>;
```

(c) Add the action (after `refreshBriefing`):
```ts
  generateBriefing: async () => {
    // Optimistic: flip to generating immediately; the backend also emits
    // `ai-briefing-generating`, and `ai-briefing-ready` drives the refresh.
    set({ briefing: { status: 'generating' } });
    try {
      await invoke('ai_briefing_generate');
    } catch (e) {
      set({ briefing: { status: 'error', message: String(e) } });
    }
  },
```

- [ ] **Step 2: Render the `idle` Generate button**

In `desktop-app-v3/src/components/BriefingCard.tsx`, add a branch before the final `ready` render (after the `empty_state` branch). Pull the action from the store at the top of the component alongside `refresh`:

```tsx
  const generate = useAIStore((s) => s.generateBriefing);
```

Branch:
```tsx
  if (briefing.status === 'idle') {
    return (
      <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4 mb-4">
        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          ✨ Your AI briefing is ready to generate.
        </div>
        <button
          className="rounded bg-primary-500 px-3 py-1 text-sm text-white"
          onClick={() => void generate()}
        >
          Generate today's briefing
        </button>
      </div>
    );
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd desktop-app-v3 && npm run typecheck 2>&1 | tail -20`
Expected: no errors (the `idle` arm has no extra fields; `generateBriefing` typed on the store).

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src/lib/ai.ts desktop-app-v3/src/components/BriefingCard.tsx
git commit -m "feat(desktop-v3): idle state + Generate briefing button"
```

---

## Manual Verification

With Local AI `ready` and ≥5 session chunks, open the dashboard: the card shows **"Generate today's briefing"** (no LLM runs on mount — CPU stays idle). Click → skeleton (`generating`) → after generation the **full** briefing text (2-3 complete sentences, not truncated). Reopen the dashboard next day (no cached row) → back to the Generate button. Confirm nothing fires the LLM at 5am or on mount.

---

## Self-Review Notes

- **Spec coverage:** token cap 80→200 ✓ (Task 1); read-only `ai_briefing_today` + `Idle` ✓ (Task 2); `ai_briefing_generate` + registration ✓ (Task 2); remove 5am branch + `should_fire` + tests ✓ (Task 3); `idle` variant + Generate button ✓ (Task 4); day-rollup/reflection scheduler branches untouched ✓ (Task 3).
- **Type consistency:** Rust `BriefingState::Idle` ↔ TS `{ status: 'idle' }`; `briefing_state(Option<Briefing>, bool, bool, i64, i64) -> BriefingState`; `ai_briefing_generate` returns `BriefingState`; events `ai-briefing-generating|ready|error` unchanged (existing store listeners drive transitions).
- **No side effects in the query:** `ai_briefing_today` has no `spawn`/`emit` after the rewrite — generation only via `ai_briefing_generate`.
- **Deferred (unchanged):** stop/cancel, reflection-tick manual control, GPU.
