# Token Revocation — Client Completion Design

**Date:** 2026-08-11
**Branch:** `feat/token-revocation`
**Status:** Approved
**Context:** Server-side revocation via `User.tokenVersion` shipped in c9cba15 (`web-app/src/lib/jwt.ts` validates `tv` claim, Redis-cached). No client handles revocation; desktop 401s throw silently on several paths; extension discards unsynced logs on 401; no logout endpoint exists. Full findings: `dev-docs/APP_ANALYSIS_2026-08-11.md`.

## Goal

Revoked token becomes unusable on every surface within ~30 seconds, with correct re-login UX and zero data loss. Active focus sessions are never killed by revocation.

## Decisions

- **Detection: reactive 401 only.** Server already rejects revoked tokens. Every surface polls ≤30s (desktop `_reSyncTimer` 30s, extension session poll 30s, web SWR 30s), so a 401 lands within ~30s with no new protocol. Proactive validation endpoints and Pusher revocation events rejected as redundant complexity.
- **Logout semantics: local + logout-everywhere.** Normal logout stays client-side (delete stored token, no server call). New `POST /api/auth/logout-all` bumps `tokenVersion` to kill all devices.
- **Mid-session behavior: preserve focus.** Auth loss never stops a running session or disables blocking. Syncs queue offline and replay after re-login.
- **Voluntary vs involuntary logout (extension):** explicit user logout flushes pending logs (final sync attempt, then clear); involuntary 401 preserves them for post-re-login replay.

## 1. Server (web-app)

`POST /api/auth/logout-all`:
- Auth via existing `getAuthUserId()` bearer flow
- `User.tokenVersion += 1` AND delete the Redis tokenVersion cache key in the same request (stale cache would delay revocation)
- Rate limit via existing `src/lib/rate-limit.ts`: 5/hour per user
- Response `204`; caller clears its own token afterward
- No request body; no Zod schema needed

No changes to token issuance. No refresh tokens (backlog).

**Web UI:** settings/profile page adds "Log out of all devices" button → call endpoint → clear own stored token → redirect to login.

## 2. Desktop (.NET)

**Unify 401 handling** in `Services/ApiClient.cs`:
- Today: `:702` fires Logout + `SessionExpired`; `:166, :250, :315` just throw; ~9 catch blocks return null silently.
- Add one private helper (e.g. `HandleUnauthorizedAsync(HttpResponseMessage)`) invoked on every API response. On 401: clear stored token, raise `SessionExpired` exactly once (guard flag against concurrent calls triple-firing), log via Serilog.

**`UI/TrayApplication.cs`:** subscribe `SessionExpired` → tray balloon "Session expired — log in again"; click opens existing login dialog. Non-blocking.

**Mid-session:**
- `SessionManager` and `BlockingService` unaffected by auth loss — session and blocking continue.
- `SyncService` treats 401 like offline: activities queue to `PendingOperations` (existing 500-cap / 7-day TTL), replay after re-login.
- `_reSyncTimer` pauses while unauthenticated instead of hammering 401s; resumes on re-auth.

**Re-login:** existing dialog; success → store token → `SyncService` replays queue → resync timer resumes.

**Out of scope:** full empty-catch cleanup (only paths the 401 helper touches gain logging).

## 3. Mobile (Expo)

**`src/lib/api.ts`:** central 401 interceptor in the fetch wrapper — delete SecureStore token, flag auth context. Preserve error codes everywhere: throw `{ code, message }` from all endpoints (extend the #110 login pattern to the whole client), not generic `Error(data.error)`.

**`src/lib/auth.tsx`:** 401 flag → context sets `user = null` → auth-gated navigator lands on LoginScreen.

**Mid-session:** running focus timer continues locally; on-screen banner "Session expired — log in". `offlineQueue.ts` keeps holding sync payloads, replays after re-login. (Queue bounding is backlog item 8 — untouched here.)

**Settings screen:** "Log out of all devices" button → `POST /api/auth/logout-all` → clear SecureStore → login screen.

## 4. Extension (chrome/ MV3 + firefox/ MV2 — both copies)

**`background.js`:**
- Today 401 → remove token AND `pendingLogs = []` (data loss). Fix: keep `pendingLogs` and mirror to `chrome.storage.local` (survives MV3 worker restarts); replay after re-login.
- Cap mirrored logs at 500 entries, drop oldest (matches desktop bound).
- Logged-out state clears the timer badge (neutral/grey), so the user notices.

**`popup/popup.js`:** surface `EMAIL_NOT_VERIFIED` on login with proper message + verify-email hint (parity with #110), both browsers.

**Logout button:** explicit logout = final sync attempt for pending logs, then clear everything.

**Out of scope:** Chrome popup MV2 `browser.tabs.executeScript` bug (backlog item 2, next PR); session controls in popup.

## 5. Testing & Verification

| Layer | Tests |
|-------|-------|
| Web (Vitest) | logout-all: bumps tokenVersion, deletes Redis key, rate-limited, 401 without token. jwt.ts: old `tv` claim rejected immediately after bump. |
| Desktop (xUnit) | 401 helper: token cleared, `SessionExpired` raised exactly once under concurrent 401s. SyncService: 401 → queue (not dropped), replay after re-auth. Session/blocking state untouched by auth loss. |
| E2E (Playwright) | Two contexts logged in; logout-all from one; other's next API call 401s → redirected to login. |
| Extension (manual) | Revoke from web → ≤30s popup shows login, badge cleared, pendingLogs preserved in storage; re-login → logs sync. |
| Mobile (manual) | Revoke while timer running → banner, timer continues, queue replays after login. |
| Cross-device smoke | Web logout-all → desktop tray prompt ≤30s, session/blocking intact, re-login replays queue. |

**Success criteria:**
- Revoked token unusable on every surface ≤30s
- Zero data loss: queued activities survive revocation and replay
- Active focus sessions never killed by revocation
- `npm run lint` zero errors; all suites green (115 Vitest, 94 xUnit, 12 Playwright specs)

## Backlog (follow-up sub-projects, report §7 order)

1. Chrome MV3 popup `browser.tabs.executeScript` bug (shipped + broken)
2. Mobile timer server-anchoring
3. Hash password reset tokens in DB
4. Rate-limit non-auth routes
5. Desktop pause/resume blocking restore (`SessionManager.cs:99-100`)
6. Subscription enforcement decision
7. Bound mobile offline queue (extension slice done in this project)
