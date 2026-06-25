# GPU Acceleration — Phase C (CPU/GPU Selector) Design

**Date:** 2026-06-25
**Status:** Approved design — pending implementation plan
**Component:** `desktop-app-v3`

## Context

Phase A made on-device inference device-agnostic (`select_device()`, off-by-default
`cuda` feature). Phase B ships a self-contained CUDA Linux AppImage. On a `cuda` build
`select_device()` always uses the GPU when one initializes — the user has no way to
opt out (e.g. GPU busy, thermal, or wanting to keep the GPU free). Phase C adds a
persisted **"Use GPU when available"** toggle on the AI settings page that
`select_device()` honors.

## Decisions (locked during brainstorming)

- **2-way toggle**, not a 3-way picker. The only behaviorally-distinct states are
  *GPU-if-available* and *force-CPU* ("force GPU" with no GPU is identical to Auto).
  Persisted as `ai.device.prefer_gpu` (bool, default `true`).
- **Show-disabled-with-explainer** on builds/machines without a usable GPU: the toggle
  always renders; when GPU is unavailable it is greyed out with an explainer. (Chosen
  over hiding it, for discoverability that a GPU build exists.)
- **Effect timing:** a change applies to the **next briefing generation** (the LLM
  reloads per generation). The cached embedder keeps its device until app restart.

## Architecture

### 1. Persistence + capability (backend, `commands/ai.rs` + `lib.rs`)

Reuse the existing `tauri_plugin_store` `settings.json` pattern (same store as
`ai.labs.enabled`). Key: `ai.device.prefer_gpu` (bool, default `true` when unset).

Three new Tauri commands (registered in `lib.rs` `invoke_handler`):

```rust
// Read the persisted preference (default true).
#[tauri::command] pub async fn ai_device_get_prefer_gpu(app: AppHandle) -> Result<bool, String>
// Persist the preference.
#[tauri::command] pub async fn ai_device_set_prefer_gpu(enabled: bool, app: AppHandle) -> Result<(), String>
// Whether a GPU is actually usable on THIS build + machine right now.
#[tauri::command] pub async fn ai_gpu_available() -> Result<bool, String>
```

`ai_gpu_available` is `false` on a non-`cuda` build; on a `cuda` build it returns
`candle_core::Device::cuda_if_available(0).map(|d| d.is_cuda()).unwrap_or(false)`.
A private `prefer_gpu(app: &AppHandle) -> bool` helper (mirrors `labs_enabled`) backs
the getter and is also called by the generation command (below).

### 2. `select_device` honors the preference

`ai/device.rs` — change the signature to take the preference (keeps `device.rs`
Tauri-free; the bool is resolved by the caller):

```rust
pub fn select_device(prefer_gpu: bool) -> Device {
    #[cfg(feature = "cuda")]
    {
        if prefer_gpu {
            match Device::cuda_if_available(0) {
                Ok(dev) if dev.is_cuda() => { tracing::info!("AI compute device: CUDA(0)"); return dev; }
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

Plumb the bool to the call sites:
- `CandleLlmRuntime::load(model_dir, prefer_gpu)` and `CandleEmbedder::load(model_dir, prefer_gpu)` / `get_or_load(slot, model_dir, prefer_gpu)` take the flag and pass it to `select_device`.
- `briefing::generate_with_real_models(db, in_flight, embedder_slot, model_dir, today, prefer_gpu)` threads it to both loads.
- The generation command (`ai_briefing_generate`, and the reflection equivalent) reads `prefer_gpu(&app)` from the store and passes it into `generate_with_real_models`.

This keeps a single read point per generation; no global state.

### 3. UI (`SettingsAiPage.tsx` + `lib/ai.ts`)

- `lib/ai.ts`: add store actions/typed wrappers `getPreferGpu()`, `setPreferGpu(enabled)`, `getGpuAvailable()` invoking the three commands. Hold `preferGpu: boolean` and `gpuAvailable: boolean` in the store (loaded on settings open).
- `SettingsAiPage.tsx`: a toggle row "Use GPU when available" with a one-line description. On mount, fetch `ai_gpu_available` + `ai_device_get_prefer_gpu`:
  - `gpuAvailable === false` → toggle **disabled**, with explainer text: *"Requires the CUDA GPU build and an available NVIDIA GPU."*
  - `gpuAvailable === true` → toggle enabled, reflecting `preferGpu`; on change, call `setPreferGpu` and a hint line: *"Applies to your next briefing."*
- Follow the existing settings-row styling on the page (match the labs toggle's look).

## Data flow

- **Toggle change:** UI → `ai_device_set_prefer_gpu(enabled)` → store persists. No model reload now.
- **Next generation:** `ai_briefing_generate` reads `prefer_gpu(&app)` → `generate_with_real_models(.., prefer_gpu)` → `load(.., prefer_gpu)` → `select_device(prefer_gpu)` → CUDA or CPU. Log line confirms (`CUDA(0)` vs `CPU (user preference)`).

## Error handling

- `ai_device_get_prefer_gpu` returns `true` (the default) if the store is missing/unreadable — GPU-preferred is the sensible default on a GPU build.
- `ai_gpu_available` never errors in practice; any CUDA-init failure resolves to `false` (treated as "no GPU", toggle disabled).
- `select_device` retains Phase A's CPU fallback: a `prefer_gpu` build that fails CUDA init still runs on CPU with a warning (never crashes).

## Testing

- `ai/device.rs` unit tests (default, non-`cuda` build): `select_device(true)` and
  `select_device(false)` both return `Device::Cpu` — proves the flag never breaks the
  shipping CPU default. (The CUDA branch is `#[cfg(feature="cuda")]`, exercised only on
  a GPU build / manual run.)
- Full `cargo test --lib` stays green; zero new warnings.
- Manual: on the `-cuda` AppImage, toggle OFF → generate → log shows `CPU (user
  preference)` + no GPU spike; toggle ON → generate → `CUDA(0)` + GPU spike.

## Out of scope

- Multi-GPU / device-ordinal selection (fixed at 0).
- Per-model device split (LLM vs embedder on different devices).
- Instant embedder device switch (the cached embedder picks up the change on restart).
- macOS Metal.

## Affected files

| File | Change |
|------|--------|
| `desktop-app-v3/src-tauri/src/ai/device.rs` | `select_device(prefer_gpu: bool)` + tests |
| `desktop-app-v3/src-tauri/src/ai/candle_llm.rs` | `load(dir, prefer_gpu)` threads the flag |
| `desktop-app-v3/src-tauri/src/ai/candle_embedder.rs` | `load`/`get_or_load` thread the flag |
| `desktop-app-v3/src-tauri/src/ai/briefing.rs` | `generate_with_real_models(.., prefer_gpu)` |
| `desktop-app-v3/src-tauri/src/ai/reflection.rs` | reflection generation passes `prefer_gpu` |
| `desktop-app-v3/src-tauri/src/commands/ai.rs` | 3 commands + `prefer_gpu(app)` helper; read at generate |
| `desktop-app-v3/src-tauri/src/lib.rs` | register the 3 commands |
| `desktop-app-v3/src/lib/ai.ts` | typed command wrappers + store fields |
| `desktop-app-v3/src/routes/SettingsAiPage.tsx` | the toggle row + capability gating |
