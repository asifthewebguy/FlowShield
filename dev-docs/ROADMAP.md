# FlowShield - Development Roadmap (v1.6.0 → v2.0)

> Last updated: 2026-03-09

## Context

FlowShield is at v1.1.6 with a working web dashboard (Next.js/Prisma/PostgreSQL on Netlify) and Windows desktop app (.NET 8.0). The PRD defines a much broader vision including browser extensions, mobile app, AI coaching, and team features. This roadmap prioritizes remaining work into 2-week sprints ordered by impact-to-effort ratio.

---

## Sprint Overview

| Sprint | Version | Theme | Effort |
|--------|---------|-------|--------|
| 1 | v1.2.0 | Reliability: error tracking, CI, first unit tests | Low |
| 2 | v1.3.0 | Trust: Google OAuth, GDPR, input validation | Medium |
| 3 | v1.4.0 | Intelligence: smart breaks, insights, weekly email | Medium |
| 3.5 | v1.4.5 | Monetization: admin dashboard, roles, subscriptions | Medium |
| 4 | v1.5.0 | Reach: Chrome browser extension | High |
| 5 | v1.6.0 | Polish: real-time updates, Redis caching | Medium |
| 6 | v1.7.0 | Resilience: offline sync, auto-updater, Firefox ext | Medium |
| 7 | v1.8.0 | Smarts: improved categorization, distraction analysis | Medium |
| 8 | v1.9.0 | Mobile: Android app MVP | Very High |
| 9 | v1.9.5 | Quality: mobile polish, test coverage, security audit | Medium |
| 10 | v2.0.0 | AI & Teams: AI coach, team features, predictive scheduling | High |

---

## Sprint 1 — v1.2.0: Reliability Foundation ✓ COMPLETE

**Goal:** Gain visibility into production issues and establish CI for the web app.

- [x] Add Sentry error tracking to web app (`@sentry/nextjs`) — `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts`, `src/app/global-error.tsx`
- [x] Adopt `src/lib/logger.ts` consistently across all API routes — logger now forwards errors to Sentry; 6 routes updated
- [x] Add GitHub Actions CI for web app: lint, type-check, build on push to `main`/`develop` — `.github/workflows/web-ci.yml`
- [x] Set up Vitest for web app unit tests — `vitest.config.ts`, `npm test` script added
- [x] Write 28 unit tests for `src/lib/productivity.ts` (21) and `src/lib/auth.ts` (7) — all passing

**Note:** Desktop Sentry (`Sentry.NETCore`) deferred to Sprint 6 alongside other desktop improvements.

---

## Sprint 2 — v1.3.0: Auth & Compliance ✓ COMPLETE

**Goal:** Remove signup friction and address legal requirements.

- [x] Google OAuth — custom flow: `/api/auth/google` + `/api/auth/google/callback`, issues existing JWT, account linking for existing email users; "Sign in with Google" button on login page
- [x] `DELETE /api/user/delete` — full cascade (all Prisma relations have `onDelete: Cascade`)
- [x] `/api/export` rewritten — now exports all user data: account, preferences, sessions, activity logs, goals, daily stats, projects, devices (JSON + CSV for sessions)
- [x] `/privacy` page — full policy covering data collection, GDPR rights, third-party services
- [x] `CookieConsent` banner — localStorage-persisted, links to privacy page, injected via root layout
- [x] Rate limiting — `src/lib/rate-limit.ts` sliding window: 10/15min on login, 5/hr on signup
- [x] Zod validation — `src/lib/schemas.ts`; applied to login, signup, goals, projects, push/send, preferences

**New env vars needed:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (redirect URI: `${APP_URL}/api/auth/google/callback`)

---

## Sprint 3 — v1.4.0: Smart Sessions & Insights ✓ COMPLETE

**Goal:** Differentiate from plain timers with intelligence.

- [x] Intelligent break system in `FocusTimer.tsx` — `'none' | 'suggested' | 'active'` state machine; break suggested after WORK sessions ≥ 15 min; duration scales with session length (5/10/15 min); override (Skip Break) available
- [x] `src/lib/insights.ts` — pure functions: `getBestDay`, `getPeakHour`, `getWeeklyTrend`, `getCompletionRate`, `getStreakInsight`, `getConsistencyInsight`, `generateInsights`
- [x] `/api/analytics/insights` — queries last 30 days, computes streak from DailyStats, returns array of insight objects + streak count
- [x] Insights panel on `/analytics` page — fetched via SWR, renders up to 6 insight cards with color-coded icons
- [x] `/api/cron/weekly-digest` — secured with `CRON_SECRET`; queries active users, sends personalized HTML email with focus stats, trend, and top 3 insights via Resend
- [x] 22 unit tests for insights logic (all 6 functions + `generateInsights`) — 51 total tests passing

---

## Sprint 3.5 — v1.4.5: Admin Dashboard & Subscriptions ✓ COMPLETE

**Goal:** Enable monetization with subscription tiers and give admins visibility into the platform.

- [x] Added `UserRole` (USER/ADMIN), `SubscriptionTier` (FREE/PRO/TEAM), `SubscriptionStatus` (ACTIVE/CANCELLED/EXPIRED/TRIAL) enums to Prisma schema
- [x] Added `role` and `subscriptionTier` fields to `User` model; new `Subscription` model for history tracking
- [x] Migration: `20260307000000_add_roles_and_subscriptions`
- [x] Updated JWT payload to include `role` — login and Google OAuth callback updated
- [x] Added `getAdminFromToken()` helper to `src/lib/jwt.ts`
- [x] Next.js edge middleware (`src/middleware.ts`) protecting all `/api/admin/*` routes
- [x] Admin API routes: `/api/admin/stats`, `/api/admin/users`, `/api/admin/users/[id]` (GET/PATCH/DELETE), `/api/admin/email/digest`, `/api/admin/email/announce`
- [x] Admin UI at `/admin` — overview with stat cards, signups bar chart, tier pie chart
- [x] Admin UI at `/admin/users` — searchable/filterable paginated user table with inline tier change
- [x] Admin UI at `/admin/users/[id]` — user detail, subscription management, email actions, danger zone
- [x] Admin UI at `/admin/subscriptions` — tier breakdown, manual upgrade form, Pro users list
- [x] Admin layout with dark sidebar, role-based client-side auth guard

**Phase B (next sprint):** Lemon Squeezy webhook, bKash payment gateway, feature gating by tier

**Key files:** `web-app/prisma/schema.prisma`, `web-app/src/middleware.ts`, `web-app/src/app/api/admin/`, `web-app/src/app/admin/`

---

**New env vars needed:** `CRON_SECRET` (set same value in Netlify scheduled function config)

---

## Sprint 4 — v1.5.0: Chrome Browser Extension ✓ COMPLETE

**Goal:** Track browser activity where most distractions happen.

- [x] `browser-extension/` directory with Manifest V3 structure — `manifest.json`, `background.js`, `popup/`
- [x] Popup UI — animated ring timer, session info, login form, current tab display, distraction warning banner
- [x] Background service worker — tab change tracking, 1-min activity sync alarm, 30s session poll alarm
- [x] Send tab activity to `/api/activity/sync` with `source: "browser"` — API updated to accept top-level `source` field
- [x] Toolbar badge showing remaining session minutes; turns orange when < 20% remains; red on distraction sites
- [x] Distraction detection — checks current domain against `user.preferences.primaryDistractions`; popup shows banner + badge turns red
- [x] `source` field added to `ActivityLog` model (migration `20260307020000_add_activity_source`); `/api/activity/sync` accepts optional `domain` field for browser entries

**Key files:** `browser-extension/`, `web-app/prisma/schema.prisma`, `web-app/src/app/api/activity/sync/route.ts`

**To load in Chrome:** chrome://extensions → Developer mode → Load unpacked → select `browser-extension/`
**Icons:** Generate PNGs from `browser-extension/icons/icon.svg` at 16, 48, 128 px (see `icons/README.md`)

---

## Sprint 5 — v1.6.0: Real-Time & Caching ✓ COMPLETE

**Goal:** Make the dashboard feel alive.

- [x] Pusher integration — `src/lib/pusher.ts` (server singleton + `triggerUserEvent` helper), `src/lib/pusher-client.ts` (client singleton)
- [x] Real-time session sync — `POST /api/sessions` and `PATCH /api/sessions/[id]` fire `session-update` Pusher event after DB write
- [x] Live dashboard stat updates — `POST /api/activity/sync` fires `activity-synced` event; dashboard subscribes to both and calls `mutate()` instantly
- [x] Dashboard Pusher subscription via `useEffect` on per-user channel `user-${userId}`, cleans up on unmount; SWR `refreshInterval` reduced 60s → 30s
- [x] Upstash Redis caching — `src/lib/redis.ts`; leaderboard cached globally by period (5-min TTL, `isCurrentUser` applied at read time); analytics cached per `userId:period`

**New env vars needed:** `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

**Netlify note:** Add `PUSHER_KEY` to `SECRETS_SCAN_OMIT_KEYS` (its value appears in client bundle via `NEXT_PUBLIC_PUSHER_KEY` — intentional)

**Key files:** `web-app/src/lib/pusher.ts`, `web-app/src/lib/pusher-client.ts`, `web-app/src/lib/redis.ts`, `web-app/src/app/dashboard/page.tsx`, `web-app/src/app/api/leaderboard/route.ts`, `web-app/src/app/api/analytics/route.ts`

---

## Sprint 6 — v1.7.0: Offline & Firefox ✓ COMPLETE

**Goal:** Robust multi-browser and offline experience.

- [x] `DatabaseService.cs` — `PendingOperations` SQLite table (auto-migrated); `QueuePendingOperation`, `GetPendingOperations`, `RemovePendingOperation`, `IncrementRetryCount` methods
- [x] `SyncService.cs` — network check via `NetworkInterface.GetIsNetworkAvailable()`; skips sync when offline; `NetworkChange.NetworkAvailabilityChanged` triggers immediate reconnect sync; replays pending session ops via `ReplayPendingOperationsAsync` before activity sync
- [x] `ApiClient.cs` — `StartSessionAsync`/`EndSessionAsync` queue `START_SESSION`/`END_SESSION` to `PendingOperations` when offline; conflict resolution: activity deduplication via `skipDuplicates: true`, server timestamp wins for sessions
- [x] `UpdateService.cs` (new) — GitHub Releases API (`asifthewebguy/FlowShield/releases/latest`), semver comparison, `CheckAndPromptAsync` prompts user and opens installer download; wired into `Program.cs` (10s after startup)
- [x] Sentry .NET — `Sentry` v4.14.0 NuGet; initialized in `Program.cs`; `SentrySdk.CaptureException` in both global exception handlers
- [x] `manifest.firefox.json` — MV2 Firefox manifest: `browser_action`, `background.scripts`, `browser_specific_settings.gecko` (min Firefox 91)
- [x] Desktop version bumped: `1.1.6` → `1.7.0`
- [x] Unit tests: 51 tests already passing (exceeds 30+ target)

**Setup needed:** Replace `YOUR_SENTRY_DSN` in `Program.cs` with DSN from sentry.io

**To load in Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → select `manifest.firefox.json`

**Key files:** `desktop-app/Services/DatabaseService.cs`, `desktop-app/Services/SyncService.cs`, `desktop-app/Services/ApiClient.cs`, `desktop-app/Services/UpdateService.cs` (new), `desktop-app/Program.cs`, `browser-extension/manifest.firefox.json` (new)

---

## Sprint 7 — v1.8.0: Smarter Categorization ✓ COMPLETE

**Goal:** Make activity data actually useful.

- [x] `CategoryRule` model in Prisma schema — keyword/matchField/category/priority; global rules seeded via migration; user-specific overrides at priority 200
- [x] Migration `20260309000000_add_category_rules` — table + 45 default global rules covering Development, Work, Communication, Entertainment, Social Media, Creative, Study, Browsing
- [x] `GET /api/categories` — returns canonical category list, productive categories, aliases (desktop→web mapping), and merged global+user rules
- [x] `POST /api/categories` — creates user-specific correction rule
- [x] `POST /api/activity/recategorize` — three modes: single activity, by applicationName, or bulk re-apply all rules
- [x] Category normalization in `/api/activity/sync` — desktop `Productivity`→`Work`, `Social`→`Social Media` via shared `normalizeCategory()` helper
- [x] Shared `PRODUCTIVE_CATEGORIES` constant used by analysis route (replaces hardcoded list)
- [x] Category correction UI on `/activity` page — click any app's category badge to open dropdown, selects new category, creates user rule + recategorizes existing activities
- [x] `GET /api/analytics/distractions` — distraction percentage, week-over-week trend comparison, top distracting apps, daily distraction minutes
- [x] Distraction Analysis panel on `/analytics` page — bar chart of daily distraction time, top distracting apps with progress bars, trend change indicator

**Key files:** `web-app/prisma/schema.prisma`, `web-app/prisma/migrations/20260309000000_add_category_rules/`, `web-app/src/app/api/categories/route.ts` (new), `web-app/src/app/api/activity/recategorize/route.ts` (new), `web-app/src/app/api/analytics/distractions/route.ts` (new), `web-app/src/app/api/activity/sync/route.ts`, `web-app/src/app/api/activity/analysis/route.ts`, `web-app/src/app/activity/page.tsx`, `web-app/src/app/analytics/page.tsx`

---

## Sprint 8 — v1.9.0: Android App MVP ✓ COMPLETE

**Goal:** Complete the multi-device story.

- [x] Expo (SDK 54) + TypeScript project in `mobile-app/` — React 19.1.0, React Native 0.81.5
- [x] `src/lib/api.ts` — typed API client with `SecureStore` token persistence; supports login, analytics, sessions CRUD, activity sync, push token registration
- [x] `src/lib/auth.tsx` — React context + provider; auto-restores session from SecureStore on app launch
- [x] `src/lib/theme.ts` — shared colors, spacing, and font sizes matching web brand (sky-500 primary)
- [x] Login screen — email/password form, error handling, keyboard-avoiding layout
- [x] Dashboard screen — weekly stats grid (sessions, completed, focus time, productivity), completion rate progress bar, peak time card, pull-to-refresh
- [x] Focus Timer screen — session type selector (Work/Study/Creative), duration picker (15/25/45/60m), countdown with circular progress ring, pause/resume/cancel, break suggestion after sessions >= 15m, vibration on complete
- [x] Session History screen — FlatList with session cards, productivity score bars, pull-to-refresh, empty state
- [x] Bottom tab navigation — Home/Focus/History tabs with emoji icons, native stack navigator, auth-gated routing
- [x] Push notifications via Expo Notifications — permission request, Android channel setup, session reminder scheduling, completion notification
- [x] Phone usage tracking — AppState-based monitoring during focus sessions; records background time as "Phone Usage" activities synced to `/api/activity/sync` with `source: "mobile"`
- [x] Full API integration — all screens use existing web API endpoints (`/api/analytics`, `/api/sessions`, `/api/activity/sync`)

**Key files:** `mobile-app/App.tsx`, `mobile-app/src/navigation/AppNavigator.tsx`, `mobile-app/src/screens/`, `mobile-app/src/lib/api.ts`, `mobile-app/src/lib/auth.tsx`, `mobile-app/src/lib/notifications.ts`, `mobile-app/src/lib/usageTracker.ts`

**To run:** `cd mobile-app && npm start` then scan QR with Expo Go app, or `npm run android`

**Note:** Full Android Usage Stats API tracking (per-app usage during sessions) deferred to Sprint 9 — requires custom native module

---

## Sprint 9 — v1.9.5: Quality Gate ✓ COMPLETE

**Goal:** Stabilize everything before v2.0.

- [x] Mobile app polish: `AnalyticsScreen` (bar chart + productivity bars), `ProfileScreen` (avatar, monthly stats, app info), `SettingsScreen` (notification toggles, Privacy Policy link) — wired into 5-tab `AppNavigator`
- [x] Offline activity queue: `mobile-app/src/lib/offlineQueue.ts` — `syncWithFallback()` wraps all activity sync calls; queued activities re-sent automatically on next successful request; `usageTracker.ts` migrated to use offline queue
- [x] Unit test coverage: **112 tests** (up from 51) — added `rate-limit.test.ts` (12 tests), `schemas.test.ts` (25 tests), `categories.test.ts` (14 tests)
- [x] Playwright E2E: **12 spec files** in `web-app/e2e/` — `auth.spec.ts`, `dashboard.spec.ts`, `navigation.spec.ts`, `api-health.spec.ts`, `signup.spec.ts`, `accessibility.spec.ts`, `security-headers.spec.ts`, plus 5 pre-existing specs
- [x] OpenAPI spec: `web-app/openapi.yaml` (OpenAPI 3.1.0) — documents all 37 API routes across 11 tags (Auth, Sessions, Activity, Analytics, Categories, Leaderboard, Goals, Projects, User, Notifications, Admin)
- [x] Security headers: `next.config.ts` now sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` on all routes
- [ ] Load testing for sync endpoint (deferred — requires k6/Artillery setup in CI)

**Key files:** `mobile-app/src/screens/AnalyticsScreen.tsx` (new), `mobile-app/src/screens/ProfileScreen.tsx` (new), `mobile-app/src/screens/SettingsScreen.tsx` (new), `mobile-app/src/lib/offlineQueue.ts` (new), `web-app/src/lib/rate-limit.test.ts` (new), `web-app/src/lib/schemas.test.ts` (new), `web-app/src/lib/categories.test.ts` (new), `web-app/e2e/` (7 new specs), `web-app/openapi.yaml` (new), `web-app/next.config.ts`

---

## Sprint 10 — v2.0.0: AI Coach & Teams

**Goal:** Phase 2 differentiators.

- [ ] AI Productivity Coach: integrate LLM API for personalized advice
- [ ] `/api/coach/advice` endpoint + "Coach" card on dashboard
- [ ] Team features: `Team` and `TeamMembership` models, invite flow, shared leaderboard
- [ ] Predictive scheduling based on historical peak-hour data

---

## Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| SSE or Pusher instead of raw WebSockets | Netlify doesn't support persistent WebSocket connections |
| Upstash Redis (serverless) | Works with Netlify Functions, no self-hosted infra needed |
| React Native for mobile | Shares TypeScript/React patterns with web app |
| Rule-based → ML categorization gradually | Start with PostgreSQL keyword lookup, graduate to ML if needed |
| Same `/api/activity/sync` for all clients | Avoids parallel sync infrastructure; add `source` field |

## Verification (After Each Sprint)

1. Run full Playwright E2E suite
2. Run unit tests with coverage report
3. Manual smoke test on web dashboard + desktop app
4. Verify desktop-to-web sync still works
5. Check Sentry for new errors (from Sprint 1 onward)
