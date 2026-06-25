# GPU Acceleration — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 3 is a manual, release-pipeline spike — run it directly (not via a subagent).**

**Goal:** Make `desktop-v3-release.yml` build and publish a self-contained, CUDA-accelerated Linux **AppImage** alongside the existing CPU bundles, without ever blocking the CPU release.

**Architecture:** A new non-blocking `build-linux-cuda` job mirrors `build-linux` but installs the CUDA 12.6 toolkit and builds with `--features cuda --bundles appimage`. linuxdeploy bundles the CUDA runtime `.so`s into the AppImage (only the NVIDIA driver stays external). The job renames its output with a `-cuda` suffix, asserts the runtime libs are bundled, and uploads a separate artifact that `sign-and-release` signs and publishes.

**Tech Stack:** GitHub Actions, Tauri 2 CLI, candle 0.8.4 `cuda` feature (from Phase A), `Jimver/cuda-toolkit` action, linuxdeploy/AppImage.

## Global Constraints

- Only file touched: `.github/workflows/desktop-v3-release.yml`. No application code changes (Phase A already shipped the `cuda` feature + `select_device()`).
- The cuda job is **non-blocking**: `continue-on-error: true`. A cuda failure must never fail the release — CPU deb/rpm/AppImage + macOS dmg always ship.
- cuda variant is **AppImage only**. Do not produce deb/rpm for it.
- Build target floor: `CUDA_COMPUTE_CAP=75` (Turing). CUDA toolkit `12.6` (matches the validated candle 0.8.4 / cudarc 0.13.9 pairing).
- Asset name: `FlowShield_${VERSION}_amd64-cuda.AppImage` — distinct from the CPU `FlowShield_${VERSION}_amd64.AppImage`.
- `publish-to-aur` must stay CPU-only: it downloads only the `linux-bundles` artifact, never the cuda artifact. Do not add the cuda artifact to its downloads.
- Runner `ubuntu-22.04` (default gcc 11 satisfies nvcc 12.6 — no conda/`NVCC_CCBIN` workaround; that was Fedora-43-only).

## Reference — current workflow shape

`.github/workflows/desktop-v3-release.yml` jobs (line anchors):
- `build-linux` (lines 25–89): ubuntu-22.04 → apt deps → node 20 → rust stable → `Swatinem/rust-cache@v2` (workspace `desktop-app-v3/src-tauri`) → `npm ci || npm install` → `npm run tauri:build` → stage deb/rpm/AppImage → `upload-artifact` name `linux-bundles`.
- `build-macos` (lines 91–143).
- `sign-and-release` (lines 145–230): `needs: [build-linux, build-macos]` → download `linux-bundles` + `macos-bundles` into `release-artifacts` → `sha256sum * > SHA256SUMS` → GPG import/sign (`for f in *.deb *.rpm *.AppImage *.dmg`) → `softprops/action-gh-release@v2` publishes `release-artifacts/*`.
- `publish-to-aur` (lines 232–304): `needs: sign-and-release` → downloads only `linux-bundles` → renders PKGBUILD from the CPU `FlowShield_*_amd64.AppImage`.

`desktop-app-v3/package.json`: `"tauri:build": "tauri build"`. So `npm run tauri:build -- <args>` forwards `<args>` to `tauri build`.

The CPU AppImage path after `npm run tauri:build`:
`desktop-app-v3/src-tauri/target/release/bundle/appimage/FlowShield_<version>_amd64.AppImage`.

### Validation tooling (used by every task)

No `actionlint`/`yamllint` installed. Validate edited YAML two ways:

1. Parse check (always available):
   `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/desktop-v3-release.yml')); print('yaml ok')"`
2. Expression/context lint via a one-shot `actionlint` binary (downloads ~2 MB to the repo-ignored scratch dir, no system install):
   ```bash
   bash <(curl -s https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash) >/dev/null
   ./actionlint .github/workflows/desktop-v3-release.yml && rm -f actionlint
   ```
   Expected: no output = clean. If `curl` is unavailable, the parse check in (1) is the floor.

---

### Task 1: Add the non-blocking `build-linux-cuda` job

**Files:**
- Modify: `.github/workflows/desktop-v3-release.yml` (insert a new job immediately before `sign-and-release`, i.e. before line 145 `  sign-and-release:`)

**Interfaces:**
- Produces: an uploaded artifact named `linux-cuda-bundle` containing one file, `FlowShield_<version>_amd64-cuda.AppImage`. Task 2 consumes this artifact name.

- [ ] **Step 1: Insert the `build-linux-cuda` job**

In `.github/workflows/desktop-v3-release.yml`, insert the following job between the end of `build-macos` (line 143) and the start of `sign-and-release` (line 145). Keep two-space indentation consistent with the other jobs.

```yaml
  build-linux-cuda:
    name: Build CUDA Linux AppImage
    # Non-blocking: a failure here (fragile GPU toolchain) must never block the
    # CPU release. The release ships without the cuda asset instead.
    runs-on: ubuntu-22.04
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ env.TAG }}

      - name: Install system deps
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev \
            libssl-dev \
            libxss-dev \
            patchelf \
            file

      - name: Install CUDA toolkit 12.6
        # Network method installs only the sub-packages we need (nvcc to compile
        # candle-kernels; cudart/cublas/curand + their -dev headers/symlinks that
        # candle-core's cuda backend links). Exports CUDA_PATH and adds nvcc to PATH.
        uses: Jimver/cuda-toolkit@v0.2.19
        id: cuda-toolkit
        with:
          cuda: '12.6.2'
          method: 'network'
          sub-packages: '["nvcc", "cudart", "cudart-dev", "cublas", "cublas-dev", "curand", "curand-dev"]'

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo build
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: desktop-app-v3/src-tauri
          # Distinct key so the cuda build's artifacts don't trample the CPU cache.
          key: linux-cuda

      - name: Install JS deps
        working-directory: desktop-app-v3
        run: npm ci || npm install

      - name: Build CUDA AppImage
        working-directory: desktop-app-v3
        env:
          CUDA_COMPUTE_CAP: '75'
        # linuxdeploy bundles the binary's NEEDED libs; point the loader at the
        # toolkit lib dir so libcudart/libcublas/libcurand get pulled into the
        # AppImage. The Jimver action exports CUDA_PATH as an env var (not a step
        # output), so reference $CUDA_PATH at the shell level.
        run: |
          export LD_LIBRARY_PATH="$CUDA_PATH/lib64:${LD_LIBRARY_PATH:-}"
          npm run tauri:build -- --features cuda --bundles appimage

      - name: Stage + rename cuda AppImage
        run: |
          set -euo pipefail
          SRC=$(ls desktop-app-v3/src-tauri/target/release/bundle/appimage/FlowShield_*_amd64.AppImage)
          mkdir -p release-artifacts
          BASE=$(basename "${SRC%_amd64.AppImage}")
          DEST="release-artifacts/${BASE}_amd64-cuda.AppImage"
          mv "$SRC" "$DEST"
          echo "--- staged ---"
          ls -la release-artifacts/

      - name: Assert CUDA runtime libs are bundled
        # The one novel risk: a "cuda" AppImage that silently bundled no CUDA
        # runtime would fall back to CPU on the user's machine. Extract the
        # AppImage (no FUSE needed) and fail THIS job (not the release) if
        # libcudart isn't inside it.
        run: |
          set -euo pipefail
          APPIMAGE=$(ls release-artifacts/FlowShield_*_amd64-cuda.AppImage)
          chmod +x "$APPIMAGE"
          "$APPIMAGE" --appimage-extract >/dev/null
          if ls squashfs-root/usr/lib/libcudart.so* >/dev/null 2>&1; then
            echo "::notice::libcudart bundled: $(ls squashfs-root/usr/lib/libcudart.so*)"
          else
            echo "::error::libcudart.so not bundled in the cuda AppImage — aborting cuda job."
            exit 1
          fi
          rm -rf squashfs-root

      - name: Upload cuda artifact
        uses: actions/upload-artifact@v4
        with:
          name: linux-cuda-bundle
          path: release-artifacts/FlowShield_*_amd64-cuda.AppImage
          if-no-files-found: error
          retention-days: 7
```

- [ ] **Step 2: Validate the workflow YAML**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/desktop-v3-release.yml')); print('yaml ok')"
bash <(curl -s https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash) >/dev/null && ./actionlint .github/workflows/desktop-v3-release.yml && rm -f actionlint
```
Expected: `yaml ok`, then no actionlint output (clean).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/desktop-v3-release.yml
git commit -m "feat(desktop-v3): build non-blocking CUDA Linux AppImage in release CI"
```

---

### Task 2: Wire the cuda artifact into `sign-and-release`

**Files:**
- Modify: `.github/workflows/desktop-v3-release.yml` — `sign-and-release` job: `needs` line (147) + add a gated download step after the existing `Download macOS bundles` step (after line 160).

**Interfaces:**
- Consumes: the `linux-cuda-bundle` artifact from Task 1.
- Produces: nothing new for later tasks — the existing sign loop (`for f in *.AppImage`), `SHA256SUMS`, and `softprops/action-gh-release` (`release-artifacts/*`) already pick up any `.AppImage` in `release-artifacts`.

- [ ] **Step 1: Add `build-linux-cuda` to `needs`**

In `.github/workflows/desktop-v3-release.yml`, change the `sign-and-release` `needs` line (147) from:
```yaml
    needs: [build-linux, build-macos]
```
to:
```yaml
    needs: [build-linux, build-macos, build-linux-cuda]
```
Because `build-linux-cuda` has `continue-on-error: true`, a cuda failure still reports success to `needs` — so adding it here makes `sign-and-release` wait for the artifact to be ready **without** letting a cuda failure block the release.

- [ ] **Step 2: Add a gated download of the cuda artifact**

Immediately after the existing `Download macOS bundles` step (ends line 160), insert:
```yaml
      - name: Download cuda bundle (best-effort)
        uses: actions/download-artifact@v4
        # The cuda job is non-blocking; if it failed/skipped, its artifact won't
        # exist. warn (not error) so the release still ships the CPU bundles.
        continue-on-error: true
        with:
          name: linux-cuda-bundle
          path: release-artifacts
```
No other change is needed in `sign-and-release`: the later `sha256sum *`, the GPG `for f in *.deb *.rpm *.AppImage *.dmg` loop, and `action-gh-release`'s `release-artifacts/*` already include whatever AppImage landed in `release-artifacts`.

- [ ] **Step 3: Confirm AUR stays CPU-only (no change, verify)**

Read the `publish-to-aur` job (lines 232–304). Confirm it still downloads only `name: linux-bundles` and globs `FlowShield_*_amd64.AppImage`. Note the CPU file is `FlowShield_<v>_amd64.AppImage` and the cuda file is `FlowShield_<v>_amd64-cuda.AppImage`; the AUR job never downloads the `linux-cuda-bundle` artifact, so the cuda asset cannot reach AUR. Make no edits — this step is a verification only.

- [ ] **Step 4: Validate the workflow YAML**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/desktop-v3-release.yml')); print('yaml ok')"
bash <(curl -s https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash) >/dev/null && ./actionlint .github/workflows/desktop-v3-release.yml && rm -f actionlint
```
Expected: `yaml ok`, then clean actionlint.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/desktop-v3-release.yml
git commit -m "feat(desktop-v3): publish cuda AppImage via sign-and-release (gated, non-blocking)"
```

---

### Task 3: Release-pipeline validation (MANUAL — gating)

**This is not a subagent task.** It exercises the real release workflow and the GPU on the developer's machine. It validates Tasks 1–2 end-to-end and gates any follow-up (Phase C).

- [ ] **Step 1: Trigger a test run of the workflow**

The cuda job's toolkit sub-package names and link deps can only be confirmed against a real run (GHA runners build differently than the local Fedora box). After Tasks 1–2 are merged to `main`, trigger the workflow against the latest existing `v3.*` tag:
```bash
gh workflow run "Desktop v3 Release" -f tag=<latest v3.* tag, e.g. v3.9.1-alpha.0>
gh run watch
```
Watch the `build-linux-cuda` job. Expected: CUDA toolkit installs, `candle-kernels` + candle compile with `--features cuda`, AppImage builds, the "Assert CUDA runtime libs are bundled" step prints `libcudart bundled`, and the artifact uploads.

**If the build fails on a missing CUDA lib at link time** (e.g. `cannot find -lcublasLt`): add the missing `-dev` sub-package (e.g. `cublasLt`) to the `sub-packages` list in Task 1's job, or switch that step to `method: 'local'` (full toolkit) if several are missing. Re-run. This is the expected iteration point — record what was needed.

- [ ] **Step 2: Confirm the asset published**

After the run, confirm the Release for that tag now lists `FlowShield_<v>_amd64-cuda.AppImage` (plus its `.asc` if GPG is provisioned) alongside the CPU bundles, and that `SHA256SUMS` includes it. Confirm the CPU `.deb`/`.rpm`/`.AppImage` + macOS `.dmg` are still present (non-blocking did not drop them).

- [ ] **Step 3: GPU smoke-test on the RTX 3060 (Fedora)**

Download the published `-cuda` AppImage on the developer's Fedora box (driver 580):
```bash
chmod +x FlowShield_*_amd64-cuda.AppImage
# Clear today's cached briefing first so Generate triggers a fresh run:
#   sqlite3 ~/.local/share/app.flowshield.desktop/local.sqlite "DELETE FROM ai_briefings WHERE date='<today YYYY-MM-DD>';"
./FlowShield_*_amd64-cuda.AppImage
```
Launch, ensure Local AI is `ready`, click **Generate today's briefing**, and confirm:
- the log shows `AI compute device: CUDA(0)` (not `CPU`),
- `nvtop` shows a GPU0 utilization spike + VRAM rise,
- the briefing completes as full text.

This re-runs the Phase A spike check against the **shipped artifact** — proving the bundled CUDA runtime works on a clean machine with only the driver present.

- [ ] **Step 4: Record the result**

Note: did the cuda job build cleanly in CI? Which sub-packages were actually required? Did the bundled AppImage run on the GPU on Fedora? This result gates Phase C (the CPU/GPU selector) — a selector is only worth building once a GPU build verifiably ships and runs.

---

## Self-Review Notes

- **Spec coverage:** self-contained AppImage ✓ (Task 1 build + bundle-assert); AppImage-only ✓ (`--bundles appimage`); sm_75 floor ✓ (`CUDA_COMPUTE_CAP=75`); CUDA 12.6 ✓ (Jimver `12.6.2`); non-blocking ✓ (`continue-on-error` + `needs` semantics + warn download); Jimver/ubuntu-22.04 ✓; `-cuda` naming + no SHA/AUR collision ✓ (Task 1 rename, Task 2 Step 3 verify); sign/release integration ✓ (Task 2); in-CI structural check + manual GPU smoke ✓ (Task 1 assert step + Task 3).
- **Placeholder scan:** none — every YAML block is complete and ready to paste; the one empirical unknown (exact toolkit sub-packages) is handled by an explicit iterate-on-CI-log loop in Task 3 Step 1, not a placeholder.
- **Type consistency:** artifact name `linux-cuda-bundle` and file pattern `FlowShield_*_amd64-cuda.AppImage` are used identically in Task 1 (produce) and Task 2 (consume); `id: cuda-toolkit` matches the `steps.cuda-toolkit.outputs.CUDA_PATH` reference.
- **Deferred:** Windows/macOS cuda, deb/rpm cuda, the CPU/GPU selector (Phase C), multi-arch cubins.
