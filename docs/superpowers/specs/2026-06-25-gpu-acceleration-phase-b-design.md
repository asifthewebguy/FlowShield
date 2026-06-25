# GPU Acceleration — Phase B (CUDA Linux AppImage Release Asset) Design

**Date:** 2026-06-25
**Status:** Approved design — pending implementation plan
**Component:** `desktop-app-v3` / `.github/workflows/desktop-v3-release.yml`

## Context

Phase A (PR #94, merged) made the on-device AI device-agnostic: an off-by-default
`cuda` cargo feature + `select_device()` (CPU default, CUDA(0) when a `cuda` build
initializes, CPU fallback otherwise). A local spike proved a `cuda` build runs Phi-3
q4 inference on the RTX 3060, fast. **Phase B ships that capability**: the release
pipeline builds a second, CUDA-accelerated Linux asset so NVIDIA users can opt into
GPU inference. It does **not** add a CPU/GPU UI selector (Phase C).

## Phasing (this spec = Phase B only)

| Phase | Scope | Status |
|-------|-------|--------|
| A | `cuda` feature, `select_device()`, wire into loaders, local spike | done (PR #94) |
| **B** | CI builds a self-contained `-cuda` Linux **AppImage** release asset | this spec |
| C | CPU/GPU selector on the AI settings page, persisted, read by `select_device` | later |

## Decisions (locked during brainstorming)

1. **Self-contained AppImage.** The asset bundles the CUDA runtime libs so the only
   external dependency is the NVIDIA driver. AppImage is the only release format that
   bundles cleanly, so the cuda variant ships as **AppImage only**; the CPU build
   keeps all three (deb/rpm/AppImage) + macOS.
2. **GPU floor = Turing `sm_75`** (`CUDA_COMPUTE_CAP=75`). candle ships PTX kernels
   that JIT at load, so sm_75 covers RTX 20/30/40-series and newer (the 3060
   included); Pascal/GTX-10 and older are dropped.
3. **Non-blocking.** A cuda-job failure must never block the release — CPU bundles +
   macOS always ship; the release simply omits the cuda asset.
4. **CI toolkit via `Jimver/cuda-toolkit` action on ubuntu-22.04.** Default gcc 11 on
   22.04 satisfies nvcc 12.6 — none of the conda/g++ workarounds the local Fedora 43
   box needed (those were a Fedora-gcc-15 + system-CUDA-13 problem, absent on 22.04).

## Architecture

One new job, `build-linux-cuda`, added to `desktop-v3-release.yml`. It mirrors the
existing `build-linux` job (same `ubuntu-22.04` runner, system deps, node, rust
setup) and adds the CUDA toolkit + the `cuda` feature. It produces one self-contained
AppImage and uploads it as a separate artifact. The existing `sign-and-release` job
consumes it alongside the other bundles. No other workflow or any application code is
touched; the default (CPU) build path is unchanged.

### Build distro ≠ run distro

The ubuntu-22.04 runner is only the build machine. The shipped AppImage is
distro-agnostic: built against glibc 2.35, it runs on any Linux with glibc ≥ 2.35
(Fedora, Arch, etc.) — the same portability the existing CPU AppImage already relies
on. CUDA-wise, the only host requirement is an NVIDIA driver new enough for CUDA 12.6
(≥ 525); the CUDA runtime itself is bundled.

## The `build-linux-cuda` job

- `runs-on: ubuntu-22.04`; `continue-on-error: true` (non-blocking).
- Same `apt` system deps, `actions/setup-node@v4` (node 20), `dtolnay/rust-toolchain@stable`,
  `Swatinem/rust-cache@v2` as `build-linux`, but with a distinct cache `key: linux-cuda`
  so the CPU and cuda caches don't trample each other.
- `Jimver/cuda-toolkit@v0.2.x` with `cuda: '12.6.x'`, `method: network`, and a
  `sub-packages`/`linux-local-args` selection that installs nvcc + the runtime libs
  (cudart, cublas) — enough to compile candle-kernels and to bundle at link time.
- Env for the build step:
  - `CUDA_COMPUTE_CAP=75`
  - `LD_LIBRARY_PATH` prepends the toolkit lib dir, so linuxdeploy resolves and
    bundles the CUDA runtime `.so`s into the AppImage.
- Build: `npm run tauri:build -- --features cuda --bundles appimage`
  (AppImage only; the deb/rpm formats are not produced for the cuda variant).

## AppImage bundling + naming

- **Bundling:** linuxdeploy copies the binary's NEEDED libs into the AppImage. With
  `LD_LIBRARY_PATH` pointing at the toolkit, `libcudart.so.12` / `libcublas.so.12` /
  etc. are bundled. `libcuda.so.1` (the driver) is on linuxdeploy's standard exclude
  list and stays external — correct, since it must come from the user's driver.
- **Naming:** the stage step renames the output to
  `FlowShield_${VERSION}_amd64-cuda.AppImage` — distinct from the CPU
  `FlowShield_${VERSION}_amd64.AppImage`. No collision in `SHA256SUMS` or the Release
  asset list; the `-cuda` suffix makes the GPU build self-describing.

## Integration with `sign-and-release` and AUR

- `sign-and-release` adds a download of the cuda artifact gated so a missing artifact
  (cuda job failed/skipped) is a clean no-op — `if-no-files-found: warn`, not `error`.
- The existing GPG sign loop (`for f in *.deb *.rpm *.AppImage *.dmg`) signs the cuda
  AppImage automatically; `SHA256SUMS` includes it.
- `publish-to-aur` is unaffected: it downloads only the `linux-bundles` (CPU) artifact
  and globs `FlowShield_*_amd64.AppImage` (the CPU file), so the cuda asset can never
  leak into the AUR `flowshield-bin` package.

## Error handling

- Cuda toolchain fragility is contained by `continue-on-error: true` + the `warn`
  download gate: every failure mode (toolkit install, nvcc compile, link, bundle)
  degrades to "release ships without the cuda asset," never to a blocked release.
- The CPU asset remains the safe default for the ~99% of users without an NVIDIA GPU.

## Testing / validation

The one novel risk is whether linuxdeploy bundles the CUDA `.so`s correctly. GHA
runners have no GPU, so runtime GPU verification is out of scope for CI; validation is
structural:

- **In-CI:** after the bundle step, extract/inspect the AppImage and assert
  `libcudart.so.*` is present *inside* it (and that the main binary's `ldd`, resolved
  against the AppImage's bundled lib dir, does not fall through to a host path for
  cudart). Fail the cuda job (not the release) if the runtime lib is missing — a
  silently-CPU-only "cuda" AppImage is worse than no cuda asset.
- **Manual GPU smoke-test:** download the built `-cuda` AppImage on the developer's
  Fedora + RTX 3060 box (driver 580), generate a briefing, confirm
  `AI compute device: CUDA(0)` in the log and a GPU utilization spike — the same check
  that closed the Phase A spike, now against the shipped artifact.

## Out of scope (Phase B)

- Windows cuda build (no Windows release exists yet).
- macOS (no NVIDIA GPUs; Metal is a separate future track).
- deb/rpm cuda variants (system-package CUDA-lib bundling is messy; AppImage only).
- The CPU/GPU settings selector + persistence (Phase C).
- Multi-arch native cubins / per-GPU optimization (single sm_75 PTX, JIT upward).

## Affected files

| File | Change |
|------|--------|
| `.github/workflows/desktop-v3-release.yml` | add `build-linux-cuda` job; wire its artifact into `sign-and-release` (gated, non-blocking) |
