# Always-On Tracking + Privacy Opt-In (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The desktop tracks foreground activity whenever the app is running (not only inside a focus session), persists it locally, uploads it in the background, and lets the user opt out of sharing window titles and URLs with the server.

**Architecture:** The Tauri tracker becomes a long-lived task spawned at app setup. Its pure bucketing logic moves into a testable `step()` function. Each activity bucket is written to a new SQLite table `activity_local` as it opens, checkpointed every 30 seconds, and marked closed on window change, idle, pause, or an explicit flush. The existing 60-second `sync_worker` gains a second job: upload closed, unsynced rows to `/api/activity/sync`, redacting titles and URLs when the user's `shareWindowDetails` preference is `false`. Sessions stop owning the tracker; they only set `AppState.active_session_id`, which each bucket records when it opens. The web side adds the `shareWindowDetails` preference, exposes it in the profile page, and redacts on receipt as defence in depth.

**Tech Stack:** Rust 2021 (rust-version 1.77), Tauri 2, `rusqlite 0.32` bundled, `tokio 1`, `serde`, `tracing` — all already in `desktop-app-v3/src-tauri/Cargo.toml`, **no new crates**. Web: Next.js 16, Prisma, Zod, Vitest. Desktop frontend: React 19 + TypeScript + zustand.

**Spec:** [2026-09-03-wedge-roadmap.md](2026-09-03-wedge-roadmap.md) — Phase 1 section and its "Decisions locked" table.

## Global Constraints

- No new Cargo or npm dependencies.
- Do not edit any version field. release-please owns `desktop-app-v3/package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` versions.
- Rust tests run with `cd desktop-app-v3/src-tauri && cargo test --lib`. The crate links candle; the first build is slow (minutes). Use `cargo test --lib <module>::` filters for iteration.
- Desktop frontend must pass `cd desktop-app-v3 && npm run typecheck`.
- Web must pass `cd web-app && npm test`, `npm run lint` (zero errors), `npm run build`.
- Web tests never hit Redis: mock `@/lib/rate-limit` in any route test (see `.claude/rules/testing.md`).
- Commit messages: Conventional Commits. **No `Co-Authored-By` trailer.**
- Preference name is exactly `shareWindowDetails` (camelCase in JSON and Prisma), `share_window_details` in Rust.
- Redacted server value for a hidden title is the literal string `Hidden`; hidden URL is `null`.
- Default when the preference row is missing or unreadable on the **server**: share (`true`). Default on the **desktop** when preferences cannot be fetched: do not share (`false`). Reasoning: the server is authoritative and has the row; the desktop should fail closed.

## File structure

**Web (`web-app/`)**

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | add `shareWindowDetails Boolean @default(true)` to `UserPreferences` |
| `prisma/migrations/20260903000000_add_share_window_details/migration.sql` (create) | the ALTER TABLE |
| `src/lib/schemas.ts` (modify) | add field to `UpdatePreferencesSchema` and `UpdateProfileSchema.preferences` |
| `src/lib/schemas.test.ts` (modify) | tests for both schemas |
| `src/app/api/activity/sync/route.ts` (modify) | read preference, redact before `createMany` |
| `src/app/api/activity/sync/route.test.ts` (create) | redaction tests |
| `src/app/(app)/profile/page.tsx` (modify) | toggle UI |

**Desktop Rust (`desktop-app-v3/src-tauri/src/`)**

| File | Responsibility |
|---|---|
| `api/preferences.rs` (modify) | `share_window_details` field, `set_share_window_details()` PATCH |
| `api/activity.rs` (modify) | per-sample `session_id: Option<String>`; drop the `session_id` parameter |
| `tracker/mod.rs` (rewrite) | `ActivitySample.session_id`, pure `step()`, `TrackerConfig`, always-on loop with DB persistence, `flush()`; pure `IdleDetector` + `tracker-idle-started` / `tracker-idle-ended` events (Task 11) |
| `store/activity_local.rs` (create) | table + CRUD for persisted buckets |
| `store/mod.rs` (modify) | register migration, make `apply_migrations` `pub(crate)` |
| `activity_upload.rs` (create) | `redact()`, `resolve_share_flag()`, `upload_once()` |
| `sync_worker.rs` (modify) | pass prefs cache, call `upload_once` after legacy drain |
| `commands/sessions.rs` (modify) | set/clear `active_session_id`; flush + upload on end |
| `commands/preferences.rs` (modify) | cache prefs; new `prefs_set_share_window_details` |
| `commands/tracking.rs` (create) | `tracking_paused_get`, `tracking_set_paused` |
| `commands/mod.rs` (modify) | `pub mod tracking;` |
| `tray.rs` (modify) | `rebuild_menu()`, Pause/Resume item |
| `lib.rs` (modify) | new `AppState` fields, spawn tracker at setup (passing `app.handle().clone()` into `TrackerConfig.app`), register commands |

**Desktop frontend (`desktop-app-v3/src/`)**

| File | Responsibility |
|---|---|
| `lib/preferences.ts` (modify) | `shareWindowDetails` in the `Preferences` interface |
| `routes/SettingsTrackingPage.tsx` (create) | Pause tracking + Share window details toggles |
| `App.tsx` (modify) | route `/settings/tracking`; bootstrap the idle store and render `<IdlePrompt />` (Task 11) |
| `routes/DashboardPage.tsx` (modify) | header link to the new page |
| `lib/idle.ts` (create) | `useIdleStore`: listens to idle events, auto-pauses the active session, holds prompt state (Task 11) |
| `components/IdlePrompt.tsx` (create) | "Welcome back" dialog: Resume / End session / Keep it paused (Task 11) |

**Docs**

| File | Responsibility |
|---|---|
| `.claude/rules/desktop-app-v3.md`, `.claude/rules/gotchas.md`, `.claude/rules/testing.md`, `.claude/rules/web-app.md` (modify) | reflect always-on tracker, new commands, test commands |

## Interfaces summary (single source of truth for names and types)

Rust:

```rust
// tracker/mod.rs
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySample {
    pub application_name: String,
    pub process_name: String,
    pub window_title: String,
    pub url: Option<String>,
    pub timestamp: String,          // RFC 3339, bucket start
    pub duration_seconds: u64,
    #[serde(default)]
    pub session_id: Option<String>, // NEW
}
pub struct Observation { pub application_name: String, pub process_name: String, pub window_title: String }
pub enum Poll { Window(Observation), Idle, Unavailable }
pub enum Step { Nothing, Extended, Opened, Rotated(ActivitySample), Closed(ActivitySample) }
pub fn step(current: &mut Option<ActivitySample>, poll: Poll, session_id: Option<&str>, now_iso: &str) -> Step;
pub struct TrackerConfig { pub db: Db, pub active_session_id: Arc<tokio::sync::RwLock<Option<String>>>, pub paused: Arc<AtomicBool>, pub app: tauri::AppHandle /* Task 11 */ }
pub struct TrackerHandle { /* private */ }
impl TrackerHandle { pub fn spawn(cfg: TrackerConfig) -> Self; pub async fn flush(&self); }

// tracker/mod.rs — idle detection (Task 11)
pub struct IdlePayload { pub idle_seconds: u64 }           // serialised camelCase: { idleSeconds }
pub enum IdleTransition { Started(IdlePayload), Ended(IdlePayload) }
pub struct IdleDetector { /* private */ }
impl IdleDetector { pub fn observe(&mut self, idle_secs: u64) -> Option<IdleTransition>; }
// Tauri events emitted by the tracker loop: "tracker-idle-started", "tracker-idle-ended", payload IdlePayload

// store/activity_local.rs
pub struct LocalRow { pub id: i64, pub sample: ActivitySample }
pub fn migrate(conn: &Connection) -> AppResult<()>;
pub fn insert_open(db: &Db, sample: &ActivitySample) -> AppResult<i64>;
pub fn update_duration(db: &Db, id: i64, duration_seconds: u64) -> AppResult<()>;
pub fn close(db: &Db, id: i64, duration_seconds: u64) -> AppResult<()>;
pub fn close_all_open(db: &Db) -> AppResult<usize>;
pub fn closed_unsynced(db: &Db, limit: i64) -> AppResult<Vec<LocalRow>>;
pub fn mark_synced(db: &Db, ids: &[i64]) -> AppResult<()>;
pub fn purge_older_than(db: &Db, max_age_secs: i64) -> AppResult<usize>;

// activity_upload.rs
pub const UPLOAD_BATCH: i64 = 200;
pub const RETENTION_SECS: i64 = 90 * 24 * 60 * 60;
pub fn redact(samples: Vec<ActivitySample>, share_window_details: bool) -> Vec<ActivitySample>;
pub async fn resolve_share_flag(http: &reqwest::Client, token: &str, cache: &Arc<RwLock<Option<Preferences>>>) -> bool;
pub async fn upload_once(http: &reqwest::Client, token: &str, db: &Db, share_window_details: bool) -> AppResult<usize>;

// api/activity.rs
pub async fn sync_activity(http: &reqwest::Client, token: &str, samples: &[ActivitySample]) -> AppResult<SyncResult>;

// api/preferences.rs
pub struct Preferences { pub primary_distractions: Vec<String>, pub share_window_details: bool }
pub async fn get_preferences(http, token) -> AppResult<Preferences>;                 // exists
pub async fn set_share_window_details(http, token, enabled: bool) -> AppResult<Preferences>;

// lib.rs AppState — new fields
pub active_session_id: Arc<tokio::sync::RwLock<Option<String>>>,
pub tracking_paused: Arc<std::sync::atomic::AtomicBool>,
pub prefs_cache: Arc<tokio::sync::RwLock<Option<api::Preferences>>>,

// Tauri commands (frontend names)
prefs_load() -> Preferences
prefs_set_share_window_details(enabled: boolean) -> Preferences
tracking_paused_get() -> boolean
tracking_set_paused(paused: boolean) -> void
```

---

### Task 1: Web — `shareWindowDetails` preference (schema, migration, Zod)

**Files:**
- Modify: `web-app/prisma/schema.prisma:41-56`
- Create: `web-app/prisma/migrations/20260903000000_add_share_window_details/migration.sql`
- Modify: `web-app/src/lib/schemas.ts:51-59` and `:83-98`
- Test: `web-app/src/lib/schemas.test.ts`

**Interfaces:**
- Produces: Prisma field `UserPreferences.shareWindowDetails: Boolean @default(true)`; Zod fields `UpdatePreferencesSchema.shareWindowDetails?: boolean` and `UpdateProfileSchema.preferences.shareWindowDetails?: boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `web-app/src/lib/schemas.test.ts` (keep existing imports; add `UpdatePreferencesSchema, UpdateProfileSchema` to the import from `./schemas` if not already imported):

```ts
describe('shareWindowDetails preference', () => {
  it('UpdatePreferencesSchema accepts shareWindowDetails: false', () => {
    const r = UpdatePreferencesSchema.safeParse({ shareWindowDetails: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shareWindowDetails).toBe(false);
  });

  it('UpdatePreferencesSchema rejects a non-boolean shareWindowDetails', () => {
    const r = UpdatePreferencesSchema.safeParse({ shareWindowDetails: 'no' });
    expect(r.success).toBe(false);
  });

  it('UpdateProfileSchema accepts preferences.shareWindowDetails (strict object)', () => {
    const r = UpdateProfileSchema.safeParse({
      preferences: { primaryDistractions: [], shareWindowDetails: true },
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web-app && npx vitest run src/lib/schemas.test.ts -t shareWindowDetails`
Expected: the strict-object test FAILS (`Unrecognized key(s) in object: 'shareWindowDetails'`) and the first test's `r.data.shareWindowDetails` is `undefined` so its `toBe(false)` FAILS.

- [ ] **Step 3: Add the Prisma field**

In `web-app/prisma/schema.prisma`, inside `model UserPreferences`, after the `darkMode` line add:

```prisma
  shareWindowDetails  Boolean  @default(true)
```

- [ ] **Step 4: Write the migration**

Create `web-app/prisma/migrations/20260903000000_add_share_window_details/migration.sql`:

```sql
-- Add per-user privacy switch: when false, window titles and URLs are
-- redacted before storage (desktop strips on upload, server strips on receipt).
ALTER TABLE "user_preferences" ADD COLUMN "shareWindowDetails" BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 5: Validate and regenerate the client**

Run: `cd web-app && npx prisma validate && npx prisma generate`
Expected: both succeed with no output about errors.

- [ ] **Step 6: Add the Zod fields**

In `web-app/src/lib/schemas.ts`, in `UpdatePreferencesSchema` after `darkMode: z.boolean().optional(),` add:

```ts
  shareWindowDetails: z.boolean().optional(),
```

In `UpdateProfileSchema`, inside the `preferences: z.object({ ... })` after `darkMode: z.boolean().optional(),` add the same line:

```ts
      shareWindowDetails: z.boolean().optional(),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd web-app && npx vitest run src/lib/schemas.test.ts`
Expected: all tests in the file PASS.

- [ ] **Step 8: Commit**

```bash
cd web-app
git add prisma/schema.prisma prisma/migrations/20260903000000_add_share_window_details src/lib/schemas.ts src/lib/schemas.test.ts
git commit -m "feat(web): add shareWindowDetails user preference"
```

---

### Task 2: Web — redact titles and URLs on receipt when sharing is off

**Files:**
- Modify: `web-app/src/app/api/activity/sync/route.ts` (the `POST` handler, between `const { activities, source: rawSource } = parsed.data;` and `await prisma.activityLog.createMany(`)
- Test: `web-app/src/app/api/activity/sync/route.test.ts` (create)

**Interfaces:**
- Consumes: Prisma `UserPreferences.shareWindowDetails` from Task 1.
- Produces: stored `ActivityLog.windowTitle === 'Hidden'` and `url === null` whenever the user's preference is `false`, regardless of `source`.

- [ ] **Step 1: Write the failing tests**

Create `web-app/src/app/api/activity/sync/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(async () => ({ count: 1 })),
  prefsFindUnique: vi.fn(),
  categoryRuleFindMany: vi.fn(async () => []),
  triggerUserEvent: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    activityLog: { createMany: mocks.createMany },
    userPreferences: { findUnique: mocks.prefsFindUnique },
    categoryRule: { findMany: mocks.categoryRuleFindMany },
  },
}));
vi.mock('@/lib/jwt', () => ({ getAuthUserId: vi.fn(async () => 'user-1') }));
vi.mock('@/lib/pusher', () => ({ triggerUserEvent: mocks.triggerUserEvent }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/activity-sync', () => ({ resolveCategory: vi.fn(() => 'Work') }));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/activity/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const sample = {
  timestamp: '2026-09-03T10:00:00.000Z',
  applicationName: 'Code',
  processName: 'code',
  windowTitle: 'secret.ts - Visual Studio Code',
  url: 'https://example.com/private',
  durationSeconds: 120,
  sessionId: null,
};

function storedRows(): Array<{ windowTitle: string; url: string | null }> {
  const call = mocks.createMany.mock.calls[0] as unknown as [{ data: Array<{ windowTitle: string; url: string | null }> }];
  return call[0].data;
}

describe('POST /api/activity/sync privacy redaction', () => {
  beforeEach(() => {
    mocks.createMany.mockClear();
    mocks.prefsFindUnique.mockReset();
  });

  it('stores titles and urls when shareWindowDetails is true', async () => {
    mocks.prefsFindUnique.mockResolvedValue({ shareWindowDetails: true });
    const res = await POST(makeRequest({ activities: [sample], source: 'desktop' }));
    expect(res.status).toBe(200);
    expect(storedRows()[0].windowTitle).toBe('secret.ts - Visual Studio Code');
    expect(storedRows()[0].url).toBe('https://example.com/private');
  });

  it('replaces title with Hidden and url with null when shareWindowDetails is false', async () => {
    mocks.prefsFindUnique.mockResolvedValue({ shareWindowDetails: false });
    const res = await POST(makeRequest({ activities: [sample], source: 'browser' }));
    expect(res.status).toBe(200);
    expect(storedRows()[0].windowTitle).toBe('Hidden');
    expect(storedRows()[0].url).toBeNull();
  });

  it('defaults to sharing when the user has no preferences row', async () => {
    mocks.prefsFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ activities: [sample], source: 'desktop' }));
    expect(res.status).toBe(200);
    expect(storedRows()[0].windowTitle).toBe('secret.ts - Visual Studio Code');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web-app && npx vitest run src/app/api/activity/sync/route.test.ts`
Expected: the second test FAILS (`expected 'secret.ts - Visual Studio Code' to be 'Hidden'`). The others pass already.

- [ ] **Step 3: Implement the redaction**

In `web-app/src/app/api/activity/sync/route.ts`, directly after the line

```ts
    const { activities, source: rawSource } = parsed.data;
```

add:

```ts
    // Privacy switch. When the user turned off sharing, never persist window
    // titles or URLs — even from clients that did not strip them themselves.
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { shareWindowDetails: true },
    });
    const shareWindowDetails = prefs?.shareWindowDetails ?? true;
```

Then inside the existing `const activityLogs = activities.map((activity) => ({ ... }))` change these two properties:

```ts
      windowTitle: shareWindowDetails
        ? (activity.windowTitle || activity.url || 'Unknown')
        : 'Hidden',
      url: shareWindowDetails ? (activity.url || null) : null,
```

and in the same object's `category: resolveCategory(...)` call, wherever it passes `activity.windowTitle` pass `shareWindowDetails ? activity.windowTitle : undefined`, and wherever it passes `activity.url` pass `shareWindowDetails ? activity.url : undefined`. Leave every other argument untouched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web-app && npx vitest run src/app/api/activity/sync/route.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Lint and type-check**

Run: `cd web-app && npm run lint && npx tsc --noEmit`
Expected: zero lint errors, no type errors.

- [ ] **Step 6: Commit**

```bash
cd web-app
git add src/app/api/activity/sync/route.ts src/app/api/activity/sync/route.test.ts
git commit -m "feat(web): redact window titles and urls on sync when sharing is off"
```

---

### Task 3: Web — profile page toggle

**Files:**
- Modify: `web-app/src/app/(app)/profile/page.tsx` (form state initialiser around line 39, hydration around line 66, and the JSX after the primary-distractions `<Card>`)

**Interfaces:**
- Consumes: `UpdateProfileSchema.preferences.shareWindowDetails` (Task 1). The page already saves with `PUT /api/user/profile` sending `preferences: formData.preferences`.

- [ ] **Step 1: Add the field to form state**

Find the `useState` initialiser that contains `primaryDistractions: [] as string[],` (about line 39). Add, in the same `preferences` object:

```ts
      shareWindowDetails: true,
```

- [ ] **Step 2: Hydrate from the server**

Find the line `primaryDistractions: user.preferences?.primaryDistractions || [],` (about line 66). Add directly below it:

```ts
            shareWindowDetails: user.preferences?.shareWindowDetails ?? true,
```

- [ ] **Step 3: Add the toggle UI**

Find the `<Card>` that renders the distraction grid (it contains `getDistractionLabel(`). Immediately after that `</Card>` add:

```tsx
            <Card className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Activity privacy</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                The desktop app records which apps and windows you use. Choose whether
                window titles and page URLs are sent to FlowShield or stay on your computer.
              </p>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={formData.preferences.shareWindowDetails}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      preferences: { ...prev.preferences, shareWindowDetails: e.target.checked },
                    }))
                  }
                />
                <span>
                  <span className="font-medium">Share window titles and URLs</span>
                  <span className="block text-sm text-gray-600 dark:text-gray-400">
                    Off: only app names and durations are uploaded. Titles and URLs stay in the
                    local database on your computer, and any received are stored as &quot;Hidden&quot;.
                  </span>
                </span>
              </label>
            </Card>
```

If the page's state setter is not named `setFormData`, use the setter that pairs with `formData`.

- [ ] **Step 4: Type-check, lint, build**

Run: `cd web-app && npx tsc --noEmit && npm run lint && npm run build`
Expected: no type errors, zero lint errors, build succeeds.

- [ ] **Step 5: Manual check**

Run `cd web-app && npm run dev`, open `/profile`, toggle the checkbox off, click Save, reload. The checkbox stays off. `GET /api/user/preferences` returns `"shareWindowDetails": false`.

- [ ] **Step 6: Commit**

```bash
cd web-app
git add "src/app/(app)/profile/page.tsx"
git commit -m "feat(web): activity privacy toggle on profile page"
```

---

### Task 4: Desktop — `Preferences.share_window_details` + PATCH + cache

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/api/preferences.rs`
- Modify: `desktop-app-v3/src-tauri/src/commands/preferences.rs`
- Modify: `desktop-app-v3/src-tauri/src/lib.rs` (`AppState` struct and `AppState::new`, and the `generate_handler!` list)

**Interfaces:**
- Produces: `Preferences.share_window_details: bool` (serde default `true`); `api::preferences::set_share_window_details(http, token, enabled) -> AppResult<Preferences>`; `AppState.prefs_cache: Arc<RwLock<Option<api::Preferences>>>`; Tauri commands `prefs_load` (now caches) and `prefs_set_share_window_details(enabled: bool)`.

- [ ] **Step 1: Write the failing tests**

Append to `desktop-app-v3/src-tauri/src/api/preferences.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn share_window_details_defaults_to_true_when_missing() {
        let p: Preferences = serde_json::from_str(r#"{"primaryDistractions":["youtube"]}"#).unwrap();
        assert!(p.share_window_details);
        assert_eq!(p.primary_distractions, vec!["youtube".to_string()]);
    }

    #[test]
    fn share_window_details_parses_false() {
        let p: Preferences =
            serde_json::from_str(r#"{"primaryDistractions":[],"shareWindowDetails":false}"#).unwrap();
        assert!(!p.share_window_details);
    }

    #[test]
    fn default_impl_shares() {
        assert!(Preferences::default().share_window_details);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd desktop-app-v3/src-tauri && cargo test --lib api::preferences::`
Expected: compile error `no field share_window_details`.

- [ ] **Step 3: Implement the struct change and the PATCH call**

Replace the `Preferences` struct and add the patch function in `api/preferences.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    #[serde(default)]
    pub primary_distractions: Vec<String>,
    /// When false the desktop strips window titles + URLs before upload
    /// (and the server strips again on receipt). Missing in old API
    /// responses → treat as true, matching the server default.
    #[serde(default = "default_true")]
    pub share_window_details: bool,
}

fn default_true() -> bool {
    true
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            primary_distractions: Vec::new(),
            share_window_details: true,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SharePatch {
    share_window_details: bool,
}

/// PATCH /api/user/preferences with `{ shareWindowDetails }`. Returns the
/// updated preferences from the response envelope.
pub async fn set_share_window_details(
    http: &reqwest::Client,
    token: &str,
    enabled: bool,
) -> AppResult<Preferences> {
    let url = format!("{}/api/user/preferences", super::api_base_url());
    let res = http
        .patch(&url)
        .bearer_auth(token)
        .json(&SharePatch { share_window_details: enabled })
        .send()
        .await?;
    let status = res.status();
    if !status.is_success() {
        let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody { error: None, code: None });
        return Err(AppError::Api {
            status: status.as_u16(),
            message: body.error.unwrap_or_else(|| "Failed to update preferences".into()),
            code: body.code,
        });
    }
    let body: serde_json::Value = res.json().await?;
    if let Ok(env) = serde_json::from_value::<PreferencesEnvelope>(body.clone()) {
        return Ok(env.preferences);
    }
    Ok(serde_json::from_value::<Preferences>(body).unwrap_or_default())
}
```

Remove `Default` from the struct's `#[derive(...)]` list (it is now implemented by hand). Keep `get_preferences`, `PreferencesEnvelope`, and `ApiErrorBody` as they are.

- [ ] **Step 4: Add the cache to `AppState`**

In `desktop-app-v3/src-tauri/src/lib.rs`, add to `pub struct AppState` after `pub latest_update: ...`:

```rust
    /// Last preferences fetched from the API. Read by the upload job to
    /// decide whether to redact window titles. `None` until the first
    /// `prefs_load` (dashboard mount) or the first upload tick.
    pub prefs_cache: Arc<RwLock<Option<api::Preferences>>>,
```

and in `AppState::new()` add the initialiser:

```rust
            prefs_cache: Arc::new(RwLock::new(None)),
```

- [ ] **Step 5: Update the commands**

Replace the body of `desktop-app-v3/src-tauri/src/commands/preferences.rs` below the `token_or_err` helper with:

```rust
#[tauri::command]
pub async fn prefs_load(state: State<'_, AppState>) -> AppResult<Preferences> {
    let token = token_or_err(&state).await?;
    let prefs = api::preferences::get_preferences(&state.http, &token).await?;
    *state.prefs_cache.write().await = Some(prefs.clone());
    Ok(prefs)
}

#[tauri::command]
pub async fn prefs_set_share_window_details(
    state: State<'_, AppState>,
    enabled: bool,
) -> AppResult<Preferences> {
    let token = token_or_err(&state).await?;
    let prefs = api::preferences::set_share_window_details(&state.http, &token, enabled).await?;
    *state.prefs_cache.write().await = Some(prefs.clone());
    Ok(prefs)
}
```

Register the new command: in `lib.rs` inside `tauri::generate_handler![ ... ]`, next to the existing `commands::preferences::prefs_load,` add:

```rust
            commands::preferences::prefs_set_share_window_details,
```

- [ ] **Step 6: Run tests and build**

Run: `cd desktop-app-v3/src-tauri && cargo test --lib api::preferences:: && cargo build`
Expected: 3 tests PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
cd desktop-app-v3
git add src-tauri/src/api/preferences.rs src-tauri/src/commands/preferences.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): shareWindowDetails preference with cache and PATCH command"
```

---

### Task 5: Desktop — pure bucketing `step()` with session tagging

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/tracker/mod.rs` (add types and `step()`; leave the existing `TrackerHandle` untouched in this task)

**Interfaces:**
- Produces: `ActivitySample.session_id: Option<String>` (serde default), `Observation`, `Poll`, `Step`, `step()` exactly as in the Interfaces summary.

- [ ] **Step 1: Write the failing tests**

Append to `desktop-app-v3/src-tauri/src/tracker/mod.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn obs(app: &str, title: &str) -> Poll {
        Poll::Window(Observation {
            application_name: app.into(),
            process_name: format!("{app}.bin"),
            window_title: title.into(),
        })
    }

    const NOW: &str = "2026-09-03T10:00:00.000Z";

    #[test]
    fn first_window_opens_a_bucket() {
        let mut cur = None;
        let s = step(&mut cur, obs("Code", "main.rs"), Some("sess-1"), NOW);
        assert_eq!(s, Step::Opened);
        let b = cur.expect("bucket opened");
        assert_eq!(b.application_name, "Code");
        assert_eq!(b.window_title, "main.rs");
        assert_eq!(b.duration_seconds, 1);
        assert_eq!(b.timestamp, NOW);
        assert_eq!(b.session_id.as_deref(), Some("sess-1"));
    }

    #[test]
    fn same_window_extends() {
        let mut cur = None;
        step(&mut cur, obs("Code", "main.rs"), None, NOW);
        let s = step(&mut cur, obs("Code", "main.rs"), None, "later");
        assert_eq!(s, Step::Extended);
        assert_eq!(cur.unwrap().duration_seconds, 2);
    }

    #[test]
    fn window_change_rotates() {
        let mut cur = None;
        step(&mut cur, obs("Code", "main.rs"), None, NOW);
        let s = step(&mut cur, obs("Firefox", "docs"), None, "later");
        match s {
            Step::Rotated(prev) => {
                assert_eq!(prev.application_name, "Code");
                assert_eq!(prev.duration_seconds, 1);
            }
            other => panic!("expected Rotated, got {other:?}"),
        }
        let b = cur.unwrap();
        assert_eq!(b.application_name, "Firefox");
        assert_eq!(b.timestamp, "later");
    }

    #[test]
    fn session_change_rotates_even_for_same_window() {
        let mut cur = None;
        step(&mut cur, obs("Code", "main.rs"), None, NOW);
        let s = step(&mut cur, obs("Code", "main.rs"), Some("sess-1"), "later");
        assert!(matches!(s, Step::Rotated(_)));
        assert_eq!(cur.unwrap().session_id.as_deref(), Some("sess-1"));
    }

    #[test]
    fn idle_closes_and_clears() {
        let mut cur = None;
        step(&mut cur, obs("Code", "main.rs"), None, NOW);
        let s = step(&mut cur, Poll::Idle, None, "later");
        assert!(matches!(s, Step::Closed(_)));
        assert!(cur.is_none());
    }

    #[test]
    fn idle_with_nothing_open_is_nothing() {
        let mut cur = None;
        assert_eq!(step(&mut cur, Poll::Idle, None, NOW), Step::Nothing);
    }

    #[test]
    fn unavailable_keeps_current_untouched() {
        let mut cur = None;
        step(&mut cur, obs("Code", "main.rs"), None, NOW);
        let before = cur.clone();
        assert_eq!(step(&mut cur, Poll::Unavailable, None, "later"), Step::Nothing);
        assert_eq!(cur, before);
    }

    #[test]
    fn session_id_survives_json_roundtrip_and_defaults_to_none() {
        let old_payload = r#"{"applicationName":"a","processName":"a","windowTitle":"t","url":null,"timestamp":"x","durationSeconds":3}"#;
        let s: ActivitySample = serde_json::from_str(old_payload).unwrap();
        assert!(s.session_id.is_none());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd desktop-app-v3/src-tauri && cargo test --lib tracker::`
Expected: compile errors (`Observation`, `Poll`, `Step`, `step` not found; no field `session_id`).

- [ ] **Step 3: Implement the types and `step()`**

In `tracker/mod.rs`, change the `ActivitySample` derive and add the field:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySample {
    pub application_name: String,
    pub process_name: String,
    pub window_title: String,
    pub url: Option<String>,
    /// RFC 3339 — when the bucket started.
    pub timestamp: String,
    pub duration_seconds: u64,
    /// Focus session that was active when this bucket opened, if any.
    /// `default` keeps old queued payloads (no field) deserialisable.
    #[serde(default)]
    pub session_id: Option<String>,
}
```

Then add, above `pub struct TrackerHandle`:

```rust
/// What one poll of the OS told us.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Observation {
    pub application_name: String,
    pub process_name: String,
    pub window_title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Poll {
    /// A foreground window was read.
    Window(Observation),
    /// User is AFK (or tracking is paused) — close whatever is open.
    Idle,
    /// The OS could not tell us (pure Wayland, transient error) — leave
    /// the current bucket untouched rather than mis-attributing time.
    Unavailable,
}

/// Outcome of one tick. The caller persists accordingly.
#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    Nothing,
    /// `current` grew by one second.
    Extended,
    /// A new bucket was opened; nothing was closed.
    Opened,
    /// The previous bucket (returned) closed and a new one opened.
    Rotated(ActivitySample),
    /// The previous bucket (returned) closed; nothing is open now.
    Closed(ActivitySample),
}

/// Pure bucketing logic. Consecutive ticks on the same window *and* the
/// same session extend the bucket; anything else rotates or closes it.
pub fn step(
    current: &mut Option<ActivitySample>,
    poll: Poll,
    session_id: Option<&str>,
    now_iso: &str,
) -> Step {
    match poll {
        Poll::Unavailable => Step::Nothing,
        Poll::Idle => match current.take() {
            Some(prev) => Step::Closed(prev),
            None => Step::Nothing,
        },
        Poll::Window(obs) => {
            let same = current.as_ref().map_or(false, |s| {
                s.application_name == obs.application_name
                    && s.window_title == obs.window_title
                    && s.session_id.as_deref() == session_id
            });
            if same {
                let s = current.as_mut().expect("checked above");
                s.duration_seconds = s.duration_seconds.saturating_add(1);
                return Step::Extended;
            }
            let fresh = ActivitySample {
                application_name: obs.application_name,
                process_name: obs.process_name,
                window_title: obs.window_title,
                url: None,
                timestamp: now_iso.to_string(),
                duration_seconds: 1,
                session_id: session_id.map(str::to_string),
            };
            match current.replace(fresh) {
                Some(prev) => Step::Rotated(prev),
                None => Step::Opened,
            }
        }
    }
}
```

Inside the existing `TrackerHandle::spawn` loop, where a new `ActivitySample { ... }` literal is built, add `session_id: None,` so the old loop still compiles. (It is replaced in Task 8.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd desktop-app-v3/src-tauri && cargo test --lib tracker::`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
cd desktop-app-v3
git add src-tauri/src/tracker/mod.rs
git commit -m "feat(desktop): pure tracker bucketing step() with session tagging"
```

---

### Task 6: Desktop — `activity_local` SQLite table

**Files:**
- Create: `desktop-app-v3/src-tauri/src/store/activity_local.rs`
- Modify: `desktop-app-v3/src-tauri/src/store/mod.rs` (add `pub mod activity_local;`, call `activity_local::migrate(conn)?;` in `apply_migrations`, and change `fn apply_migrations` to `pub(crate) fn apply_migrations`)

**Interfaces:**
- Consumes: `ActivitySample` with `session_id` (Task 5), `store::Db`, `AppError::Storage`.
- Produces: every function in the Interfaces summary under `store/activity_local.rs`.

- [ ] **Step 1: Write the failing tests**

Create `desktop-app-v3/src-tauri/src/store/activity_local.rs` containing only the test module for now:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn test_db() -> Db {
        let conn = Connection::open_in_memory().unwrap();
        crate::store::apply_migrations(&conn).unwrap();
        Arc::new(Mutex::new(conn))
    }

    fn sample(app: &str, session: Option<&str>) -> ActivitySample {
        ActivitySample {
            application_name: app.into(),
            process_name: format!("{app}.bin"),
            window_title: "title".into(),
            url: None,
            timestamp: "2026-09-03T10:00:00.000Z".into(),
            duration_seconds: 1,
            session_id: session.map(str::to_string),
        }
    }

    #[test]
    fn open_rows_are_not_uploadable_until_closed() {
        let db = test_db();
        let id = insert_open(&db, &sample("Code", Some("s1"))).unwrap();
        assert!(closed_unsynced(&db, 10).unwrap().is_empty());
        update_duration(&db, id, 30).unwrap();
        assert!(closed_unsynced(&db, 10).unwrap().is_empty());
        close(&db, id, 42).unwrap();
        let rows = closed_unsynced(&db, 10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, id);
        assert_eq!(rows[0].sample.duration_seconds, 42);
        assert_eq!(rows[0].sample.session_id.as_deref(), Some("s1"));
        assert_eq!(rows[0].sample.application_name, "Code");
    }

    #[test]
    fn mark_synced_removes_from_upload_set() {
        let db = test_db();
        let a = insert_open(&db, &sample("A", None)).unwrap();
        let b = insert_open(&db, &sample("B", None)).unwrap();
        close(&db, a, 5).unwrap();
        close(&db, b, 6).unwrap();
        mark_synced(&db, &[a]).unwrap();
        let rows = closed_unsynced(&db, 10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, b);
    }

    #[test]
    fn closed_unsynced_respects_limit_and_order() {
        let db = test_db();
        for i in 0..5 {
            let id = insert_open(&db, &sample(&format!("app{i}"), None)).unwrap();
            close(&db, id, 1).unwrap();
        }
        let rows = closed_unsynced(&db, 3).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].sample.application_name, "app0");
        assert_eq!(rows[2].sample.application_name, "app2");
    }

    #[test]
    fn close_all_open_finalises_orphans() {
        let db = test_db();
        insert_open(&db, &sample("A", None)).unwrap();
        insert_open(&db, &sample("B", None)).unwrap();
        let closed_now = close_all_open(&db).unwrap();
        assert_eq!(closed_now, 2);
        assert_eq!(closed_unsynced(&db, 10).unwrap().len(), 2);
        assert_eq!(close_all_open(&db).unwrap(), 0);
    }

    #[test]
    fn purge_removes_only_old_rows() {
        let db = test_db();
        let old = insert_open(&db, &sample("old", None)).unwrap();
        close(&db, old, 1).unwrap();
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "UPDATE activity_local SET created_at = created_at - 200 WHERE id = ?1",
                rusqlite::params![old],
            )
            .unwrap();
        }
        let fresh = insert_open(&db, &sample("fresh", None)).unwrap();
        close(&db, fresh, 1).unwrap();
        assert_eq!(purge_older_than(&db, 100).unwrap(), 1);
        let rows = closed_unsynced(&db, 10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].sample.application_name, "fresh");
    }
}
```

- [ ] **Step 2: Wire the module and run tests to verify they fail**

In `store/mod.rs`: add `pub mod activity_local;` next to `pub mod ai;`, change `fn apply_migrations(conn: &Connection)` to `pub(crate) fn apply_migrations(conn: &Connection)`, and add `activity_local::migrate(conn)?;` directly after `ai::migrate(conn)?;`.

Run: `cd desktop-app-v3/src-tauri && cargo test --lib store::activity_local::`
Expected: compile errors (`migrate`, `insert_open`, … not found).

- [ ] **Step 3: Implement the module**

Prepend to `store/activity_local.rs` (above the test module):

```rust
//! Locally persisted activity buckets. The always-on tracker writes one
//! row per foreground-window bucket as it opens (`closed = 0`), checkpoints
//! its duration every 30 s, and finalises it (`closed = 1`) on window
//! change / idle / pause / flush. The upload job ships `closed = 1 AND
//! synced = 0` rows to `/api/activity/sync` and flips `synced`.
//!
//! Retention: rows older than `activity_upload::RETENTION_SECS` are purged
//! on each upload tick regardless of sync state, bounding the file.

use super::Db;
use crate::error::{AppError, AppResult};
use crate::tracker::ActivitySample;
use rusqlite::{params, Connection};

pub struct LocalRow {
    pub id: i64,
    pub sample: ActivitySample,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn lock(db: &Db) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
    db.lock()
        .map_err(|_| AppError::Storage("db mutex poisoned".into()))
}

fn storage<E: std::fmt::Display>(what: &str) -> impl FnOnce(E) -> AppError + '_ {
    move |e| AppError::Storage(format!("activity_local {what}: {e}"))
}

pub fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS activity_local (\n\
            id               INTEGER PRIMARY KEY AUTOINCREMENT,\n\
            session_id       TEXT,\n\
            application_name TEXT    NOT NULL,\n\
            process_name     TEXT    NOT NULL,\n\
            window_title     TEXT    NOT NULL,\n\
            url              TEXT,\n\
            timestamp        TEXT    NOT NULL,\n\
            duration_seconds INTEGER NOT NULL,\n\
            closed           INTEGER NOT NULL DEFAULT 0,\n\
            synced           INTEGER NOT NULL DEFAULT 0,\n\
            created_at       INTEGER NOT NULL\n\
         );\n\
         CREATE INDEX IF NOT EXISTS idx_activity_local_upload\n\
            ON activity_local (synced, closed, id);\n\
         CREATE INDEX IF NOT EXISTS idx_activity_local_created\n\
            ON activity_local (created_at);",
    )
    .map_err(storage("migrate"))
}

pub fn insert_open(db: &Db, s: &ActivitySample) -> AppResult<i64> {
    let conn = lock(db)?;
    conn.execute(
        "INSERT INTO activity_local\n\
         (session_id, application_name, process_name, window_title, url,\n\
          timestamp, duration_seconds, closed, synced, created_at)\n\
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8)",
        params![
            s.session_id,
            s.application_name,
            s.process_name,
            s.window_title,
            s.url,
            s.timestamp,
            s.duration_seconds as i64,
            now_secs(),
        ],
    )
    .map_err(storage("insert_open"))?;
    Ok(conn.last_insert_rowid())
}

pub fn update_duration(db: &Db, id: i64, duration_seconds: u64) -> AppResult<()> {
    let conn = lock(db)?;
    conn.execute(
        "UPDATE activity_local SET duration_seconds = ?1 WHERE id = ?2",
        params![duration_seconds as i64, id],
    )
    .map_err(storage("update_duration"))?;
    Ok(())
}

pub fn close(db: &Db, id: i64, duration_seconds: u64) -> AppResult<()> {
    let conn = lock(db)?;
    conn.execute(
        "UPDATE activity_local SET duration_seconds = ?1, closed = 1 WHERE id = ?2",
        params![duration_seconds as i64, id],
    )
    .map_err(storage("close"))?;
    Ok(())
}

/// Finalise buckets left open by a previous run (crash, kill, power loss).
/// Their checkpointed duration is the best information we have.
pub fn close_all_open(db: &Db) -> AppResult<usize> {
    let conn = lock(db)?;
    conn.execute("UPDATE activity_local SET closed = 1 WHERE closed = 0", [])
        .map_err(storage("close_all_open"))
}

pub fn closed_unsynced(db: &Db, limit: i64) -> AppResult<Vec<LocalRow>> {
    let conn = lock(db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, application_name, process_name, window_title, url,\n\
                    timestamp, duration_seconds\n\
             FROM activity_local\n\
             WHERE closed = 1 AND synced = 0\n\
             ORDER BY id ASC\n\
             LIMIT ?1",
        )
        .map_err(storage("closed_unsynced prepare"))?;
    let rows = stmt
        .query_map(params![limit], |r| {
            Ok(LocalRow {
                id: r.get(0)?,
                sample: ActivitySample {
                    session_id: r.get(1)?,
                    application_name: r.get(2)?,
                    process_name: r.get(3)?,
                    window_title: r.get(4)?,
                    url: r.get(5)?,
                    timestamp: r.get(6)?,
                    duration_seconds: r.get::<_, i64>(7)?.max(0) as u64,
                },
            })
        })
        .map_err(storage("closed_unsynced query"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(storage("closed_unsynced row"))?);
    }
    Ok(out)
}

pub fn mark_synced(db: &Db, ids: &[i64]) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let mut conn = lock(db)?;
    let tx = conn.transaction().map_err(storage("mark_synced tx"))?;
    for id in ids {
        tx.execute(
            "UPDATE activity_local SET synced = 1 WHERE id = ?1",
            params![id],
        )
        .map_err(storage("mark_synced"))?;
    }
    tx.commit().map_err(storage("mark_synced commit"))
}

pub fn purge_older_than(db: &Db, max_age_secs: i64) -> AppResult<usize> {
    let conn = lock(db)?;
    conn.execute(
        "DELETE FROM activity_local WHERE created_at < ?1",
        params![now_secs() - max_age_secs],
    )
    .map_err(storage("purge"))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd desktop-app-v3/src-tauri && cargo test --lib store::`
Expected: the 5 new tests PASS and existing `store::pending_sync` / `store::ai` tests still PASS.

- [ ] **Step 5: Commit**

```bash
cd desktop-app-v3
git add src-tauri/src/store/activity_local.rs src-tauri/src/store/mod.rs
git commit -m "feat(desktop): activity_local table for persisted tracker buckets"
```

---

### Task 7: Desktop — upload pipeline (`activity_upload.rs`, API signature, sync worker)

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/api/activity.rs`
- Create: `desktop-app-v3/src-tauri/src/activity_upload.rs`
- Modify: `desktop-app-v3/src-tauri/src/sync_worker.rs`
- Modify: `desktop-app-v3/src-tauri/src/commands/sessions.rs` (only the `sync_activity` call site in `session_end`, so it still compiles; the real rewrite is Task 8)
- Modify: `desktop-app-v3/src-tauri/src/lib.rs` (`mod activity_upload;`, `sync_worker::spawn` call)

**Interfaces:**
- Consumes: `store::activity_local::*` (Task 6), `Preferences.share_window_details` and `AppState.prefs_cache` (Task 4), `ActivitySample.session_id` (Task 5).
- Produces: `api::activity::sync_activity(http, token, samples)`; `activity_upload::{UPLOAD_BATCH, RETENTION_SECS, redact, resolve_share_flag, upload_once}`; `sync_worker::spawn(http, token, db, prefs_cache)`.

- [ ] **Step 1: Write the failing tests**

Create `desktop-app-v3/src-tauri/src/activity_upload.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn s(title: &str, url: Option<&str>) -> ActivitySample {
        ActivitySample {
            application_name: "Firefox".into(),
            process_name: "firefox".into(),
            window_title: title.into(),
            url: url.map(str::to_string),
            timestamp: "2026-09-03T10:00:00.000Z".into(),
            duration_seconds: 9,
            session_id: Some("sess".into()),
        }
    }

    #[test]
    fn redact_is_identity_when_sharing() {
        let input = vec![s("Bank statement", Some("https://bank.example"))];
        assert_eq!(redact(input.clone(), true), input);
    }

    #[test]
    fn redact_strips_title_and_url_but_keeps_everything_else() {
        let out = redact(vec![s("Bank statement", Some("https://bank.example"))], false);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].window_title, "");
        assert_eq!(out[0].url, None);
        assert_eq!(out[0].application_name, "Firefox");
        assert_eq!(out[0].process_name, "firefox");
        assert_eq!(out[0].duration_seconds, 9);
        assert_eq!(out[0].session_id.as_deref(), Some("sess"));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Add `mod activity_upload;` to `lib.rs` next to `mod sync_worker;`.

Run: `cd desktop-app-v3/src-tauri && cargo test --lib activity_upload::`
Expected: compile error `cannot find function redact`.

- [ ] **Step 3: Change `api::activity::sync_activity` to per-sample session ids**

In `api/activity.rs`:

- change `session_id: String,` in `ActivityPayload` to `session_id: Option<String>,`
- change the function signature to `pub async fn sync_activity(http: &reqwest::Client, token: &str, samples: &[ActivitySample]) -> AppResult<SyncResult>`
- in the `.map(|s| ActivityPayload { ... })` set `session_id: s.session_id.clone(),`
- update the doc comment to: `/// POST /api/activity/sync — uploads activity samples. Each sample carries its own optional session id.`

- [ ] **Step 4: Implement `activity_upload.rs`**

Prepend above the test module:

```rust
//! Ships persisted activity buckets to the API. Two callers: the 60 s
//! `sync_worker` tick and `session_end` (so a just-finished session shows
//! up on the web dashboard without waiting for the next tick).

use crate::api;
use crate::store::{self, Db};
use crate::tracker::ActivitySample;
use std::sync::Arc;
use tokio::sync::RwLock;

pub const UPLOAD_BATCH: i64 = 200;
pub const RETENTION_SECS: i64 = 90 * 24 * 60 * 60;

/// Strip window titles and URLs when the user opted out of sharing them.
/// App and process names still go up so web analytics keep working at
/// the app level.
pub fn redact(samples: Vec<ActivitySample>, share_window_details: bool) -> Vec<ActivitySample> {
    if share_window_details {
        return samples;
    }
    samples
        .into_iter()
        .map(|mut s| {
            s.window_title = String::new();
            s.url = None;
            s
        })
        .collect()
}

/// Read the cached preference, fetching once if the cache is cold.
/// Fails closed: if preferences cannot be fetched we redact.
pub async fn resolve_share_flag(
    http: &reqwest::Client,
    token: &str,
    cache: &Arc<RwLock<Option<api::Preferences>>>,
) -> bool {
    if let Some(p) = cache.read().await.as_ref() {
        return p.share_window_details;
    }
    match api::preferences::get_preferences(http, token).await {
        Ok(p) => {
            let flag = p.share_window_details;
            *cache.write().await = Some(p);
            flag
        }
        Err(err) => {
            tracing::warn!(?err, "preferences unavailable; redacting titles for this upload");
            false
        }
    }
}

/// Upload one batch of closed, unsynced rows. Returns how many were sent.
pub async fn upload_once(
    http: &reqwest::Client,
    token: &str,
    db: &Db,
    share_window_details: bool,
) -> crate::error::AppResult<usize> {
    let rows = store::activity_local::closed_unsynced(db, UPLOAD_BATCH)?;
    if rows.is_empty() {
        return Ok(0);
    }
    let ids: Vec<i64> = rows.iter().map(|r| r.id).collect();
    let samples = redact(rows.into_iter().map(|r| r.sample).collect(), share_window_details);
    api::activity::sync_activity(http, token, &samples).await?;
    store::activity_local::mark_synced(db, &ids)?;
    let purged = store::activity_local::purge_older_than(db, RETENTION_SECS)?;
    if purged > 0 {
        tracing::debug!(purged, "activity_local retention purge");
    }
    Ok(ids.len())
}
```

- [ ] **Step 5: Wire the sync worker**

Replace `desktop-app-v3/src-tauri/src/sync_worker.rs` with:

```rust
//! Background uploader. Wakes every minute and does two jobs:
//!   1. Legacy: drain `pending_activity_sync` rows (queued by pre-Phase-1
//!      builds at session end) with exponential backoff.
//!   2. Ship closed, unsynced `activity_local` rows via `activity_upload`.
//!
//! Spawned once on app launch. Skips silently when signed out.

use crate::activity_upload;
use crate::api;
use crate::store::{self, Db};
use crate::tracker::ActivitySample;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

const TICK_SECS: u64 = 60;
const BATCH_SIZE: i64 = 16;

pub fn spawn(
    http: reqwest::Client,
    token: Arc<RwLock<Option<String>>>,
    db: Db,
    prefs_cache: Arc<RwLock<Option<api::Preferences>>>,
) {
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(TICK_SECS));
        loop {
            tick.tick().await;
            if let Err(err) = drain_once(&http, &token, &db, &prefs_cache).await {
                tracing::warn!(?err, "sync tick failed");
            }
        }
    });
}

async fn drain_once(
    http: &reqwest::Client,
    token: &Arc<RwLock<Option<String>>>,
    db: &Db,
    prefs_cache: &Arc<RwLock<Option<api::Preferences>>>,
) -> crate::error::AppResult<()> {
    let token = match token.read().await.clone() {
        Some(t) => t,
        None => return Ok(()),
    };

    // Job 1 — legacy queue.
    let rows = store::pending_sync::ready_rows(db, BATCH_SIZE)?;
    for row in rows {
        let samples: Vec<ActivitySample> = row
            .samples
            .iter()
            .cloned()
            .map(|mut s| {
                if s.session_id.is_none() {
                    s.session_id = Some(row.session_id.clone());
                }
                s
            })
            .collect();
        match api::activity::sync_activity(http, &token, &samples).await {
            Ok(_) => {
                store::pending_sync::delete(db, row.id)?;
                tracing::info!(session_id = %row.session_id, samples = samples.len(), "legacy pending sync drained");
            }
            Err(err) => {
                store::pending_sync::record_failure(db, row.id, row.retry_count)?;
                tracing::debug!(?err, session_id = %row.session_id, "legacy drain failed; backing off");
            }
        }
    }

    // Job 2 — always-on tracker rows.
    let share = activity_upload::resolve_share_flag(http, &token, prefs_cache).await;
    match activity_upload::upload_once(http, &token, db, share).await {
        Ok(0) => {}
        Ok(n) => tracing::info!(uploaded = n, redacted = !share, "activity_local uploaded"),
        Err(err) => tracing::debug!(?err, "activity_local upload failed; will retry next tick"),
    }
    Ok(())
}
```

In `lib.rs`, change the call `sync_worker::spawn(state.http.clone(), state.token.clone(), db);` to:

```rust
                    sync_worker::spawn(
                        state.http.clone(),
                        state.token.clone(),
                        db,
                        state.prefs_cache.clone(),
                    );
```

- [ ] **Step 6: Keep `session_end` compiling**

In `commands/sessions.rs::session_end`, the current call `api::activity::sync_activity(&state.http, &token, &session_id, &samples)` no longer matches. Replace that one line with:

```rust
        let samples: Vec<crate::tracker::ActivitySample> = samples
            .into_iter()
            .map(|mut s| {
                s.session_id = Some(session_id.clone());
                s
            })
            .collect();
        match api::activity::sync_activity(&state.http, &token, &samples).await {
```

(Leave the surrounding `match` arms and the `pending_sync::enqueue` fallback untouched. Task 8 removes this whole block.)

- [ ] **Step 7: Run tests and build**

Run: `cd desktop-app-v3/src-tauri && cargo test --lib activity_upload:: && cargo build`
Expected: 2 PASS; build succeeds with no new warnings about unused items.

- [ ] **Step 8: Commit**

```bash
cd desktop-app-v3
git add src-tauri/src/activity_upload.rs src-tauri/src/api/activity.rs src-tauri/src/sync_worker.rs src-tauri/src/commands/sessions.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): background upload of persisted activity with privacy redaction"
```

---

### Task 8: Desktop — always-on tracker loop, session tagging, app-setup spawn

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/tracker/mod.rs` (replace `TrackerHandle` and its `spawn`; delete `stop_and_drain`)
- Modify: `desktop-app-v3/src-tauri/src/lib.rs` (`AppState` fields, `AppState::new`, setup block)
- Modify: `desktop-app-v3/src-tauri/src/commands/sessions.rs` (`session_start`, `session_active`, `session_end`)

**Interfaces:**
- Consumes: `step()`/`Poll`/`Step` (Task 5), `store::activity_local` (Task 6), `activity_upload::{resolve_share_flag, upload_once}` (Task 7).
- Produces: `TrackerConfig`, `TrackerHandle::spawn(cfg)`, `TrackerHandle::flush().await`; `AppState.active_session_id`, `AppState.tracking_paused`.

- [ ] **Step 1: Rewrite the tracker runtime**

In `tracker/mod.rs`, replace the module doc comment (the `//!` block at the top) with:

```rust
//! Foreground-window activity tracker — always on while the app runs.
//!
//! Polls `active_win_pos_rs::get_active_window()` once per second, folds
//! consecutive same-window samples into buckets via the pure `step()`
//! function, and persists every bucket to `activity_local` as it opens
//! (checkpointing its duration every `CHECKPOINT_TICKS` seconds). Buckets
//! close on window change, AFK idle, tray pause, or an explicit `flush()`.
//! The `sync_worker` uploads closed buckets in the background.
//!
//! Sessions no longer own the tracker: `AppState.active_session_id` is
//! read on every tick and recorded on the bucket, so session start/end
//! becomes a label on a continuous timeline.
//!
//! Platform notes:
//! - **Windows / macOS / Linux X11**: works.
//! - **Linux Wayland**: most compositors refuse to expose the foreground
//!   window; we get `Poll::Unavailable` every tick and record nothing.
//!   `user-idle` also lacks a pure-Wayland backend; XWayland fallback
//!   works on most GNOME/KDE setups.
```

Replace the `use` lines with:

```rust
use crate::api::sessions::now_iso;
use crate::error::AppResult;
use crate::store::{self, Db};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, RwLock};
```

Add below `IDLE_THRESHOLD_SECS`:

```rust
/// Persist the open bucket's duration this often so a crash loses at
/// most this many seconds of the current window.
const CHECKPOINT_TICKS: u32 = 30;
```

Delete the old `pub struct TrackerHandle { ... }` and its whole `impl TrackerHandle { ... }` (including `spawn` and `stop_and_drain`). Replace with:

```rust
pub struct TrackerConfig {
    pub db: Db,
    pub active_session_id: Arc<RwLock<Option<String>>>,
    pub paused: Arc<AtomicBool>,
}

pub struct TrackerHandle {
    flush_tx: mpsc::Sender<oneshot::Sender<()>>,
    _join: tauri::async_runtime::JoinHandle<()>,
}

impl TrackerHandle {
    /// Spawn the always-on polling task. Uses `tauri::async_runtime::spawn`
    /// so it can be called from Tauri's synchronous `setup` callback.
    pub fn spawn(cfg: TrackerConfig) -> Self {
        let (flush_tx, flush_rx) = mpsc::channel::<oneshot::Sender<()>>(4);
        let join = tauri::async_runtime::spawn(run(cfg, flush_rx));
        Self { flush_tx, _join: join }
    }

    /// Close the currently open bucket (if any) and wait until it is
    /// persisted. Used at session end so the session's last bucket is
    /// uploadable immediately.
    pub async fn flush(&self) {
        let (tx, rx) = oneshot::channel();
        if self.flush_tx.send(tx).await.is_ok() {
            let _ = rx.await;
        }
    }
}

fn poll_os() -> Poll {
    let idle_secs = user_idle::UserIdle::get_time()
        .map(|t| t.as_seconds())
        .unwrap_or(0);
    if idle_secs >= IDLE_THRESHOLD_SECS {
        return Poll::Idle;
    }
    match active_win_pos_rs::get_active_window() {
        Ok(win) => {
            let process_name = win
                .process_path
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let application_name = if win.app_name.is_empty() {
                process_name.clone()
            } else {
                win.app_name.clone()
            };
            Poll::Window(Observation {
                application_name,
                process_name,
                window_title: win.title,
            })
        }
        Err(_) => Poll::Unavailable,
    }
}

fn open_row(db: &Db, sample: Option<&ActivitySample>) -> Option<i64> {
    let s = sample?;
    match store::activity_local::insert_open(db, s) {
        Ok(id) => Some(id),
        Err(err) => {
            tracing::warn!(?err, "activity_local insert failed; bucket not persisted");
            None
        }
    }
}

fn log_write(result: AppResult<()>) {
    if let Err(err) = result {
        tracing::warn!(?err, "activity_local write failed");
    }
}

async fn run(cfg: TrackerConfig, mut flush_rx: mpsc::Receiver<oneshot::Sender<()>>) {
    let mut current: Option<ActivitySample> = None;
    let mut row_id: Option<i64> = None;
    let mut ticks_since_checkpoint: u32 = 0;
    let mut interval = tokio::time::interval(Duration::from_secs(1));

    loop {
        tokio::select! {
            Some(reply) = flush_rx.recv() => {
                if let (Some(prev), Some(id)) = (current.take(), row_id.take()) {
                    log_write(store::activity_local::close(&cfg.db, id, prev.duration_seconds));
                }
                ticks_since_checkpoint = 0;
                let _ = reply.send(());
            }
            _ = interval.tick() => {
                let poll = if cfg.paused.load(Ordering::Relaxed) { Poll::Idle } else { poll_os() };
                let session_id = cfg.active_session_id.read().await.clone();
                match step(&mut current, poll, session_id.as_deref(), &now_iso()) {
                    Step::Nothing => {}
                    Step::Extended => {
                        ticks_since_checkpoint += 1;
                        if ticks_since_checkpoint >= CHECKPOINT_TICKS {
                            ticks_since_checkpoint = 0;
                            if let (Some(s), Some(id)) = (current.as_ref(), row_id) {
                                log_write(store::activity_local::update_duration(&cfg.db, id, s.duration_seconds));
                            }
                        }
                    }
                    Step::Opened => {
                        ticks_since_checkpoint = 0;
                        row_id = open_row(&cfg.db, current.as_ref());
                    }
                    Step::Rotated(prev) => {
                        if let Some(id) = row_id.take() {
                            log_write(store::activity_local::close(&cfg.db, id, prev.duration_seconds));
                        }
                        ticks_since_checkpoint = 0;
                        row_id = open_row(&cfg.db, current.as_ref());
                    }
                    Step::Closed(prev) => {
                        if let Some(id) = row_id.take() {
                            log_write(store::activity_local::close(&cfg.db, id, prev.duration_seconds));
                        }
                        ticks_since_checkpoint = 0;
                    }
                }
            }
        }
    }
}
```

Keep `ActivitySample`, `Observation`, `Poll`, `Step`, `step()`, and the test module from Task 5 unchanged.

- [ ] **Step 2: Extend `AppState`**

In `lib.rs`, add to `pub struct AppState`:

```rust
    /// Focus session currently running (set by session_start/session_active,
    /// cleared by session_end). Each tracker bucket records this when it opens.
    pub active_session_id: Arc<RwLock<Option<String>>>,
    /// Tray "Pause tracking" toggle. Not persisted — a restart resumes tracking.
    pub tracking_paused: Arc<std::sync::atomic::AtomicBool>,
```

and to `AppState::new()`:

```rust
            active_session_id: Arc::new(RwLock::new(None)),
            tracking_paused: Arc::new(std::sync::atomic::AtomicBool::new(false)),
```

Update the doc comment on the `tracker` field from "holds the activity-monitoring task while a session is running" to "holds the always-on activity tracker, spawned in `setup` once the local store is open".

- [ ] **Step 3: Spawn the tracker at setup**

In `lib.rs` setup, inside `match store::open(&db_path) { Ok(db) => { ... } }`, after `let _ = state.db.set(db.clone());` and before the `sync_worker::spawn(...)` call, insert:

```rust
                    match store::activity_local::close_all_open(&db) {
                        Ok(0) => {}
                        Ok(n) => tracing::info!(n, "closed activity buckets orphaned by a previous run"),
                        Err(err) => tracing::warn!(?err, "orphaned bucket cleanup failed"),
                    }
                    let handle = tracker::TrackerHandle::spawn(tracker::TrackerConfig {
                        db: db.clone(),
                        active_session_id: state.active_session_id.clone(),
                        paused: state.tracking_paused.clone(),
                    });
                    match state.tracker.try_write() {
                        Ok(mut slot) => *slot = Some(handle),
                        Err(_) => tracing::warn!("tracker slot busy during setup; flush() will be unavailable"),
                    }
                    tracing::info!("always-on activity tracker started");
```

- [ ] **Step 4: Rewrite the session commands**

In `commands/sessions.rs`:

Replace the module doc comment's tracker paragraph with:

```rust
//! The activity tracker is always on (spawned in `lib.rs` setup). These
//! commands only publish the active session id so buckets get tagged:
//!   - session_start / session_active set `AppState.active_session_id`
//!   - session_end clears it, flushes the open bucket, and triggers an
//!     immediate upload so the web dashboard reflects the session
```

In `session_start`, delete everything from `// Replace any leftover tracker` through `*slot = Some(TrackerHandle::spawn());` and put in its place:

```rust
    *state.active_session_id.write().await = Some(session.id.clone());
```

Replace `session_active` with:

```rust
/// `session_active` — GET /api/sessions/active. Returns null if none.
/// Also publishes the id so buckets get tagged for sessions started on
/// another device (web, mobile, extension).
#[tauri::command]
pub async fn session_active(state: State<'_, AppState>) -> AppResult<Option<Session>> {
    let token = token_or_err(&state).await?;
    let session = api::sessions::get_active_session(&state.http, &token).await?;
    let id = session
        .as_ref()
        .filter(|s| !s.completed)
        .map(|s| s.id.clone());
    *state.active_session_id.write().await = id;
    Ok(session)
}
```

In `session_end`, delete everything from `// Drain whatever the tracker captured during this session.` through the end of the `if !samples.is_empty() { ... }` block (the block that calls `sync_activity` and falls back to `store::pending_sync::enqueue`). Put in its place:

```rust
    *state.active_session_id.write().await = None;
    if let Some(tracker) = state.tracker.read().await.as_ref() {
        tracker.flush().await;
    }
    // Best-effort immediate upload so the session's activity appears on the
    // web without waiting for the next sync tick. Failure is fine: rows stay
    // in activity_local and the sync worker retries.
    if let Some(db) = state.db.get() {
        let share = crate::activity_upload::resolve_share_flag(&state.http, &token, &state.prefs_cache).await;
        match crate::activity_upload::upload_once(&state.http, &token, db, share).await {
            Ok(n) => tracing::info!(uploaded = n, "post-session activity upload"),
            Err(err) => tracing::warn!(?err, "post-session upload failed; sync worker will retry"),
        }
    }
```

Everything after that block in `session_end` (device registration, return value) stays as is. Remove `use crate::tracker::TrackerHandle;`. Remove `use crate::store;` only if the compiler reports it unused.

- [ ] **Step 5: Build and run all Rust tests**

Run: `cd desktop-app-v3/src-tauri && cargo build && cargo test --lib`
Expected: build succeeds with no warnings about unused imports or dead code in `tracker`, `sessions`, or `sync_worker`; all tests PASS.

- [ ] **Step 6: Manual smoke test**

Run `cd desktop-app-v3 && npm run tauri:dev`. Sign in. Do **not** start a session. Switch between two windows for ~15 seconds, then run:

```bash
sqlite3 ~/.local/share/FlowShield/local.sqlite \
  "SELECT id, session_id, application_name, duration_seconds, closed, synced FROM activity_local ORDER BY id DESC LIMIT 5;"
```

(On macOS the path is `~/Library/Application Support/FlowShield/local.sqlite`; on Windows `%APPDATA%\FlowShield\local.sqlite`.)

Expected: rows with `session_id` NULL, the newest with `closed = 0`, older ones `closed = 1`. Wait 60 s and re-run: closed rows show `synced = 1`. Start a session, switch windows, end it: new rows carry the session id and are `synced = 1` right after ending.

- [ ] **Step 7: Commit**

```bash
cd desktop-app-v3
git add src-tauri/src/tracker/mod.rs src-tauri/src/lib.rs src-tauri/src/commands/sessions.rs
git commit -m "feat(desktop): always-on activity tracker with local persistence and session tagging"
```

---

### Task 9: Desktop — tray Pause/Resume tracking + commands

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/tray.rs`
- Create: `desktop-app-v3/src-tauri/src/commands/tracking.rs`
- Modify: `desktop-app-v3/src-tauri/src/commands/mod.rs` (add `pub mod tracking;`)
- Modify: `desktop-app-v3/src-tauri/src/lib.rs` (`generate_handler!`)

**Interfaces:**
- Consumes: `AppState.tracking_paused` (Task 8), `AppState.latest_update`.
- Produces: `tray::rebuild_menu(handle: &AppHandle) -> tauri::Result<()>`; Tauri commands `tracking_paused_get() -> bool`, `tracking_set_paused(paused: bool)`.

- [ ] **Step 1: Add `rebuild_menu` and the Pause item**

In `tray.rs`:

Add the import `use std::sync::atomic::Ordering;` and the constant:

```rust
const PAUSE_ID: &str = "pause-tracking";
```

Add this function (anywhere after the constants):

```rust
/// Rebuild the whole tray menu from current state: optional "Updates
/// available", Pause/Resume tracking, Show, Quit. Called on install, on
/// update announcement, and on every pause toggle.
pub fn rebuild_menu(handle: &AppHandle) -> tauri::Result<()> {
    let Some(tray) = handle.tray_by_id(TRAY_ID) else {
        return Ok(()); // tray install failed earlier — log already emitted
    };
    let state = handle.state::<AppState>();
    let paused = state.tracking_paused.load(Ordering::Relaxed);
    let pause_label = if paused { "Resume tracking" } else { "Pause tracking" };
    let update_info = match state.latest_update.lock() {
        Ok(guard) => guard.clone(),
        Err(poisoned) => poisoned.into_inner().clone(),
    };

    let pause = MenuItem::with_id(handle, PAUSE_ID, pause_label, true, None::<&str>)?;
    let show = MenuItem::with_id(handle, SHOW_ID, "Show FlowShield", true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, QUIT_ID, "Quit", true, None::<&str>)?;
    let menu = match update_info {
        Some(info) => {
            let label = format!("▲ Updates: {} available", info.latest_version);
            let update_item = MenuItem::with_id(handle, UPDATE_ID, &label, true, None::<&str>)?;
            Menu::with_items(handle, &[&update_item, &pause, &show, &quit])?
        }
        None => Menu::with_items(handle, &[&pause, &show, &quit])?,
    };
    tray.set_menu(Some(menu))?;
    Ok(())
}
```

Replace the body of `install` with:

```rust
pub fn install(app: &App) -> tauri::Result<()> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| tauri::Error::AssetNotFound(format!("tray '{TRAY_ID}' not configured")))?;
    tray.on_menu_event(handle_menu_event);
    tray.on_tray_icon_event(handle_icon_event);
    rebuild_menu(app.handle())
}
```

In `announce_update`, delete everything after the `match latest_update_arc.lock() { ... }` block and replace it with:

```rust
    rebuild_menu(handle)
```

In `handle_menu_event`, add an arm before `_ => {}`:

```rust
        PAUSE_ID => {
            let state = app.state::<AppState>();
            let now_paused = !state.tracking_paused.load(Ordering::Relaxed);
            state.tracking_paused.store(now_paused, Ordering::Relaxed);
            tracing::info!(paused = now_paused, "tracking pause toggled via tray");
            if let Err(e) = rebuild_menu(app) {
                tracing::warn!(error = %e, "tray menu rebuild failed");
            }
        }
```

Update the module doc comment's menu list to include `- **Pause tracking / Resume tracking** — toggles the always-on activity tracker; not persisted across restarts.`

- [ ] **Step 2: Add the commands**

Create `desktop-app-v3/src-tauri/src/commands/tracking.rs`:

```rust
//! Always-on tracker controls exposed to the frontend. The tray menu
//! toggles the same flag; both paths rebuild the tray menu so the label
//! stays in sync.

use crate::error::{AppError, AppResult};
use crate::AppState;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn tracking_paused_get(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(state.tracking_paused.load(Ordering::Relaxed))
}

#[tauri::command]
pub async fn tracking_set_paused(
    app: AppHandle,
    state: State<'_, AppState>,
    paused: bool,
) -> AppResult<()> {
    state.tracking_paused.store(paused, Ordering::Relaxed);
    tracing::info!(paused, "tracking pause set from settings");
    crate::tray::rebuild_menu(&app)
        .map_err(|e| AppError::Storage(format!("rebuild tray menu: {e}")))
}
```

In `commands/mod.rs` add `pub mod tracking;`. In `lib.rs` `generate_handler!` add:

```rust
            commands::tracking::tracking_paused_get,
            commands::tracking::tracking_set_paused,
```

- [ ] **Step 3: Build and test**

Run: `cd desktop-app-v3/src-tauri && cargo build && cargo test --lib`
Expected: build clean, all tests PASS.

- [ ] **Step 4: Manual check**

`npm run tauri:dev`. Tray menu shows "Pause tracking". Click it: label becomes "Resume tracking". While paused, switch windows for 10 s; the `sqlite3` query from Task 8 Step 6 shows no new rows and the previously open row is now `closed = 1`. Click "Resume tracking": new rows appear.

- [ ] **Step 5: Commit**

```bash
cd desktop-app-v3
git add src-tauri/src/tray.rs src-tauri/src/commands/tracking.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): pause/resume tracking from tray and settings commands"
```

---

### Task 10: Desktop frontend — Tracking settings page

**Files:**
- Modify: `desktop-app-v3/src/lib/preferences.ts` (interface)
- Create: `desktop-app-v3/src/routes/SettingsTrackingPage.tsx`
- Modify: `desktop-app-v3/src/App.tsx:54-57` (add route)
- Modify: `desktop-app-v3/src/routes/DashboardPage.tsx` (header link next to the existing `<Link to="/settings/ai" ...>`)

**Interfaces:**
- Consumes: commands `prefs_load`, `prefs_set_share_window_details`, `tracking_paused_get`, `tracking_set_paused` (Tasks 4 and 9).

- [ ] **Step 1: Extend the `Preferences` interface**

In `desktop-app-v3/src/lib/preferences.ts` change:

```ts
export interface Preferences {
  primaryDistractions: string[];
  shareWindowDetails: boolean;
}
```

- [ ] **Step 2: Create the page**

Create `desktop-app-v3/src/routes/SettingsTrackingPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link } from 'react-router-dom';
import type { Preferences } from '../lib/preferences';

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as { message?: string; error?: string };
    return obj.message ?? obj.error ?? fallback;
  }
  return fallback;
}

export default function SettingsTrackingPage() {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [share, setShare] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, prefs] = await Promise.all([
          invoke<boolean>('tracking_paused_get'),
          invoke<Preferences>('prefs_load'),
        ]);
        if (!cancelled) {
          setPaused(p);
          setShare(prefs.shareWindowDetails);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Could not load tracking settings'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePaused = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await invoke('tracking_set_paused', { paused: next });
      setPaused(next);
    } catch (err) {
      setError(errorMessage(err, 'Could not update tracking state'));
    } finally {
      setBusy(false);
    }
  };

  const toggleShare = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const prefs = await invoke<Preferences>('prefs_set_share_window_details', { enabled: next });
      setShare(prefs.shareWindowDetails);
    } catch (err) {
      setError(errorMessage(err, 'Could not update privacy setting'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-surface-3">
        <div className="text-lg font-bold">Tracking &amp; privacy</div>
        <Link to="/" className="text-sm text-primary-500 hover:underline">
          Back to dashboard
        </Link>
      </header>

      <main className="flex-1 px-6 py-6 max-w-2xl space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="rounded-lg border border-surface-3 bg-surface-1 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            Activity tracking
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              disabled={busy || paused === null}
              checked={paused === true}
              onChange={(e) => void togglePaused(e.target.checked)}
            />
            <span>
              <span className="font-medium">Pause tracking</span>
              <span className="block text-sm text-gray-600 dark:text-gray-400">
                While paused, FlowShield records nothing about which apps or windows you use.
                Tracking resumes automatically the next time the app starts.
              </span>
            </span>
          </label>
        </section>

        <section className="rounded-lg border border-surface-3 bg-surface-1 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            What leaves this computer
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              disabled={busy || share === null}
              checked={share === true}
              onChange={(e) => void toggleShare(e.target.checked)}
            />
            <span>
              <span className="font-medium">Share window titles and URLs with FlowShield</span>
              <span className="block text-sm text-gray-600 dark:text-gray-400">
                Off: only app names and durations are uploaded. Window titles and page URLs stay
                in the local database on this computer. This setting is shared with the web app.
              </span>
            </span>
          </label>
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Register the route and link**

In `desktop-app-v3/src/App.tsx`, import the page next to the `SettingsAiPage` import:

```tsx
import SettingsTrackingPage from './routes/SettingsTrackingPage';
```

and after the `/settings/ai` route add:

```tsx
      <Route path="/settings/tracking" element={<SettingsTrackingPage />} />
```

In `desktop-app-v3/src/routes/DashboardPage.tsx`, find the header `<Link to="/settings/ai" ...>AI Settings</Link>` and add directly after it, copying its `className` verbatim:

```tsx
          <Link to="/settings/tracking" className={/* same className as the AI Settings link */}>
            Tracking
          </Link>
```

- [ ] **Step 4: Type-check**

Run: `cd desktop-app-v3 && npm run typecheck`
Expected: clean.

- [ ] **Step 5: Manual check**

`npm run tauri:dev`. Dashboard header shows "Tracking". The page loads both checkboxes. Toggling "Pause tracking" flips the tray label. Toggling "Share window titles" off, then reloading `/profile` on the web, shows the web checkbox off too.

- [ ] **Step 6: Commit**

```bash
cd desktop-app-v3
git add src/lib/preferences.ts src/routes/SettingsTrackingPage.tsx src/App.tsx src/routes/DashboardPage.tsx
git commit -m "feat(desktop): tracking and privacy settings page"
```

---

### Task 11: Desktop — idle detection: session auto-pause + "welcome back" prompt

Added 2026-09-04 (roadmap amendment). The rubric item is "auto-pause/prompt when no activity detected". The tracker already computes OS idle seconds every tick; this task turns the threshold crossing into two Tauri events, auto-pauses a running focus session on the way out, and asks the user what to do on the way back.

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/tracker/mod.rs` (add `IdlePayload`, `IdleTransition`, `IdleDetector`, split `poll_os` into `os_idle_secs` + `poll_window`, emit events from `run`)
- Modify: `desktop-app-v3/src-tauri/src/lib.rs` (`TrackerConfig { app }` at setup)
- Create: `desktop-app-v3/src/lib/idle.ts`
- Create: `desktop-app-v3/src/components/IdlePrompt.tsx`
- Modify: `desktop-app-v3/src/App.tsx`
- Test: `desktop-app-v3/src-tauri/src/tracker/mod.rs` (`#[cfg(test)]` module from Task 5)

**Interfaces:**
- Consumes: `TrackerConfig`, `run()`, `IDLE_THRESHOLD_SECS` (Task 8); `useSessionStore.{current, togglePause, end}` (`desktop-app-v3/src/lib/sessions.ts`, exists); `Button` (`desktop-app-v3/src/components/Button.tsx`, exists).
- Produces: `IdleDetector::observe(&mut self, idle_secs: u64) -> Option<IdleTransition>`; Tauri events `tracker-idle-started` and `tracker-idle-ended` with payload `{ idleSeconds: number }`; `useIdleStore` with `bootstrap(): Promise<UnlistenFn>`, `resume()`, `endSession()`, `dismiss()`; `selectShowIdlePrompt(state)`.

**Behaviour:**
1. Every tick the tracker reads OS idle seconds. Crossing `IDLE_THRESHOLD_SECS` upward emits `tracker-idle-started` once. Dropping back below emits `tracker-idle-ended` once, with the total away time.
2. Frontend on `tracker-idle-started`: if a session is active, not completed, and not already paused, call `togglePause('pause')` and remember the session id. Sessions the user paused manually are left alone.
3. Frontend on `tracker-idle-ended`: if we auto-paused something, show the prompt: "You were away for N minutes. Resume session / End session / Keep it paused".
4. Idle detection runs even when tray "Pause tracking" is on. Pausing *tracking* is about privacy of window data; pausing a *session* is about time accounting. They are independent.

- [ ] **Step 1: Write the failing detector tests**

In `tracker/mod.rs`, inside the existing `#[cfg(test)] mod tests { ... }` block from Task 5, add:

```rust
    #[test]
    fn idle_detector_is_silent_below_threshold() {
        let mut d = IdleDetector::default();
        assert_eq!(d.observe(0), None);
        assert_eq!(d.observe(IDLE_THRESHOLD_SECS - 1), None);
        assert_eq!(d.observe(0), None);
    }

    #[test]
    fn idle_detector_fires_started_once_when_threshold_crossed() {
        let mut d = IdleDetector::default();
        assert_eq!(d.observe(IDLE_THRESHOLD_SECS - 1), None);
        assert_eq!(
            d.observe(IDLE_THRESHOLD_SECS),
            Some(IdleTransition::Started(IdlePayload { idle_seconds: IDLE_THRESHOLD_SECS }))
        );
        // Still idle: no repeat.
        assert_eq!(d.observe(IDLE_THRESHOLD_SECS + 1), None);
        assert_eq!(d.observe(IDLE_THRESHOLD_SECS + 60), None);
    }

    #[test]
    fn idle_detector_fires_ended_with_total_away_time() {
        let mut d = IdleDetector::default();
        d.observe(IDLE_THRESHOLD_SECS);
        d.observe(IDLE_THRESHOLD_SECS + 120);
        // User touches the keyboard: OS idle counter resets.
        assert_eq!(
            d.observe(0),
            Some(IdleTransition::Ended(IdlePayload { idle_seconds: IDLE_THRESHOLD_SECS + 120 }))
        );
        // Back at work: silent again.
        assert_eq!(d.observe(1), None);
    }

    #[test]
    fn idle_payload_serialises_camel_case() {
        let json = serde_json::to_string(&IdlePayload { idle_seconds: 7 }).unwrap();
        assert_eq!(json, r#"{"idleSeconds":7}"#);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd desktop-app-v3/src-tauri && cargo test --lib tracker::`
Expected: compile error, `cannot find type IdleDetector in this scope`.

- [ ] **Step 3: Add the detector types**

In `tracker/mod.rs`, directly below the `CHECKPOINT_TICKS` constant (Task 8), add:

```rust
/// Payload of the `tracker-idle-started` / `tracker-idle-ended` events.
/// For `started`, `idle_seconds` is the threshold that was just crossed.
/// For `ended`, it is the whole stretch the user was away.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdlePayload {
    pub idle_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdleTransition {
    Started(IdlePayload),
    Ended(IdlePayload),
}

/// Pure edge detector over the OS idle counter. Fed once per tick; reports
/// the tick the user crosses `IDLE_THRESHOLD_SECS` and the tick they come
/// back. Owns no clock — the caller supplies `idle_secs`, so it is trivially
/// unit-testable.
#[derive(Debug, Default)]
pub struct IdleDetector {
    was_idle: bool,
    last_idle_secs: u64,
}

impl IdleDetector {
    pub fn observe(&mut self, idle_secs: u64) -> Option<IdleTransition> {
        let is_idle = idle_secs >= IDLE_THRESHOLD_SECS;
        let transition = match (self.was_idle, is_idle) {
            (false, true) => Some(IdleTransition::Started(IdlePayload { idle_seconds: idle_secs })),
            (true, false) => Some(IdleTransition::Ended(IdlePayload { idle_seconds: self.last_idle_secs })),
            _ => None,
        };
        if is_idle {
            self.last_idle_secs = idle_secs;
        }
        self.was_idle = is_idle;
        transition
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd desktop-app-v3/src-tauri && cargo test --lib tracker::`
Expected: the four new tests PASS alongside the Task 5 `step()` tests.

- [ ] **Step 5: Wire the detector into the tracker loop**

In `tracker/mod.rs`:

Add `use tauri::Emitter;` to the `use` block.

Add `pub app: tauri::AppHandle,` as the last field of `pub struct TrackerConfig`.

Replace the whole `fn poll_os() -> Poll { ... }` function (Task 8) with these two functions:

```rust
fn os_idle_secs() -> u64 {
    user_idle::UserIdle::get_time()
        .map(|t| t.as_seconds())
        .unwrap_or(0)
}

fn poll_window() -> Poll {
    match active_win_pos_rs::get_active_window() {
        Ok(win) => {
            let process_name = win
                .process_path
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let application_name = if win.app_name.is_empty() {
                process_name.clone()
            } else {
                win.app_name.clone()
            };
            Poll::Window(Observation {
                application_name,
                process_name,
                window_title: win.title,
            })
        }
        Err(_) => Poll::Unavailable,
    }
}

fn emit_idle(app: &tauri::AppHandle, transition: IdleTransition) {
    let result = match transition {
        IdleTransition::Started(payload) => {
            tracing::info!(idle_seconds = payload.idle_seconds, "user went idle");
            app.emit("tracker-idle-started", payload)
        }
        IdleTransition::Ended(payload) => {
            tracing::info!(idle_seconds = payload.idle_seconds, "user came back");
            app.emit("tracker-idle-ended", payload)
        }
    };
    if let Err(err) = result {
        tracing::warn!(?err, "idle event emit failed");
    }
}
```

In `async fn run(...)`, add `let mut idle = IdleDetector::default();` after `let mut ticks_since_checkpoint: u32 = 0;`.

Replace the first line of the `_ = interval.tick() => { ... }` arm, which currently reads

```rust
                let poll = if cfg.paused.load(Ordering::Relaxed) { Poll::Idle } else { poll_os() };
```

with

```rust
                let idle_secs = os_idle_secs();
                if let Some(transition) = idle.observe(idle_secs) {
                    emit_idle(&cfg.app, transition);
                }
                let poll = if cfg.paused.load(Ordering::Relaxed) || idle_secs >= IDLE_THRESHOLD_SECS {
                    Poll::Idle
                } else {
                    poll_window()
                };
```

Everything after that line in the arm (the `session_id` read and the `match step(...)`) is unchanged.

- [ ] **Step 6: Pass the app handle at setup**

In `lib.rs` setup, in the `tracker::TrackerHandle::spawn(tracker::TrackerConfig { ... })` call from Task 8 Step 3, add the field:

```rust
                        app: app.handle().clone(),
```

- [ ] **Step 7: Build and run all Rust tests**

Run: `cd desktop-app-v3/src-tauri && cargo build && cargo test --lib`
Expected: build clean (no unused-import warning for `Emitter`), all tests PASS.

- [ ] **Step 8: Create the frontend idle store**

Create `desktop-app-v3/src/lib/idle.ts`:

```ts
import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useSessionStore } from './sessions';

/** Mirrors `IdlePayload` in src-tauri/src/tracker/mod.rs (serde camelCase). */
export interface IdlePayload {
  idleSeconds: number;
}

interface IdleState {
  /** Session we auto-paused when the user went idle. Null = we paused nothing. */
  autoPausedSessionId: string | null;
  /** Total away time once the user returns; non-null drives the prompt. */
  awaySeconds: number | null;

  /** Subscribe to the tracker's idle events. App.tsx calls this once on
   *  mount and stores the unlisten fn for cleanup. */
  bootstrap: () => Promise<UnlistenFn>;
  /** Prompt: "Resume session". */
  resume: () => Promise<void>;
  /** Prompt: "End session". */
  endSession: () => Promise<void>;
  /** Prompt: "Keep it paused" — close the dialog, leave the session paused. */
  dismiss: () => void;
}

export const useIdleStore = create<IdleState>((set, get) => ({
  autoPausedSessionId: null,
  awaySeconds: null,

  bootstrap: async () => {
    const unlistenStarted = await listen<IdlePayload>('tracker-idle-started', async () => {
      const session = useSessionStore.getState().current;
      // Nothing running, or the user paused it themselves: leave it alone.
      if (!session || session.completed || session.isPaused) return;
      try {
        await useSessionStore.getState().togglePause('pause');
        set({ autoPausedSessionId: session.id, awaySeconds: null });
      } catch (err) {
        // Non-fatal: the session simply keeps running. Store already set `error`.
        // eslint-disable-next-line no-console
        console.warn('[idle] auto-pause failed', err);
      }
    });

    const unlistenEnded = await listen<IdlePayload>('tracker-idle-ended', (event) => {
      if (!get().autoPausedSessionId) return;
      set({ awaySeconds: event.payload.idleSeconds });
    });

    return () => {
      unlistenStarted();
      unlistenEnded();
    };
  },

  resume: async () => {
    const { autoPausedSessionId } = get();
    const session = useSessionStore.getState().current;
    set({ autoPausedSessionId: null, awaySeconds: null });
    // The session may have been ended or resumed from another device while
    // we were away; only resume the exact session we paused, and only if it
    // is still paused.
    if (!session || session.id !== autoPausedSessionId || !session.isPaused) return;
    await useSessionStore.getState().togglePause('resume');
  },

  endSession: async () => {
    set({ autoPausedSessionId: null, awaySeconds: null });
    await useSessionStore.getState().end();
  },

  dismiss: () => set({ autoPausedSessionId: null, awaySeconds: null }),
}));

/** Selector: should the "welcome back" dialog render right now? */
export function selectShowIdlePrompt(state: IdleState): boolean {
  return state.awaySeconds !== null && state.autoPausedSessionId !== null;
}
```

- [ ] **Step 9: Create the prompt component**

Create `desktop-app-v3/src/components/IdlePrompt.tsx`:

```tsx
import { Button } from './Button';
import { useIdleStore, selectShowIdlePrompt } from '../lib/idle';

function formatAway(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins === 1 ? '1 minute' : `${mins} minutes`;
}

/**
 * Modal shown when the user returns after the tracker auto-paused their
 * focus session for inactivity. Three exits: resume, end, or leave paused.
 * Mounted once in App.tsx so it works on every route.
 */
export function IdlePrompt() {
  const visible = useIdleStore(selectShowIdlePrompt);
  const awaySeconds = useIdleStore((s) => s.awaySeconds);
  const resume = useIdleStore((s) => s.resume);
  const endSession = useIdleStore((s) => s.endSession);
  const dismiss = useIdleStore((s) => s.dismiss);

  if (!visible || awaySeconds === null) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-xl border border-surface-3 bg-surface-1 p-6 shadow-lg">
        <h2 id="idle-prompt-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Welcome back
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          You were away for {formatAway(awaySeconds)}. Your focus session was paused while you were gone.
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => void resume()}>
            Resume session
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => void endSession()}>
            End session
          </Button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 w-full text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Keep it paused
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Mount it in `App.tsx`**

In `desktop-app-v3/src/App.tsx`:

Add the imports:

```tsx
import { useIdleStore } from './lib/idle';
import { IdlePrompt } from './components/IdlePrompt';
```

After the AI-substrate `useEffect` (the one calling `useAIStore.getState().bootstrap()`), add:

```tsx
  // Subscribe to tracker idle events: auto-pause the running session when
  // the user walks away, prompt them when they come back.
  useEffect(() => {
    const unlistenPromise = useIdleStore.getState().bootstrap();
    return () => {
      void unlistenPromise.then((fn) => fn());
    };
  }, []);
```

Replace the final `return ( <Routes> ... </Routes> );` with:

```tsx
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardPage />} />
        <Route path="/settings/ai" element={<SettingsAiPage />} />
        <Route path="/settings/tracking" element={<SettingsTrackingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <IdlePrompt />
    </>
  );
```

(The `/settings/tracking` route and `SettingsTrackingPage` import come from Task 10. If Task 10 has not been applied yet, omit that one `<Route>` line and add it when Task 10 runs.)

- [ ] **Step 11: Typecheck**

Run: `cd desktop-app-v3 && npm run typecheck`
Expected: clean.

- [ ] **Step 12: Manual smoke test**

To avoid waiting 5 minutes per check, temporarily set `IDLE_THRESHOLD_SECS` to `15` in `tracker/mod.rs`, run `cd desktop-app-v3 && npm run tauri:dev`, and **revert the constant before committing**.

1. Sign in, start a 25-minute session. Take hands off keyboard and mouse for 20 s. Expected: the timer shows the paused state (`⏸` in the tray label, Resume button on the dashboard). Terminal log shows `user went idle`.
2. Move the mouse. Expected: the "Welcome back" dialog appears with "You were away for 1 minute". Terminal log shows `user came back`.
3. Click "Resume session". Expected: dialog closes, timer resumes, the countdown has **not** lost the away time (server shifts `startTime` on resume).
4. Repeat 1-2, click "End session". Expected: dialog closes, session ends, dashboard shows the start form.
5. Repeat 1-2, click "Keep it paused". Expected: dialog closes, session stays paused; manual Resume still works.
6. Start a session, pause it manually, go idle 20 s, come back. Expected: **no** dialog (we did not auto-pause).
7. With no session running, go idle and come back. Expected: no dialog; log lines still appear.
8. Hide the window to the tray (close button), start a session from the web dashboard, go idle, come back, then show the window. Expected: the dialog is waiting when the window reappears.

Revert `IDLE_THRESHOLD_SECS` to `5 * 60`.

- [ ] **Step 13: Commit**

```bash
cd desktop-app-v3
git add src-tauri/src/tracker/mod.rs src-tauri/src/lib.rs src/lib/idle.ts src/components/IdlePrompt.tsx src/App.tsx
git commit -m "feat(desktop): auto-pause the focus session on idle and prompt on return"
```

---

### Task 12: Docs, rules, and full verification

**Files:**
- Modify: `.claude/rules/desktop-app-v3.md`, `.claude/rules/gotchas.md`, `.claude/rules/testing.md`, `.claude/rules/web-app.md`

- [ ] **Step 1: Update `.claude/rules/desktop-app-v3.md`**

In the Rust Modules table, change the `tracker/` row to:

```
| `tracker/` | Always-on foreground-window + idle tracking (`active-win-pos-rs`, `user-idle`); pure `step()` bucketing; persists to `activity_local`; `flush()` at session end |
```

Add a row:

```
| `activity_upload.rs` | Redacts (`shareWindowDetails`) and uploads closed `activity_local` rows; called by `sync_worker` every 60 s and by `session_end` |
```

In the `store/` row add `activity_local.rs (persisted tracker buckets, 90-day retention)`.

In the `commands/` row add `tracking` to the list.

Under Frontend Layout `routes/` add `SettingsTrackingPage`.

Replace the "Tests" section with:

```
## Tests

Rust unit tests live in `#[cfg(test)]` modules across `src-tauri/src/` (tracker, store, activity_upload, blocking, ai/*, update, device, tray_indicator).

    cd desktop-app-v3/src-tauri && cargo test --lib

No frontend tests. Verification = `cargo test --lib` + `npm run typecheck` + manual smoke test.
```

- [ ] **Step 2: Update `.claude/rules/gotchas.md`**

Append:

```
- **Tracker is always on** — `TrackerHandle` is spawned in `lib.rs` setup, not by `session_start`. Sessions only set `AppState.active_session_id`. If you add a new way to start a session (another device, deep link), you must set that field or the buckets will not be tagged. `session_active` does this for sessions started elsewhere.

- **`shareWindowDetails` is enforced twice** — desktop strips titles/URLs in `activity_upload::redact`, and `/api/activity/sync` strips again from the user's preference row. Do not remove either side; old clients rely on the server side.

- **`activity_local.closed = 0` rows are never uploaded** — a bucket becomes uploadable only on window change, idle, pause, flush, or the `close_all_open` sweep at next launch. If activity "never shows up", check for a long-lived open bucket first.

- **Idle auto-pause is threshold-late** — the tracker emits `tracker-idle-started` only once OS idle reaches `IDLE_THRESHOLD_SECS` (5 min), and the frontend pauses the session via `/api/sessions/[id]/toggle-pause` at that moment. The first 5 minutes of an idle stretch therefore still count as session time. Backdating `pausedAt` needs an API change; deferred to Phase 4.
```

- [ ] **Step 3: Update `.claude/rules/testing.md`**

Change the Desktop v3 row of the Test Suites table to:

```
| Desktop v3 (Tauri, Rust) | `#[cfg(test)]` modules in 24 files | `cd desktop-app-v3/src-tauri && cargo test --lib` |
```

Under "Web Unit Tests" add `activity/sync` 3 to the `src/app/api/` list and bump the header count by the number of tests added in Tasks 1-2 (3 + 3 = 6). Update the Verification Checklist step 4 to `cd desktop-app-v3/src-tauri && cargo test --lib && cd .. && npm run typecheck`.

- [ ] **Step 4: Update `.claude/rules/web-app.md`**

In the Category Normalization section (or directly after it) add:

```
## Activity privacy

`UserPreferences.shareWindowDetails` (default `true`). `/api/activity/sync` reads it per request and stores `windowTitle = 'Hidden'`, `url = null` when `false`, for every `source`. The desktop also strips before upload.
```

- [ ] **Step 5: Full verification**

Run each and record the result:

```bash
cd web-app && npm test                     # all pass, zero "Failed to execute command" / "Failed to parse URL" lines
cd web-app && npm run lint                 # zero errors
cd web-app && npm run build                # succeeds
cd desktop-app-v3/src-tauri && cargo test --lib   # all pass
cd desktop-app-v3 && npm run typecheck     # clean
```

Then the end-to-end check: desktop running, no session, switch windows, wait 60 s, open the web dashboard activity page and confirm the entries appear. Toggle sharing off on the web profile, switch windows on the desktop, wait 60 s, confirm new web entries show `Hidden` with no URL.

- [ ] **Step 6: Commit**

```bash
git add .claude/rules/desktop-app-v3.md .claude/rules/gotchas.md .claude/rules/testing.md .claude/rules/web-app.md
git commit -m "docs: always-on tracker, activity privacy, desktop test command"
```

---

## Self-review

**Spec coverage** (roadmap Phase 1 "Decisions locked"):

| Decision | Task |
|---|---|
| Auto-start on launch, independent of sessions | 8 |
| Tray Pause/Resume | 9 |
| `shareWindowDetails` default true; desktop strips; server strips | 1, 2, 4, 7 |
| `activity_local` persisted, 30 s checkpoint, close on change | 6, 8 |
| Uploaded by 60 s sync worker; 90-day retention | 7 |
| Session tagging via `active_session_id` | 5, 8 |
| Wayland unchanged | 8 (`Poll::Unavailable`) |
| Idle auto-pause + return prompt (2026-09-04 amendment) | 11 |
| Exit criteria verified | 12 |

**Type consistency:** `ActivitySample.session_id: Option<String>` (Task 5) is what `activity_local` reads/writes (Task 6), what `redact` preserves (Task 7), and what `ActivityPayload.session_id: Option<String>` serialises (Task 7). `resolve_share_flag(http, token, &Arc<RwLock<Option<Preferences>>>)` matches `AppState.prefs_cache` (Task 4) and both call sites (Tasks 7, 8). `rebuild_menu(&AppHandle)` is used by `install`, `announce_update`, `handle_menu_event` (Task 9) and `tracking_set_paused` (Task 9). Frontend command names match the `generate_handler!` registrations in Tasks 4 and 9.

**Placeholders:** none. Two spots ask the implementer to copy an existing value rather than invent one (the profile page state setter name in Task 3, the `className` of the AI Settings link in Task 10) because the plan cannot see those lines; both are one-token lookups in the file being edited.
