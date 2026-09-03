# FlowShield Wedge Roadmap — Automatic, Private Time Tracking Fused With Daily Planning

**Status:** approved direction, 2026-09-03; amended 2026-09-04 (see section 6). This document locks sequencing, data-model shape, and decisions for six phases. Each phase gets its own bite-sized implementation plan when the previous phase ships. Plans that exist: Phase 0 [2026-09-04-pricing-truth-phase-0.md](2026-09-04-pricing-truth-phase-0.md), Phase 1 [2026-09-03-always-on-tracking-phase-1.md](2026-09-03-always-on-tracking-phase-1.md).

**Implementation order:** Phase 0 first (one day, web only, independent). Then Phase 1 Tasks 1-12 in order. Phase 0 and Phase 1 touch different directories and can be worked on the same day, but land Phase 0 first so the live site stops over-promising while Phase 1 is in progress.

**Audience:** an engineer or agent with zero context on this repo. Read `.claude/CLAUDE.md` and `.claude/rules/*.md` first.

---

## 1. Where the product stands (audit, 2026-09-03)

FlowShield today is a focus-timer plus activity tracker. Four clients (Next.js web, Tauri desktop, Expo mobile, Chrome/Firefox extension) share one API. Evidence-backed status against the wedge checklist:

| Capability | Status | Evidence |
|---|---|---|
| Manual timer | Yes | `web-app/src/components/dashboard/FocusTimer.tsx`, `desktop-app-v3/src/routes/DashboardPage.tsx`, `mobile-app/src/screens/TimerScreen.tsx` |
| Automatic activity tracking | **Session-gated only** | `desktop-app-v3/src-tauri/src/tracker/mod.rs:3-4` polls "while a focus session is running"; spawned in `commands/sessions.rs::session_start` |
| Privacy of tracked data | **Raw titles + URLs uploaded** | `ActivitySample` has `window_title`, `url`, `process_name`; stored verbatim in Prisma `ActivityLog` (`web-app/prisma/schema.prisma:82-96`). No local-only option. |
| Idle detection | Partial | 5-minute threshold drops samples; no auto-pause, no prompt (`tracker/mod.rs:32`) |
| Distraction blocking | Yes | Hosts-file, domains only, auto-apply on session start (`DashboardPage.tsx:223-266`) |
| Offline sync | Activity samples only | `store/pending_sync.rs`, `mobile-app/src/lib/offlineQueue.ts`, `browser-extension/chrome/background.js:14` |
| Tasks / plans | **None** | No task entity in schema |
| Calendar | **None** | Zero calendar code; Google is OAuth login only |
| Billable / client / invoice | Partial | `Project.hourlyRate`, `Project.budget`, `/api/projects/cost`; no client, no billable flag, no invoice |
| Categorisation | Rule-based | `CategoryRule` keyword rules, 45 defaults, user overrides |
| Local AI | Real | candle embedder + Phi-3 LLM, retriever, briefing, reflection (`desktop-app-v3/src-tauri/src/ai/`) — prose only, no ranking |
| Pricing | **Incoherent** | Tier enum + `Subscription` + `getUserTier()` exist; one gate enforced (coach quota); `Pricing.tsx:34` says "All core features are free. No time limit." |

Three contradictions between the current code and the wedge:

1. Tracking is not automatic. It runs only inside a user-started session.
2. Tracking is not private. Raw window titles and URLs leave the device.
3. There is no planning half. Nothing to compare actual time against.

## 2. The wedge

> Automatic, privacy-respecting time tracking fused directly into daily planning. The app tells you where your time actually went versus what you planned, and re-plans tomorrow based on the gap. Billable-hour output is a first-class citizen for solo freelancers.

Assets that already fit: Tauri tracker, hosts-file blocking, on-device AI stack, `Project.hourlyRate`, four clients, sync/backoff plumbing.

## 3. Phase sequence

Phases are strictly ordered. Each depends on the previous one's data model. Do not parallelise across phases.

```
Phase 0  Pricing truth           (1 day)      no code dependencies
Phase 1  Always-on tracking      (1-2 weeks)  ← plan written
   └─ Phase 2  Task + plan entity   (2 weeks)
        └─ Phase 3  Calendar read/write (2 weeks)
             └─ Phase 4  Plan vs actual + re-plan (2-3 weeks)
                  └─ Phase 5  Client + billable + invoice (1-2 weeks)
```

### Phase 0 — Pricing page truth

**Goal:** the public site stops promising "free forever" for everything while a three-tier model exists in code.

**Plan:** [2026-09-04-pricing-truth-phase-0.md](2026-09-04-pricing-truth-phase-0.md)

**Scope (amended 2026-09-04):** landing page copy only — `Pricing.tsx`, `FeaturesGrid.tsx`, `Hero.tsx`, `Navbar.tsx`, `Footer.tsx`, `FAQ.tsx`, `CrossPlatform.tsx`, `app/page.tsx`, `app/layout.tsx`.

- Rewrite Pricing to one honest Free plan plus an informational "Pro — planned" card. No prices. No payment provider. No waitlist (there is no backend to hold one; the original "join the waitlist" idea is dropped).
- Remove "Intelligent break scheduling" from the Focus Timer feature copy (it is a three-branch lookup on duration, `FocusTimer.tsx:13-17`).
- Pull the AI coach and Teams/leaderboard off the landing page: stop rendering `AICoachShowcase` and `TeamsSection`, drop their nav/footer links and FAQ entries, and rewrite the hero so it no longer leads with AI. Keep the component files and the `/coach`, `/community` app pages; their fate is decided after Phase 4.
- Remove gamification copy (badges, achievements, streaks) from the features grid and plan list.
- Do not make any privacy claim yet. That claim becomes true only after Phase 1 ships with the toggle.

**Exit criteria:** landing copy matches shipped behaviour. `npm run lint` and `npm run build` clean.

### Phase 1 — Always-on tracking + privacy opt-in

**Plan:** [2026-09-03-always-on-tracking-phase-1.md](2026-09-03-always-on-tracking-phase-1.md)

**Decisions locked (2026-09-03):**

| Decision | Choice | Why |
|---|---|---|
| Tracker lifecycle | Auto-start on app launch, independent of sessions. Tray menu gets Pause/Resume. | Wedge requires "where your time actually went", not "during the 25 minutes you told us to watch". |
| Privacy default | Upload by default. New preference `shareWindowDetails` (default `true`). When `false`, desktop strips `windowTitle` and `url` before upload and the server strips them again on receipt. | User's call. Server-side strip is defence in depth against old clients. |
| Local persistence | New SQLite table `activity_local` on desktop: every bucket persisted as it opens, checkpointed every 30 s, closed on window change. Uploaded by the existing 60 s sync worker. 90-day retention. | Crash-safe. Local history is the raw material for Phase 4. |
| Session tagging | Sessions no longer own the tracker. `AppState.active_session_id` is set on start/end; each bucket records the session active when it opened. | Session start/end becomes a label on a continuous timeline. |
| Wayland | No change. Tracker still yields `Unavailable` on pure Wayland. | Out of scope; needs per-compositor portal work. |
| Idle handling (added 2026-09-04) | Tracker emits `tracker-idle-started` / `tracker-idle-ended` at the existing 5-minute threshold. Desktop auto-pauses a running session on idle-start and shows a "welcome back" prompt (Resume / End / Keep paused) on idle-end. Sessions the user paused manually are not touched. | Rubric table-stakes item ("auto-pause/prompt when no activity detected"). The tracker rewrite is the cheapest moment to add it. Plan Task 11. |

**Known limitation:** the pause lands when the threshold is crossed, so the first 5 minutes of an idle stretch still count as session time. Backdating `pausedAt` needs an API change; deferred to Phase 4.

**Exit criteria:** desktop tracks with no session running; toggling `shareWindowDetails` off results in `windowTitle = 'Hidden'` and `url = null` in `ActivityLog` for all sources; tray Pause stops new buckets; a running session auto-pauses on idle and the prompt appears on return; `cargo test`, `npm run typecheck`, web `npm test`, `npm run lint`, `npm run build` all pass.

### Phase 2 — Task + plan entity

**Goal:** the smallest task model that lets a user say what they intend to do tomorrow, and lets sessions and tracked time attach to it.

**Data model (Prisma, web-app):**

```prisma
model Task {
  id              String     @id @default(uuid())
  userId          String
  projectId       String?
  title           String
  notes           String?
  estimateMinutes Int?
  dueAt           DateTime?
  scheduledStart  DateTime?
  scheduledEnd    DateTime?
  status          TaskStatus @default(TODO)
  completedAt     DateTime?
  sortOrder       Int        @default(0)
  tags            String[]   @default([])   // added 2026-09-04; same shape as UserPreferences.primaryDistractions
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  project         Project?   @relation(fields: [projectId], references: [id], onDelete: SetNull)
  sessions        Session[]

  @@index([userId, status, scheduledStart])
  @@map("tasks")
}

enum TaskStatus { TODO DOING DONE }
```

`Session` gains `taskId String?`. No subtasks, no recurrence, no dependencies. Those are explicitly deferred. Tags are in (amended 2026-09-04): a free-form `String[]` on `Task`, no separate `Tag` model, filter by tag on the list endpoint.

**Surfaces:**

- Web: `/api/tasks` (list/create, `?tag=` and `?status=` filters), `/api/tasks/[id]` (patch/delete). Zod schemas. Quick-add input on the dashboard with a plain date picker. No natural-language parsing in this phase.
- Web (added 2026-09-04): `/api/search?q=` — one endpoint, one `ILIKE` per entity, returns `{ tasks, projects, sessions }` capped at 10 rows each, scoped to the caller. Sessions match on their project name and task title; activity logs are **not** searched (volume, and titles may be `Hidden`). A search box in the dashboard header on web. Desktop, mobile, extension: none in this phase.
- Desktop: task list in the dashboard sidebar, pick a task when starting a session, quick-add. Task mutations queued offline in a new `pending_task_ops` SQLite table using the same backoff as `pending_sync.rs`.
- Mobile and extension: read-only task list. Session start can pick a task.

**Exit criteria:** create a task on web, start a session against it on desktop offline, come online, see the session attached to the task on web. Tag a task, filter the list by that tag. Type a word from the task title into the dashboard search box and see the task and its session in the results.

### Phase 3 — Calendar read, then write

**Goal:** Google Calendar first. Read free/busy so the planner knows real availability. Write scheduled tasks as events.

**Data model:**

```prisma
model CalendarConnection {
  id            String   @id @default(uuid())
  userId        String   @unique
  provider      String   // "google"
  refreshToken  String   // AES-GCM encrypted with CALENDAR_TOKEN_KEY env var
  calendarId    String   // primary
  syncToken     String?  // incremental sync cursor
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("calendar_connections")
}
```

`Task` gains `calendarEventId String?`.

**Constraints:** the existing Google OAuth login at `/api/auth/google` requests only profile scopes. Calendar needs a separate consent flow with `calendar.events` scope. Do not widen the login scope.

**Order inside the phase:** (a) OAuth connect + disconnect, (b) read events into a `/api/calendar/busy?from&to` endpoint, (c) write: when `Task.scheduledStart/End` are set, upsert an event; when cleared, delete it. Two-way inbound edits (user drags the event in Google) are read on next sync and update the task.

**Exit criteria:** schedule a task on web, see it in Google Calendar; move it in Google, see the task move.

### Phase 4 — Plan vs actual and re-plan

**Goal:** the actual product. A day view showing planned blocks against tracked activity, the gap per task, and a "re-plan tomorrow" action driven by the on-device LLM.

**Computation (pure functions, web `src/lib/plan-actual.ts` and desktop `ai/plan_gap.rs`):**

- For each task with a scheduled block: sum `ActivityLog` durations inside the block by category; sum session time attached to the task; produce `plannedMinutes`, `focusedMinutes`, `distractedMinutes`, `unplannedMinutes`.
- Day summary: planned total, tracked total, top three unplanned apps.

**Re-plan:** desktop only in v1. Feed the day summary plus tomorrow's open tasks and calendar busy blocks into the existing `LlmRuntime` via a new prompt in `ai/prompts.rs`. Output is a proposed ordering with start times. The user accepts or edits; accepted proposals write `scheduledStart/End` (and therefore calendar events via Phase 3).

**Exit criteria:** after one tracked day, the desktop shows plan-vs-actual and offers a re-plan that the user can accept in one click.

### Phase 5 — Client, billable, invoice export

**Goal:** monetisation lever for freelancers.

**Data model:**

```prisma
model Client {
  id        String    @id @default(uuid())
  userId    String
  name      String
  email     String?
  currency  String    @default("USD")
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  projects  Project[]
  @@map("clients")
}
```

`Project` gains `clientId String?`. `Session` gains `billable Boolean @default(true)`.

**Surfaces:** `/api/clients`, client filter on `/api/reports/weekly`, `/api/invoices/export?clientId&from&to&format=csv|pdf`. PDF via a server-side renderer; pick one library at plan time.

**Freemium hook (decided 2026-09-04, ships in this phase):** Free keeps unlimited tasks, sessions, and projects. Free is capped to **90 days of activity and session history** on the server (matches the desktop `activity_local` retention). Pro lifts the cap and unlocks clients + invoice export. Enforcement is a date filter in the analytics, sessions, export, and reports endpoints keyed on `getUserTier()`; older rows are retained, not deleted, so an upgrade restores them. The coach quota stops being the only paid gate. No payment provider is chosen in this document; Lemon Squeezy was the Sprint 3.5 Phase B candidate and is still the default unless something changes.

**Exit criteria:** export a month of billable hours for one client as CSV and PDF with rate and total. A FREE user's analytics stop at 90 days; the same user set to PRO by an admin sees the full history without any data migration.

## 4. Deliberately deferred

Listed so nobody re-opens them mid-phase.

- Kanban, timeline, timesheet views. Solo-freelancer wedge does not need them yet.
- Public API keys and outgoing webhooks.
- SSO / SCIM and seat-based billing.
- Team workload and capacity views. Teams stay a leaderboard.
- Natural-language date parsing in quick-add. Revisit after Phase 2 ships; `chrono-node` is a one-line add once `Task.dueAt` exists.
- Subtasks, recurrence, dependencies. (Tags moved into Phase 2 on 2026-09-04.)
- Predictive distraction detection.
- Machine-learned categorisation. Rules stay.
- Landing page privacy copy. Only after Phase 1 ships and the toggle is real.
- Deleting the AI coach (`/coach`, `/api/coach/advice`) and Teams (`/community`, `/api/teams`, `/api/leaderboard`) code. Phase 0 only unrenders them on the landing page. Decide after Phase 4 proves the on-device re-plan; if it does, the Gemini coach is redundant and goes.
- Search on desktop, mobile, extension. Web only in Phase 2.
- OpenAPI spec updates for new endpoints. Do at the end of each phase, not per task.

## 5. Cross-phase engineering rules

- Every phase plan follows `docs/superpowers/plans/` format: bite-sized TDD tasks, no placeholders.
- Desktop versions are owned by release-please. Never hand-edit `package.json`, `tauri.conf.json`, or `Cargo.toml` versions.
- Web deploys continuously from `main`. Every web task must leave `npm run lint` at zero errors and `npm run build` green.
- Rust tests: `cd desktop-app-v3/src-tauri && cargo test --lib`. Existing `#[cfg(test)]` modules live in 21 files; `.claude/rules/testing.md` is stale on this point and Phase 1 fixes it.
- Prisma migrations are hand-written SQL under `web-app/prisma/migrations/YYYYMMDDHHMMSS_snake_name/migration.sql`. CI has a schema-drift job.
- No `Co-Authored-By` trailers on commits.

## 6. Amendments (2026-09-04)

Source: a tiered feature-rubric review of the app on 2026-09-04 (Tier 1 table stakes, Tier 2 differentiators, Tier 3 moat, business model, deliberate exclusions). Findings that changed this document:

| Finding | Change |
|---|---|
| Zero of six Tier-1 items fully met. Cross-entity search and tags are table stakes and trivial once `Task` exists. | Phase 2 gains `Task.tags` and `/api/search`. |
| Idle auto-pause/prompt is a Tier-2 item and the tracker already computes idle seconds. | Phase 1 gains Task 11 (idle events + session auto-pause + prompt). |
| The rubric lists gamification and a generic AI chatbot as deliberate exclusions; the landing page sells both as headline features, and the coach quota is the only paid gate. | Phase 0 scope widened: AI coach and Teams sections unrendered, gamification copy removed. Code deletion deferred to after Phase 4. |
| No freemium hook exists; "all core features are free, no time limit" is the public promise. | Phase 5 defines the hook: 90-day history cap on Free, unlimited on Pro. Phase 0 changes the public promise to "everything shipped today is free" without promising forever. |
| Multiple views (kanban, timeline, timesheet), API keys, webhooks, SSO/SCIM, team capacity: Tier-2/3 in the rubric. | Still deferred. None of them move a solo freelancer to pay. Re-evaluate after Phase 5. |
| Natural-language task capture: Tier 1 in the rubric. | Still deferred past Phase 2. Cheap to add later, and it must not block the task entity landing. |

Not changed: the wedge, the phase order, the Phase 1 privacy decisions, the data models beyond `Task.tags`.
