# FlowShield — Claude Code Project Guide

> **Current date context:** 2026-03-13
> **Active version:** Web v2.0.0 (Sprint 10 complete) · Desktop v2.3.0 (Sprint 13 complete)
> **GitHub:** asifthewebguy/FlowShield
> **Live site:** flowshield.app (Netlify auto-deploy from `main`)

---

## Repository Layout

```
FlowShield/
├── web-app/               # Next.js 16 web dashboard (primary product)
├── desktop-app/           # .NET 8.0 Windows app
├── mobile-app/            # Expo SDK 54 React Native app
├── browser-extension/     # Chrome MV3 + Firefox MV2 extension
├── dev-docs/              # ROADMAP.md, PRD, architecture docs
├── .github/workflows/     # web-ci.yml, desktop-release.yml, load-test.yml
└── RELEASE_NOTES.md
```

---

## Web App (`web-app/`)

### Stack
- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** TailwindCSS with `primary-*` color scale (sky-500)
- **ORM:** Prisma + PostgreSQL (Neon serverless)
- **Auth:** Custom JWT (`src/lib/jwt.ts`) + email verification via Resend; Google OAuth at `/api/auth/google`
- **State:** Zustand (global), SWR (server data, 30s poll interval)
- **Charts:** Recharts
- **Real-time:** Pusher — server: `src/lib/pusher.ts`, client: `src/lib/pusher-client.ts`
  - Per-user channels: `user-${userId}`; events: `session-update`, `activity-synced`
- **Caching:** Upstash Redis (`src/lib/redis.ts`) — 5-min TTL; leaderboard cached globally, analytics per `userId:period`
- **AI:** `@anthropic-ai/sdk` — Claude Opus 4.6 streams SSE at `/api/coach/advice`
- **Validation:** Zod schemas in `src/lib/schemas.ts`
- **Logging:** `src/lib/logger.ts` → Sentry (`@sentry/nextjs`)
- **Push notifications:** Web Push API (`web-push`), subscription at `/api/push/subscribe`
- **Email:** Resend — weekly digest cron + announce at `/api/admin/email/*`

### Key Paths
| What | Where |
|------|-------|
| App pages | `web-app/src/app/` |
| API routes | `web-app/src/app/api/` |
| Shared lib | `web-app/src/lib/` |
| Components | `web-app/src/components/` |
| Landing page | `web-app/src/components/landing/` (13 section components) |
| Prisma schema | `web-app/prisma/schema.prisma` |
| Migrations | `web-app/prisma/migrations/` |
| Unit tests | `web-app/src/lib/*.test.ts` (115 Vitest tests) |
| E2E tests | `web-app/e2e/` (12 Playwright specs) |
| OpenAPI spec | `web-app/openapi.yaml` |
| Load test | `web-app/load-tests/sync.js` (k6) |

### Scripts
```bash
cd web-app
npm run dev        # dev server
npm run build      # production build (must pass before pushing)
npm run lint       # ESLint — must be zero errors
npm test           # Vitest unit tests (115 tests)
```

### API Routes (37 total)
| Tag | Routes |
|-----|--------|
| Auth | `/api/auth/login`, `/api/auth/signup`, `/api/auth/verify`, `/api/auth/google`, `/api/auth/google/callback` |
| Sessions | `/api/sessions`, `/api/sessions/[id]`, `/api/sessions/[id]/toggle-pause`, `/api/sessions/active` |
| Activity | `/api/activity/sync`, `/api/activity/analysis`, `/api/activity/recategorize` |
| Analytics | `/api/analytics`, `/api/analytics/insights`, `/api/analytics/distractions`, `/api/analytics/yearly` |
| Categories | `/api/categories` (GET rules + POST user override) |
| Coach | `/api/coach/advice` (SSE stream, Claude Opus 4.6) |
| Teams | `/api/teams`, `/api/teams/[id]`, `/api/teams/join` |
| Leaderboard | `/api/leaderboard` |
| Goals | `/api/goals` |
| Projects | `/api/projects` |
| User | `/api/user/profile`, `/api/user/preferences`, `/api/user/delete`, `/api/export` |
| Notifications | `/api/push/subscribe`, `/api/push/send` |
| Admin | `/api/admin/stats`, `/api/admin/users`, `/api/admin/users/[id]`, `/api/admin/email/*`, `/api/admin/settings` |
| Cron | `/api/cron/weekly-digest` |

### Prisma Models
`User` · `UserPreferences` · `Session` · `ActivityLog` · `Goal` · `DailyStats` · `DeviceConnection` · `PushSubscription` · `Project` · `Subscription` · `CategoryRule` · `AppSetting` · `Team` · `TeamMembership`

Key enums: `SessionType` (WORK/STUDY/CREATIVE), `UserRole` (USER/ADMIN), `SubscriptionTier` (FREE/PRO/TEAM), `TeamRole` (OWNER/ADMIN/MEMBER)

### Category Normalization
Desktop sends raw enum names; `normalizeCategory()` in `src/app/api/activity/sync/route.ts` maps:
- `Productivity` → `Work`
- `Social` → `Social Media`
- All others pass through unchanged

### Environment Variables (Netlify)
```
DATABASE_URL               # Neon PostgreSQL connection string
JWT_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
RESEND_API_KEY
CRON_SECRET
PUSHER_APP_ID
PUSHER_KEY                 # Also in SECRETS_SCAN_OMIT_KEYS (appears in client bundle)
PUSHER_SECRET
PUSHER_CLUSTER
NEXT_PUBLIC_PUSHER_KEY
NEXT_PUBLIC_PUSHER_CLUSTER
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
ANTHROPIC_API_KEY          # Claude Opus 4.6 for AI Coach
SENTRY_DSN
NEXT_PUBLIC_APP_URL
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

**Netlify `SECRETS_SCAN_OMIT_KEYS`:** `NEXTAUTH_URL,PUSHER_KEY`

### Hosting Constraints
- **Netlify** = no persistent WebSockets → use SSE (coach) or Pusher (real-time events)
- **Serverless functions** = stateless, short-lived — no in-memory caches

---

## Desktop App (`desktop-app/`)

### Stack
- **.NET 8.0**, WinForms + WPF (hybrid), C#, `nullable enable`
- **DB:** SQLite encrypted with SQLCipher (`SQLitePCLRaw.bundle_e_sqlcipher`)
- **Key protection:** DPAPI via `KeyProtectionService`
- **Logging:** Serilog → `%LOCALAPPDATA%\FlowShield\logs\` (7-day rolling)
- **Error tracking:** Sentry .NET v4.14.0
- **Installer:** Inno Setup (`FlowShield-Setup.iss`) → `FlowShield-Setup-v{version}.exe`
- **Current version:** 2.3.0

### Key Services
| File | Responsibility |
|------|---------------|
| `Services/ActivityTracker.cs` | Window/process monitoring, delegates to `CategoryService` |
| `Services/CategoryService.cs` | Fetches rules from `/api/categories`, caches in SQLite `CategoryRules`, refreshes every 24h, `NormalizeCategory()` |
| `Services/SessionManager.cs` | Timer anchored to server `startTime`, 30s re-sync poll for cross-device detection |
| `Services/SyncService.cs` | Offline queue replay, exponential backoff (`min(5min × 2^n, 30min)`), network-change reconnect |
| `Services/DatabaseService.cs` | SQLite CRUD, auto-migration, tables: `Sessions`, `ActivityLogs`, `PendingOperations`, `CategoryRules` |
| `Services/ApiClient.cs` | HTTP calls to web API, `GetCategoryRulesAsync()`, `SyncActivitiesAsync()` uses `NormalizeCategory()` |
| `Services/UpdateService.cs` | Checks GitHub Releases API on startup, prompts user to download |
| `Services/BlockingService.cs` | Hosts file manipulation for deep work mode; backup + crash recovery |
| `UI/TrayApplication.cs` | System tray entry point, wires all services together |

### SQLite Tables
`Sessions` · `ActivityLogs` · `PendingOperations` (bounded 500 entries, 7-day TTL) · `CategoryRules`

### `ActivityCategory` Enum
`Unknown=0` · `Work=7` · `Productivity=1` · `Entertainment=2` · `Social=3` · `Communication=4` · `Development=5` · `Browsing=6` · `Creative=8` · `Study=9`

### CI/CD
- **Workflow:** `.github/workflows/desktop-release.yml` — triggers on `v*` tags
- Steps: checkout → dotnet test → dotnet publish (self-contained, win-x64) → Inno Setup → create GitHub Release
- **Releases:** tagged `vX.Y.Z`, asset: `FlowShield-Setup-vX.Y.Z.exe`
- **Code signing:** Not yet implemented — Windows Smart App Control blocks unsigned installer. Plan: integrate SignPath Foundation (free for OSS) or Azure Trusted Signing.

### Unit Tests
- Project: `desktop-app/FlowShield.Desktop.Tests/` (xUnit)
- **94 tests** covering: categorization, version compare, activity levels, DB CRUD, blocking, backoff, queue bounds, hosts-file resilience, `CategoryService` rule matching + normalization

### Release Process
```bash
# Bump version in FlowShield.Desktop.csproj and FlowShield-Setup.iss
# Update RELEASE_NOTES.md
git tag v2.X.0
git push origin v2.X.0   # triggers desktop-release.yml
```

---

## Mobile App (`mobile-app/`)

### Stack
- **Expo SDK 54**, React Native 0.81.5, TypeScript
- **Auth:** `SecureStore` for JWT persistence, `src/lib/auth.tsx` context
- **Navigation:** 5-tab bottom nav (Home/Focus/History/Analytics/Profile/Settings) via `AppNavigator.tsx`
- **Notifications:** Expo Notifications — session reminders, completion alerts
- **Offline:** `src/lib/offlineQueue.ts` — `syncWithFallback()` wraps all activity sync calls
- **Usage tracking:** `AppState`-based phone usage monitoring → synced as `source: "mobile"`

### Key Screens
`LoginScreen` · `DashboardScreen` · `FocusTimerScreen` · `SessionHistoryScreen` · `AnalyticsScreen` · `ProfileScreen` · `SettingsScreen`

### Run
```bash
cd mobile-app && npm start   # Expo Go / QR scan
npm run android              # Android emulator
```

---

## Browser Extension (`browser-extension/`)

- **Chrome:** Manifest V3 (`manifest.json`)
- **Firefox:** Manifest V2 (`manifest.firefox.json`)
- **Background:** `background.js` — 1-min activity sync alarm, 30s session poll, `FORCE_POLL_SESSION` message handler (forces fresh fetch on popup open)
- **Popup:** `popup/popup.js` — calls `FORCE_POLL_SESSION` before `refreshState()` to eliminate stale timer display

### Load in Browser
- **Chrome:** `chrome://extensions` → Developer mode → Load unpacked → `browser-extension/`
- **Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → `manifest.firefox.json`

---

## Testing

| Suite | Count | Command |
|-------|-------|---------|
| Vitest unit tests (web) | 115 | `cd web-app && npm test` |
| xUnit unit tests (desktop) | 94 | `cd desktop-app && dotnet test` |
| Playwright E2E (web) | 12 specs | `cd web-app && npx playwright test` |
| k6 load test | — | GitHub Actions `workflow_dispatch` or weekly |

---

## CI/CD

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `web-ci.yml` | Push to `main` / `develop` | lint → typecheck → build |
| `desktop-release.yml` | Push `v*` tag | test → publish → Inno Setup → GitHub Release |
| `load-test.yml` | Manual / weekly | k6 load test against sync endpoint |

**Important:** `npm run lint` must return **zero errors** before pushing web changes. Local build (`npm run build`) should also pass.

---

## Roadmap Status

### Web App (v1.x → v2.0) — ALL COMPLETE
Sprints 1–10 shipped: Reliability → Auth → Insights → Admin → Extension → Real-Time → Offline → Categorization → Android → AI Coach & Teams

### Desktop App (v2.1 → v3.0)
| Sprint | Version | Theme | Status |
|--------|---------|-------|--------|
| 11 | v2.1.0 | Quality Foundation | ✓ COMPLETE |
| 12 | v2.2.0 | Resilience & Safety | ✓ COMPLETE |
| 12.1 | v2.2.1 | Timer Sync Hotfix | ✓ COMPLETE |
| 13 | v2.3.0 | Category Sync & Normalization | ✓ COMPLETE |
| 14 | v2.4.0 | Session Pause/Resume | — |
| 15 | v2.5.0 | Desktop Analytics Dashboard | — |
| 16 | v2.6.0 | Goals, Projects & Preferences Sync | — |
| 17 | v2.7.0 | AI Coach & Leaderboard | — |
| 18 | v2.8.0 | Teams & Real-Time via Pusher | — |
| 19 | v2.9.0 | Desktop-Unique Features | — |
| 20 | v3.0.0 | Polish & Release | — |

### Deferred
- Sprint 3.5 Phase B: Lemon Squeezy webhook, bKash payment gateway, feature gating
- Desktop code signing: Windows Smart App Control blocking unsigned installer — SignPath Foundation (free OSS) is the recommended fix

---

## Architectural Decisions

| Decision | Reason |
|----------|--------|
| SSE + Pusher instead of WebSockets | Netlify doesn't support persistent WebSocket connections |
| Upstash Redis (serverless) | Works with Netlify Functions; no self-hosted infra |
| React Native (not Flutter) | Shares TypeScript/React patterns with web |
| Same `/api/activity/sync` for all clients | Single sync pipeline; `source` field differentiates origin |
| Rule-based categorization (not ML) | PostgreSQL keyword lookup now; can graduate to ML later |
| JWT (not NextAuth sessions) | Desktop and mobile need bearer tokens; NextAuth sessions are cookie-based |

---

## Common Gotchas

- **`<a href="/">` in Next.js pages** → ESLint error; always use `<Link href="/">` from `next/link` for internal page navigation
- **Timer drift** — all surfaces anchor to server `startTime`, never do `prev - 1` countdown
- **Category names** — desktop enum values (`Productivity`, `Social`) differ from web strings (`Work`, `Social Media`); always run through `NormalizeCategory()` before syncing
- **Pusher key in client bundle** — `NEXT_PUBLIC_PUSHER_KEY` is intentionally public; suppress Netlify secrets scan warning via `SECRETS_SCAN_OMIT_KEYS`
- **`_reSyncTimer` in `SessionManager`** — must be started in `InitializeAsync()` (not just `StartSessionAsync`) to detect sessions started on other devices
