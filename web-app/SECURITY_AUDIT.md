# FlowShield Web App — Security Audit

**Date:** 2026-06-27 · **Scope:** `web-app/` (Next.js 16, Prisma/Postgres, custom JWT, Netlify)
**Method:** 4 parallel reviewers — auth/authz, injection/input, secrets/config/headers, rate-limit/abuse.
Findings deduplicated and prioritized. Line numbers are from the audited tree; re-check before editing.

---

## TL;DR — fix in this order

1. **Rotate live credentials** (Neon DB password, Upstash token, Google AI key) + `chmod 600` the env files. They sat in world-readable files on disk.
2. **Replace the in-memory rate limiter with Upstash Redis.** It is a no-op on serverless today — every brute-force/abuse limit silently fails open. Single highest-leverage fix (covers 6+ endpoints).
3. **Stop leaking `hashedPassword` + reset tokens** from `/api/user/profile`.
4. **Timing-safe `CRON_SECRET` compare**, JWT algorithm pinning, OAuth `state`, input validation on the unvalidated POST routes.

---

## CRITICAL

### C1 — In-memory rate limiter is a no-op on serverless (auth brute-force, cost abuse)
`src/lib/rate-limit.ts:10` — module-level `Map`. Netlify spawns fresh instances → counter resets to 0 per cold start. Every limit (login 10/15m, signup, forgot/reset-password, resend-verify, team-join) fails open.
Compounded by `src/lib/rate-limit.ts:50-56`: `getClientIp` trusts raw `X-Forwarded-For` first element → attacker spoofs a new IP per request, bypassing the limiter even if it worked.
**Fix:** `@upstash/ratelimit` (Redis already wired at `src/lib/redis.ts`). Key authenticated endpoints by userId; for unauth use Netlify's `x-nf-client-connection-ip` (or last XFF element). Removing the Map fixes C1 + the spoof at once.

### C2 — Live credentials in world-readable env files
`.env` and `.env.local` are `-rwxrwxrwx`. Gitignored and **not** in git history (verified) — exposure is local-disk only, but any process/user on the box can read them. Contains real Neon `DATABASE_URL`, `JWT_SECRET`, `NEXTAUTH_SECRET`, `UPSTASH_REDIS_REST_TOKEN`, `GOOGLE_AI_API_KEY`.
**Fix:** `chmod 600 web-app/.env web-app/.env.local`. **Rotate** the Neon password, Upstash token, Google AI key (they were exposed); rotate `JWT_SECRET`/`NEXTAUTH_SECRET` if the box is shared/CI-accessible.

### C3 — `/api/user/profile` returns full User row (hashedPassword + reset tokens)
`src/app/api/user/profile/route.ts:32` — `findUnique({ include: { preferences:true }})` with no `select` → returns `hashedPassword`, `verificationToken`, `passwordResetToken`, `passwordResetExpires` to the client. Login route strips these; profile route does not.
**Fix:** explicit `select` of safe fields only.

### C4 — `CRON_SECRET` compared with `!==` (timing side-channel)
`src/app/api/cron/weekly-digest/route.ts:18`, `src/app/api/cron/expire-subscriptions/route.ts:32`. String `===` is not constant-time → char-by-char enumeration over many requests.
**Fix:** `crypto.timingSafeEqual` with length pre-check.

### C5 — Admin announcement email: no schema, raw HTML to all users
`src/app/api/admin/email/announce/route.ts:12-19` — body is a type assertion (`as`), no Zod, `html` forwarded unsanitized to bulk `sendEmail`. Compromised/insider admin → phishing/XSS HTML to every user.
**Fix:** Zod-validate + sanitize (`sanitize-html`) before send. (Bounded to admin auth, but highest blast radius — treat as Critical.)

---

## HIGH

### H1 — JWT verified without algorithm pinning
`src/lib/jwt.ts:41,62`, `src/app/api/coach/advice/route.ts:23` — `verify(token, secret)` with no `{ algorithms:['HS256'] }`. Latent alg-confusion / `alg:none` risk on any lib downgrade/fork. Also pin on `sign` (`login/route.ts:70`, `google/callback/route.ts:101`).

### H2 — JWT passed in URL query string (`?token=`)
`src/app/api/coach/advice/route.ts:17-28` — SSE can't set Authorization header, so full JWT lands in browser history, access logs, CDN/proxy logs. Token valid up to 30 days.
**Fix:** short-lived (≤2 min) SSE-scoped exchange token via POST, or httpOnly cookie the EventSource inherits.

### H3 — OAuth callback has no `state` (login CSRF)
`src/app/api/auth/google/route.ts:14-26` — no `state` param → attacker can force-login a victim into the attacker's account.
**Fix:** generate `state`, store in Redis/signed cookie, verify in callback before code exchange.

### H4 — SSRF via unvalidated push subscription endpoint
`src/app/api/push/subscribe/route.ts:13-40` — arbitrary `endpoint` URL stored, later called by `webpush.sendNotification` in `/api/push/send`. Authenticated attacker points it at internal hosts / metadata endpoints.
**Fix:** allowlist known push domains (google/mozilla/windows/apple); reject RFC-1918 / localhost.

### H5 — Mass-assignment / no validation on `POST /api/sessions`
`src/app/api/sessions/route.ts:17-25` — `CreateSessionSchema` exists in `src/lib/schemas.ts:20` but is never used. `plannedDuration`/`sessionType`/`projectId` go raw to Prisma → 500s + stack traces on bad input.
**Fix:** `CreateSessionSchema.safeParse(body)`.

### H6 — `/api/activity/sync`: unbounded array + unvalidated fields (DoS, leaderboard fraud)
`src/app/api/activity/sync/route.ts:19-68` — no `length` cap, no field validation, no rate limit. One request with 100k rows → mass `createMany`, table bloat. `durationSeconds` unchecked → submit `999999999` to top the leaderboard (`src/app/api/leaderboard/route.ts`).
**Fix:** Zod `z.array().max(500)`; clamp `durationSeconds` to a per-entry/per-day ceiling; truncate strings; rate-limit by userId.

### H7 — No CSP header
`next.config.ts:4-29` — has X-Frame-Options/HSTS/etc but no `Content-Security-Policy`. Any injected/3rd-party script runs unrestricted.
**Fix:** add CSP (`default-src 'self'`; allow pusher/upstash/sentry in `connect-src`; `frame-ancestors 'none'`). Drop legacy `X-XSS-Protection`.

### H8 — `/api/health` leaks DB error message, unauthenticated
`src/app/api/health/route.ts:18-25` — returns `error.message` → can expose DB host/SSL details.
**Fix:** return generic status; no `error.message`.

### H9 — FREE-tier coach quota race (LLM cost abuse)
`src/app/api/coach/advice/route.ts:60-269` — `lastCoachCallAt` written only after stream completes; N concurrent requests all pass the quota check → N parallel Gemini streams.
**Fix:** Redis `SET NX EX` lock per userId before the call; add per-user req rate limit.

### H10 — Stored XSS in email templates
`src/app/api/admin/settings/route.ts` + `src/lib/settings.ts:97` (`applyTemplate` literal replace, no escaping) + `src/app/api/auth/signup/route.ts:90`. Admin-stored `email.welcome.body`/`digest.body` emitted as raw HTML to every signup; user `name` interpolated unescaped.
**Fix:** sanitize stored bodies; HTML-escape all template vars.

### H11 — `netlify.toml` catch-all SPA redirect shadows Next.js routes
`netlify.toml:15-18` — `from "/*" to "/index.html" 200`. Wrong for App Router + `@netlify/plugin-nextjs`; API routes can return the HTML shell with 200.
**Fix:** remove the `[[redirects]]` block.

---

## MEDIUM

| ID | File | Issue | Fix |
|----|------|-------|-----|
| M1 | `api/devices/route.ts:61-68` | IDOR — POST reassigns an existing `deviceId` to caller without ownership check (device hijack) | check `existingDevice.userId === userId` first |
| M2 | `api/sessions/[id]/toggle-pause/route.ts:19-65` | Read-then-write race doubles pause adjustment | wrap in `$transaction` |
| M3 | `api/auth/signup/route.ts:39` | Account enumeration — 409 on existing email (login/forgot correctly generic) | generic response |
| M4 | `api/sessions/route.ts:83` | `limit` query unclamped → `take: huge`/`NaN` | `Math.min(Math.max(n,1),200)` |
| M5 | `api/teams/route.ts:48` | No cap on teams created per user | per-owner count cap |
| M6 | `api/push/subscribe` | No per-user subscription cap → fan-out amplification in `/send` | cap (~10) |
| M7 | `api/coach/advice/route.ts:203` | Prompt injection via user-controlled category strings | normalize categories to allowlist before prompt |
| M8 | `api/leaderboard/route.ts:73-86` | Leaks every top-10 user's DB UUID to peers | drop `userId`, keep only `isCurrentUser` |
| M9 | `api/auth/signup/route.ts:103` | User name/email interpolated unescaped into admin-notify HTML | HTML-escape or text-only |
| M10 | `api/goals/route.ts:23` | Raw `goalType` query → Prisma 500 on bad enum | validate against enum |
| M11 | `push/send`, `lib/pushNotify.ts` | Server uses `NEXT_PUBLIC_` VAPID key | split server/client env vars |
| M12 | `netlify.toml:9` | `PUSHER_KEY` missing from `SECRETS_SCAN_OMIT_KEYS` (per own gotchas rule) | `"NEXTAUTH_URL,PUSHER_KEY"` |

## LOW

| ID | File | Issue |
|----|------|-------|
| L1 | `api/auth/login/route.ts:73` | 30-day `rememberMe` JWT not revoked on password change/reset (no tokenVersion/blocklist) |
| L2 | `api/auth/reset-password/route.ts:17` | 10/hr limit vs forgot's 3/hr (tokens are 256-bit, low real risk) |
| L3 | `api/export/route.ts:61-74` | CSV cells not RFC-4180 escaped → malformed CSV / formula injection if user strings added |
| L4 | `api/auth/login/route.ts:59` | Email verification off by default (`REQUIRE_EMAIL_VERIFICATION`) |
| L5 | `api/sessions/route.ts:88` | Unvalidated `date` query → `new Date()` → 500 |

---

## Clean (checked, no issue)
- No raw SQL injection — all `$queryRaw` use tagged templates (parameterized).
- No `dangerouslySetInnerHTML`; no dynamic `fetch()` to user URLs (except H4 push path).
- Session/teams/admin IDOR — ownership + `UserRole==ADMIN` checks present (except M1 devices).
- bcrypt cost=12; verification/reset tokens 32-byte crypto-random.
- No filesystem ops with user input; no user-controlled RegExp.
