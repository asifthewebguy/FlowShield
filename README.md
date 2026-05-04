<div align="center">

![FlowShield Logo](image-resources/logo.jpg)

# FlowShield

### AI-Powered Productivity & Focus Management Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status](https://img.shields.io/badge/Status-Active-success.svg)]()
[![Next.js](https://img.shields.io/badge/next.js-16-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=flat&logo=Prisma&logoColor=white)](https://www.prisma.io/)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-4285F4?style=flat&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/flowshield/pjjmmmefbcmcckgmdoceapgbdnjbffdg)

[Overview](#overview) •
[Features](#features) •
[Platforms](#platforms) •
[Quick Start](#quick-start) •
[Architecture](#architecture) •
[Testing](#testing) •
[Roadmap](#roadmap)

**Live → [flowshield.app](https://flowshield.app)**

</div>

---

## Overview

**FlowShield** is a full-stack productivity ecosystem that helps knowledge workers, developers, and students build deep focus habits. It combines structured Pomodoro-style sessions with automatic activity tracking, AI-powered coaching, team accountability, and detailed billing analytics — across web, desktop, mobile, and browser extension.

**Current versions:** Web v2.0.0 · Desktop v2.3.0 (Windows, stable) · Desktop v3.3.0-alpha.0 (cross-platform alpha — Linux & macOS)

---

## Features

### Focus Sessions
- Work / Study / Creative session modes with customizable durations
- Session pause/resume with server-anchored timers (no drift across devices)
- Real-time session state synced to browser extension and desktop via Pusher
- Distraction site detection with toolbar badge warnings

### Activity Tracking & Categorization
- Automatic window/app tracking from the desktop client
- Rule-based categorization with 45 default rules and user overrides
- 14 categories: Work, Development, Study, Creative, Social Media, Entertainment, and more
- Category normalization pipeline so desktop and web always agree
- Browser-level tracking via Chrome MV3 / Firefox MV2 extension

### Analytics & Reporting
- Interactive analytics dashboard with weekly/monthly/yearly views
- Productivity scoring (0–100 daily score based on focus ratio and session quality)
- Peak productivity time detection
- Distraction pattern analysis
- **8-week rolling performance report** — delta cards (focus hours, productivity score, sessions) with grouped bar chart and top category breakdown
- **Project cost analysis** — per-project hourly rates, budget tracking, progress bars, earnings chart; inline editing of rates and budgets

### AI Coach
- Powered by Gemini 2.5 Flash Lite (Google)
- Personalized coaching advice streamed via Server-Sent Events
- Context-aware: uses your recent session data, productivity trends, and goals

### Teams & Community
- Create or join teams with invite codes
- Team leaderboard with weekly/monthly/all-time rankings
- Community leaderboard across all users

### Projects & Goals
- Organize sessions by project with color coding
- Set hourly rates and budgets per project for freelance billing
- Daily and weekly focus goals with progress tracking

### Notifications & Digest
- Web push notifications for session reminders and completions
- Weekly email digest with productivity summary (Resend)
- Smart break recommendations based on work patterns

### Administration
- Admin dashboard with user management, subscription tiers (Free/Pro/Team)
- Global app settings, email broadcast, role management

---

## Platforms

### Web App (`web-app/`)
Next.js 16 · React 19 · TypeScript · TailwindCSS · Prisma · PostgreSQL (Neon)

The primary product. Deployed on Netlify at [flowshield.app](https://flowshield.app).

- 37 API routes covering auth, sessions, activity, analytics, reports, projects, goals, teams, coach, admin, and push notifications
- SWR for real-time data fetching · Zustand for global state · Recharts for charts
- JWT auth + Google OAuth · Email verification via Resend
- Real-time events via Pusher (per-user channels)
- Server-side caching via Upstash Redis (5-min TTL)
- Error tracking via Sentry

### Desktop App — v2 Windows (`desktop-app/`)
.NET 8.0 · C# · WinForms/WPF · SQLite (SQLCipher encrypted) · **Current: v2.3.0** · **[Install from Microsoft Store](https://apps.microsoft.com/detail/9MX8Q3FQ136L)**

The polished, signed Windows release. Use this on Windows.

- Background activity tracker monitoring active window/process
- Deep Work Mode: hosts-file-based website and app blocking
- Offline sync queue with exponential backoff (replays on reconnect)
- Category sync: fetches server rules every 24h, caches in SQLite
- Server-anchored session timers — cross-device session detection every 30s
- Auto-updater checks GitHub Releases on startup
- DPAPI-based encrypted key storage · Serilog structured logging · Sentry .NET
- Inno Setup installer → `FlowShield-Setup-vX.Y.Z.exe`

### Desktop App — v3 cross-platform alpha (`desktop-app-v3/`)
Tauri 2 · Rust · React 19 · TypeScript · SQLite · **Current: v3.3.0-alpha.0** · macOS · Linux

The cross-platform rewrite. Native client for Linux and macOS users; Windows users should stay on v2 until v3 reaches parity. Full install walkthroughs: [macOS](desktop-app-v3/INSTALL_MACOS.md) · [Linux](desktop-app-v3/INSTALL_LINUX.md).

- **macOS:** universal `.dmg` (Intel + Apple Silicon) on each [GitHub Release](https://github.com/asifthewebguy/FlowShield/releases/latest). Unsigned/unnotarized for now — first launch needs right-click → Open → "Open Anyway" in System Settings → Privacy & Security. See [`INSTALL_MACOS.md`](desktop-app-v3/INSTALL_MACOS.md) for the Gatekeeper bypass + permissions walkthrough.
- **Linux:** `.AppImage`, `.deb`, and `.rpm` on each [GitHub Release](https://github.com/asifthewebguy/FlowShield/releases/latest), GPG-signed. Verify with `gpg --verify SHA256SUMS.asc`. See [`INSTALL_LINUX.md`](desktop-app-v3/INSTALL_LINUX.md) for per-distro install + Wayland/tray troubleshooting.
- **Arch Linux:** [`flowshield-bin`](https://aur.archlinux.org/packages/flowshield-bin) on AUR — `yay -S flowshield-bin` (auto-published from each tag).
- Native system tray with focus-session progress ring overlay
- Activity tracker via cross-platform foreground-window query
- Deep Work Mode: hosts-file blocking via `pkexec` (Linux) / `osascript` (macOS) elevation prompt
- Real-time cross-device session sync via Pusher (`session-update` events)
- In-app update notifications: GitHub Releases poll every 12h, channel-aware UX (loud banner for direct downloads, quiet tray badge for AUR / future Flatpak)
- Tag-driven release pipeline: GitHub Actions builds + signs + publishes to GitHub Releases + auto-pushes to AUR on every `v3.*` tag

### Browser Extension (`browser-extension/`)
Chrome Manifest V3 · Firefox Manifest V2 · **[Install from Chrome Web Store](https://chromewebstore.google.com/detail/flowshield/pjjmmmefbcmcckgmdoceapgbdnjbffdg)**

- Tracks active tab URL and domain in 1-minute activity windows
- Toolbar badge shows remaining session minutes; turns orange < 20%, red on distraction sites
- Popup with animated ring timer and session controls
- Syncs activity to `/api/activity/sync` alongside the desktop client

### Mobile App (`mobile-app/`)
Expo SDK 54 · React Native 0.81.5 · TypeScript

- 5-tab navigation: Dashboard, Focus Timer, Session History, Analytics, Profile
- SecureStore for JWT persistence · Expo push notifications
- AppState-based phone usage tracking during sessions
- Offline activity queue with automatic retry on reconnect
- Syncs with the same web API endpoints — no mobile-specific backend needed

---

## Quick Start

### Web App

```bash
cd web-app
npm install
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, etc.
npx prisma migrate dev
npm run dev                  # http://localhost:3000
```

See [web-app/SETUP_GUIDE.md](web-app/SETUP_GUIDE.md) for all environment variables.

### Desktop App — v2 (Windows, .NET)

```bash
cd desktop-app
dotnet restore
dotnet run -c Release
```

The app will prompt you to log in with your FlowShield account on first run.

### Desktop App — v3 (Tauri, cross-platform)

End-user install (Linux / macOS) — quick reference. **Full walkthroughs (verification, permissions, troubleshooting, uninstall):**
- macOS: [`desktop-app-v3/INSTALL_MACOS.md`](desktop-app-v3/INSTALL_MACOS.md)
- Linux: [`desktop-app-v3/INSTALL_LINUX.md`](desktop-app-v3/INSTALL_LINUX.md)

```bash
# Linux (Debian/Ubuntu)
sudo apt install ./FlowShield_3.3.0-alpha.0_amd64.deb

# Linux (Fedora/RHEL)
sudo dnf install ./FlowShield-3.3.0-alpha.0-1.x86_64.rpm

# Linux (Arch — auto-publishes from each tag)
yay -S flowshield-bin

# macOS — right-click the .dmg → Open → "Open Anyway" in System Settings (unsigned for now)
open FlowShield_3.3.0-alpha.0_universal.dmg
```

Dev build (any OS):

```bash
cd desktop-app-v3
npm install
npm run tauri:dev          # hot-reload dev mode
npm run tauri:build        # produces installers under src-tauri/target/release/bundle/
```

System deps for Linux dev: `webkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libssl-dev`, `libxss-dev`, `patchelf`. Tag-driven CI handles building + signing + publishing for releases — see [`.github/workflows/desktop-v3-release.yml`](.github/workflows/desktop-v3-release.yml).

### Browser Extension

**Chrome:** `chrome://extensions` → Developer mode → Load unpacked → select `browser-extension/`

**Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → select `browser-extension/manifest.firefox.json`

### Mobile App

```bash
cd mobile-app
npm install
npm start        # Expo Go — scan QR with phone
```

---

## Project Structure

```
FlowShield/
├── web-app/                   # Next.js 16 web dashboard (live at flowshield.app)
│   ├── src/
│   │   ├── app/               # App Router pages & API routes
│   │   │   ├── (app)/         # Authenticated pages (dashboard, analytics, reports, etc.)
│   │   │   ├── api/           # 37 API routes
│   │   │   └── auth/          # Login, signup, verify pages
│   │   ├── components/        # Shared UI components
│   │   └── lib/               # Prisma, JWT, Pusher, Redis, reports helpers
│   ├── prisma/                # Schema + migrations
│   └── e2e/                   # Playwright E2E specs
├── desktop-app/               # .NET 8.0 Windows app
│   ├── Services/              # ActivityTracker, SessionManager, SyncService, etc.
│   └── FlowShield.Desktop.Tests/  # 94 xUnit tests
├── mobile-app/                # Expo React Native app
│   └── src/
│       ├── navigation/        # AppNavigator (5-tab bottom nav)
│       ├── screens/           # Dashboard, FocusTimer, SessionHistory, Analytics, Profile
│       └── lib/               # API client, auth, offline queue, notifications
├── browser-extension/         # Chrome MV3 + Firefox MV2
│   ├── background.js          # Service worker — tab tracking, session polling
│   └── popup/                 # Animated ring timer popup
├── dev-docs/                  # ROADMAP, PRD, architecture notes
├── .github/workflows/         # web-ci.yml, desktop-release.yml, load-test.yml
├── PRD.md
└── RELEASE_NOTES.md
```

---

## Architecture

| Decision | Reason |
|----------|--------|
| SSE + Pusher instead of WebSockets | Netlify doesn't support persistent WebSocket connections |
| Upstash Redis (serverless) | Compatible with Netlify Functions; no self-hosted infra |
| JWT (not session cookies) | Desktop and mobile need bearer tokens |
| Rule-based categorization | PostgreSQL keyword lookup; upgradable to ML later |
| SQLite + SQLCipher on desktop | Encrypted local storage; works fully offline |
| Server-anchored session timers | Prevents drift across desktop, web, and extension |
| React Native (not Flutter) | Shares TypeScript/React patterns with web app |

**Real-time:** Pusher per-user channels (`user-${userId}`) with `session-update` and `activity-synced` events.

**Caching:** Upstash Redis at 5-min TTL — leaderboard cached globally, analytics cached per `userId:period`.

**Category flow:**
```
Desktop ActivityTracker
  → CategoryService (server rules, SQLite cache, 24h refresh)
  → ApiClient.SyncActivitiesAsync() → NormalizeCategory()
  → POST /api/activity/sync
  → Web analytics reads normalized category string
```

---

## Testing

| Suite | Count | Command |
|-------|-------|---------|
| Vitest unit tests (web) | 140 | `cd web-app && npm test` |
| xUnit unit tests (desktop) | 94 | `cd desktop-app && dotnet test` |
| Playwright E2E (web) | 12 specs | `cd web-app && npx playwright test` |
| k6 load test | — | GitHub Actions `workflow_dispatch` or weekly schedule |

Web unit tests cover: productivity scoring, auth, insights, rate limiting, Zod schemas, category rules, and the `getWeeklyStats` reports helper.

Desktop tests cover: categorization, version comparison, activity levels, DB CRUD, blocking, backoff, queue bounds, and hosts-file resilience.

---

## CI/CD

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `web-ci.yml` | Push to `main` or `develop` | lint → typecheck → build |
| `desktop-release.yml` | Push `v*` tag | dotnet test → publish → Inno Setup → GitHub Release |
| `load-test.yml` | Manual + weekly Sunday 02:00 UTC | k6 load test on `/api/activity/sync` |

---

## Roadmap

### Web App — Sprint History (all complete)

| Version | Theme |
|---------|-------|
| v1.2.0 | Reliability — Sentry, CI, unit tests |
| v1.3.0 | Auth — Google OAuth, GDPR, rate limiting, Zod |
| v1.4.0 | Intelligence — smart breaks, insights, weekly email digest |
| v1.4.5 | Admin — dashboard, roles, subscription tiers |
| v1.5.0 | Browser extension — Chrome MV3 + Firefox MV2 |
| v1.6.0 | Real-time — Pusher, Upstash Redis |
| v1.7.0 | Offline — desktop PendingOperations, auto-updater, Sentry .NET |
| v1.8.0 | Categorization — 45 default rules, user overrides |
| v1.9.0 | Android — Expo SDK 54, React Native, 5-screen MVP |
| v1.9.5 | Quality — 140 tests, 12 E2E specs, OpenAPI, security headers |
| v2.0.0 | AI Coach — Gemini 2.5 Flash Lite SSE; Teams + Leaderboard; Reports + Project Cost |

### Desktop App — Upcoming

| Version | Theme |
|---------|-------|
| v2.4.0 | Session Pause/Resume |
| v2.5.0 | Desktop Analytics Dashboard |
| v2.6.0 | Goals, Projects & Preferences Sync |
| v2.7.0 | AI Coach & Leaderboard |
| v2.8.0 | Teams & Real-Time via Pusher |
| v3.0.0 | Polish & Release |

---

## Documentation

- [Web App Setup Guide](web-app/SETUP_GUIDE.md)
- [Web App Deployment](web-app/DEPLOYMENT.md)
- [Desktop Build Summary](web-app/BUILD_SUMMARY.md)
- [Product Requirements (PRD)](PRD.md)
- [Release Notes](RELEASE_NOTES.md)
- [Manual Testing Guide](MANUAL_TESTING.md)

---

## License

This project is licensed under the [MIT License](LICENSE).
