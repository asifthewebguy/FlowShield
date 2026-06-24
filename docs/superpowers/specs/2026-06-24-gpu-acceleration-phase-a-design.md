# GPU Acceleration — Phase A (Runtime Device + cuda Feature + Spike) Design

**Date:** 2026-06-24
**Status:** Approved design — pending implementation plan
**Component:** `desktop-app-v3`

## Context

The on-device Phi-3 briefing runs CPU-only — observed RAM at 88% + swap full + all
cores pegged while the user's RTX 3060 sits idle. GPU inference would be far faster
and relieve that pressure. This is the first of three phases (see "Phasing"):
**Phase A** makes the inference code device-agnostic and proves CUDA works on the
target machine. It does **not** ship a GPU build to other users (Phase B) or expose
a CPU/GPU choice (Phase C).

## Feasibility (established)

candle 0.8.4 has a `candle::quantized::cuda` module, and its quantized example
(which includes Phi-3) runs on `candle_examples::device(...)` → CUDA when available.
So the quantized GGUF path **does** run on CUDA. The remaining risk is narrow and is
what the spike resolves:

- **Top risk:** the target machine has **CUDA toolkit 13.1** (very new). candle 0.8.4
  pins an older `cudarc`; the `--features cuda` build may fail to compile/link against
  CUDA 13. If so, Phase A stops at the spike and we choose a pivot (bump candle to a
  version supporting CUDA 13, or install/point at an older toolkit) **before** any
  further work.
- A phi3-specific quantized op could lack a CUDA kernel — also surfaced by the spike.

## Phasing (this spec = Phase A only)

| Phase | Scope | Status |
|-------|-------|--------|
| **A** | `cuda` cargo feature, `select_device()` with CPU fallback, wire into LLM+embedder, **local build+run spike on the RTX 3060** | this spec |
| B | CI builds a second `-cuda` release asset (CUDA-toolkit runner) | later |
| C | CPU/GPU selector on the AI settings page, persisted, read by `select_device` | later |

## Architecture (Phase A)

### 1. `cuda` cargo feature

In `desktop-app-v3/src-tauri/Cargo.toml`, add an off-by-default feature that turns on
candle's CUDA backend across the three candle crates:

```toml
[features]
# existing: default = ["custom-protocol"], custom-protocol = ["tauri/custom-protocol"]
cuda = ["candle-core/cuda", "candle-nn/cuda", "candle-transformers/cuda"]
```

- Default build (no `cuda`) links **no** CUDA libraries — runs on any machine (the
  shipping default for the ~99% of users without an NVIDIA GPU).
- `cargo build --features cuda` produces a CUDA-linked binary (requires the CUDA
  toolkit at build time and CUDA runtime libs at launch).

### 2. `select_device()` helper — new `ai/device.rs`

A single source of truth for which compute device the AI uses:

```rust
//! Compute-device selection for on-device AI. CPU by default; CUDA when the
//! `cuda` feature is compiled in and a device initializes. Falls back to CPU
//! (with a warning) if CUDA init fails, so a GPU build still runs when the GPU
//! is busy or absent.

use candle_core::Device;

pub fn select_device() -> Device {
    #[cfg(feature = "cuda")]
    {
        match Device::cuda_if_available(0) {
            Ok(dev) if dev.is_cuda() => {
                tracing::info!("AI compute device: CUDA(0)");
                return dev;
            }
            Ok(_) => tracing::warn!("CUDA feature built but no CUDA device; using CPU"),
            Err(e) => tracing::warn!(?e, "CUDA init failed; using CPU"),
        }
    }
    tracing::info!("AI compute device: CPU");
    Device::Cpu
}
```

Registered as `pub mod device;` in `ai/mod.rs`.

### 3. Wire into the model loaders

- `ai/candle_llm.rs`: replace `let device = Device::Cpu;` with
  `let device = crate::ai::device::select_device();`. The `ModelWeights::from_gguf(false, …)`
  flash-attn argument stays `false` (quantized inference doesn't need flash-attn on CUDA).
- `ai/candle_embedder.rs`: replace `let device = Device::Cpu;` with
  `let device = crate::ai::device::select_device();`.

No other call-site changes — both runtimes already thread their `device` field through
the forward pass; switching the device value is sufficient.

### 4. The spike (gates Phase B/C)

A manual, machine-specific validation — **the deliverable that proves the phase**:

1. `cd desktop-app-v3/src-tauri && cargo build --release --features cuda`.
   - If this fails to compile/link (the CUDA-13 risk), **stop**: record the exact
     error and decide the pivot with the user. Do not proceed.
2. Run the app (`cargo tauri build --features cuda` or `cargo run`), enable Local AI,
   click **Generate briefing**.
3. Confirm with `nvtop` that GPU utilization spikes during generation and that the
   briefing completes without error (and reads as full text).
4. Note the rough speedup vs CPU.

## Error handling

- CUDA init failure on a `cuda` build → CPU fallback with a `tracing::warn` (never a
  crash). The default build is unaffected (CPU always).
- A phi3 op unsupported on CUDA would surface as a generation error via the existing
  `ai-briefing-error` path; the spike catches it before shipping.

## Testing

- Unit test in `ai/device.rs`: the default (non-`cuda`) build's `select_device()`
  returns `Device::Cpu` (`matches!(select_device(), Device::Cpu)`). The CUDA branch is
  `#[cfg(feature="cuda")]` and verified by the manual spike (CPU CI can't exercise it).
- Full `cargo test --lib` (default features) stays green; zero new warnings.
- The CUDA build is **not** added to CI in Phase A (that's Phase B) — it is a local
  spike only.

## Out of scope (Phase A)

- CI / release packaging of a GPU asset (Phase B).
- The CPU/GPU settings selector + persistence (Phase C).
- macOS Metal backend.
- Multi-GPU selection (ordinal fixed at 0).

## Affected files

| File | Change |
|------|--------|
| `desktop-app-v3/src-tauri/Cargo.toml` | add off-by-default `cuda` feature |
| `desktop-app-v3/src-tauri/src/ai/device.rs` | **new** — `select_device()` + test |
| `desktop-app-v3/src-tauri/src/ai/mod.rs` | `pub mod device;` |
| `desktop-app-v3/src-tauri/src/ai/candle_llm.rs` | use `select_device()` |
| `desktop-app-v3/src-tauri/src/ai/candle_embedder.rs` | use `select_device()` |
