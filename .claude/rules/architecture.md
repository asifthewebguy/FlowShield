---
description: FlowShield architectural decisions and constraints — why things are built the way they are
alwaysApply: true
---

# Architectural Decisions

| Decision | Reason |
|----------|--------|
| SSE + Pusher instead of WebSockets | Netlify doesn't support persistent WebSocket connections |
| Upstash Redis (serverless) | Works with Netlify Functions; no self-hosted infra |
| React Native (not Flutter) | Shares TypeScript/React patterns with web app |
| Same `/api/activity/sync` for all clients | Single sync pipeline; `source` field differentiates origin (desktop/browser/mobile) |
| Rule-based categorization (not ML) | PostgreSQL keyword lookup now; can graduate to ML later |
| JWT (not NextAuth sessions) | Desktop and mobile need bearer tokens; NextAuth sessions are cookie-based |
| SQLite + SQLCipher on desktop | Encrypted local storage; works offline; no server dependency for local data |
| DPAPI key protection | OS-level key protection without user-managed secrets |

## Real-Time Architecture

- **Pusher** per-user channels: `user-${userId}`
- Events: `session-update` (session start/stop/pause), `activity-synced` (desktop sync)
- Server lib: `web-app/src/lib/pusher.ts` — `triggerUserEvent()` helper
- Client lib: `web-app/src/lib/pusher-client.ts` — singleton

## Caching Architecture

- **Upstash Redis** 5-min TTL
- Leaderboard: cached globally by period key
- Analytics: cached per `userId:period`
- `isCurrentUser` flag applied at read time (not stored in cache)

## Category Flow

```
Desktop ActivityTracker
  → CategoryService.CategorizeActivity()     [uses server rules, falls back to hardcoded]
  → ApiClient.SyncActivitiesAsync()
    → CategoryService.NormalizeCategory()    [Productivity→Work, Social→Social Media]
  → POST /api/activity/sync                  [web stores normalized string]
  → Web analytics reads category string directly
```
