---
description: Common FlowShield gotchas — mistakes that have caused bugs before, always check these
alwaysApply: true
---

# Common Gotchas

- **`<a href="/">` in Next.js pages** → ESLint error; always use `<Link href="/">` from `next/link` for all internal page navigation. `<a>` is only for external URLs.

- **Timer drift** — all surfaces (web, desktop, extension) anchor to server `startTime`. Never do `prev - 1` countdown. Always recalculate from wall clock: `plannedEnd - Date.now()`.

- **Category names mismatch** — desktop `ActivityCategory` enum values (`Productivity`, `Social`) differ from web analytics strings (`Work`, `Social Media`). Always run through `NormalizeCategory()` in `ApiClient.SyncActivitiesAsync()` before syncing to web.

- **Pusher key in client bundle** — `NEXT_PUBLIC_PUSHER_KEY` is intentionally public (client-side). Suppress Netlify secrets scan warning by keeping `PUSHER_KEY` in `SECRETS_SCAN_OMIT_KEYS`.

- **`_reSyncTimer` in `SessionManager`** — must be started in `InitializeAsync()` (not just `StartSessionAsync()`). If only started in `StartSessionAsync`, the desktop never polls for sessions started on other devices.

- **Netlify = no WebSockets** — never add raw WebSocket endpoints. Use SSE for streaming (coach) and Pusher for real-time events.

- **`npm run lint` must be zero errors** — warnings are acceptable but errors block CI. Run locally before pushing. ESLint treats `@next/next/no-html-link-for-pages` as an error.

- **Tracker is always on** — `TrackerHandle` is spawned in `lib.rs` setup, not by `session_start`. Sessions only set `AppState.active_session_id`. If you add a new way to start a session (another device, deep link), you must set that field or the buckets will not be tagged. `session_active` does this for sessions started elsewhere.

- **`shareWindowDetails` is enforced twice** — desktop strips titles/URLs in `activity_upload::redact`, and `/api/activity/sync` strips again from the user's preference row. Do not remove either side; old clients rely on the server side.

- **`activity_local.closed = 0` rows are never uploaded** — a bucket becomes uploadable only on window change, idle, pause, flush, or the `close_all_open` sweep at next launch. If activity "never shows up", check for a long-lived open bucket first.

- **Idle auto-pause is threshold-late** — the tracker emits `tracker-idle-started` only once OS idle reaches `IDLE_THRESHOLD_SECS` (5 min), and the frontend pauses the session via `/api/sessions/[id]/toggle-pause` at that moment. The first 5 minutes of an idle stretch therefore still count as session time. Backdating `pausedAt` needs an API change; deferred to Phase 4.
