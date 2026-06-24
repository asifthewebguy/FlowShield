# GPU Acceleration — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 2 is a manual, machine-specific spike — run it directly (not via a subagent).**

**Goal:** Make the on-device AI device-agnostic (CPU default, CUDA when a `cuda` build initializes) and prove Phi-3 quantized inference runs on the RTX 3060.

**Architecture:** A `select_device()` helper picks CUDA (feature-gated, with CPU fallback) or CPU; the LLM and embedder loaders call it instead of hardcoding `Device::Cpu`. An off-by-default `cuda` cargo feature enables candle's CUDA backend. A manual build+run spike validates the CUDA path before any further phases.

**Tech Stack:** Rust, candle 0.8 (candle-core/nn/transformers), CUDA toolkit (build-time, cuda feature only).

## Global Constraints

- Component: `desktop-app-v3/src-tauri`. Paths relative to repo root. Rust tests from `desktop-app-v3/src-tauri`.
- The **default build stays CPU-only** and links no CUDA — must run on any machine. CUDA is opt-in via `--features cuda`.
- CUDA init failure on a `cuda` build → **fall back to CPU** with a `tracing::warn`, never crash.
- `from_gguf(false, …)` flash-attn arg stays `false`.
- No `unwrap` in non-test production code. Default-feature `cargo test --lib` stays green, zero new warnings.
- Phase A does **not** touch CI/packaging (Phase B) or add a settings toggle (Phase C).

## Reference — current code

`Cargo.toml` features block:
```toml
[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```
candle deps: `candle-core`, `candle-nn`, `candle-transformers` = `{ version = "0.8", default-features = false }`.

`ai/candle_llm.rs:77` and `ai/candle_embedder.rs:70` each have `let device = Device::Cpu;`.
`ai/mod.rs` lists `pub mod` declarations (alphabetical-ish).

---

### Task 1: `cuda` feature + `select_device()` + wire into loaders

**Files:**
- Create: `desktop-app-v3/src-tauri/src/ai/device.rs`
- Modify: `desktop-app-v3/src-tauri/src/ai/mod.rs` (add `pub mod device;`)
- Modify: `desktop-app-v3/src-tauri/Cargo.toml` (add `cuda` feature)
- Modify: `desktop-app-v3/src-tauri/src/ai/candle_llm.rs:77`
- Modify: `desktop-app-v3/src-tauri/src/ai/candle_embedder.rs:70`

**Interfaces:**
- Produces: `pub fn select_device() -> candle_core::Device`

- [ ] **Step 1: Add the `cuda` cargo feature**

In `desktop-app-v3/src-tauri/Cargo.toml`, change the `[features]` block to:
```toml
[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
cuda = ["candle-core/cuda", "candle-nn/cuda", "candle-transformers/cuda"]
```

- [ ] **Step 2: Write the failing test**

Create `desktop-app-v3/src-tauri/src/ai/device.rs` with the test module first:

```rust
//! Compute-device selection for on-device AI. CPU by default; CUDA when the
//! `cuda` feature is compiled in and a device initializes. Falls back to CPU
//! (with a warning) if CUDA init fails, so a GPU build still runs when the GPU
//! is busy or absent.

use candle_core::Device;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_build_selects_cpu() {
        // Default (non-cuda) feature set must resolve to CPU — the shipping
        // default that runs on any machine.
        #[cfg(not(feature = "cuda"))]
        assert!(matches!(select_device(), Device::Cpu));
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cargo test --lib ai::device 2>&1 | tail -15`
Expected: FAIL — `cannot find function select_device`.

- [ ] **Step 4: Implement `select_device`**

Add above the test module in `device.rs`:

```rust
/// Pick the compute device for AI inference. On a `cuda` build, use CUDA
/// device 0 when it initializes, otherwise fall back to CPU. On a non-`cuda`
/// build, always CPU. Logs the chosen device.
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

- [ ] **Step 5: Register the module**

In `desktop-app-v3/src-tauri/src/ai/mod.rs`, add (alphabetical position, near `candle_*`):
```rust
pub mod device;
```

- [ ] **Step 6: Wire into the loaders**

In `desktop-app-v3/src-tauri/src/ai/candle_llm.rs`, replace:
```rust
        let device = Device::Cpu;
```
with:
```rust
        let device = crate::ai::device::select_device();
```

In `desktop-app-v3/src-tauri/src/ai/candle_embedder.rs`, replace:
```rust
        let device = Device::Cpu;
```
with:
```rust
        let device = crate::ai::device::select_device();
```

If `Device` becomes an unused import in either file after the change, leave it — `Device` is still referenced in the struct field `device: Device` and the `from_gguf`/tensor calls. (Confirm: `cargo build --lib` shows no new `unused import` warning; if it does, remove only that orphaned import.)

- [ ] **Step 7: Run tests + build (default features)**

Run: `cargo test --lib ai::device 2>&1 | tail -10` then `cargo test --lib 2>&1 | tail -5` then `cargo build --lib 2>&1 | grep -iE "warning|error" | grep -v "generated.*warning" || echo "clean"`
Expected: device test passes; full suite green; clean build, no new warnings. (This is all on the **default** CPU feature set — the cuda path is exercised in Task 2.)

- [ ] **Step 8: Commit**

```bash
git add desktop-app-v3/src-tauri/Cargo.toml desktop-app-v3/src-tauri/src/ai/device.rs desktop-app-v3/src-tauri/src/ai/mod.rs desktop-app-v3/src-tauri/src/ai/candle_llm.rs desktop-app-v3/src-tauri/src/ai/candle_embedder.rs
git commit -m "feat(desktop-v3): device-agnostic AI inference + off-by-default cuda feature"
```

---

### Task 2: CUDA build + run spike (MANUAL — gating)

**This is not a subagent task.** It is a machine-specific validation on the RTX 3060 (CUDA toolkit 13.1, driver 580). Run it directly. It gates Phases B and C.

- [ ] **Step 1: Build with the `cuda` feature**

Run: `cd desktop-app-v3/src-tauri && cargo build --release --features cuda 2>&1 | tail -40`

Expected (success): compiles and links. **If it FAILS** — most likely the candle 0.8 `cudarc` not supporting CUDA toolkit 13.1 — **STOP**. Capture the exact error (e.g. `nvcc fatal`, `unsupported cuda version`, cudarc feature/link error) and decide the pivot with the user before any further work:
- bump candle to a version whose `cudarc` supports CUDA 13, **or**
- install/point the build at an older CUDA toolkit (11.x/12.x) via `CUDA_ROOT`/`CUDA_COMPUTE_CAP`.

- [ ] **Step 2: Run the app with CUDA and generate a briefing**

Launch the cuda build (e.g. `cd desktop-app-v3 && npm run tauri:dev -- --features cuda`, or run the release binary). With Local AI `ready` and ≥5 session chunks, click **Generate today's briefing**. Watch the dev log for `AI compute device: CUDA(0)`.

- [ ] **Step 2b: Confirm GPU usage**

In a second terminal run `nvtop`. During generation, confirm GPU0 utilization spikes (it sat idle on the CPU build) and VRAM rises by ~the model size. Confirm the briefing completes without error and reads as full text.

- [ ] **Step 3: Record the result**

Note: did the cuda build compile? did generation run on GPU? rough speedup vs the ~30-90s CPU time? Any phi3 op that errored on CUDA? This result is the input to deciding Phase B/C (or a pivot).

---

## Self-Review Notes

- **Spec coverage:** `cuda` feature ✓ (Task 1 Step 1); `select_device()` + CPU fallback ✓ (Steps 2-4); module registration ✓ (Step 5); wire into LLM+embedder ✓ (Step 6); CPU-default unit test ✓ (Step 2); the gating spike ✓ (Task 2).
- **Type consistency:** `select_device() -> candle_core::Device` used identically in both loaders; the `cuda` branch is `#[cfg(feature = "cuda")]`.
- **Default build unaffected:** all of Task 1's verification runs on the default feature set (CPU); CUDA is only exercised in the manual Task 2 spike.
- **Deferred:** CI cuda asset (Phase B), settings selector (Phase C), Metal, multi-GPU.
