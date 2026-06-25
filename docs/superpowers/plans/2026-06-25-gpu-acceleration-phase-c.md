# GPU Acceleration — Phase C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted **"Use GPU when available"** toggle on the AI settings page that `select_device()` honors, so a `cuda` build can be forced to CPU; capability-gated so CPU-only builds show it disabled with an explainer.

**Architecture:** `select_device` gains a `prefer_gpu: bool` param (keeps `device.rs` Tauri-free). The flag is read once per generation from the `tauri_plugin_store` `settings.json` (`ai.device.prefer_gpu`, default `true`) and threaded through the model loads. Three new commands (`get`/`set`/`ai_gpu_available`) back a toggle in `SettingsAiPage`.

**Tech Stack:** Rust (Tauri 2 commands, candle, tauri_plugin_store), TypeScript/React (Zustand).

## Global Constraints

- Store key `ai.device.prefer_gpu` (bool), **default `true`** when unset (GPU-preferred). Reuse the `settings.json` store (same as `ai.labs.enabled`).
- `select_device` stays Tauri-free — it takes a `bool`, not the AppHandle/store.
- The signature change is atomic: Task 1 updates `select_device` AND every caller (loads, generate fns, command read-points, scheduler) so the crate compiles + `cargo test --lib` stays green, zero new warnings.
- `ai_gpu_available` returns `false` on a non-`cuda` build; on a `cuda` build it probes `candle_core::Device::cuda_if_available(0)`.
- On a CPU-only build the toggle renders **disabled** with explainer text (don't hide it).
- Effect timing: a change applies to the next briefing generation (LLM reloads then). No model reload on toggle.
- Out of scope: multi-GPU, per-model device split, instant embedder switch, Metal.

## Reference — current code (exact signatures to change)

- `ai/device.rs`: `pub fn select_device() -> Device` (no args) + test `default_build_selects_cpu` calling `select_device()`.
- `ai/candle_llm.rs`: `pub fn load(model_dir: &Path) -> Result<Self, AiError>` → `let device = crate::ai::device::select_device();` (line ~77). Test callers: `CandleLlmRuntime::load(&bogus)` (~277), `::load(dir)` (~299), `::load(&base)` (~331).
- `ai/candle_embedder.rs`: `pub fn load(model_dir: &Path) -> Result<Self, AiError>` → `select_device()` (line ~70); `pub fn get_or_load(slot: &OnceLock<Arc<CandleEmbedder>>, model_dir: &Path) -> Result<Arc<CandleEmbedder>, AiError>` (~53) calls `CandleEmbedder::load(&model_dir.join("bge-small-en-v1.5"))`. Test callers: `::load(&bogus)` (~218), `::load(dir)` (~240).
- `ai/briefing.rs`: `pub async fn generate_with_real_models(db: &Db, in_flight: &AtomicBool, embedder_slot: &OnceLock<Arc<CandleEmbedder>>, model_dir: &Path, today: NaiveDate) -> Result<(), AppError>` (line ~159) calls `CandleEmbedder::get_or_load(embedder_slot, model_dir)` then `CandleLlmRuntime::load(&model_dir.join("phi-3-mini-4k-instruct"))`. A gated test calls `generate_with_real_models(...)` (~320).
- `ai/reflection.rs`: `pub async fn generate_and_store_question(db: &Db, in_flight: &AtomicBool, model_dir: &Path, today: NaiveDate) -> Result<bool, AppError>` (line ~64) calls `CandleLlmRuntime::load(&model_dir.join("phi-3-mini-4k-instruct"))` (~124). No embedder.
- `commands/ai.rs`: `ai_briefing_generate(state, app)` spawns `briefing::generate_with_real_models(&db_clone, &in_flight, &embedder, &model_dir, today)` at line ~224; `labs_enabled(app: &AppHandle) -> bool` (~294) is the store-read pattern; `ai_labs_set_enabled` (~257) is the store-write pattern.
- `ai/scheduler.rs`: has `app_handle: AppHandle` (param, ~13) + `read_labs_flag(app)` (~88); calls `reflection::generate_and_store_question(&db, &in_flight, &model_dir, today)` at line ~73.
- `lib.rs`: invoke_handler lists `commands::ai::ai_labs_get_enabled`, `ai_labs_set_enabled` (~284-285).
- `src/lib/ai.ts`: `setLabsEnabled: async (enabled) => { await invoke('ai_labs_set_enabled', { enabled }); … }` (~93).
- `src/routes/SettingsAiPage.tsx`: labs toggle `<input type="checkbox" checked={settings.labs_enabled} onChange={(e) => void setLabsEnabled(e.target.checked)} />` (~74).

---

### Task 1: Backend — `select_device(prefer_gpu)`, thread it through, 3 commands

**Files:** modify `ai/device.rs`, `ai/candle_llm.rs`, `ai/candle_embedder.rs`, `ai/briefing.rs`, `ai/reflection.rs`, `commands/ai.rs`, `ai/scheduler.rs`, `lib.rs` (all under `desktop-app-v3/src-tauri`).

**Interfaces:**
- Produces: `select_device(prefer_gpu: bool) -> Device`; `prefer_gpu(app: &AppHandle) -> bool` (pub(crate)); commands `ai_device_get_prefer_gpu`, `ai_device_set_prefer_gpu`, `ai_gpu_available` (frontend invoke names).

- [ ] **Step 1: Update the device test to the new signature (RED)**

In `ai/device.rs`, replace the test body:

```rust
    #[cfg(not(feature = "cuda"))]
    #[test]
    fn default_build_ignores_pref_and_selects_cpu() {
        // On the shipping CPU-only build, the preference is irrelevant — both
        // values must resolve to CPU.
        assert!(matches!(select_device(true), Device::Cpu));
        assert!(matches!(select_device(false), Device::Cpu));
    }
```

Run: `cd desktop-app-v3/src-tauri && cargo test --lib ai::device 2>&1 | tail -8` → FAIL (this function takes 0 arguments).

- [ ] **Step 2: Change `select_device` to take `prefer_gpu`**

In `ai/device.rs`, replace `pub fn select_device() -> Device { … }` with:

```rust
pub fn select_device(prefer_gpu: bool) -> Device {
    #[cfg(feature = "cuda")]
    {
        if prefer_gpu {
            match Device::cuda_if_available(0) {
                Ok(dev) if dev.is_cuda() => {
                    tracing::info!("AI compute device: CUDA(0)");
                    return dev;
                }
                Ok(_) => tracing::warn!("CUDA feature built but no CUDA device; using CPU"),
                Err(e) => tracing::warn!(?e, "CUDA init failed; using CPU"),
            }
        } else {
            tracing::info!("AI compute device: CPU (user preference)");
        }
        return Device::Cpu;
    }
    #[cfg(not(feature = "cuda"))]
    {
        let _ = prefer_gpu; // CPU-only build ignores the preference
        tracing::info!("AI compute device: CPU");
        Device::Cpu
    }
}
```

- [ ] **Step 3: Thread through `candle_llm.rs`**

Change `pub fn load(model_dir: &Path)` to `pub fn load(model_dir: &Path, prefer_gpu: bool)` and the body line to `let device = crate::ai::device::select_device(prefer_gpu);`. Update the three in-file test call sites to pass `true`: `CandleLlmRuntime::load(&bogus, true)`, `::load(dir, true)`, `::load(&base, true)`.

- [ ] **Step 4: Thread through `candle_embedder.rs`**

Change `pub fn load(model_dir: &Path)` to `pub fn load(model_dir: &Path, prefer_gpu: bool)` and the body to `let device = crate::ai::device::select_device(prefer_gpu);`. Change `get_or_load` to:

```rust
    pub fn get_or_load(
        slot: &std::sync::OnceLock<std::sync::Arc<CandleEmbedder>>,
        model_dir: &std::path::Path,
        prefer_gpu: bool,
    ) -> Result<std::sync::Arc<CandleEmbedder>, crate::error::AiError> {
        if let Some(e) = slot.get() {
            return Ok(e.clone());
        }
        let loaded = std::sync::Arc::new(CandleEmbedder::load(
            &model_dir.join("bge-small-en-v1.5"),
            prefer_gpu,
        )?);
        let _ = slot.set(loaded.clone());
        Ok(slot.get().cloned().unwrap_or(loaded))
    }
```

Update the two in-file test call sites: `CandleEmbedder::load(&bogus, true)`, `::load(dir, true)`.

- [ ] **Step 5: Thread through `briefing.rs`**

Change `generate_with_real_models` to take `prefer_gpu: bool` as the last param, and pass it to both loads:

```rust
pub async fn generate_with_real_models(
    db: &Db,
    in_flight: &AtomicBool,
    embedder_slot: &std::sync::OnceLock<Arc<CandleEmbedder>>,
    model_dir: &Path,
    today: chrono::NaiveDate,
    prefer_gpu: bool,
) -> Result<(), AppError> {
    let embedder = CandleEmbedder::get_or_load(embedder_slot, model_dir, prefer_gpu)?;
    let runtime = CandleLlmRuntime::load(&model_dir.join("phi-3-mini-4k-instruct"), prefer_gpu)?;
    let result = generate(db, in_flight, embedder.as_ref(), &runtime, today).await;
    drop(runtime);
    result
}
```

In the gated test that calls `generate_with_real_models(...)` (~line 320), add `, true` as the final argument.

- [ ] **Step 6: Thread through `reflection.rs`**

Change `generate_and_store_question` to take `prefer_gpu: bool` as the last param, and pass it to the load:

```rust
pub async fn generate_and_store_question(
    db: &Db,
    in_flight: &AtomicBool,
    model_dir: &Path,
    today: chrono::NaiveDate,
    prefer_gpu: bool,
) -> Result<bool, AppError> {
```
and change the load line (~124) to:
```rust
    let runtime = CandleLlmRuntime::load(&model_dir.join("phi-3-mini-4k-instruct"), prefer_gpu)?;
```
(No other changes — there is no embedder here.)

- [ ] **Step 7: Add the `prefer_gpu` helper + 3 commands in `commands/ai.rs`**

Add the read helper (next to `labs_enabled`):

```rust
/// Read the persisted GPU preference. Defaults to `true` (GPU-preferred) when
/// the store is missing/unreadable or the key is unset.
pub(crate) fn prefer_gpu(app: &AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    match app.store("settings.json") {
        Ok(store) => store
            .get("ai.device.prefer_gpu")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        Err(_) => true,
    }
}
```

Add the three commands (near `ai_labs_get_enabled`/`ai_labs_set_enabled`):

```rust
#[tauri::command]
pub async fn ai_device_get_prefer_gpu(app: AppHandle) -> Result<bool, String> {
    Ok(prefer_gpu(&app))
}

#[tauri::command]
pub async fn ai_device_set_prefer_gpu(enabled: bool, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("ai.device.prefer_gpu", serde_json::Value::Bool(enabled));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Whether a GPU is usable on THIS build + machine right now. `false` on a
/// non-cuda build; on a cuda build, probes CUDA device 0.
#[tauri::command]
pub async fn ai_gpu_available() -> Result<bool, String> {
    #[cfg(feature = "cuda")]
    {
        Ok(candle_core::Device::cuda_if_available(0)
            .map(|d| d.is_cuda())
            .unwrap_or(false))
    }
    #[cfg(not(feature = "cuda"))]
    {
        Ok(false)
    }
}
```

Then in `ai_briefing_generate`, read the preference before the spawn and pass it through. After the existing `let model_dir = app_data_dir.join("models");` line, add:
```rust
    let prefer = prefer_gpu(&app);
```
and change the spawned call from
```rust
        match briefing::generate_with_real_models(&db_clone, &in_flight, &embedder, &model_dir, today).await {
```
to
```rust
        match briefing::generate_with_real_models(&db_clone, &in_flight, &embedder, &model_dir, today, prefer).await {
```

- [ ] **Step 8: Read the preference in `scheduler.rs` for reflection**

In `ai/scheduler.rs`, in the reflection block, change the call (~line 73) from
```rust
                    match crate::ai::reflection::generate_and_store_question(&db, &in_flight, &model_dir, today).await {
```
to
```rust
                    let prefer = crate::commands::ai::prefer_gpu(&app_handle);
                    match crate::ai::reflection::generate_and_store_question(&db, &in_flight, &model_dir, today, prefer).await {
```
(Use the `app_handle` already in scope — the same handle `read_labs_flag` uses.)

- [ ] **Step 9: Register the 3 commands in `lib.rs`**

In the `invoke_handler![ … ]` list, after `commands::ai::ai_labs_set_enabled,` add:
```rust
            commands::ai::ai_device_get_prefer_gpu,
            commands::ai::ai_device_set_prefer_gpu,
            commands::ai::ai_gpu_available,
```

- [ ] **Step 10: Build + full test + warning check**

Run:
```bash
cd desktop-app-v3/src-tauri
cargo test --lib 2>&1 | tail -6
cargo build --lib 2>&1 | grep -iE "warning|error" | grep -v "generated.*warning" || echo "clean"
```
Expected: full suite green (incl. `default_build_ignores_pref_and_selects_cpu`); clean build, no new warnings.

- [ ] **Step 11: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/device.rs desktop-app-v3/src-tauri/src/ai/candle_llm.rs desktop-app-v3/src-tauri/src/ai/candle_embedder.rs desktop-app-v3/src-tauri/src/ai/briefing.rs desktop-app-v3/src-tauri/src/ai/reflection.rs desktop-app-v3/src-tauri/src/commands/ai.rs desktop-app-v3/src-tauri/src/ai/scheduler.rs desktop-app-v3/src-tauri/src/lib.rs
git commit -m "feat(desktop-v3): prefer_gpu preference + commands; select_device honors it"
```

---

### Task 2: Frontend — toggle row on the AI settings page

**Files:** modify `desktop-app-v3/src/lib/ai.ts`, `desktop-app-v3/src/routes/SettingsAiPage.tsx`.

**Interfaces:**
- Consumes: commands `ai_device_get_prefer_gpu` (→bool), `ai_device_set_prefer_gpu({enabled})`, `ai_gpu_available` (→bool) from Task 1.

- [ ] **Step 1: Add store fields + actions in `ai.ts`**

In the `AiStore` interface, add (near `setLabsEnabled`):
```ts
  preferGpu: boolean;
  gpuAvailable: boolean;
  refreshDevicePrefs: () => Promise<void>;
  setPreferGpu: (enabled: boolean) => Promise<void>;
```

In the store object, add to the initial state (near `settings: null`):
```ts
  preferGpu: true,
  gpuAvailable: false,
```
and the actions (near `setLabsEnabled`):
```ts
  refreshDevicePrefs: async () => {
    try {
      const [preferGpu, gpuAvailable] = await Promise.all([
        invoke<boolean>('ai_device_get_prefer_gpu'),
        invoke<boolean>('ai_gpu_available'),
      ]);
      set({ preferGpu, gpuAvailable });
    } catch (e) {
      console.error('refreshDevicePrefs failed:', e);
    }
  },
  setPreferGpu: async (enabled) => {
    await invoke('ai_device_set_prefer_gpu', { enabled });
    set({ preferGpu: enabled });
  },
```

- [ ] **Step 2: Render the toggle row in `SettingsAiPage.tsx`**

Pull the new store bits (near the existing `setLabsEnabled` selector):
```tsx
  const preferGpu = useAIStore((s) => s.preferGpu);
  const gpuAvailable = useAIStore((s) => s.gpuAvailable);
  const setPreferGpu = useAIStore((s) => s.setPreferGpu);
  const refreshDevicePrefs = useAIStore((s) => s.refreshDevicePrefs);
```
Load them on mount — add an effect:
```tsx
  useEffect(() => {
    void refreshDevicePrefs();
  }, [refreshDevicePrefs]);
```
(If `useEffect` is not already imported in this file, add it to the React import.)

Add a settings row (place it after the labs toggle row, matching that row's markup/classes):
```tsx
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium">Use GPU when available</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {gpuAvailable
                ? 'Runs AI on your NVIDIA GPU. Applies to your next briefing.'
                : 'Requires the CUDA GPU build and an available NVIDIA GPU.'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={gpuAvailable ? preferGpu : false}
            disabled={!gpuAvailable}
            onChange={(e) => void setPreferGpu(e.target.checked)}
          />
        </div>
```
(Match the exact wrapper/label classes the labs toggle row uses on this page; the snippet above mirrors the checkbox pattern — adapt the surrounding container classes to the page's existing row styling.)

- [ ] **Step 3: Typecheck**

Run:
```bash
cd desktop-app-v3
npm run typecheck 2>&1 | tail -10
```
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add desktop-app-v3/src/lib/ai.ts desktop-app-v3/src/routes/SettingsAiPage.tsx
git commit -m "feat(desktop-v3): Use-GPU-when-available toggle on AI settings page"
```

---

## Self-Review Notes

- **Spec coverage:** `ai.device.prefer_gpu` default true ✓ (T1 S7 helper); `select_device(prefer_gpu)` ✓ (T1 S2); threaded through llm/embedder/briefing/reflection ✓ (T1 S3-6); read at briefing generate ✓ (T1 S7) + scheduler/reflection ✓ (T1 S8); 3 commands + register ✓ (T1 S7,S9); `ai_gpu_available` cfg-gated ✓ (T1 S7); toggle disabled+explainer when no GPU ✓ (T2 S2); applies-next-briefing hint ✓ (T2 S2); device test both-prefs→CPU ✓ (T1 S1).
- **Placeholder scan:** none — every step has concrete code. The one adaptive note (matching the page's existing row container classes) is a styling-fidelity instruction, not a missing requirement; the checkbox + invoke logic is fully specified.
- **Type consistency:** `prefer_gpu`/`prefer` (bool) threads identically across `select_device` → `load` → `get_or_load` → `generate_with_real_models` → `generate_and_store_question` → the read points; command names `ai_device_get_prefer_gpu` / `ai_device_set_prefer_gpu` / `ai_gpu_available` match between the Rust `#[tauri::command]` fns, `lib.rs` registration, and the `invoke(...)` calls; `preferGpu`/`gpuAvailable` match between the store interface, initial state, actions, and the component.
- **Deferred:** multi-GPU, per-model device split, instant embedder switch, Metal.
