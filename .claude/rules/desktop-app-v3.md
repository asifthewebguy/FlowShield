---
description: Desktop v3 — the shipping cross-platform client. Tauri 2 + React + Rust, local AI, release-please versioning
globs: desktop-app-v3/**
alwaysApply: false
---

# Desktop App v3 (`desktop-app-v3/`)

**This is the desktop client that actually ships.** The .NET app in `desktop-app/`
is legacy — see [`desktop-app`](desktop-app.md).

- **Current version:** 3.13.0-alpha.0 (`.release-please-manifest.json` is the source of truth)
- **Platforms:** Windows · macOS (universal) · Linux (AppImage, plus a CUDA AppImage)

## Stack

- **Shell:** Tauri 2 (Rust) — `src-tauri/`
- **Frontend:** React 19 + TypeScript + Vite + TailwindCSS — `src/`
- **Routing:** `react-router-dom` · **State:** `zustand`
- **Real-time:** `pusher-js` (same `user-${userId}` channels as web)
- **Local store:** `tauri-plugin-store` (frontend) + `rusqlite` (bundled SQLite, offline sync queue)
- **HTTP:** `reqwest` with `rustls-tls` (no OpenSSL/native-tls)
- **Async:** `tokio`

## Frontend Layout (`src/`)

| Path | Contents |
|------|----------|
| `routes/` | `DashboardPage` · `LoginPage` · `SettingsAiPage` · `SettingsTrackingPage` |
| `components/` | `BriefingCard` · `Button` · `Input` · `ReflectionCard` · `Timer` · `UpdateBanner` |
| `lib/` | `ai` · `auth` · `blocking` · `preferences` · `projects` · `realtime` · `sessions` · `tasks` · `update` |

## Rust Modules (`src-tauri/src/`)

| Module | Responsibility |
|--------|---------------|
| `api/` | Web API client — `activity` · `auth` · `devices` · `preferences` · `projects` · `realtime` · `sessions` · `tasks` |
| `commands/` | Tauri command surface exposed to the frontend — `ai` · `auth` · `blocking` · `elevation` · `ping` · `preferences` · `projects` · `realtime` · `sessions` · `tasks` · `tracking` · `tray` · `update` |
| `ai/` | Local AI substrate (see below) |
| `store/` | `pending_sync.rs` (offline queue) · `pending_task_ops.rs` (offline write queue for task mutations, same backoff as pending_sync) · `ai.rs` · `activity_local.rs` (persisted tracker buckets, 90-day retention) |
| `tracker/` | Always-on foreground-window + idle tracking (`active-win-pos-rs`, `user-idle`); pure `step()` bucketing; persists to `activity_local`; `flush()` at session end |
| `activity_upload.rs` | Redacts (`shareWindowDetails`) and uploads closed `activity_local` rows; called by `sync_worker` every 60 s and by `session_end` |
| `blocking/` | Distraction blocking |
| `sync_worker.rs` · `tray.rs` · `tray_indicator.rs` · `update.rs` · `device.rs` | Background sync, tray UI, updater, device registration |

**Platform note:** `user-idle` has no pure-Wayland backend — it falls back to
XWayland, which works on most GNOME/KDE setups but not all.

## Local AI (`src-tauri/src/ai/`)

Runs on-device with **candle** (HuggingFace's pure-Rust ML framework), CPU backend
by default. Pinned: `candle-* 0.8`, `tokenizers 0.20`, `ndarray 0.16`, `safetensors`.

Files: `briefing` · `candle_embedder` · `candle_llm` · `corpus` · `device` ·
`embedder` · `empty_state` · `indexer` · `model_download` · `prompts` ·
`reflection` · `registry` · `retriever` · `runtime` · `scheduler`

- **GPU:** optional `cuda` cargo feature → `candle-core/cuda`, `candle-nn/cuda`,
  `candle-transformers/cuda`. CI ships a separate CUDA AppImage.
- **Model integrity:** `sha2` verification in `model_download.rs`.

## Versioning & Release

Handled by **release-please** — do not hand-edit versions.

- Config: `release-please-config.json` (release-type `simple`, package `desktop-app-v3`)
- Manifest: `.release-please-manifest.json`
- release-please syncs the version into `package.json`, `src-tauri/tauri.conf.json`,
  and `src-tauri/Cargo.toml`
- Merging the release PR tags `v3.*` → triggers `desktop-v3-release.yml`

`desktop-v3-release.yml` jobs: `build-linux` · `build-macos` (universal) ·
`build-linux-cuda`.

## Commands

```bash
cd desktop-app-v3
npm run tauri:dev     # dev shell
npm run typecheck     # tsc --noEmit — must be clean
npm run tauri:build   # production bundle
```

## Tests

Rust unit tests live in `#[cfg(test)]` modules across `src-tauri/src/` (tracker, store, activity_upload, blocking, ai/*, update, device, tray_indicator).

    cd desktop-app-v3/src-tauri && cargo test --lib

No frontend tests. Verification = `cargo test --lib` + `npm run typecheck` + manual smoke test.
