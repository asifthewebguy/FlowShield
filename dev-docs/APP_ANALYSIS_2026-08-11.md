# FlowShield — Full App Analysis (2026-08-11)

Branch: `feat/token-revocation` · Analysis by 4 parallel code explorers (web, desktop, mobile+extension, cross-surface).

---

## 1. Feature Matrix

| Feature | Web | Desktop | Mobile | Extension |
|---------|-----|---------|--------|-----------|
| Sessions: start/stop | ✅ | ✅ | ✅ | ❌ (read-only) |
| Sessions: pause/resume | ✅ | ⚠️ partial (blocking not restored) | ❌ | ❌ |
| Active session fetch | ✅ | ✅ | ✅ | ✅ |
| Activity sync | ✅ | ✅ | ✅ | ✅ |
| Category normalization | ✅ `resolveCategory` | ✅ `NormalizeCategory` | ❌ raw pass-through | ✅ `categoryForDomain` |
| Analytics | ✅ | ❌ stub | ✅ | ❌ |
| Goals | ✅ | ❌ stub | unclear | ❌ |
| Projects | ✅ | ❌ stub | unclear | ❌ |
| Teams | ✅ | ❌ stub | ❌ | ❌ |
| AI Coach | ✅ | ⚠️ partial (SSE works, no context) | ❌ | ❌ |
| Token revocation (tokenVersion) | ✅ | ❌ | ❌ | ❌ |
| 401 handling UX | ✅ | ⚠️ throws, no re-login UI | ⚠️ generic error | ✅ clears token |
| EMAIL_NOT_VERIFIED surfaced | ✅ | ✅ | ✅ | ❌ |
| Timer: server-anchored | ✅ | ✅ | ❌ local countdown | ❌ |
| Signup | ✅ | ❌ | ❌ (redirects to web) | ❌ |
| Google OAuth | ✅ | ❌ | ❌ | ❌ |

---

## 2. Web App

### Capabilities
- **Auth:** signup + email verification, login (rate-limited 10/15min), password reset (token-based, tokenVersion bump), forgot password, resend verification, Google OAuth, token revocation via tokenVersion
- **Sessions:** CRUD, pause/toggle, auto-end with 5min grace, 409 on concurrent active session, duration capping vs clock-skew abuse
- **Analytics:** weekly/monthly/yearly, Redis-cached, distraction + peak-time detection
- **Teams:** CRUD, role-based member removal, self-leave, cascade delete
- **Goals:** create/list/upsert, 4 types (DAILY_TIME, WEEKLY_TIME, STREAK, PRODUCTIVITY_SCORE), one active per type
- **Projects:** CRUD with cost tracking (hourlyRate, budget, plannedHours), session linking
- **AI Coach:** Gemini SSE, tier-quota (FREE 1/month, PRO/TEAM unlimited), tiered caching
- **Admin:** user management, announcement/digest emails, settings, stats
- **Misc:** push notifications, weekly digest cron, data export, leaderboard, health check

### Missing Logic (with evidence)
| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| 1 | No `/api/auth/logout` endpoint — client-side only; can't revoke mid-session | 9 auth routes, no logout | HIGH |
| 2 | No token refresh/rotation | `login/route.ts` issues single JWT | MED |
| 3 | No email-change endpoint | `user/profile/route.ts` only updates name/timezone/prefs | MED |
| 4 | No `/api/goals/[id]` — can't delete individual goal | `goals/route.ts` POST/GET only | MED |
| 5 | Subscription tier not enforced anywhere except coach | `coach/advice/route.ts:93-120` only gate; 61 refs mostly logging | HIGH |
| 6 | Rate limiting only on auth routes — analytics/export/leaderboard/activity unprotected | `rate-limit.ts` used in auth only | HIGH |
| 7 | Pagination missing/inconsistent — goals no limit, analytics unbounded date-fill | `goals/route.ts`, `leaderboard/route.ts:57` | MED |
| 8 | Password reset token stored **plaintext** in DB | `reset-password/route.ts:36` `findUnique({passwordResetToken})` | HIGH (security) |
| 9 | `emailVerified` not enforced in protected routes — unverified accounts fully functional | `getAuthUserId()` no check | MED |
| 10 | Leaderboard exposes all users platform-wide (names + minutes) to any authed user | `leaderboard/route.ts:45-58` | MED (privacy) |
| 11 | No `subscriptionExpires` field — expire-subscriptions cron likely no-op; PRO never expires | schema + `cron/expire-subscriptions` | MED |
| 12 | No MFA/2FA | no TOTP schema/routes | LOW |
| 13 | No email unsubscribe endpoint — GDPR risk | admin sends emails, no opt-out handler | MED |
| 14 | No account recovery beyond password reset (email loss = permanent lock) | — | LOW |

### Incapabilities
- No payment integration (Stripe/Lemon Squeezy) — subs tracked, never billed or enforced
- No org/workspace hierarchy, no team goals/shared projects, no team invitations (code-join only)
- No recurring goals/habits, no calendar integration, no time-blocking
- No SSO/SAML, no audit logging, no data-retention policies
- No circuit breakers for Gemini/Pusher/Redis; no retry for failed notifications

---

## 3. Desktop App

### Capabilities
- Session start/stop with server-anchored timer; state persistence
- Activity tracking (keyboard/mouse hooks, categorization, per-session attribution)
- Website blocking (hosts file + admin check + DNS flush + stale-block recovery)
- App blocking (process kill enforcement)
- Cross-device sync (30s poll + Pusher, 4-case conflict handling)
- Offline queue (synced flag, exponential backoff, network-reconnect resync)
- Auth (bearer token, DB storage, 401 → SessionExpired event)
- Auto-update check, DPAPI key protection, autostart

### Missing Logic
| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| 1 | Pause/resume: **blocking NOT restored on resume** — acknowledged bug comment | `SessionManager.cs:99-100` | HIGH |
| 2 | 401 → Logout + event but no re-login UI; token has no stored expiry (reactive only) | `ApiClient.cs:702`, `ApiClient.cs:45-89` | HIGH |
| 3 | **8+ empty catch blocks** — silent state corruption | `DatabaseService.cs:455,486`, `SessionManager.cs:105,188,262`, `WebsiteBlocker.cs:108`, `ApiClient.cs` ×9 | HIGH |
| 4 | Multi-device race: simultaneous start on two devices → conflicting events; no mutex on `CurrentSession`/`IsPaused`/`IsRunning` triplet | `SessionManager.cs:210-235, 27-30` | MED |
| 5 | Admin check at EnableBlocking() call, not startup — no graceful degrade | `WebsiteBlocker.cs:191-193` | MED |
| 6 | Offline queue: no dedup — retried sync can double-count activities → inflated stats | `SyncService.cs`, `ApiClient.cs` | MED |
| 7 | DispatcherTimer (UI) + _reSyncTimer (system thread) uncoordinated — state flip-flop | `SessionManager.cs:60-62` | MED |
| 8 | Update: no rollback/atomic install — failed update can corrupt binary | `UpdateService.cs:80-180` | LOW |
| 9 | No tokenVersion awareness — revoked tokens work until server 401s | `ApiClient.cs` | HIGH |

### Incapabilities (roadmap sprints 14–18 undone)
| Feature | State |
|---------|-------|
| Pause/resume | PARTIAL/BROKEN (blocking loss) |
| Analytics dashboard | STUB — API method wired, UI doesn't load data |
| Goals | STUB — hardcoded test data in GoalsWindow |
| AI Coach | PARTIAL — SSE streams, no session context/personalization |
| Teams/Leaderboards | STUB — fetch works, no invite/join/sync, no data loading |
| Projects | STUB — window exists, no CRUD calls |

---

## 4. Mobile App

### Capabilities
- Login (email/password), auth persistence (SecureStore)
- Dashboard analytics (week/month), Focus Timer (15/25/45/60min, WORK/STUDY/CREATIVE)
- Timer pause/resume/cancel **local controls** (but no server pause endpoint call)
- Session history with scores/badges
- Offline activity queue with retry, push notifications (Expo)

### Missing Logic
| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| 1 | No in-app signup — redirects to flowshield.app | `LoginScreen.tsx:38` | MED |
| 2 | No Google OAuth | `auth.tsx` | LOW |
| 3 | **Timer local countdown — no server startTime anchor** — violates project timer rule; drift/sleep breaks it | `TimerScreen.tsx:55-80` | HIGH |
| 4 | No pause endpoint call — `toggle-pause` never invoked; can't see paused state from other devices | `api.ts` zero pause refs | HIGH |
| 5 | No token refresh; clears on failure only; generic errors lose codes | `api.ts:40-55` | MED |
| 6 | Offline queue unbounded — no max length/TTL (desktop has 500-cap/7d TTL; mobile doesn't) | `offlineQueue.ts:1-20` | MED |
| 7 | No iOS push config (Android channel only) | `notifications.ts:30-35` | MED |
| 8 | Settings toggles not persisted to API | `SettingsScreen.tsx:15-50` | LOW |
| 9 | No category normalization — raw pass-through to sync | `api.ts` | MED |
| 10 | No tokenVersion awareness | `api.ts` | HIGH |

### Incapabilities
- No signup, no OAuth, no server-anchored timing, no pause sync, no teams/coach/goals/projects

---

## 5. Browser Extension

### Capabilities
- Badge timer (remaining minutes), tab tracking + domain categorization
- 1-min activity sync alarm, 30s session poll, FORCE_POLL_SESSION
- Distraction detection vs user prefs
- Login/logout popup; 401 clears stale token
- Chrome MV3 + Firefox MV2 near-parity

### Missing Logic
| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| 1 | **Chrome popup calls MV2-only `browser.tabs.executeScript()`** — doesn't exist in MV3; should be `chrome.scripting.executeScript()` | `chrome/popup/popup.js:15-25` | HIGH (bug) |
| 2 | On 401: `pendingLogs = []` — **unsynced activity discarded** | `chrome/background.js` | MED |
| 3 | `pendingLogs` unbounded — no TTL/max size | `chrome/background.js:180-195` | MED |
| 4 | Sync retry: no backoff, no retry cap | `chrome/background.js:215-235` | MED |
| 5 | MV3 service worker suspension — no keepalive strategy for long idle | `chrome/manifest.json` | LOW |
| 6 | EMAIL_NOT_VERIFIED not surfaced (other clients fixed in #110) | popup.js | MED |
| 7 | No signup flow | popup.js:60-90 | LOW |

### Incapabilities
- Cannot start/stop/pause sessions from popup (read-only)
- Cannot edit blocklist/distractions from popup
- No token refresh, no offline backoff queue

---

## 6. Cross-Surface Gaps (highest-value fixes)

| Risk | Severity | Root cause |
|------|----------|-----------|
| Token revocation invisible to desktop/mobile/extension — revoked tokens keep working until next 401; desktop has no re-login UX at all | **CRITICAL** | tokenVersion only enforced server-side; clients don't handle revocation UX (relevant to current branch `feat/token-revocation`) |
| Mobile timer drift | HIGH | Local countdown, violates server-anchor rule all other surfaces follow |
| Pause state fragmentation | HIGH | Web ✅, desktop ⚠️ (blocking lost), mobile ❌, extension ❌ — pausing from web leaves mobile timer running blind |
| Desktop silent 401s | HIGH | Throws without SessionExpired invoke on several call paths (`ApiClient.cs:166,250,315`) |
| Category normalization ×3 implementations | MED | Desktop NormalizeCategory / web resolveCategory / mobile none → analytics fragmentation |
| Activity sync payload drift | MED | Zod optional-heavy schema silently drops fields; 3 clients send different shapes |
| Extension discards pending logs on 401 | MED | Data loss on token expiry |

---

## 7. Recommended Priority Order

1. **Finish token revocation across clients** (current branch): 401/revocation → clear token + re-login prompt on desktop/mobile/extension; add `/api/auth/logout`. Desktop: fire `SessionExpired` on all 401 paths.
2. **Fix Chrome popup MV2 API bug** (`browser.tabs.executeScript` → broken in MV3).
3. **Mobile timer server-anchoring** (known project gotcha, mobile violates it).
4. **Hash password reset tokens** in DB.
5. **Rate-limit non-auth routes** (analytics, export, leaderboard, activity sync).
6. **Desktop pause/resume blocking restore** (SessionManager.cs:99-100).
7. **Subscription enforcement or drop the tiers** — currently decorative outside coach.
8. Bound mobile + extension offline queues (mirror desktop's 500/7d).
