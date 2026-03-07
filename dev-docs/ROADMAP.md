# FlowShield - Development Roadmap (v1.1.6 → v2.0)

> Last updated: 2026-03-07

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

## Sprint 4 — v1.5.0: Chrome Browser Extension

**Goal:** Track browser activity where most distractions happen.

- [ ] Create `browser-extension/` directory with Manifest V3 structure
- [ ] Popup UI showing current session timer (synced via API)
- [ ] Background service worker tracking active tab domains and durations
- [ ] Send tab activity to `/api/activity/sync` with `source: "browser"` field
- [ ] Toolbar badge showing remaining session time
- [ ] Flag distracting domains based on user's `primaryDistractions` preference
- [ ] Add `source` field to `ActivityLog` model via Prisma migration

---

## Sprint 5 — v1.6.0: Real-Time & Caching

**Goal:** Make the dashboard feel alive.

- [ ] Add Server-Sent Events (SSE) or Pusher/Ably for real-time updates (Netlify doesn't support raw WebSockets)
- [ ] Real-time session sync across tabs and between web/extension
- [ ] Live dashboard stat updates when desktop/extension syncs new data
- [ ] Add Upstash Redis (serverless, Netlify-compatible) for caching
- [ ] Cache leaderboard results (5-min TTL) and analytics aggregations
- [ ] Add database indexes for common `ActivityLog` query patterns

---

## Sprint 6 — v1.7.0: Offline & Firefox

**Goal:** Robust multi-browser and offline experience.

- [ ] Enhance `SyncService.cs` to queue operations when offline, replay on reconnect
- [ ] Add conflict resolution: server timestamp wins for sessions, deduplicate activity logs
- [ ] Desktop auto-updater: version check against latest GitHub release, prompt to download
- [ ] Port Chrome extension to Firefox (WebExtensions API, high compatibility)
- [ ] Desktop app crash reporting via Sentry .NET SDK
- [ ] Expand to 30+ unit tests

---

## Sprint 7 — v1.8.0: Smarter Categorization

**Goal:** Make activity data actually useful.

- [ ] Enhanced categorization: keyword lookup table stored in PostgreSQL, user-correctable
- [ ] UI for users to correct miscategorized activities (feeds back into lookup table)
- [ ] Shared categorization rules endpoint so desktop, extension, and web use same categories
- [ ] Distraction pattern analysis on analytics page with trend comparison

---

## Sprint 8 — v1.9.0: Android App MVP

**Goal:** Complete the multi-device story.

- [ ] React Native project setup (shares TypeScript/React patterns with web)
- [ ] Screens: Login, Dashboard, Focus Timer, Session History
- [ ] Push notifications via Firebase Cloud Messaging
- [ ] Phone usage tracking during focus sessions (Android Usage Stats API)
- [ ] Sync with existing `/api/activity/sync` and `/api/sessions` endpoints

---

## Sprint 9 — v1.9.5: Quality Gate

**Goal:** Stabilize everything before v2.0.

- [ ] Mobile app polish: settings, profile, analytics view, offline queueing
- [ ] Expand Playwright E2E from 6 to 15-20 specs
- [ ] Unit test coverage: 50+ tests
- [ ] Load testing for sync endpoint
- [ ] OpenAPI/Swagger spec for all API routes
- [ ] Security audit

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
