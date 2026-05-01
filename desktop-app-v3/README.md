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
sudo dnf install -y webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel libXScrnSaver-devel
```

(`libXScrnSaver-devel` is required by the `user-idle` crate for AFK detection.)

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

### Linux + Wayland: WebKitGTK protocol error

If `tauri:dev` exits immediately on Linux with
`Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display`,
WebKitGTK 2.44+ has a known DMA-BUF renderer incompatibility with some
Wayland compositors (Fedora 43 + GNOME hits this). Workaround:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri:dev
```

Or fall back to XWayland: `GDK_BACKEND=x11 npm run tauri:dev`.

### Linux + GNOME Wayland: tray icon doesn't appear

GNOME Shell on Wayland dropped native system-tray support — the tray
code in the Rust backend runs without errors, but no icon shows up
in the panel. Without an icon there's no way to bring the window back
after close-to-tray. Install the AppIndicator extension:

```bash
sudo dnf install gnome-shell-extension-appindicator
gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com
# Log out + back in (or run `r` in Alt+F2 on X11) to load the extension.
```

This is a runtime UX requirement on GNOME Wayland, not a build
dependency. KDE / XFCE / GNOME-on-X11 ship native tray support and
need no extension.

## Icons (before first build)

`tauri.conf.json` references `src-tauri/icons/*` which aren't checked in.
Generate placeholders from any 1024×1024 PNG:

```bash
npm run tauri icon path/to/source.png
```

Real icons are needed before any signed release.

## Hosts-file blocking (Phase 6 + 6.5)

Deep-work mode maps blocked domains to `127.0.0.1` in the OS hosts
file. The GUI itself runs unprivileged; when it needs to edit hosts,
it re-invokes its own binary as a privileged subprocess via the OS's
standard prompt:

| Platform | Elevation mechanism | UX |
|---|---|---|
| Linux | `pkexec /proc/self/exe --blocking-apply ...` | polkit graphical password prompt |
| macOS | `osascript ... 'do shell script ... with administrator privileges'` | Keychain / Touch ID prompt |
| Windows | not yet wired up — returns a clear error | run the app as administrator manually for now |

You **don't need** to launch the app with `sudo`. The polkit/Keychain
prompt fires only when you actually toggle deep-work mode. Cancelling
the prompt surfaces a friendly `AppError::Storage` to the frontend.

A one-time backup of the user's pristine hosts file is saved to
`<hosts>.flowshield-backup` before the very first edit and never
overwritten — manual rollback is always one command away:

```bash
sudo cp /etc/hosts.flowshield-backup /etc/hosts
```

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
