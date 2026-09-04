---
description: Current roadmap status — shipped work and where the product actually stands
alwaysApply: false
---

# Roadmap Status

## Web App — sprints 1–10, ALL COMPLETE

Sprint version labels below are historical. The web app is **not** versioned or
released independently — it deploys continuously from `main`.

| Sprint | Version | Theme |
|--------|---------|-------|
| 1 | v1.2.0 | Reliability — Sentry, CI, 28 unit tests |
| 2 | v1.3.0 | Auth — Google OAuth, GDPR, rate limiting, Zod |
| 3 | v1.4.0 | Intelligence — smart breaks, insights, weekly email digest |
| 3.5 | v1.4.5 | Admin — dashboard, roles (USER/ADMIN), subscriptions (FREE/PRO/TEAM) |
| 4 | v1.5.0 | Browser extension — Chrome MV3 + Firefox MV2 |
| 5 | v1.6.0 | Real-time — Pusher, Upstash Redis caching |
| 6 | v1.7.0 | Offline — desktop PendingOperations, auto-updater, Sentry .NET |
| 7 | v1.8.0 | Categorization — CategoryRule model, 45 default rules, user overrides |
| 8 | v1.9.0 | Android — Expo SDK 54, React Native, 5-screen MVP |
| 9 | v1.9.5 | Quality — 115 tests, 12 E2E specs, OpenAPI, security headers |
| 10 | v2.0.0 | AI Coach — Gemini 1.5 Flash SSE, Teams (create/join/leaderboard) |

## Desktop — .NET app (`desktop-app/`), sprints 11–13

| Sprint | Version | Theme | Status |
|--------|---------|-------|--------|
| 11 | v2.1.0 | Quality Foundation — interfaces, tests, DPAPI, Serilog | ✓ COMPLETE |
| 12 | v2.2.0 | Resilience & Safety — hosts backup, bounded queue, backoff | ✓ COMPLETE |
| 12.1 | v2.2.1 | Timer Sync Hotfix — server-anchored timers, cross-device polling | ✓ COMPLETE |
| 13 | v2.3.0 | Category Sync & Normalization — CategoryService, NormalizeCategory | ✓ COMPLETE |

**Sprints 14–20 (v2.4 → v3.0) were never executed as planned.** The .NET app was
superseded by a ground-up rewrite instead — see below. It is now legacy and only
receives cross-client changes.

## Desktop v3 (`desktop-app-v3/`) — CURRENT

Tauri 2 + React rewrite. Cross-platform (Windows · macOS · Linux) rather than
Windows-only. Versioned by release-please, currently **v3.11.1-alpha.0** (still
on the alpha channel).

Shipped in v3 so far: auth + login, dashboard, session timer, distraction
blocking (with elevation), project tracking, preferences sync, Pusher real-time,
device registration, offline sync queue (rusqlite), tray + auto-update, and an
**on-device AI substrate** (candle embedder + LLM, model download with SHA-256
verification, corpus/indexer/retriever, briefing + reflection) with an optional
CUDA build.

Details: [`desktop-app-v3`](desktop-app-v3.md).

## Deferred Items

- **Sprint 3.5 Phase B:** Lemon Squeezy webhook, bKash payment gateway, feature gating by subscription tier
- **Desktop code signing:** unsigned builds are still blocked by Windows Smart App
  Control. SignPath Foundation (free for OSS) remains the recommended fix — now
  applies to `desktop-v3-release.yml`, not the dormant `desktop-release.yml`.
- **Desktop v3 has no automated tests** — no frontend Vitest, no Rust test modules.
