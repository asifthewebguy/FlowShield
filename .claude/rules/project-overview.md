---
description: FlowShield project overview — versions, repo layout, live URLs, GitHub
alwaysApply: true
---

# FlowShield Project Overview

- **Web app:** no independent version. `web-app/package.json` sits at `1.0.0` and is
  not bumped — the web app deploys continuously from `main` via Netlify.
- **Desktop:** **v3.13.0-alpha.0** — `desktop-app-v3/` (Tauri 2 + React). This is the
  client that ships. Versioned by release-please; `.release-please-manifest.json` is
  the source of truth.
- **Legacy desktop:** `desktop-app/` (.NET 8 WinForms, `<Version>3.0.8</Version>`) is
  superseded by v3 and no longer released. See [`desktop-app`](desktop-app.md).
- **GitHub:** asifthewebguy/FlowShield
- **Live site:** flowshield.app (Netlify auto-deploy from `main`)

## Repository Layout

```
FlowShield/
├── web-app/               # Next.js 16 web dashboard (primary product)
├── desktop-app-v3/        # Tauri 2 + React desktop client — SHIPPING
├── desktop-app/           # .NET 8.0 Windows app — LEGACY
├── mobile-app/            # Expo SDK 54 React Native app
├── browser-extension/     # Chrome MV3 + Firefox MV2 extension
├── dev-docs/              # ROADMAP.md, PRD, architecture docs
├── docs/                  # implementation plans
├── scripts/
├── RELEASE_NOTES.md
├── release-please-config.json + .release-please-manifest.json
└── .github/workflows/     # 7 workflows — see cicd.md
```

**Careful:** `dev-docs/ROADMAP.md` still ends at Sprint 13 / desktop v2.3.0 and predates
the v3 rewrite. Treat [`roadmap`](roadmap.md) as authoritative over it.
