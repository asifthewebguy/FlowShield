# Token Revocation Client Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a revoked JWT unusable on every surface within ~30s, with re-login UX and zero data loss; add a "log out of all devices" endpoint + UI.

**Architecture:** Reactive 401 handling only — the server already rejects revoked tokens (`web-app/src/lib/jwt.ts` checks the `tv` claim against `User.tokenVersion`, Redis-cached). Clients detect the resulting 401s on their existing ≤30s polls. New `POST /api/auth/logout-all` bumps `tokenVersion`. Active focus sessions are never killed by auth loss; unsynced activity is preserved and replayed after re-login.

**Tech Stack:** Next.js 16 App Router + Prisma + Upstash Redis (web) · .NET 8 WinForms/WPF + xUnit/Moq (desktop) · Expo/React Native (mobile) · Chrome MV3 + Firefox MV2 vanilla JS (extension)

**Spec:** `docs/superpowers/specs/2026-08-11-token-revocation-clients-design.md`

## Reality Corrections (verified against code; supersede the spec where they conflict)

1. Extension EMAIL_NOT_VERIFIED is ALREADY implemented in both popups (`chrome/popup/popup.js:97`, `firefox/popup/popup.js:128`) — no task for it.
2. Extension badge ALREADY clears when session is null (`formatBadge(null)` → `''`) — no task for it.
3. Desktop mutation paths (sync, start session, toggle-pause, goals, projects, teams) ALREADY call `Logout()` which fires `SessionExpired`. The real gaps: (a) silent GET methods — including `GetActiveSessionAsync`, polled every 30s — swallow 401s and never fire the event; (b) `Logout()` is not idempotent so concurrent 401s fire the event repeatedly; (c) **`SessionManager.TriggerResyncAsync()` interprets the null returned by an unauthenticated `GetActiveSessionAsync()` as "session stopped on another device" and kills the local session + disengages blocking (`SessionManager.cs:221-236`)** — revocation currently destroys an active focus session, the exact opposite of the spec guarantee.

## Global Constraints

- `npm run lint` must return **zero errors** (warnings OK) before any push — CI hard-fails on errors.
- `npm run build` must pass locally before push.
- All 3 suites stay green: 115 Vitest (`cd web-app && npm test`), 94 xUnit (`cd desktop-app && dotnet test`), 12 Playwright specs.
- Never use `<a href>` for internal Next.js navigation — `<Link>` only.
- Timer rule: never `prev - 1` countdowns; anchor to server `startTime` (not changed by this plan, don't regress it).
- Chrome and Firefox extension directories are fully independent copies — every extension change is made in BOTH `browser-extension/chrome/` and `browser-extension/firefox/` (Firefox uses `browser.*` namespace, Chrome uses `chrome.*`).
- Desktop nullable is enabled; match existing Serilog `Log.Warning/Error` style.
- Commit messages: conventional commits, no Co-Authored-By lines.

---

### Task 1: `POST /api/auth/logout-all` endpoint (web)

**Files:**
- Create: `web-app/src/app/api/auth/logout-all/route.ts`
- Create: `web-app/src/app/api/auth/logout-all/route.test.ts`
- Modify: `web-app/openapi.yaml` (add endpoint entry under the Auth tag, matching existing entry style)

**Interfaces:**
- Consumes: `getAuthUserId(request)`, `revokeUserTokens(userId)` from `@/lib/jwt`; `rateLimit(key, limit, windowMs)` from `@/lib/rate-limit`; `prisma` from `@/lib/prisma`.
- Produces: `POST /api/auth/logout-all` — bearer-auth'd, no body, returns `204` on success, `401` unauthenticated, `429` rate-limited. Tasks 2, 7, 8 call this endpoint.

- [ ] **Step 1: Write the failing test**

Check `web-app/vitest.config.ts` (or `vite.config.ts`) resolves the `@/` alias; if not, add `resolve: { alias: { '@': path.resolve(__dirname, 'src') } }`.

```ts
// web-app/src/app/api/auth/logout-all/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { update: vi.fn() } },
}));
vi.mock('@/lib/jwt', () => ({
  getAuthUserId: vi.fn(),
  revokeUserTokens: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

import { POST } from './route';
import { prisma } from '@/lib/prisma';
import { getAuthUserId, revokeUserTokens } from '@/lib/jwt';
import { rateLimit } from '@/lib/rate-limit';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/auth/logout-all', { method: 'POST' });
}

describe('POST /api/auth/logout-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetInMs: 0 });
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(getAuthUserId).mockResolvedValue('user-1');
    vi.mocked(rateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetInMs: 60000 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('bumps tokenVersion, busts the cache, and returns 204', async () => {
    vi.mocked(getAuthUserId).mockResolvedValue('user-1');
    const res = await POST(makeRequest());
    expect(res.status).toBe(204);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenVersion: { increment: 1 } },
    });
    expect(revokeUserTokens).toHaveBeenCalledWith('user-1');
  });

  it('returns 500 when the DB update throws', async () => {
    vi.mocked(getAuthUserId).mockResolvedValue('user-1');
    vi.mocked(prisma.user.update).mockRejectedValue(new Error('db down'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web-app && npx vitest run src/app/api/auth/logout-all/route.test.ts`
Expected: FAIL — cannot resolve `./route`

- [ ] **Step 3: Write the route**

```ts
// web-app/src/app/api/auth/logout-all/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId, revokeUserTokens } from '@/lib/jwt';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * Log out of all devices: bump the user's tokenVersion so every token minted
 * before now fails the `tv` check in getAuthUserId, then bust the Redis cache
 * so the new version takes effect immediately. The caller clears its own
 * stored token after a 204.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 5 per hour per user
    const rl = await rateLimit(`logout-all:${userId}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await revokeUserTokens(userId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error('Logout-all error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web-app && npx vitest run src/app/api/auth/logout-all/route.test.ts`
Expected: 4 PASS

- [ ] **Step 5: Add OpenAPI entry**

In `web-app/openapi.yaml`, add under paths (match the file's existing style for auth endpoints):

```yaml
  /api/auth/logout-all:
    post:
      tags: [Auth]
      summary: Log out of all devices
      description: Increments the user's tokenVersion, revoking every previously issued JWT.
      security:
        - bearerAuth: []
      responses:
        "204":
          description: All tokens revoked
        "401":
          description: Missing or invalid token
        "429":
          description: Rate limited (5/hour per user)
```

- [ ] **Step 6: Full web suite + lint**

Run: `cd web-app && npm test && npm run lint`
Expected: 119 tests pass (115 + 4 new), zero lint errors

- [ ] **Step 7: Commit**

```bash
git add web-app/src/app/api/auth/logout-all/ web-app/openapi.yaml web-app/vitest.config.ts
git commit -m "feat(auth): add POST /api/auth/logout-all endpoint bumping tokenVersion"
```

---

### Task 2: "Log out of all devices" button on web profile page

**Files:**
- Modify: `web-app/src/app/(app)/profile/page.tsx` (~line 920, next to the existing "Danger zone — Delete account" section)

**Interfaces:**
- Consumes: `POST /api/auth/logout-all` (Task 1); `getToken`, `removeToken`, `removeUserData` from `@/lib/auth-token`; the page's existing `router` and `onMessage({ type, text })` feedback pattern (see the delete-account handler at ~line 849-863).

- [ ] **Step 1: Read the existing danger-zone section**

Read `web-app/src/app/(app)/profile/page.tsx:840-956` to match the exact card/button component structure and the `onMessage` prop plumbing of the delete-account block.

- [ ] **Step 2: Add handler + UI**

Add a handler following the delete-account handler's shape:

```tsx
const handleLogoutAll = async () => {
  setLogoutAllBusy(true);
  try {
    const res = await fetch('/api/auth/logout-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onMessage({ type: 'error', text: data.error || 'Failed to log out of all devices.' });
      return;
    }
    removeToken();
    removeUserData();
    router.push('/auth/login');
  } finally {
    setLogoutAllBusy(false);
  }
};
```

with `const [logoutAllBusy, setLogoutAllBusy] = useState(false);` and a section above the Danger zone:

```tsx
<h2 className="...">Security</h2>
<p className="...">Signed in on another device you don't recognize? This signs you out everywhere, including this browser.</p>
<button onClick={handleLogoutAll} disabled={logoutAllBusy} className="...">
  {logoutAllBusy ? 'Logging out…' : 'Log out of all devices'}
</button>
```

Copy the Tailwind classes from the surrounding sections (heading, description, and a non-red variant of the danger button). Add `removeUserData` to the existing `@/lib/auth-token` import on line 5.

- [ ] **Step 3: Verify build + lint**

Run: `cd web-app && npm run lint && npm run build`
Expected: zero lint errors, build succeeds

- [ ] **Step 4: Commit**

```bash
git add "web-app/src/app/(app)/profile/page.tsx"
git commit -m "feat(web): log-out-of-all-devices button on profile page"
```

---

### Task 3: Playwright E2E — revocation kills the other session

**Files:**
- Create: `web-app/e2e/logout-all.spec.ts`

**Interfaces:**
- Consumes: `POST /api/auth/login`, `POST /api/auth/logout-all`, `GET /api/sessions` (any auth'd route works as the probe).

- [ ] **Step 1: Read an existing auth-using spec**

Read `web-app/e2e/auth.spec.ts` to learn how existing specs obtain test credentials / base URL (env vars, fixtures, or helpers). Reuse that mechanism verbatim.

- [ ] **Step 2: Write the spec**

API-level test (no browser UI needed — matches `api-health.spec.ts` style). Adapt the credential source to what Step 1 found; skip when credentials are absent, same as existing specs handle it:

```ts
// web-app/e2e/logout-all.spec.ts
import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL;      // adapt to the repo's actual convention
const PASSWORD = process.env.E2E_PASSWORD;

test.describe('logout-all revocation', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E credentials not configured');

  test('revokes a second token within one request', async ({ request }) => {
    const loginA = await request.post('/api/auth/login', {
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(loginA.ok()).toBeTruthy();
    const { token: tokenA } = await loginA.json();

    const loginB = await request.post('/api/auth/login', {
      data: { email: EMAIL, password: PASSWORD },
    });
    const { token: tokenB } = await loginB.json();

    // Both tokens work
    const probeB = await request.get('/api/sessions?limit=1', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(probeB.status()).toBe(200);

    // Logout-all with token A
    const revoke = await request.post('/api/auth/logout-all', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(revoke.status()).toBe(204);

    // Token B is now dead
    const probeBAfter = await request.get('/api/sessions?limit=1', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(probeBAfter.status()).toBe(401);

    // Token A is dead too (it was minted before the bump)
    const probeAAfter = await request.get('/api/sessions?limit=1', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(probeAAfter.status()).toBe(401);
  });
});
```

- [ ] **Step 3: Run the spec**

Run: `cd web-app && npx playwright test e2e/logout-all.spec.ts`
Expected: PASS (or SKIP if credentials unavailable locally — in that case run the full existing suite to confirm nothing broke: `npx playwright test`)

- [ ] **Step 4: Commit**

```bash
git add web-app/e2e/logout-all.spec.ts
git commit -m "test(e2e): logout-all revokes concurrent tokens"
```

---

### Task 4: Desktop — idempotent Logout + 401 detection in silent methods

**Files:**
- Modify: `desktop-app/Services/ApiClient.cs`
- Test: `desktop-app/FlowShield.Desktop.Tests/ApiClientTests.cs`

**Interfaces:**
- Consumes: existing test helpers in `ApiClientTests.cs` — `BuildClient(Mock<IDatabaseService>, FakeHttpHandler)`, `AuthenticatedDb()`, `FakeHttpHandler(HttpStatusCode, string)`.
- Produces: `ApiClient.Logout()` becomes idempotent (fires `SessionExpired` at most once per authenticated period); every API method that receives a 401 clears auth state and fires the event. Task 5 and 6 depend on the single-fire guarantee.

- [ ] **Step 1: Write failing tests**

Append to `ApiClientTests.cs`, following its existing patterns:

```csharp
[Fact]
public void Logout_CalledTwice_RaisesSessionExpiredOnce()
{
    var client = BuildClient(AuthenticatedDb(), new FakeHttpHandler());
    var fired = 0;
    client.SessionExpired += (_, _) => fired++;

    client.Logout();
    client.Logout();

    Assert.Equal(1, fired);
    Assert.False(client.IsAuthenticated());
}

[Fact]
public async Task GetActiveSession_On401_ClearsTokenAndRaisesSessionExpired()
{
    var handler = new FakeHttpHandler(HttpStatusCode.Unauthorized, "");
    var client = BuildClient(AuthenticatedDb(), handler);
    var fired = 0;
    client.SessionExpired += (_, _) => fired++;

    var result = await client.GetActiveSessionAsync();

    Assert.Null(result);
    Assert.False(client.IsAuthenticated());
    Assert.Equal(1, fired);
}

[Fact]
public async Task GetUserPreferences_On401_ClearsTokenAndRaisesSessionExpired()
{
    var handler = new FakeHttpHandler(HttpStatusCode.Unauthorized, "");
    var client = BuildClient(AuthenticatedDb(), handler);
    var fired = 0;
    client.SessionExpired += (_, _) => fired++;

    var result = await client.GetUserPreferencesAsync();

    Assert.Null(result);
    Assert.False(client.IsAuthenticated());
    Assert.Equal(1, fired);
}
```

NOTE: if an existing test asserts `GetActiveSessionAsync` returns null on 401 WITHOUT the event (there is a 401 test near line 128), keep its return-value assertion and update its expectations to the new behavior rather than deleting it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd desktop-app && dotnet test --filter "FullyQualifiedName~ApiClientTests"`
Expected: the 3 new tests FAIL (event count 0 or 2, token not cleared)

- [ ] **Step 3: Implement**

In `ApiClient.cs`:

(a) Make `Logout()` (line 729) idempotent:

```csharp
public void Logout()
{
    // Idempotent: concurrent 401s from parallel requests must not re-fire
    // SessionExpired or thrash the DB settings.
    if (string.IsNullOrEmpty(_authToken)) return;

    _authToken = null;
    _httpClient.DefaultRequestHeaders.Remove("Authorization");
    _dbService.SaveSetting("AuthToken", string.Empty);
    _dbService.SaveSetting("UserId", string.Empty);

    SessionExpired?.Invoke(this, EventArgs.Empty);
}
```

(b) Add a helper near `Logout()`:

```csharp
/// <summary>
/// Detects a 401 response, clears auth state, and raises SessionExpired
/// (once, via the idempotent Logout). Returns true when the response was
/// a 401 and has been handled.
/// </summary>
private bool HandleUnauthorized(HttpResponseMessage response)
{
    if (response.StatusCode != HttpStatusCode.Unauthorized) return false;
    Logout();
    return true;
}
```

(c) In every silent-null method, insert the check between receiving the response and the `IsSuccessStatusCode` check. Pattern:

```csharp
var response = await _httpClient.GetAsync("...");
if (HandleUnauthorized(response)) return null;
if (!response.IsSuccessStatusCode) return null;
```

Apply to: `GetActiveSessionAsync` (:185), `GetUserPreferencesAsync` (:360), `GetAnalyticsAsync` (:459), `GetSessionHistoryAsync` (:472), `GetGoalsAsync` (:486), `GetProjectsAsync` (:525), `UpdatePreferencesAsync` (:574), `GetLeaderboardAsync` (:589), `GetTeamsAsync` (:642), `GetCategoryRulesAsync` (:714), and `EndSessionAsync` (:290 — returns `false` instead of `null`), `RegisterDeviceAsync` (:403 — returns `false`).

Leave the mutation paths (`SyncActivitiesAsync`, `StartSessionAsync`, `TogglePauseAsync`, `SetGoalAsync`, `CreateProjectAsync`, `CreateTeamAsync`, `JoinTeamAsync`) as they are — they already `Logout()` + throw, and the idempotent `Logout()` now de-duplicates the event.

- [ ] **Step 4: Run the full desktop suite**

Run: `cd desktop-app && dotnet test`
Expected: all pass (94 existing + 3 new = 97; adjust count if Step 1's NOTE modified a test)

- [ ] **Step 5: Commit**

```bash
git add desktop-app/Services/ApiClient.cs desktop-app/FlowShield.Desktop.Tests/ApiClientTests.cs
git commit -m "fix(desktop): detect 401 in all API calls; make Logout idempotent"
```

---

### Task 5: Desktop — revocation must not kill the local session

**Files:**
- Modify: `desktop-app/Services/SessionManager.cs:205-263` (`TriggerResyncAsync`)
- Test: `desktop-app/FlowShield.Desktop.Tests/SessionManagerTests.cs`

**Interfaces:**
- Consumes: `IApiClient.IsAuthenticated()` — confirm the interface in `desktop-app/Interfaces/` declares it (the concrete `ApiClient` has it at :376); add to the interface if missing.
- Produces: `TriggerResyncAsync()` is a no-op while unauthenticated. This is what keeps the 30s poll from reading an auth-less `GetActiveSessionAsync() == null` as "session stopped remotely" (`SessionManager.cs:221-236`).

- [ ] **Step 1: Write the failing test**

Read `SessionManagerTests.cs` first to reuse its existing mock setup (it mocks `IApiClient`, `IActivityTracker`, `INotificationService`, `IWebsiteBlocker`, `IApplicationBlocker`). Then add:

```csharp
[Fact]
public async Task TriggerResync_WhenUnauthenticated_DoesNotCallApiOrTouchSession()
{
    // Arrange: manager with a mocked IApiClient that reports unauthenticated.
    // Reuse the test class's existing helper/builder for SessionManager.
    _apiClientMock.Setup(a => a.IsAuthenticated()).Returns(false);

    // Act
    await _sessionManager.TriggerResyncAsync();

    // Assert: the resync never even asks the server — a null active-session
    // response while logged out must not be mistaken for a remote stop.
    _apiClientMock.Verify(a => a.GetActiveSessionAsync(), Times.Never);
}
```

(Adapt field/builder names to the test class's existing conventions.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop-app && dotnet test --filter "FullyQualifiedName~SessionManagerTests"`
Expected: new test FAILS (`GetActiveSessionAsync` was called once)

- [ ] **Step 3: Implement the guard**

At the top of `TriggerResyncAsync()` (`SessionManager.cs:205`):

```csharp
public async Task TriggerResyncAsync()
{
    // A missing/revoked token makes GetActiveSessionAsync return null, which
    // the logic below would misread as "session stopped on another device"
    // and kill the local session + disengage blocking. Never resync while
    // unauthenticated — the local session must survive token revocation.
    if (!_apiClient.IsAuthenticated()) return;

    try
    {
        ...existing body unchanged...
```

If `IApiClient` lacks `IsAuthenticated()`, add `bool IsAuthenticated();` to the interface — the concrete implementation already exists.

- [ ] **Step 4: Run the full desktop suite**

Run: `cd desktop-app && dotnet test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add desktop-app/Services/SessionManager.cs desktop-app/FlowShield.Desktop.Tests/SessionManagerTests.cs desktop-app/Interfaces/
git commit -m "fix(desktop): keep local session alive when token is revoked mid-session"
```

---

### Task 6: Desktop — re-login prompt and post-login recovery

**Files:**
- Modify: `desktop-app/UI/TrayApplication.cs:642-648` (`OnSessionExpired`) and the login-success block at ~:422-435 (`ShowLoginDialog`)

**Interfaces:**
- Consumes: `SessionExpired` single-fire event (Task 4); existing `ShowLoginDialog()` at :422; `_syncService.Start()` / `SyncNowAsync()`; `_sessionManager.TriggerResyncAsync()`; `ConnectPusherAsync()`.
- Produces: user-visible re-login path — tray balloon on expiry, click opens login; successful re-login restarts sync (replays offline queue), resyncs session state, reconnects Pusher.

- [ ] **Step 1: Balloon prompt on expiry**

Replace `OnSessionExpired` (:642):

```csharp
private void OnSessionExpired(object? sender, EventArgs e)
{
    _syncService.Stop();
    _notificationService.NotifyLogout();
    BuildContextMenu();
    _trayIcon.ContextMenuStrip = _contextMenu;

    // Prompt re-login: balloon click opens the login dialog. Handler is
    // detached on fire so a later unrelated balloon doesn't open login.
    _trayIcon.BalloonTipClicked += OnSessionExpiredBalloonClicked;
    _trayIcon.ShowBalloonTip(10000, "FlowShield",
        "Session expired — click here to log in again.", ToolTipIcon.Warning);
}

private void OnSessionExpiredBalloonClicked(object? sender, EventArgs e)
{
    _trayIcon.BalloonTipClicked -= OnSessionExpiredBalloonClicked;
    ShowLoginDialog();
}
```

- [ ] **Step 2: Post-login recovery**

Read the `ShowLoginDialog` success block (~:424-435). After the existing register-device call, ensure ALL of the following happen (add whichever are missing):

```csharp
private void ShowLoginDialog()
{
    var loginForm = new LoginForm(_apiClient, _syncService, _dbService);
    if (loginForm.ShowDialog() == DialogResult.OK)
    {
        BuildContextMenu();
        _trayIcon.ContextMenuStrip = _contextMenu;

        RegisterDeviceAndLoadPreferencesAsync();

        // Recover from an expired-session period:
        _syncService.Start();                        // resume periodic sync; replays PendingOperations + unsynced logs
        _ = _sessionManager.TriggerResyncAsync();    // pick up session state changed while logged out
        ConnectPusherAsync();                        // real-time events need the fresh UserId setting
    }
}
```

Check `LoginForm` internals first — if it already restarts `_syncService`, don't double-start (a second `Start()` replaces the timer; verify `SyncService.Start` at `SyncService.cs:67-76` is safe to call twice or guard accordingly — it overwrites `_syncTimer` without disposing the old one, so if both call it, remove the duplicate from `LoginForm` or dispose before re-creating).

- [ ] **Step 3: Build + full suite**

Run: `cd desktop-app && dotnet build && dotnet test`
Expected: build clean, all tests pass

- [ ] **Step 4: Manual smoke (needs Windows)**

If on Windows: run the app, log in, revoke via web profile "Log out of all devices" (Task 2), wait ≤30s → balloon appears, session/blocking (if active) keep running, click balloon → login → sync resumes. If not on Windows, note this in the commit body as pending manual verification.

- [ ] **Step 5: Commit**

```bash
git add desktop-app/UI/TrayApplication.cs
git commit -m "feat(desktop): re-login balloon on session expiry; restart sync+pusher after re-login"
```

---

### Task 7: Mobile — 401 interceptor, error codes, logoutAll

**Files:**
- Modify: `mobile-app/src/lib/api.ts`

**Interfaces:**
- Consumes: existing `apiFetch`, `removeToken`, `removeStoredUser`; `POST /api/auth/logout-all` (Task 1).
- Produces (Task 8 depends on these exact names):
  - `class ApiError extends Error { code?: string; status: number }` (exported; `AuthError` stays for login)
  - `export function setOnUnauthorized(handler: () => void): void` — module-level callback fired on 401
  - `api.logoutAll(): Promise<void>`

- [ ] **Step 1: Add ApiError + interceptor**

In `api.ts`, after the `AuthError` class (:19-26):

```ts
/** Non-auth API error that preserves HTTP status and the API's error code. */
export class ApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Fired when any authenticated call gets a 401 (token expired or revoked).
// AuthProvider registers a handler that flags the session as expired.
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(handler: () => void): void {
  onUnauthorized = handler;
}
```

Modify `apiFetch` (:80-94) to intercept:

```ts
async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // 401 on an authenticated call = token expired or revoked. Login itself
  // returns 401 for bad credentials — that's not a session expiry.
  if (res.status === 401 && token && !path.startsWith('/api/auth/login')) {
    await removeToken();
    onUnauthorized?.();
  }

  return res;
}
```

- [ ] **Step 2: Preserve error codes on all methods**

Replace every generic `throw new Error('Failed to ...')` in `api.ts` with the ApiError pattern. Example for `getAnalytics` (:132) — apply the same shape to `getSessions` (:138), `startSession` (:152-155, currently half-done), `endSession` (:168), `cancelSession` (:180), `syncActivity` (:197):

```ts
if (!res.ok) {
  const data = await res.json().catch(() => ({}));
  throw new ApiError(data.error || 'Failed to fetch analytics', res.status, data.code);
}
```

(Keep `AuthError` in `login` — screens already match on it.)

- [ ] **Step 3: Add logoutAll**

In the `api` object, after `logout` (:124):

```ts
async logoutAll(): Promise<void> {
  const res = await apiFetch('/api/auth/logout-all', { method: 'POST' });
  // 401 means the token was already dead — that's still "logged out everywhere".
  if (!res.ok && res.status !== 401) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || 'Failed to log out of all devices', res.status, data.code);
  }
  await removeToken();
  await removeStoredUser();
},
```

- [ ] **Step 4: Typecheck**

Run: `cd mobile-app && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add mobile-app/src/lib/api.ts
git commit -m "feat(mobile): 401 interceptor, ApiError codes, logoutAll"
```

---

### Task 8: Mobile — session-expired banner + logout-all in Settings

**Files:**
- Modify: `mobile-app/src/lib/auth.tsx`
- Modify: `mobile-app/App.tsx` (or wherever the navigator is rendered under `AuthProvider` — read it first)
- Modify: `mobile-app/src/screens/SettingsScreen.tsx`

**Interfaces:**
- Consumes: `setOnUnauthorized`, `api.logoutAll`, `ApiError` (Task 7).
- Produces: `useAuth()` additionally returns `sessionExpired: boolean` and `logoutAll: () => Promise<void>`.

- [ ] **Step 1: Extend the auth context**

In `auth.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, User, setOnUnauthorized } from './api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  sessionExpired: false,
  login: async () => {},
  logout: async () => {},
  logoutAll: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    // Flag expiry instead of hard-logout: a running focus timer must keep
    // running; the user re-authenticates via the banner when they choose.
    setOnUnauthorized(() => setSessionExpired(true));
    (async () => {
      try {
        const token = await api.getToken();
        if (token) {
          const stored = await api.getStoredUser();
          if (stored) {
            setUser(stored);
          }
        }
      } catch {
        // Token invalid or storage error
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const { user: u } = await api.login(email, password);
    setUser(u);
    setSessionExpired(false);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setSessionExpired(false);
  };

  const logoutAll = async () => {
    await api.logoutAll();
    setUser(null);
    setSessionExpired(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, login, logout, logoutAll }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 2: Global expired banner**

Read `App.tsx` / `AppNavigator.tsx` to find the component INSIDE `AuthProvider` that renders the navigator. Add there (colors from `src/lib/theme.ts`):

```tsx
const { sessionExpired, user, logout } = useAuth();
...
{sessionExpired && user && (
  <TouchableOpacity
    style={{ backgroundColor: '#f59e0b', paddingVertical: 10, paddingHorizontal: 16 }}
    onPress={() => { logout(); }}
  >
    <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>
      Session expired — tap to log in again
    </Text>
  </TouchableOpacity>
)}
```

Rendered above the navigator so it shows on every screen, including a running timer. Tapping calls `logout()` → `user` null → navigator lands on LoginScreen. Match the file's existing style conventions (StyleSheet vs inline).

- [ ] **Step 3: Settings row**

In `SettingsScreen.tsx`, add a row (match existing row styling) with confirm dialog:

```tsx
const { logoutAll } = useAuth();

const handleLogoutAll = () => {
  Alert.alert(
    'Log out of all devices?',
    'This signs you out everywhere, including this phone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out everywhere',
        style: 'destructive',
        onPress: async () => {
          try {
            await logoutAll();
          } catch {
            Alert.alert('Error', 'Could not log out of all devices. Check your connection.');
          }
        },
      },
    ]
  );
};
```

- [ ] **Step 4: Typecheck + manual verify**

Run: `cd mobile-app && npx tsc --noEmit`
Expected: no errors.
Manual (Expo Go): log in on phone → revoke from web profile → next API call (open Dashboard) shows banner; if a timer is running it keeps counting; tap banner → login screen; log back in → banner gone. Settings → "Log out of all devices" → lands on login.

- [ ] **Step 5: Commit**

```bash
git add mobile-app/src/lib/auth.tsx mobile-app/App.tsx mobile-app/src/navigation/ mobile-app/src/screens/SettingsScreen.tsx
git commit -m "feat(mobile): session-expired banner and log-out-of-all-devices"
```

---

### Task 9: Extension (Chrome) — preserve pending logs across 401, replay after re-login

**Files:**
- Modify: `browser-extension/chrome/background.js`
- Modify: `browser-extension/chrome/popup/popup.js:116-119` (logout button)

**Interfaces:**
- Consumes: existing `pendingLogs` array, `syncActivities()` (:103-127), `flushCurrentTab()` (:74-90), message handlers (:221-266).
- Produces: `pendingLogs` persisted to `chrome.storage.local` (key `pendingLogs`, max 500 newest), restored on worker start; new `LOGOUT` message that syncs-then-clears; `TOKEN_UPDATED` replays preserved logs.

- [ ] **Step 1: Persistence helpers**

In `background.js` after the state block (:16):

```js
const MAX_PENDING_LOGS = 500; // matches desktop's offline-queue bound

async function persistPendingLogs() {
  if (pendingLogs.length > MAX_PENDING_LOGS) {
    pendingLogs = pendingLogs.slice(-MAX_PENDING_LOGS); // keep newest
  }
  await chrome.storage.local.set({ pendingLogs });
}

async function restorePendingLogs() {
  const { pendingLogs: stored } = await chrome.storage.local.get('pendingLogs');
  if (Array.isArray(stored) && stored.length) {
    pendingLogs = [...stored, ...pendingLogs];
  }
}
```

- [ ] **Step 2: Stop discarding on 401; persist on every outcome**

Replace the body of `syncActivities()` (:103-127):

```js
async function syncActivities() {
  const token = await getToken();
  if (!token || !pendingLogs.length) return;

  const logsToSend = [...pendingLogs];
  pendingLogs = [];

  try {
    const res = await fetch(`${API_BASE}/api/activity/sync`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ source: 'browser', activities: logsToSend }),
    });
    if (res.status === 401) {
      // Token expired/revoked — clear it so popup shows login, but KEEP the
      // logs: they sync after re-login (TOKEN_UPDATED triggers a replay).
      await chrome.storage.local.remove('token');
      pendingLogs = [...logsToSend, ...pendingLogs];
    } else if (!res.ok) {
      // Transient error — put logs back for next sync
      pendingLogs = [...logsToSend, ...pendingLogs];
    }
  } catch {
    pendingLogs = [...logsToSend, ...pendingLogs];
  }

  // Persist survivors so an MV3 worker restart doesn't lose them.
  await persistPendingLogs();
}
```

- [ ] **Step 3: Replay after re-login + restore on startup**

In the `TOKEN_UPDATED` handler (:231-242), add a sync after the session fetch:

```js
  if (msg.type === 'TOKEN_UPDATED') {
    (msg.token
      ? chrome.storage.local.set({ token: msg.token })
      : Promise.resolve()
    ).then(async () => {
      await fetchActiveSession();
      await fetchUserPreferences();
      await syncActivities(); // replay logs preserved across the logged-out period
    });
    sendResponse({ ok: true });
    return true;
  }
```

In the init IIFE (:270-281), add `await restorePendingLogs();` as the first statement inside.

- [ ] **Step 4: Voluntary logout = final sync, then clear everything**

Add a `LOGOUT` message handler in `background.js` (next to `TOKEN_CLEARED`, which stays for backward compat):

```js
  if (msg.type === 'LOGOUT') {
    (async () => {
      // Explicit logout: last-chance sync while the token still works,
      // then clear all auth + buffered state.
      flushCurrentTab();
      await syncActivities();
      pendingLogs = [];
      await chrome.storage.local.remove(['token', 'user', 'pendingLogs']);
      activeSession = null;
      updateBadge();
      sendResponse({ ok: true });
    })();
    return true;
  }
```

In `popup/popup.js` replace the logout handler (:116-119):

```js
btnLogout.addEventListener('click', async () => {
  await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'LOGOUT' }, resolve)
  );
  showScreen('auth');
});
```

- [ ] **Step 5: Manual verification (Chrome)**

Load unpacked `browser-extension/chrome/`. Log in, browse a few sites, then revoke from web profile. Within ~1min: badge clears, popup shows login, and `chrome.storage.local.get('pendingLogs')` (inspect service worker console) shows preserved entries. Log back in via popup → entries sync (storage empties). Explicit logout → storage token+pendingLogs both empty.

- [ ] **Step 6: Commit**

```bash
git add browser-extension/chrome/
git commit -m "fix(extension/chrome): preserve unsynced logs across 401, replay after re-login"
```

---

### Task 10: Extension (Firefox) — same changes as Task 9

**Files:**
- Modify: `browser-extension/firefox/background.js`
- Modify: `browser-extension/firefox/popup/popup.js` (logout button)

**Interfaces:**
- Same as Task 9. Firefox uses the `browser.*` namespace and MV2 event-page background; the logic is identical.

- [ ] **Step 1: Port all four Task 9 changes**

Apply the exact Task 9 diffs to the Firefox copies, substituting `chrome.` → `browser.` throughout (the Firefox files already use `browser.*` — match the file's existing namespace usage, not Task 9's literal text). The Firefox popup's logout button and `TOKEN_UPDATED`/init flows mirror Chrome's; the Firefox-only `loadTokenFromPage()` (`firefox/popup/popup.js:60-93`) is untouched.

- [ ] **Step 2: Manual verification (Firefox)**

`about:debugging` → Load Temporary Add-on → `browser-extension/firefox/manifest.json`. Repeat the Task 9 Step 5 checklist.

- [ ] **Step 3: Build both zips**

Run: `cd browser-extension && npm run build`
Expected: `dist/flowshield-chrome-*.zip` and `dist/flowshield-firefox-*.zip` build cleanly

- [ ] **Step 4: Commit**

```bash
git add browser-extension/firefox/
git commit -m "fix(extension/firefox): preserve unsynced logs across 401, replay after re-login"
```

---

### Task 11: Final verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Web**

Run: `cd web-app && npm run lint && npm run build && npm test && npx playwright test`
Expected: zero lint errors; build passes; 119 unit tests; 13 E2E specs (12 + logout-all)

- [ ] **Step 2: Desktop**

Run: `cd desktop-app && dotnet test`
Expected: all tests pass (97+)

- [ ] **Step 3: Mobile**

Run: `cd mobile-app && npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Cross-device manual checklist (spec success criteria)**

- [ ] Web profile → "Log out of all devices" → own browser lands on login
- [ ] Second web session's next request 401s → redirected to login
- [ ] Desktop (Windows): balloon ≤30s after revocation; active session + blocking untouched; balloon click → login → queued activities sync
- [ ] Mobile: banner appears; running timer keeps counting; re-login replays offline queue
- [ ] Extension (both): popup shows login ≤30s; pendingLogs preserved; re-login syncs them

- [ ] **Step 5: Record any deviations**

If any check fails, fix before proceeding; do not mark the plan complete with failing checks. Then update `RELEASE_NOTES.md` if the repo's convention includes unreleased entries (check first).
