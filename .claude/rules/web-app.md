---
description: Web app stack, API routes, Prisma models, env vars, scripts — Next.js 16 dashboard
globs: web-app/**
alwaysApply: false
---

# Web App (`web-app/`)

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** TailwindCSS — `primary-*` color scale maps to sky-500
- **ORM:** Prisma + PostgreSQL (Neon serverless)
- **Auth:** Custom JWT (`src/lib/jwt.ts`) + email verification via Resend; Google OAuth at `/api/auth/google`
- **State:** Zustand (global UI), SWR (server data, 30s poll interval)
- **Charts:** Recharts
- **Real-time:** Pusher — `src/lib/pusher.ts` (server), `src/lib/pusher-client.ts` (client)
- **Caching:** Upstash Redis (`src/lib/redis.ts`) — 5-min TTL
- **AI Coach:** `@google/generative-ai` — Gemini 1.5 Flash, streams SSE at `/api/coach/advice`
- **Validation:** Zod schemas in `src/lib/schemas.ts`
- **Logging:** `src/lib/logger.ts` → Sentry (`@sentry/nextjs`)
- **Push notifications:** Web Push API (`web-push`), subscription at `/api/push/subscribe`
- **Email:** Resend — weekly digest cron + announce

## Key Paths

| What | Where |
|------|-------|
| App pages | `web-app/src/app/` |
| API routes | `web-app/src/app/api/` |
| Shared lib | `web-app/src/lib/` |
| Components | `web-app/src/components/` |
| Landing page sections | `web-app/src/components/landing/` (13 components) |
| Prisma schema | `web-app/prisma/schema.prisma` |
| Migrations | `web-app/prisma/migrations/` |
| Unit tests | `web-app/src/lib/*.test.ts` |
| E2E tests | `web-app/e2e/` |
| OpenAPI spec | `web-app/openapi.yaml` |
| Load test | `web-app/load-tests/sync.js` (k6) |

## Scripts

```bash
cd web-app
npm run dev        # dev server
npm run build      # production build — must pass before pushing
npm run lint       # ESLint — must be zero errors before pushing
npm test           # Vitest unit tests (115 tests)
npx playwright test  # E2E tests (12 specs)
```

## API Routes (58 total)

| Tag | Routes |
|-----|--------|
| Auth | `/api/auth/login`, `/api/auth/signup`, `/api/auth/verify`, `/api/auth/google`, `/api/auth/google/callback`, `/api/auth/callback-exchange`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/logout-all`, `/api/auth/resend-verification`, `/api/auth/request-verification` |
| Sessions | `/api/sessions`, `/api/sessions/[id]`, `/api/sessions/[id]/toggle-pause`, `/api/sessions/[id]/auto-end`, `/api/sessions/active` |
| Activity | `/api/activity/sync`, `/api/activity/analysis`, `/api/activity/recategorize` |
| Analytics | `/api/analytics`, `/api/analytics/insights`, `/api/analytics/distractions`, `/api/analytics/yearly` |
| Categories | `/api/categories`, `/api/categories/[id]` |
| Coach | `/api/coach/advice` — SSE stream, Gemini 1.5 Flash |
| Teams | `/api/teams`, `/api/teams/[id]`, `/api/teams/[id]/members/[userId]`, `/api/teams/join` |
| Leaderboard | `/api/leaderboard` |
| Goals | `/api/goals` |
| Projects | `/api/projects`, `/api/projects/[id]`, `/api/projects/cost` |
| Tasks | `/api/tasks`, `/api/tasks/[id]` |
| Search | `/api/search` |
| Devices | `/api/devices` |
| Reports | `/api/reports/weekly` |
| User | `/api/user/profile`, `/api/user/preferences`, `/api/user/password`, `/api/user/delete`, `/api/export` |
| Notifications | `/api/push/subscribe`, `/api/push/send` |
| Admin | `/api/admin/stats`, `/api/admin/users`, `/api/admin/users/[id]`, `/api/admin/settings`, `/api/admin/email/announce`, `/api/admin/email/digest` |
| Cron | `/api/cron/weekly-digest`, `/api/cron/expire-subscriptions` |
| Misc | `/api/health`, `/api/config/realtime`, `/api/migrate-distractions` |

## Prisma Models

`User` · `UserPreferences` · `Session` · `ActivityLog` · `Goal` · `DailyStats` · `DeviceConnection` · `PushSubscription` · `Project` · `Task` · `Subscription` · `CategoryRule` · `AppSetting` · `Team` · `TeamMembership`

Enums: `SessionType` · `GoalType` · `UserRole` (USER/ADMIN) · `SubscriptionTier` (FREE/PRO/TEAM) · `SubscriptionStatus` · `TeamRole` (OWNER/ADMIN/MEMBER) · `TaskStatus` (TODO/DOING/DONE)

## Category Normalization (web side)

`normalizeCategory()` in `/api/activity/sync/route.ts`:
- `Productivity` → `Work`
- `Social` → `Social Media`
- All others pass through unchanged

## Activity privacy

`UserPreferences.shareWindowDetails` (default `true`). `/api/activity/sync` reads it per request and stores `windowTitle = 'Hidden'`, `url = null` when `false`, for every `source`. The desktop also strips before upload.

## Environment Variables (Netlify)

```
DATABASE_URL               # Neon PostgreSQL connection string
JWT_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
RESEND_API_KEY
CRON_SECRET
PUSHER_APP_ID
PUSHER_KEY                 # Add to SECRETS_SCAN_OMIT_KEYS — intentionally in client bundle
PUSHER_SECRET
PUSHER_CLUSTER
NEXT_PUBLIC_PUSHER_KEY
NEXT_PUBLIC_PUSHER_CLUSTER
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
GOOGLE_AI_API_KEY          # Gemini 1.5 Flash for AI Coach
SENTRY_DSN
NEXT_PUBLIC_APP_URL
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

**Netlify `SECRETS_SCAN_OMIT_KEYS`:** `NEXTAUTH_URL,PUSHER_KEY`

## Hosting Constraints

- Netlify = no persistent WebSockets → SSE for streaming, Pusher for real-time events
- Serverless functions = stateless, short-lived — no in-memory caches between requests
