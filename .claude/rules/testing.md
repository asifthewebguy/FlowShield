---
description: Test suites, counts, commands, and the post-sprint verification checklist
alwaysApply: true
---

# Testing

## Test Suites

| Suite | Count | Command |
|-------|-------|---------|
| Vitest unit tests (web) | **314** across 31 files | `cd web-app && npm test` |
| Playwright E2E (web) | **13 specs** | `cd web-app && npx playwright test` |
| xUnit (legacy .NET desktop) | 177 `[Fact]`/`[Theory]` in 12 files | `cd desktop-app && dotnet test` — **Windows only** |
| Desktop v3 (Tauri, Rust) | `#[cfg(test)]` modules in 26 files | `cd desktop-app-v3/src-tauri && cargo test --lib` |
| k6 load test | — | GitHub Actions `workflow_dispatch` or weekly schedule |

## Web Unit Tests (314 Vitest, 31 files)

`src/lib/`:
`schemas` 49 · `insights` 26 · `productivity` 21 · `coach-quota` 18 · `subscription` 16 ·
`categories` 14 · `activity-sync` 12 · `project-classifier` 12 · `jwt` 10 · `rate-limit` 9 ·
`reports` 9 · `timezone` 8 · `auth` 7 · `auto-classify-helper` 7

`src/app/api/`:
`coach/advice` 8 · `tasks` 8 · `sessions` 8 · `auth/callback-exchange` 6 · `auth/login` 6 · `auth/reset-password` 6 ·
`cron/expire-subscriptions` 6 · `auth/request-verification` 6 · `tasks/[id]` 6 ·
`search` 6 · `auth/forgot-password` 5 · `user/password` 5 ·
`auth/logout-all` 4 · `projects/[id]` 4 · `sessions/[id]/auto-end` 4 · `user/delete` 4 ·
`activity/sync` 4

**Redis in tests:** `UPSTASH_REDIS_REST_URL` is unset under Vitest, so any unmocked
module that touches Redis makes a real `fetch` that fails slowly and spams stderr.
Mock it — `vi.mock('@/lib/redis', ...)` — or mock the wrapper that uses it
(`@/lib/rate-limit`, `@/lib/analytics-cache`, `@/lib/coach-quota`). Existing tests
show both patterns. A suite run should print **zero** `Failed to execute command` /
`Failed to parse URL` lines.

## Playwright E2E Specs (13)

`web-app/e2e/`: `accessibility` · `api-health` · `auth` · `auth_debug` ·
`dashboard` · `dashboard_audit` · `email_flow` · `logout-all` · `navigation` ·
`security-headers` · `session` · `signup` · `validation_check`

## Legacy Desktop Tests (.NET)

`desktop-app/FlowShield.Desktop.Tests/` (xUnit) — categorization, version compare,
activity levels, DB CRUD, blocking, backoff, queue bounds, hosts-file resilience,
`CategoryService` rule matching + normalization.

Compiles on Linux with `-p:EnableWindowsTargeting=true` but only *runs* on Windows.

## Verification Checklist

1. `cd web-app && npm test` — 314 passing, no Redis stderr noise
2. `cd web-app && npm run lint` — zero errors
3. `cd web-app && npm run build`
4. `cd desktop-app-v3/src-tauri && cargo test --lib && cd .. && npm run typecheck`
5. Full Playwright E2E suite
6. Manual smoke test: web dashboard + desktop v3
7. Verify desktop-to-web activity sync
8. Check Sentry for new errors
