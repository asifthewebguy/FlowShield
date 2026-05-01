# FlowShield Desktop v3 — Tauri 2 (Windows · macOS · Linux)

Cross-platform rewrite of the FlowShield desktop client. Replaces the
.NET 8 `desktop-app/` (Windows-only) with Tauri 2 + React + TypeScript on
top of a Rust backend.

> **Status: alpha foundation.** Login round-trips through Rust to the
> production FlowShield API. Token + user are persisted locally via
> `tauri-plugin-store`. Everything else (session timer, activity tracking,
> sync, blocking, tray, autostart, updater, code signing) is intentionally
> out of scope for this PR — see the legacy `desktop-app/` for the
> Windows-only feature set we're working back toward.

## Why Tauri 2 + Rust?

- **~8 MB installers** vs Electron's ~200 MB. Auto-start on every login
  means binary size matters.
- **Native webview** (WebKit / WebView2 / WebKitGTK) — security patches
  come from the OS, not bundled.
- **Activity-tracking crates** (`active-win-pos-rs`) are best-in-class on
  every Tauri target. Phase 2+ work.
- **Frontend reuses FlowShield's TypeScript + React + Tailwind** — same
  design tokens as `web-app/`.

## Prerequisites

```bash
# 1. Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Node 20+ (you probably already have this)

# 3. Tauri 2 system deps — see https://v2.tauri.app/start/prerequisites/
```

Linux (Fedora):
```bash
sudo dnf install -y webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel
```

macOS: `xcode-select --install`. Windows: Microsoft C++ Build Tools + WebView2.

## Develop

```bash
cd desktop-app-v3
npm install
npm run tauri:dev
```

Point at a local FlowShield API:
```bash
FLOWSHIELD_API_URL=http://localhost:3000 npm run tauri:dev
```

## Icons (before first build)

`tauri.conf.json` references `src-tauri/icons/*` which aren't checked in.
Generate placeholders from any 1024×1024 PNG:

```bash
npm run tauri icon path/to/source.png
```

Real icons are needed before any signed release.

## Build

```bash
npm run tauri:build
```

Outputs unsigned bundles in `src-tauri/target/release/bundle/`. Code
signing is deferred until phase 7.

## What's next

The roadmap intentionally lives outside this PR — see the GitHub issue
that tracks v3 phases. Phase 2 = session timer, phase 3 = activity
tracker, phase 4+ = sync, tray, autostart, updater, signing.

## Layout

```
desktop-app-v3/
├── src/                    # React + TS frontend
│   ├── components/         # Button, Input
│   ├── lib/                # auth store
│   ├── routes/             # LoginPage, DashboardPage
│   ├── styles/             # Tailwind entry
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── api/            # FlowShield REST client
│   │   ├── commands/       # auth, ping
│   │   ├── error.rs
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── capabilities/       # Tauri ACL
│   ├── icons/              # not committed; generate before build
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```
