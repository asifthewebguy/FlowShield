# Task + Plan Entity (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the smallest task model that lets a user say what they intend to do tomorrow, and lets sessions and tracked time attach to it. Tasks can be tagged and filtered; a cross-entity search box finds tasks, projects, and sessions by name.

**Architecture:** One new Prisma model (`Task`) plus one new field on `Session` (`taskId`). Web gets full CRUD + search; desktop gets CRUD with an offline write queue (new `pending_task_ops` SQLite table, same backoff shape as the existing `pending_sync` module) plus a task picker on session start; mobile and the browser extension get a read-only task list. No subtasks, no recurrence, no dependencies, no natural-language date parsing — all explicitly deferred past this phase.

**Tech Stack:** Next.js 16 + Prisma + Zod (web), Tauri 2 + Rust + `rusqlite` + React/Zustand (desktop), Expo/React Native (mobile), Chrome MV3 + Firefox MV2 (extension) — all already in place, no new dependencies anywhere.

**Spec:** [2026-09-03-wedge-roadmap.md](2026-09-03-wedge-roadmap.md), section "Phase 2 — Task + plan entity" (including the 2026-09-04 amendment adding `tags` and `/api/search`).

## Global Constraints

- No new npm or Cargo dependencies anywhere (web, desktop, mobile, extension).
- Do not hand-edit desktop version fields — release-please owns `desktop-app-v3/package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
- Task model is locked to the roadmap's shape: no subtasks, no recurrence, no dependencies, no natural-language parsing in quick-add. Do not add any of these even if it looks easy.
- Tags are a free-form `String[]` directly on `Task` (same shape as `UserPreferences.primaryDistractions`) — no separate `Tag` model, no join table.
- Search is one endpoint (`/api/search?q=`), one case-insensitive `contains` filter per entity (Prisma's `mode: 'insensitive'`, not raw SQL), returns `{ tasks, projects, sessions }` capped at 10 rows each, scoped to `userId`. Sessions match on their linked project's name or linked task's title (not on activity data). **Activity logs are never searched** — volume, and titles may be the literal string `Hidden`.
- Web must pass `cd web-app && npm test`, `npm run lint` (zero errors), `npm run build`.
- Prisma migrations are hand-written SQL under `web-app/prisma/migrations/YYYYMMDDHHMMSS_snake_name/migration.sql` — never `prisma migrate dev`.
- Rust tests: `cd desktop-app-v3/src-tauri && cargo test --lib`. Desktop frontend: `cd desktop-app-v3 && npm run typecheck`.
- `pending_task_ops` follows the exact backoff shape already in `store/pending_sync.rs`: `min(5min · 2^retry, 30min)`, oldest-first draining. Unlike `pending_sync` (legacy, drain-only — nothing enqueues into it anymore), `pending_task_ops` is actively written to: every task mutation that fails while offline enqueues here, and `sync_worker.rs`'s existing 60s tick becomes the drain point (a third job, alongside the two it already runs).
- Replaying a queued op that the server answers with a 4xx **drops the row** instead of retrying — same rule `activity_upload.rs` adopted in Phase 1 (`upload_once` drops a batch on permanent 4xx rejection). A malformed payload is dropped the same way. Only network-layer failures (`AppError::Network`) back off and retry. Without this, one bad row retries every 30 min forever.
- A task created offline gets a local `pending-<hex>` id until `sync_worker` replays the create. That id never exists on the server, so `tasks_update`/`tasks_delete` refuse `pending-` ids up front (409 `TASK_NOT_SYNCED`) and the desktop session-start picker hides them. Otherwise an offline status-cycle would enqueue a PATCH against an id the server will 404 forever.
- Zod is **v4** (`zod@4.3.6`). Keep the existing `z.string().uuid()` / `z.string().datetime()` style already used by `CreateSessionSchema` — do not switch to `z.uuid()` / `z.iso.datetime()` in this phase.
- Desktop, mobile, extension: no search UI in this phase (web only, per roadmap).
- OpenAPI spec (`web-app/openapi.yaml`) updates land in the last task, not per-task.
- Commit messages: Conventional Commits. **No `Co-Authored-By` trailer.**

---

## File structure

**Web (`web-app/`)**

| File | Change | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | modify | add `Task` model, `TaskStatus` enum, `Session.taskId` + relation |
| `prisma/migrations/20260905000000_add_task_model/migration.sql` | create | `CREATE TABLE tasks`, `ALTER TABLE sessions ADD COLUMN "taskId"` |
| `src/lib/schemas.ts` | modify | `CreateTaskSchema`, `UpdateTaskSchema`; `CreateSessionSchema` gains optional `taskId` |
| `src/lib/schemas.test.ts` | modify | tests for the two new schemas + the `CreateSessionSchema` addition |
| `src/app/api/tasks/route.ts` | create | `GET` (list, `?tag=`/`?status=` filters), `POST` (create) |
| `src/app/api/tasks/route.test.ts` | create | list/filter/create tests |
| `src/app/api/tasks/[id]/route.ts` | create | `PATCH`, `DELETE` |
| `src/app/api/tasks/[id]/route.test.ts` | create | patch/delete/ownership tests |
| `src/app/api/search/route.ts` | create | cross-entity search |
| `src/app/api/search/route.test.ts` | create | search tests |
| `src/app/api/sessions/route.ts` | modify | accept optional `taskId` on session create |
| `src/app/api/sessions/route.test.ts` | modify (exists — race-check suite) | test `taskId` is stored and ownership-validated |
| `src/components/dashboard/TaskList.tsx` | create | quick-add input + list, tag filter chips |
| `src/components/dashboard/SearchBox.tsx` | create | header search box + results dropdown |
| `src/app/(app)/dashboard/page.tsx` | modify | render `TaskList` and `SearchBox` |

**Desktop Rust (`desktop-app-v3/src-tauri/src/`)**

| File | Change | Responsibility |
|---|---|---|
| `api/tasks.rs` | create | `Task` struct, `list_tasks`/`create_task`/`update_task`/`delete_task` REST calls |
| `api/mod.rs` | modify | `pub mod tasks;` |
| `api/sessions.rs` | modify | `Session.task_id`, `start_session` gains `task_id: Option<&str>` |
| `store/pending_task_ops.rs` | create | offline write queue: enqueue + drain, same backoff as `pending_sync` |
| `store/mod.rs` | modify | register `pending_task_ops::migrate`, `pub mod pending_task_ops;` |
| `commands/tasks.rs` | create | `tasks_list`/`tasks_create`/`tasks_update`/`tasks_delete` — offline-queue-aware |
| `commands/mod.rs` | modify | `pub mod tasks;` |
| `commands/sessions.rs` | modify | `session_start` gains `task_id: Option<String>` |
| `sync_worker.rs` | modify | Job 3 — drain `pending_task_ops` |
| `lib.rs` | modify | register the 4 new commands in `generate_handler!` |

**Desktop frontend (`desktop-app-v3/src/`)**

| File | Change | Responsibility |
|---|---|---|
| `lib/tasks.ts` | create | `useTasksStore` — list/create/update/delete, offline-aware |
| `routes/DashboardPage.tsx` | modify | task list sidebar section, quick-add, task picker in the session-start form |

**Mobile (`mobile-app/src/`)**

| File | Change | Responsibility |
|---|---|---|
| `lib/api.ts` | modify | `getTasks()` |
| `screens/TasksScreen.tsx` | create | read-only task list |
| `navigation/AppNavigator.tsx` | modify | add the `Tasks` tab |
| `screens/TimerScreen.tsx` | modify | optional task picker when starting a session |

**Browser extension (`browser-extension/{chrome,firefox}/`)**

| File | Change | Responsibility |
|---|---|---|
| `background.js` (both) | modify | `fetchTasks()`, cached in `chrome.storage.local`, polled like preferences (every 15 min) |
| `popup/popup.js` (both) | modify | render the cached task list read-only |
| `popup/popup.html` (both) | modify | task list container markup |

**Docs**

| File | Change | Responsibility |
|---|---|---|
| `web-app/openapi.yaml` | modify | add `/api/tasks`, `/api/tasks/{id}`, `/api/search` |
| `.claude/rules/web-app.md`, `.claude/rules/desktop-app-v3.md`, `.claude/rules/mobile-app.md`, `.claude/rules/browser-extension.md`, `.claude/rules/testing.md` | modify | reflect the new model, routes, offline queue, test counts |

---

## Interfaces summary (single source of truth for names and types)

```ts
// web-app/src/lib/schemas.ts
export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
  projectId: z.string().uuid().optional().nullable(),
  estimateMinutes: z.number().int().min(1).max(1440).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  scheduledStart: z.string().datetime().optional().nullable(),
  scheduledEnd: z.string().datetime().optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});
export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  status: z.enum(['TODO', 'DOING', 'DONE']).optional(),
});
// CreateSessionSchema gains: taskId: z.string().uuid().optional().nullable(),
```

```rust
// desktop-app-v3/src-tauri/src/api/tasks.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    #[serde(default)] pub notes: Option<String>,
    #[serde(default)] pub project_id: Option<String>,
    #[serde(default)] pub estimate_minutes: Option<i32>,
    #[serde(default)] pub due_at: Option<String>,
    #[serde(default)] pub scheduled_start: Option<String>,
    #[serde(default)] pub scheduled_end: Option<String>,
    pub status: String, // "TODO" | "DOING" | "DONE"
    #[serde(default)] pub tags: Vec<String>,
}
pub async fn list_tasks(http, token) -> AppResult<Vec<Task>>;
pub async fn create_task(http, token, title: &str, project_id: Option<&str>) -> AppResult<Task>;
pub async fn update_task(http, token, id: &str, patch: serde_json::Value) -> AppResult<Task>;
pub async fn delete_task(http, token, id: &str) -> AppResult<()>;

// desktop-app-v3/src-tauri/src/store/pending_task_ops.rs
pub struct PendingTaskOp { pub id: i64, pub op: String /* "create"|"update"|"delete" */, pub payload: String, pub retry_count: i64 }
pub fn migrate(conn: &Connection) -> AppResult<()>;
pub fn enqueue(db: &Db, op: &str, payload: &str) -> AppResult<i64>;
pub fn ready_rows(db: &Db, limit: i64) -> AppResult<Vec<PendingTaskOp>>;
pub fn delete(db: &Db, id: i64) -> AppResult<()>;
pub fn record_failure(db: &Db, id: i64, retry_count: i64) -> AppResult<()>;

// desktop-app-v3/src-tauri/src/commands/tasks.rs — Tauri commands (frontend names)
tasks_list() -> Task[]
tasks_create(title: string, projectId?: string) -> Task
tasks_update(id: string, patch: object) -> void   // rejects ids starting with "pending-" (409 TASK_NOT_SYNCED)
tasks_delete(id: string) -> void                  // same guard
```

```ts
// desktop-app-v3/src/lib/tasks.ts
export interface Task { id: string; title: string; notes?: string | null; projectId?: string | null;
  estimateMinutes?: number | null; dueAt?: string | null; scheduledStart?: string | null;
  scheduledEnd?: string | null; status: 'TODO' | 'DOING' | 'DONE'; tags: string[] }
useTasksStore: { items: Task[]; loading: boolean; error: string | null;
  refresh(): Promise<void>; create(title: string, projectId?: string | null): Promise<Task>;
  update(id: string, patch: Record<string, unknown>): Promise<void>; remove(id: string): Promise<void> }
```

---

### Task 1: Web — `Task` model, migration, `Session.taskId`

**Files:**
- Modify: `web-app/prisma/schema.prisma`
- Create: `web-app/prisma/migrations/20260905000000_add_task_model/migration.sql`

**Interfaces:**
- Produces: `Task` Prisma model, `TaskStatus` enum, `Session.taskId` — every later web task depends on these exact field names.

- [ ] **Step 1: Add the `Task` model and `TaskStatus` enum**

In `web-app/prisma/schema.prisma`, add after the `Project` model:

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
  tags            String[]   @default([])
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  project         Project?   @relation(fields: [projectId], references: [id], onDelete: SetNull)
  sessions        Session[]

  @@index([userId, status, scheduledStart])
  @@map("tasks")
}

enum TaskStatus {
  TODO
  DOING
  DONE
}
```

Add `tasks Task[]` to the `User` model's relation list (next to `projects Project[]`).

Add `tasks Task[]` to the `Project` model's relation list (next to `sessions Session[]`).

In the `Session` model, add `taskId String?` next to `projectId String?`, and `task Task? @relation(fields: [taskId], references: [id], onDelete: SetNull)` next to the `project` relation.

- [ ] **Step 2: Write the migration**

Create `web-app/prisma/migrations/20260905000000_add_task_model/migration.sql`:

```sql
-- Task entity (Phase 2): the smallest model that lets a user say what they
-- intend to do, with sessions and tracked time attaching to it via
-- Session.taskId. Tags are a free-form array, same shape as
-- UserPreferences.primaryDistractions — no separate Tag table.

CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DOING', 'DONE');

CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "estimateMinutes" INTEGER,
    "dueAt" TIMESTAMP(3),
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tasks_userId_status_scheduledStart_idx" ON "tasks"("userId", "status", "scheduledStart");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sessions" ADD COLUMN "taskId" TEXT;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Regenerate the Prisma client and verify**

Run: `cd web-app && DATABASE_URL="postgresql://user:pass@localhost:5432/db" npx prisma generate`
Expected: "Generated Prisma Client" with no errors — confirms `schema.prisma` and the migration agree (this repo's CI has a schema-drift job that fails if they don't).

Run: `cd web-app && npm run build`
Expected: succeeds (a previous phase's `shareWindowDetails` addition needed this same regenerate step before `prisma.userPreferences` picked up the new field — same applies here for `prisma.task`).

- [ ] **Step 4: Commit**

```bash
git add web-app/prisma/schema.prisma web-app/prisma/migrations/20260905000000_add_task_model/
git commit -m "feat(web): add Task model, TaskStatus enum, and Session.taskId"
```

---

### Task 2: Web — Zod schemas for tasks + `taskId` on session create

**Files:**
- Modify: `web-app/src/lib/schemas.ts`
- Modify: `web-app/src/lib/schemas.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CreateTaskSchema`, `UpdateTaskSchema` (exact shape in the Interfaces Summary above) — Tasks 3 and 4 import these. `CreateSessionSchema` gains `taskId`.

- [ ] **Step 1: Write the failing tests**

In `web-app/src/lib/schemas.test.ts`, add:

```ts
describe('CreateTaskSchema', () => {
  it('accepts a minimal task (title only)', () => {
    const result = CreateTaskSchema.safeParse({ title: 'Write the report' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty title', () => {
    const result = CreateTaskSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('accepts tags as an array of strings', () => {
    const result = CreateTaskSchema.safeParse({ title: 'x', tags: ['deep-work', 'client-a'] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tags).toEqual(['deep-work', 'client-a']);
  });

  it('rejects a non-uuid projectId', () => {
    const result = CreateTaskSchema.safeParse({ title: 'x', projectId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 tags', () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
    const result = CreateTaskSchema.safeParse({ title: 'x', tags });
    expect(result.success).toBe(false);
  });
});

describe('UpdateTaskSchema', () => {
  it('accepts a bare status change', () => {
    const result = UpdateTaskSchema.safeParse({ status: 'DONE' });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (no-op patch)', () => {
    const result = UpdateTaskSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status value', () => {
    const result = UpdateTaskSchema.safeParse({ status: 'ARCHIVED' });
    expect(result.success).toBe(false);
  });
});

describe('CreateSessionSchema taskId', () => {
  it('accepts an optional taskId', () => {
    const result = CreateSessionSchema.safeParse({ plannedDuration: 25, taskId: '123e4567-e89b-12d3-a456-426614174000' });
    expect(result.success).toBe(true);
  });

  it('accepts a null taskId', () => {
    const result = CreateSessionSchema.safeParse({ plannedDuration: 25, taskId: null });
    expect(result.success).toBe(true);
  });

  it('omitting taskId still works (backward compatible)', () => {
    const result = CreateSessionSchema.safeParse({ plannedDuration: 25 });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `cd web-app && npm test -- schemas`
Expected: FAIL — `CreateTaskSchema is not defined` / `UpdateTaskSchema is not defined`.

- [ ] **Step 3: Add the schemas**

In `web-app/src/lib/schemas.ts`, add after `CreateProjectSchema`:

```ts
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(200),
  notes: z.string().max(2000).optional(),
  projectId: z.string().uuid().optional().nullable(),
  estimateMinutes: z.number().int().min(1).max(1440).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  scheduledStart: z.string().datetime().optional().nullable(),
  scheduledEnd: z.string().datetime().optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  status: z.enum(['TODO', 'DOING', 'DONE']).optional(),
});
```

In `CreateSessionSchema` (already in the file), add one field:

```ts
export const CreateSessionSchema = z.object({
  plannedDuration: z.number().int().min(1).max(480),
  sessionType: z.enum(['WORK', 'STUDY', 'CREATIVE']).default('WORK'),
  projectId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable(),
});
```

- [ ] **Step 4: Run to verify GREEN**

Run: `cd web-app && npm test -- schemas`
Expected: all new tests PASS, existing schema tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add web-app/src/lib/schemas.ts web-app/src/lib/schemas.test.ts
git commit -m "feat(web): CreateTaskSchema, UpdateTaskSchema, and taskId on CreateSessionSchema"
```

---

### Task 3: Web — `/api/tasks` (list, create)

**Files:**
- Create: `web-app/src/app/api/tasks/route.ts`
- Create: `web-app/src/app/api/tasks/route.test.ts`

**Interfaces:**
- Consumes: `CreateTaskSchema` (Task 2), `Task` Prisma model (Task 1).
- Produces: `GET /api/tasks?tag=&status=` → `{ tasks: Task[] }`; `POST /api/tasks` → `{ task: Task }`, 201.

- [ ] **Step 1: Write the failing tests**

Create `web-app/src/app/api/tasks/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(async () => []),
  create: vi.fn(async (args: any) => ({ id: 'task-1', ...args.data })),
  projectFindFirst: vi.fn(async () => null),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: { findMany: mocks.findMany, create: mocks.create },
    project: { findFirst: mocks.projectFindFirst },
  },
}));
vi.mock('@/lib/jwt', () => ({ getAuthUserId: vi.fn(async () => 'user-1') }));

import { GET, POST } from './route';

function makeGetRequest(query: string): NextRequest {
  return new Request(`http://localhost/api/tasks${query}`) as unknown as NextRequest;
}

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('GET /api/tasks', () => {
  beforeEach(() => mocks.findMany.mockClear());

  it('lists the caller\'s tasks scoped by userId', async () => {
    const res = await GET(makeGetRequest(''));
    expect(res.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });

  it('filters by tag', async () => {
    await GET(makeGetRequest('?tag=deep-work'));
    const call = mocks.findMany.mock.calls[0][0];
    expect(call.where.tags).toEqual({ has: 'deep-work' });
  });

  it('filters by status', async () => {
    await GET(makeGetRequest('?status=DONE'));
    const call = mocks.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('DONE');
  });

  it('rejects an invalid status value', async () => {
    const res = await GET(makeGetRequest('?status=ARCHIVED'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tasks', () => {
  beforeEach(() => mocks.create.mockClear());

  it('creates a task with just a title', async () => {
    const res = await POST(makePostRequest({ title: 'Write the report' }));
    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', title: 'Write the report' }) })
    );
  });

  it('rejects an empty title', async () => {
    const res = await POST(makePostRequest({ title: '' }));
    expect(res.status).toBe(400);
  });

  it('defaults tags to an empty array when omitted', async () => {
    await POST(makePostRequest({ title: 'x' }));
    const call = mocks.create.mock.calls[0][0];
    expect(call.data.tags).toEqual([]);
  });

  it('404s when projectId is not one of the caller\'s projects', async () => {
    mocks.projectFindFirst.mockResolvedValueOnce(null);
    const res = await POST(makePostRequest({ title: 'x', projectId: '123e4567-e89b-12d3-a456-426614174000' }));
    expect(res.status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `cd web-app && npm test -- api/tasks`
Expected: FAIL — module `./route` not found.

- [ ] **Step 3: Implement the route**

Create `web-app/src/app/api/tasks/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { CreateTaskSchema } from '@/lib/schemas';

const VALID_STATUSES = ['TODO', 'DOING', 'DONE'] as const;

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tag = searchParams.get('tag');
    const status = searchParams.get('status');

    if (status && !VALID_STATUSES.includes(status as any)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const where: any = { userId };
    if (tag) where.tags = { has: tag };
    if (status) where.status = status;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    logger.error('Tasks fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    const { title, notes, projectId, estimateMinutes, dueAt, scheduledStart, scheduledEnd, tags } = parsed.data;

    if (projectId) {
      const owned = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
      if (!owned) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
    }

    const task = await prisma.task.create({
      data: {
        userId,
        title,
        notes: notes ?? null,
        projectId: projectId ?? null,
        estimateMinutes: estimateMinutes ?? null,
        dueAt: dueAt ? new Date(dueAt) : null,
        scheduledStart: scheduledStart ? new Date(scheduledStart) : null,
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
        tags: tags ?? [],
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    logger.error('Task creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `cd web-app && npm test -- api/tasks`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/src/app/api/tasks/route.ts web-app/src/app/api/tasks/route.test.ts
git commit -m "feat(web): GET/POST /api/tasks with tag and status filters"
```

---

### Task 4: Web — `/api/tasks/[id]` (patch, delete)

**Files:**
- Create: `web-app/src/app/api/tasks/[id]/route.ts`
- Create: `web-app/src/app/api/tasks/[id]/route.test.ts`

**Interfaces:**
- Consumes: `UpdateTaskSchema` (Task 2).
- Produces: `PATCH /api/tasks/[id]` → `{ task: Task }`; `DELETE /api/tasks/[id]` → `{ message }`.

- [ ] **Step 1: Write the failing tests**

Create `web-app/src/app/api/tasks/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
  delete: vi.fn(async () => ({})),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { task: { findUnique: mocks.findUnique, update: mocks.update, delete: mocks.delete } },
}));
vi.mock('@/lib/jwt', () => ({ getAuthUserId: vi.fn(async () => 'user-1') }));

import { PATCH, DELETE } from './route';

function makeRequest(method: string, body?: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/tasks/task-1', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ id: 'task-1' }) };

describe('PATCH /api/tasks/[id]', () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.update.mockClear();
  });

  it('404s when the task does not exist', async () => {
    mocks.findUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest('PATCH', { status: 'DONE' }), ctx);
    expect(res.status).toBe(404);
  });

  it('404s when the task belongs to another user', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'task-1', userId: 'someone-else' });
    const res = await PATCH(makeRequest('PATCH', { status: 'DONE' }), ctx);
    expect(res.status).toBe(404);
  });

  it('updates status and sets completedAt when moving to DONE', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'task-1', userId: 'user-1', status: 'DOING' });
    const res = await PATCH(makeRequest('PATCH', { status: 'DONE' }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
  });

  it('rejects an invalid status', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'task-1', userId: 'user-1' });
    const res = await PATCH(makeRequest('PATCH', { status: 'ARCHIVED' }), ctx);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/tasks/[id]', () => {
  beforeEach(() => mocks.findUnique.mockReset());

  it('404s when the task belongs to another user', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'task-1', userId: 'someone-else' });
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(404);
  });

  it('deletes when owned', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'task-1', userId: 'user-1' });
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `cd web-app && npm test -- api/tasks/\[id\]`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `web-app/src/app/api/tasks/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { UpdateTaskSchema } from '@/lib/schemas';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = UpdateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    const { title, notes, projectId, estimateMinutes, dueAt, scheduledStart, scheduledEnd, tags, status } = parsed.data;

    if (projectId) {
      const owned = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
      if (!owned) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(notes !== undefined && { notes }),
        ...(projectId !== undefined && { projectId }),
        ...(estimateMinutes !== undefined && { estimateMinutes }),
        ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
        ...(scheduledStart !== undefined && { scheduledStart: scheduledStart ? new Date(scheduledStart) : null }),
        ...(scheduledEnd !== undefined && { scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null }),
        ...(tags !== undefined && { tags }),
        ...(status !== undefined && { status, completedAt: status === 'DONE' ? new Date() : null }),
      },
    });

    return NextResponse.json({ task });
  } catch (error) {
    logger.error('Task update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ message: 'Task deleted successfully' });
  } catch (error) {
    logger.error('Task deletion error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `cd web-app && npm test -- api/tasks`
Expected: all tests in both `api/tasks` test files PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/src/app/api/tasks/\[id\]/route.ts web-app/src/app/api/tasks/\[id\]/route.test.ts
git commit -m "feat(web): PATCH/DELETE /api/tasks/[id]"
```

---

### Task 5: Web — `taskId` on session create

**Files:**
- Modify: `web-app/src/app/api/sessions/route.ts`
- Modify: `web-app/src/app/api/sessions/route.test.ts` (exists — race-check suite)

**Interfaces:**
- Consumes: `CreateSessionSchema` (Task 2, already has `taskId`).
- Produces: sessions can now be created with a `taskId`; `Session.task` is included in the response the same way `Session.project` already is.

- [ ] **Step 1: Extend the existing prisma mock**

`web-app/src/app/api/sessions/route.test.ts` already exists (the "race check" suite). It hoists `mocks = { findFirst, create, triggerUserEvent, invalidateAnalyticsCache }`, mocks `@/lib/prisma` as `{ session: { findFirst, create } }`, plus `@/lib/jwt`, `@/lib/pusher`, `@/lib/analytics-cache`, and exposes `makeRequest(body)` → `NextRequest` with a bearer header. Do not add new mocks for those modules.

Add one hoisted mock and one prisma model to the existing block:

```ts
const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  triggerUserEvent: vi.fn(),
  invalidateAnalyticsCache: vi.fn(async () => {}),
  taskFindFirst: vi.fn(async () => null),          // NEW
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: { findFirst: mocks.findFirst, create: mocks.create },
    task: { findFirst: mocks.taskFindFirst },     // NEW
  },
}));
```

- [ ] **Step 2: Write the failing tests**

Append a new `describe` to the same file. `TASK_ID` must be a real UUID — `CreateSessionSchema.taskId` is `z.string().uuid()`:

```ts
const TASK_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('POST /api/sessions — taskId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores taskId when the task belongs to the caller', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);                       // no active session
    mocks.taskFindFirst.mockResolvedValueOnce({ id: TASK_ID });         // owned
    mocks.create.mockResolvedValueOnce({ id: 'new-1', plannedDuration: 25, taskId: TASK_ID });
    const res = await POST(makeRequest({ plannedDuration: 25, taskId: TASK_ID }));
    expect(res.status).toBe(201);
    expect(mocks.taskFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TASK_ID, userId: 'user-1' } })
    );
    expect(mocks.create.mock.calls[0][0].data.taskId).toBe(TASK_ID);
  });

  it('404s when taskId is not one of the caller\'s tasks', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    mocks.taskFindFirst.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ plannedDuration: 25, taskId: TASK_ID }));
    expect(res.status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('still creates a session without a taskId (backward compatible)', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({ id: 'new-2', plannedDuration: 25 });
    const res = await POST(makeRequest({ plannedDuration: 25 }));
    expect(res.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data.taskId).toBeNull();
  });
});
```

(`POST /api/sessions` returns 201 on success — `route.ts` line 64, pinned by the existing race-check test.)

- [ ] **Step 3: Run to verify RED**

Run: `cd web-app && npm test -- api/sessions`
Expected: FAIL on the new assertions (taskId not yet threaded through).

- [ ] **Step 4: Wire `taskId` into the route**

In `web-app/src/app/api/sessions/route.ts`, in `POST`:

```ts
const { plannedDuration, sessionType, projectId, taskId } = parsed.data;
```

Add task ownership validation right after the existing active-session check (`prisma.session.findFirst` at line ~33). This is the same shape as the `projectId` ownership check in `sessions/[id]/route.ts` lines 39–51. Note that `POST` itself does **not** validate `projectId` ownership today — pre-existing gap, leave it alone in this task:

```ts
if (taskId) {
  const ownedTask = await prisma.task.findFirst({ where: { id: taskId, userId }, select: { id: true } });
  if (!ownedTask) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
}
```

In the `prisma.session.create` call's `data`, add `taskId: taskId || null,` next to `projectId: projectId || null,`. In its `include`, add `task: true,` next to `project: true,`.

- [ ] **Step 5: Run to verify GREEN**

Run: `cd web-app && npm test -- api/sessions`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add web-app/src/app/api/sessions/route.ts web-app/src/app/api/sessions/route.test.ts
git commit -m "feat(web): sessions can be created against a task"
```

---

### Task 6: Web — `/api/search`

**Files:**
- Create: `web-app/src/app/api/search/route.ts`
- Create: `web-app/src/app/api/search/route.test.ts`

**Interfaces:**
- Consumes: `Task`, `Project`, `Session` Prisma models.
- Produces: `GET /api/search?q=` → `{ tasks: Task[], projects: Project[], sessions: Session[] }`, each capped at 10.

- [ ] **Step 1: Write the failing tests**

Create `web-app/src/app/api/search/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  taskFindMany: vi.fn(async () => []),
  projectFindMany: vi.fn(async () => []),
  sessionFindMany: vi.fn(async () => []),
  rateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: { findMany: mocks.taskFindMany },
    project: { findMany: mocks.projectFindMany },
    session: { findMany: mocks.sessionFindMany },
  },
}));
vi.mock('@/lib/jwt', () => ({ getAuthUserId: vi.fn(async () => 'user-1') }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }));

import { GET } from './route';

function makeRequest(q: string): NextRequest {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`) as unknown as NextRequest;
}

describe('GET /api/search', () => {
  beforeEach(() => {
    mocks.taskFindMany.mockClear();
    mocks.projectFindMany.mockClear();
    mocks.sessionFindMany.mockClear();
  });

  it('rejects an empty query', async () => {
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(400);
  });

  it('scopes every query to the caller', async () => {
    await GET(makeRequest('report'));
    expect(mocks.taskFindMany.mock.calls[0][0].where.userId).toBe('user-1');
    expect(mocks.projectFindMany.mock.calls[0][0].where.userId).toBe('user-1');
    expect(mocks.sessionFindMany.mock.calls[0][0].where.userId).toBe('user-1');
  });

  it('caps each entity at 10 results', async () => {
    await GET(makeRequest('report'));
    expect(mocks.taskFindMany.mock.calls[0][0].take).toBe(10);
    expect(mocks.projectFindMany.mock.calls[0][0].take).toBe(10);
    expect(mocks.sessionFindMany.mock.calls[0][0].take).toBe(10);
  });

  it('uses a case-insensitive contains filter on task title', async () => {
    await GET(makeRequest('report'));
    expect(mocks.taskFindMany.mock.calls[0][0].where.title).toEqual({ contains: 'report', mode: 'insensitive' });
  });

  it('matches sessions on their linked project name or task title, not on raw SQL', async () => {
    await GET(makeRequest('report'));
    const sessionWhere = mocks.sessionFindMany.mock.calls[0][0].where;
    expect(sessionWhere.OR).toEqual([
      { project: { name: { contains: 'report', mode: 'insensitive' } } },
      { task: { title: { contains: 'report', mode: 'insensitive' } } },
    ]);
  });

  it('returns 429 when rate limited', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });
    const res = await GET(makeRequest('report'));
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `cd web-app && npm test -- api/search`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `web-app/src/app/api/search/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const RESULTS_PER_ENTITY = 10;

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit('search:' + userId, 60, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    if (!q) {
      return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
    }

    const contains = { contains: q, mode: 'insensitive' as const };

    const [tasks, projects, sessions] = await Promise.all([
      prisma.task.findMany({
        where: { userId, title: contains },
        take: RESULTS_PER_ENTITY,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.project.findMany({
        where: { userId, name: contains },
        take: RESULTS_PER_ENTITY,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.session.findMany({
        where: {
          userId,
          OR: [
            { project: { name: contains } },
            { task: { title: contains } },
          ],
        },
        take: RESULTS_PER_ENTITY,
        orderBy: { startTime: 'desc' },
        include: { project: true, task: true },
      }),
    ]);

    return NextResponse.json({ tasks, projects, sessions });
  } catch (error) {
    logger.error('Search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `cd web-app && npm test -- api/search`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/src/app/api/search/route.ts web-app/src/app/api/search/route.test.ts
git commit -m "feat(web): cross-entity search across tasks, projects, and sessions"
```

---

### Task 7: Web — dashboard task list + quick-add

**Files:**
- Create: `web-app/src/components/dashboard/TaskList.tsx`
- Modify: `web-app/src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/[id]` (Tasks 3-4).
- Produces: nothing consumed by later tasks — this is a leaf UI component.

- [ ] **Step 1: Read the existing dashboard patterns**

Read `web-app/src/components/dashboard/GoalsWidget.tsx` and `web-app/src/app/(app)/dashboard/page.tsx` in full — match their SWR + `Card` + `getToken()`-based fetch conventions exactly. Do not invent a different data-fetching pattern.

- [ ] **Step 2: Build the component**

Create `web-app/src/components/dashboard/TaskList.tsx` following the exact fetch/mutate conventions you just read (SWR with the shared `fetcher`, `Authorization: Bearer <getToken()>` on writes, optimistic `mutate()` after create/patch). Structure:

- A single-line text input + "Add" button that `POST`s `{ title }` to `/api/tasks` on submit, clears on success. This is the quick-add — no date picker, no natural-language parsing, just a title (the roadmap's "plain date picker" for due dates is a `<input type="date">` bound to `dueAt`, shown as a second, optional field next to the title input — not a separate step).
- Below it, the task list grouped by status (`TODO`, `DOING`, `DONE`), each row showing title, tags (as small pills), and a status-cycle button (`TODO` → `DOING` → `DONE` → back to `TODO`) that `PATCH`es `{ status }`.
- A tag-filter row above the list: distinct tags across the loaded tasks, rendered as clickable chips; clicking refetches with `?tag=<tag>` and highlights the active chip.

Use the `Card` component (`@/components/ui/Card`) as the outer wrapper, matching `GoalsWidget`'s structure.

- [ ] **Step 3: Mount it on the dashboard**

In `web-app/src/app/(app)/dashboard/page.tsx`, import `TaskList` and render it in the same grid area as `GoalsWidget` (read the current layout first — likely a flex/grid row of widget cards; add `TaskList` as another card in that row, or below it if the row is already full).

- [ ] **Step 4: Verify**

Run: `cd web-app && npm run typecheck 2>/dev/null || npx tsc --noEmit`
Run: `cd web-app && npm run lint`
Expected: both clean.

Run: `cd web-app && npm run dev`, open the dashboard, add a task, click its status pill twice (TODO → DOING → DONE), click a tag chip if any tasks have tags. Confirm each action reflects immediately without a full page reload.

- [ ] **Step 5: Commit**

```bash
git add web-app/src/components/dashboard/TaskList.tsx web-app/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(web): task list widget with quick-add and tag filtering"
```

---

### Task 8: Web — dashboard search box

**Files:**
- Create: `web-app/src/components/dashboard/SearchBox.tsx`
- Modify: `web-app/src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET /api/search?q=` (Task 6).

- [ ] **Step 1: Build the component**

Create `web-app/src/components/dashboard/SearchBox.tsx`: a text input, debounced (300ms) so it doesn't fire a request per keystroke, calling `GET /api/search?q=<value>` once the value is non-empty. Render results in a dropdown under the input, grouped by "Tasks", "Projects", "Sessions" headers (only render a group header if that group has results). Clicking outside the dropdown or pressing Escape closes it. No navigation wiring to specific pages is required in this phase — just show the matched titles/names.

- [ ] **Step 2: Mount it in the dashboard header**

In `web-app/src/app/(app)/dashboard/page.tsx`, render `SearchBox` in the header area (near the top of the page, alongside any existing header content — read the current top of the page's JSX first to find the right spot).

- [ ] **Step 3: Verify**

Run: `cd web-app && npm run lint && npx tsc --noEmit`
Expected: clean.

Manual: `npm run dev`, type a few characters matching an existing task/project title into the search box, confirm the dropdown shows it within ~300ms, confirm clicking outside closes it.

- [ ] **Step 4: Commit**

```bash
git add web-app/src/components/dashboard/SearchBox.tsx web-app/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(web): cross-entity search box on the dashboard"
```

---

### Task 9: Desktop — `api/tasks.rs` REST client

**Files:**
- Create: `desktop-app-v3/src-tauri/src/api/tasks.rs`
- Modify: `desktop-app-v3/src-tauri/src/api/mod.rs`

**Interfaces:**
- Produces: `Task` struct, `list_tasks`/`create_task`/`update_task`/`delete_task` (exact signatures in the Interfaces Summary) — Task 11 (commands) depends on these.

- [ ] **Step 1: Write the client, mirroring `api/projects.rs`'s shape**

Create `desktop-app-v3/src-tauri/src/api/tasks.rs`:

```rust
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

/// Task as returned by the FlowShield REST API. Fields mirror the Prisma
/// model; serde rename maps snake_case Rust to camelCase JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub estimate_minutes: Option<i32>,
    #[serde(default)]
    pub due_at: Option<String>,
    #[serde(default)]
    pub scheduled_start: Option<String>,
    #[serde(default)]
    pub scheduled_end: Option<String>,
    pub status: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct TaskEnvelope {
    task: Task,
}

#[derive(Debug, Deserialize)]
struct TasksEnvelope {
    tasks: Vec<Task>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    error: Option<String>,
    code: Option<String>,
}

fn auth(req: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    req.bearer_auth(token)
}

async fn error_from_response(res: reqwest::Response) -> AppError {
    let status = res.status();
    let body: ApiErrorBody = res.json().await.unwrap_or(ApiErrorBody { error: None, code: None });
    AppError::Api {
        status: status.as_u16(),
        message: body.error.unwrap_or_else(|| "Task request failed".into()),
        code: body.code,
    }
}

/// GET /api/tasks — list the user's tasks.
pub async fn list_tasks(http: &reqwest::Client, token: &str) -> AppResult<Vec<Task>> {
    let url = format!("{}/api/tasks", super::api_base_url());
    let res = auth(http.get(&url), token).send().await?;
    if !res.status().is_success() {
        return Err(error_from_response(res).await);
    }
    let envelope: TasksEnvelope = res.json().await?;
    Ok(envelope.tasks)
}

/// POST /api/tasks — create a task with just a title (+ optional project).
pub async fn create_task(
    http: &reqwest::Client,
    token: &str,
    title: &str,
    project_id: Option<&str>,
) -> AppResult<Task> {
    let url = format!("{}/api/tasks", super::api_base_url());
    let mut body = serde_json::json!({ "title": title });
    if let Some(pid) = project_id {
        body["projectId"] = serde_json::Value::String(pid.to_string());
    }
    let res = auth(http.post(&url), token).json(&body).send().await?;
    if !res.status().is_success() {
        return Err(error_from_response(res).await);
    }
    let envelope: TaskEnvelope = res.json().await?;
    Ok(envelope.task)
}

/// PATCH /api/tasks/{id} — `patch` is forwarded verbatim as the request body
/// (e.g. `{"status": "DONE"}`), so callers control exactly which fields change.
pub async fn update_task(
    http: &reqwest::Client,
    token: &str,
    id: &str,
    patch: serde_json::Value,
) -> AppResult<Task> {
    let url = format!("{}/api/tasks/{}", super::api_base_url(), id);
    let res = auth(http.patch(&url), token).json(&patch).send().await?;
    if !res.status().is_success() {
        return Err(error_from_response(res).await);
    }
    let envelope: TaskEnvelope = res.json().await?;
    Ok(envelope.task)
}

/// DELETE /api/tasks/{id}
pub async fn delete_task(http: &reqwest::Client, token: &str, id: &str) -> AppResult<()> {
    let url = format!("{}/api/tasks/{}", super::api_base_url(), id);
    let res = auth(http.delete(&url), token).send().await?;
    if !res.status().is_success() {
        return Err(error_from_response(res).await);
    }
    Ok(())
}
```

- [ ] **Step 2: Register the module**

In `desktop-app-v3/src-tauri/src/api/mod.rs`, add `pub mod tasks;` after `pub mod sessions;` (line 11), and `pub use tasks::Task;` after `pub use sessions::Session;` (line 16) — the file already re-exports `AuthUser`, `Preferences`, `RealtimeConfig`, `Session` that way.

- [ ] **Step 3: Build**

Run: `cd desktop-app-v3/src-tauri && cargo build`
Expected: clean (no warnings beyond pre-existing).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/api/tasks.rs src-tauri/src/api/mod.rs
git commit -m "feat(desktop): api::tasks REST client"
```

---

### Task 10: Desktop — `pending_task_ops` offline write queue

**Files:**
- Create: `desktop-app-v3/src-tauri/src/store/pending_task_ops.rs`
- Modify: `desktop-app-v3/src-tauri/src/store/mod.rs`

**Interfaces:**
- Consumes: nothing.
- Produces: `PendingTaskOp`, `migrate`, `enqueue`, `ready_rows`, `delete`, `record_failure` (exact signatures in the Interfaces Summary) — Task 11 (commands) and Task 12 (sync_worker) depend on these.

- [ ] **Step 1: Write the failing tests**

Create the module with its test block first (TDD — write `mod tests` before the real functions compile against real logic, following the pattern `store/activity_local.rs` used):

```rust
//! `pending_task_ops` — offline write queue for task mutations. Unlike
//! `pending_sync` (legacy, drain-only), this table is actively written to:
//! every create/update/delete that fails while offline enqueues here, and
//! `sync_worker`'s existing 60s tick drains it with the same exponential
//! backoff `pending_sync` already uses.

use super::Db;
use crate::error::{AppError, AppResult};
use rusqlite::Connection;

/// Exponential backoff between retries: `min(5min · 2^retry, 30min)` —
/// identical shape to `pending_sync::backoff_secs`.
pub fn backoff_secs(retry_count: i64) -> i64 {
    let base: i64 = 5 * 60;
    let cap: i64 = 30 * 60;
    let exp = retry_count.clamp(0, 8) as u32;
    base.saturating_mul(2_i64.saturating_pow(exp)).min(cap)
}

#[derive(Debug, Clone)]
pub struct PendingTaskOp {
    pub id: i64,
    pub op: String,
    pub payload: String,
    pub retry_count: i64,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn lock(db: &Db) -> AppResult<std::sync::MutexGuard<'_, rusqlite::Connection>> {
    db.lock().map_err(|_| AppError::Storage("db mutex poisoned".into()))
}

pub fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS pending_task_ops (\n\
            id            INTEGER PRIMARY KEY AUTOINCREMENT,\n\
            op            TEXT    NOT NULL,\n\
            payload       TEXT    NOT NULL,\n\
            retry_count   INTEGER NOT NULL DEFAULT 0,\n\
            created_at    INTEGER NOT NULL,\n\
            next_retry_at INTEGER NOT NULL\n\
         );\n\
         CREATE INDEX IF NOT EXISTS idx_pending_task_ops_next_retry\n\
            ON pending_task_ops (next_retry_at);",
    )
    .map_err(|e| AppError::Storage(format!("pending_task_ops migrate: {e}")))?;
    Ok(())
}

/// Queue one op (`\"create\"` / `\"update\"` / `\"delete\"`) with its JSON
/// payload for later replay. Returns the new row's id.
pub fn enqueue(db: &Db, op: &str, payload: &str) -> AppResult<i64> {
    let now = now_secs();
    let conn = lock(db)?;
    conn.execute(
        "INSERT INTO pending_task_ops (op, payload, retry_count, created_at, next_retry_at)\n\
         VALUES (?1, ?2, 0, ?3, ?3)",
        rusqlite::params![op, payload, now],
    )
    .map_err(|e| AppError::Storage(format!("enqueue: {e}")))?;
    Ok(conn.last_insert_rowid())
}

/// Fetch up to `limit` rows whose `next_retry_at <= now`, oldest first.
pub fn ready_rows(db: &Db, limit: i64) -> AppResult<Vec<PendingTaskOp>> {
    let now = now_secs();
    let conn = lock(db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, op, payload, retry_count\n\
             FROM pending_task_ops\n\
             WHERE next_retry_at <= ?1\n\
             ORDER BY created_at ASC\n\
             LIMIT ?2",
        )
        .map_err(|e| AppError::Storage(format!("ready_rows prepare: {e}")))?;
    let rows = stmt
        .query_map(rusqlite::params![now, limit], |r| {
            Ok(PendingTaskOp {
                id: r.get(0)?,
                op: r.get(1)?,
                payload: r.get(2)?,
                retry_count: r.get(3)?,
            })
        })
        .map_err(|e| AppError::Storage(format!("ready_rows query: {e}")))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| AppError::Storage(format!("ready_rows row: {e}")))?);
    }
    Ok(out)
}

pub fn delete(db: &Db, id: i64) -> AppResult<()> {
    let conn = lock(db)?;
    conn.execute("DELETE FROM pending_task_ops WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| AppError::Storage(format!("delete: {e}")))?;
    Ok(())
}

pub fn record_failure(db: &Db, id: i64, retry_count: i64) -> AppResult<()> {
    let next = now_secs() + backoff_secs(retry_count + 1);
    let conn = lock(db)?;
    conn.execute(
        "UPDATE pending_task_ops SET retry_count = ?1, next_retry_at = ?2 WHERE id = ?3",
        rusqlite::params![retry_count + 1, next, id],
    )
    .map_err(|e| AppError::Storage(format!("record_failure: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    fn test_db() -> Db {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn backoff_caps_at_30min() {
        assert_eq!(backoff_secs(0), 5 * 60);
        assert_eq!(backoff_secs(3), 30 * 60);
        assert_eq!(backoff_secs(99), 30 * 60);
    }

    #[test]
    fn enqueue_then_ready_rows_round_trips() {
        let db = test_db();
        let id = enqueue(&db, "create", r#"{"title":"x"}"#).unwrap();
        let rows = ready_rows(&db, 10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, id);
        assert_eq!(rows[0].op, "create");
        assert_eq!(rows[0].retry_count, 0);
    }

    #[test]
    fn record_failure_delays_next_ready_rows_call() {
        let db = test_db();
        let id = enqueue(&db, "update", r#"{"status":"DONE"}"#).unwrap();
        record_failure(&db, id, 0).unwrap();
        // next_retry_at is now ~5 minutes out — nothing should be ready yet.
        let rows = ready_rows(&db, 10).unwrap();
        assert_eq!(rows.len(), 0);
    }

    #[test]
    fn delete_removes_the_row() {
        let db = test_db();
        let id = enqueue(&db, "delete", r#"{"id":"task-1"}"#).unwrap();
        delete(&db, id).unwrap();
        let rows = ready_rows(&db, 10).unwrap();
        assert_eq!(rows.len(), 0);
    }

    #[test]
    fn ready_rows_respects_limit_and_order() {
        let db = test_db();
        enqueue(&db, "create", r#"{"title":"a"}"#).unwrap();
        enqueue(&db, "create", r#"{"title":"b"}"#).unwrap();
        enqueue(&db, "create", r#"{"title":"c"}"#).unwrap();
        let rows = ready_rows(&db, 2).unwrap();
        assert_eq!(rows.len(), 2);
    }
}
```

- [ ] **Step 2: Register the migration**

In `desktop-app-v3/src-tauri/src/store/mod.rs`, add `pub mod pending_task_ops;` next to `pub mod pending_sync;`, and add `pending_task_ops::migrate(conn)?;` at the end of `apply_migrations`, after the existing `activity_local::migrate(conn)?;` line.

- [ ] **Step 3: Build and test**

Run: `cd desktop-app-v3/src-tauri && cargo build && cargo test --lib pending_task_ops::`
Expected: clean build, all 5 new tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/store/pending_task_ops.rs src-tauri/src/store/mod.rs
git commit -m "feat(desktop): pending_task_ops offline write queue for task mutations"
```

---

### Task 11: Desktop — `commands/tasks.rs` (offline-aware CRUD)

**Files:**
- Create: `desktop-app-v3/src-tauri/src/commands/tasks.rs`
- Modify: `desktop-app-v3/src-tauri/src/commands/mod.rs`
- Modify: `desktop-app-v3/src-tauri/src/lib.rs` (`generate_handler!`)

**Interfaces:**
- Consumes: `api::tasks::{list_tasks, create_task, update_task, delete_task}` (Task 9), `store::pending_task_ops::enqueue` (Task 10).
- Produces: `tasks_list`, `tasks_create`, `tasks_update`, `tasks_delete` Tauri commands (Task 13's frontend calls these by name).

- [ ] **Step 1: Write the commands**

Create `desktop-app-v3/src-tauri/src/commands/tasks.rs`:

```rust
//! Task commands. Reads go straight to the API. Writes try the API first;
//! on a network failure (not a validation failure — those are the user's
//! fault and should surface immediately) they enqueue into
//! `pending_task_ops` for `sync_worker` to replay later, and return
//! optimistically so the UI doesn't block on connectivity.

use crate::api::{self, tasks::Task};
use crate::error::{AppError, AppResult};
use crate::store;
use crate::AppState;
use tauri::State;

async fn token_or_err(state: &State<'_, AppState>) -> AppResult<String> {
    state
        .token
        .read()
        .await
        .clone()
        .ok_or_else(|| AppError::Api {
            status: 401,
            message: "Not authenticated".into(),
            code: Some("UNAUTHENTICATED".into()),
        })
}

/// A network-layer failure (server unreachable) is retryable offline; an API
/// error the server actually answered (4xx/5xx) is not — surface it.
fn is_offline(err: &AppError) -> bool {
    matches!(err, AppError::Network(_))
}

/// Ids minted by `tasks_create` while offline. They exist only in this
/// process until `sync_worker` replays the create, so no PATCH/DELETE can
/// ever succeed against them — refuse early instead of queueing a doomed op.
fn is_pending_id(id: &str) -> bool {
    id.starts_with("pending-")
}

fn not_synced_err() -> AppError {
    AppError::Api {
        status: 409,
        message: "Task has not synced yet — try again once you're back online".into(),
        code: Some("TASK_NOT_SYNCED".into()),
    }
}

/// `tasks_list` — GET /api/tasks.
#[tauri::command]
pub async fn tasks_list(state: State<'_, AppState>) -> AppResult<Vec<Task>> {
    let token = token_or_err(&state).await?;
    api::tasks::list_tasks(&state.http, &token).await
}

/// `tasks_create` — POST /api/tasks with { title, projectId? }. On a network
/// failure, queues the create and returns a locally-synthesized Task with a
/// temporary id so the UI can render it immediately; the real id replaces it
/// once `sync_worker` successfully replays the queued op and the next
/// `tasks_list` refresh runs.
#[tauri::command]
pub async fn tasks_create(
    state: State<'_, AppState>,
    title: String,
    project_id: Option<String>,
) -> AppResult<Task> {
    let token = token_or_err(&state).await?;
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(AppError::Api {
            status: 400,
            message: "Task title is required".into(),
            code: Some("INVALID_TITLE".into()),
        });
    }
    match api::tasks::create_task(&state.http, &token, trimmed, project_id.as_deref()).await {
        Ok(task) => Ok(task),
        Err(err) if is_offline(&err) => {
            if let Some(db) = state.db.get() {
                let payload = serde_json::json!({ "title": trimmed, "projectId": project_id }).to_string();
                store::pending_task_ops::enqueue(db, "create", &payload)?;
            }
            Ok(Task {
                id: format!("pending-{}", uuid_v4_ish()),
                title: trimmed.to_string(),
                notes: None,
                project_id,
                estimate_minutes: None,
                due_at: None,
                scheduled_start: None,
                scheduled_end: None,
                status: "TODO".into(),
                tags: Vec::new(),
            })
        }
        Err(err) => Err(err),
    }
}

/// `tasks_update` — PATCH /api/tasks/{id} with an arbitrary JSON patch
/// object. Queues offline the same way `tasks_create` does; the caller's
/// optimistic UI state is the source of truth for what the patch should look
/// like once it lands.
#[tauri::command]
pub async fn tasks_update(
    state: State<'_, AppState>,
    id: String,
    patch: serde_json::Value,
) -> AppResult<()> {
    if is_pending_id(&id) {
        return Err(not_synced_err());
    }
    let token = token_or_err(&state).await?;
    match api::tasks::update_task(&state.http, &token, &id, patch.clone()).await {
        Ok(_) => Ok(()),
        Err(err) if is_offline(&err) => {
            if let Some(db) = state.db.get() {
                let payload = serde_json::json!({ "id": id, "patch": patch }).to_string();
                store::pending_task_ops::enqueue(db, "update", &payload)?;
            }
            Ok(())
        }
        Err(err) => Err(err),
    }
}

/// `tasks_delete` — DELETE /api/tasks/{id}.
#[tauri::command]
pub async fn tasks_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if is_pending_id(&id) {
        return Err(not_synced_err());
    }
    let token = token_or_err(&state).await?;
    match api::tasks::delete_task(&state.http, &token, &id).await {
        Ok(()) => Ok(()),
        Err(err) if is_offline(&err) => {
            if let Some(db) = state.db.get() {
                let payload = serde_json::json!({ "id": id }).to_string();
                store::pending_task_ops::enqueue(db, "delete", &payload)?;
            }
            Ok(())
        }
        Err(err) => Err(err),
    }
}

/// Cheap, dependency-free unique-enough suffix for a temporary offline id.
/// Not a real UUID — just needs to not collide within one offline session.
fn uuid_v4_ish() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{nanos:x}")
}
```

- [ ] **Step 2: Register the module and commands**

In `desktop-app-v3/src-tauri/src/commands/mod.rs`, add `pub mod tasks;` next to `pub mod projects;`.

In `desktop-app-v3/src-tauri/src/lib.rs`'s `generate_handler!`, add next to the `commands::projects::*` lines:

```rust
            commands::tasks::tasks_list,
            commands::tasks::tasks_create,
            commands::tasks::tasks_update,
            commands::tasks::tasks_delete,
```

- [ ] **Step 3: Build and test**

Run: `cd desktop-app-v3/src-tauri && cargo build && cargo test --lib`
Expected: clean build, all tests passing (no new unit tests in this task — the offline-queue logic itself is tested in Task 10; this task is Tauri command plumbing, matching how `commands/projects.rs` has no test module either).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/tasks.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): tasks_list/create/update/delete commands with offline queueing"
```

---

### Task 12: Desktop — `sync_worker.rs` drains `pending_task_ops`; `session_start` gains `task_id`

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/sync_worker.rs`
- Modify: `desktop-app-v3/src-tauri/src/api/sessions.rs`
- Modify: `desktop-app-v3/src-tauri/src/commands/sessions.rs`

**Interfaces:**
- Consumes: `store::pending_task_ops::{ready_rows, delete, record_failure}` (Task 10), `api::tasks::{create_task, update_task, delete_task}` (Task 9).
- Produces: sessions started from the desktop can carry a `task_id`; queued task ops get replayed automatically.

- [ ] **Step 1: Add Job 3 to the sync worker**

In `desktop-app-v3/src-tauri/src/sync_worker.rs`, update the module doc comment (currently "does two jobs") to list the third job, add `use crate::error::{AppError, AppResult};` to the imports, then add a Job 3 block inside `drain_once` after the existing Job 2 block (the `activity_upload::upload_once` match at line ~75):

```rust
    // Job 3 — queued task mutations.
    let task_rows = store::pending_task_ops::ready_rows(db, BATCH_SIZE)?;
    for row in task_rows {
        // A malformed payload can never succeed. Drop it and move on — a `?`
        // here would abort this tick (and Jobs 1–2 on every later tick) for
        // as long as the row exists.
        let v: serde_json::Value = match serde_json::from_str(&row.payload) {
            Ok(v) => v,
            Err(err) => {
                tracing::warn!(?err, id = row.id, op = %row.op, "dropping unparseable pending task op");
                store::pending_task_ops::delete(db, row.id)?;
                continue;
            }
        };
        let result: AppResult<()> = match row.op.as_str() {
            "create" => {
                let title = v["title"].as_str().unwrap_or_default();
                let project_id = v["projectId"].as_str();
                api::tasks::create_task(http, &token, title, project_id).await.map(|_| ())
            }
            "update" => {
                let id = v["id"].as_str().unwrap_or_default();
                api::tasks::update_task(http, &token, id, v["patch"].clone()).await.map(|_| ())
            }
            "delete" => {
                let id = v["id"].as_str().unwrap_or_default();
                api::tasks::delete_task(http, &token, id).await
            }
            _ => Ok(()), // unknown op — drop rather than retry forever
        };
        match result {
            Ok(()) => {
                store::pending_task_ops::delete(db, row.id)?;
                tracing::info!(op = %row.op, "queued task op replayed");
            }
            // The server answered and rejected it (404 task deleted meanwhile,
            // 400 validation, …). Retrying cannot change that answer — same
            // rule as `activity_upload::upload_once` on a 4xx.
            Err(AppError::Api { status, .. }) if (400..500).contains(&status) => {
                tracing::warn!(op = %row.op, status, "queued task op permanently rejected; dropping");
                store::pending_task_ops::delete(db, row.id)?;
            }
            Err(err) => {
                store::pending_task_ops::record_failure(db, row.id, row.retry_count)?;
                tracing::debug!(?err, op = %row.op, "task op replay failed; backing off");
            }
        }
    }
```

`token` inside `drain_once` is already an owned `String` (line ~42), so `&token` derefs to `&str` for the `api::tasks` calls.

- [ ] **Step 2: `Session.task_id` and `start_session`'s new parameter**

In `desktop-app-v3/src-tauri/src/api/sessions.rs`, add `#[serde(default)] pub task_id: Option<String>,` to the `Session` struct, next to `project_id`.

In `start_session`, add a `task_id: Option<&str>` parameter (after `project_id`) and thread it into the request body the same way `project_id` already is:

```rust
    if let Some(tid) = task_id {
        body["taskId"] = serde_json::Value::String(tid.to_string());
    }
```

- [ ] **Step 3: `session_start` command gains `task_id`**

In `desktop-app-v3/src-tauri/src/commands/sessions.rs`, add `task_id: Option<String>` as a parameter to `session_start`, and pass it through to `api::sessions::start_session` (matching how `project_id` is already handled — including the same `.as_deref().filter(|s| !s.is_empty())` pattern).

- [ ] **Step 4: Build and test**

Run: `cd desktop-app-v3/src-tauri && cargo build && cargo test --lib`
Expected: clean, all tests passing.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/sync_worker.rs src-tauri/src/api/sessions.rs src-tauri/src/commands/sessions.rs
git commit -m "feat(desktop): sync_worker replays queued task ops; sessions can start against a task"
```

---

### Task 13: Desktop frontend — `lib/tasks.ts`, sidebar list, session-start task picker

**Files:**
- Create: `desktop-app-v3/src/lib/tasks.ts`
- Modify: `desktop-app-v3/src/routes/DashboardPage.tsx`

**Interfaces:**
- Consumes: `tasks_list`/`tasks_create`/`tasks_update`/`tasks_delete` (Task 11), `session_start` now accepting `taskId` (Task 12).
- Produces: `useTasksStore` (exact shape in the Interfaces Summary).

- [ ] **Step 1: Write the store**

Create `desktop-app-v3/src/lib/tasks.ts`, mirroring `lib/projects.ts`'s shape exactly:

```ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Task {
  id: string;
  title: string;
  notes?: string | null;
  projectId?: string | null;
  estimateMinutes?: number | null;
  dueAt?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  status: 'TODO' | 'DOING' | 'DONE';
  tags: string[];
}

interface TasksState {
  items: Task[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (title: string, projectId?: string | null) => Promise<Task>;
  update: (id: string, patch: Record<string, unknown>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as { message?: string; error?: string };
    return obj.message ?? obj.error ?? fallback;
  }
  return fallback;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const items = await invoke<Task[]>('tasks_list');
      set({ items, loading: false });
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load tasks'), loading: false });
    }
  },

  create: async (title, projectId = null) => {
    set({ loading: true, error: null });
    try {
      const created = await invoke<Task>('tasks_create', { title, projectId });
      set({ items: [...get().items, created], loading: false });
      return created;
    } catch (err) {
      const msg = errorMessage(err, 'Failed to create task');
      set({ error: msg, loading: false });
      throw new Error(msg);
    }
  },

  update: async (id, patch) => {
    const previous = get().items;
    // Optimistic — the command queues offline and doesn't return the
    // server's copy, so we apply the patch locally right away.
    set({ items: previous.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    try {
      await invoke('tasks_update', { id, patch });
    } catch (err) {
      set({ items: previous, error: errorMessage(err, 'Failed to update task') });
      throw err;
    }
  },

  remove: async (id) => {
    const previous = get().items;
    set({ items: previous.filter((t) => t.id !== id) });
    try {
      await invoke('tasks_delete', { id });
    } catch (err) {
      set({ items: previous, error: errorMessage(err, 'Failed to delete task') });
      throw err;
    }
  },
}));
```

- [ ] **Step 2: Read `DashboardPage.tsx`'s project-picker section**

`DashboardPage.tsx` is 746 lines (as of 2026-09-05). The project-picker plumbing you are mirroring lives at these points — read each before editing so your additions match prop names, state shape, and styling classes exactly:

| Line | What |
|---|---|
| 11 | `import { useProjectsStore, type Project } from '../lib/projects';` |
| 89–92 | `const projects = useProjectsStore();` … `const [selectedProjectId, setSelectedProjectId] = useState<string \| null>(null);` |
| 174 | `void projects.refresh();` inside the mount effect |
| 262 | `await start(duration, type, selectedProjectId);` |
| 323 | `selectedProjectId={selectedProjectId}` prop pass-down |
| 355 / 370 | the prop destructure and its `selectedProjectId: string \| null;` type |
| 528 | `<select value={selectedProjectId ?? ''} …>` — the project picker |

- [ ] **Step 3: Add the task list sidebar section**

In `DashboardPage.tsx`, import `useTasksStore` and call `tasks.refresh()` in the mount `useEffect` right after `projects.refresh()` (line 174). Render a sidebar section (a new card in the existing layout, next to where the project picker's card renders) showing tasks grouped by status with a quick-add input, matching Task 7's web behavior but using `useTasksStore`'s `create`/`update` instead of a fetch call. Status-cycle on click, same three-state cycle as the web version.

Rows whose `id` starts with `pending-` (created offline, not yet replayed) render with a small "syncing…" label and **no** status-cycle or delete affordance — `tasks_update`/`tasks_delete` refuse those ids (Task 11), so offering the buttons would only surface a 409. They are replaced by the server copy on the next `tasks.refresh()`; call `tasks.refresh()` again after every successful `create` so a reconnect-then-add picks up any earlier replayed rows too.

- [ ] **Step 4: Add the task picker to session start**

In the same component that renders the project `<select>` (`selectedProjectId`/`onSelectProject`), add a parallel `selectedTaskId`/`onSelectTask` pair, and a second `<select>` populated from `useTasksStore().items.filter(t => t.status !== 'DONE' && !t.id.startsWith('pending-'))` — a `pending-` id would make `session_start` 404 on the server. Thread `selectedTaskId` into the `start()` call — `useSessionStore.start` currently takes `(plannedDuration, sessionType, projectId)`; extend it to `(plannedDuration, sessionType, projectId, taskId)`, and extend the `session_start` invoke call in `desktop-app-v3/src/lib/sessions.ts` to pass `taskId` alongside `projectId` (mirroring exactly how `projectId` is already passed).

- [ ] **Step 5: Verify**

Run: `cd desktop-app-v3 && npm run typecheck`
Expected: clean.

Manual (if you have a live environment — otherwise note this explicitly rather than skip it silently): `npm run tauri:dev`, add a task via quick-add, cycle its status, start a session with a task selected, confirm no console errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tasks.ts src/lib/sessions.ts src/routes/DashboardPage.tsx
git commit -m "feat(desktop): task list sidebar, quick-add, and session-start task picker"
```

---

### Task 14: Mobile — read-only task list + session-start task picker

**Files:**
- Modify: `mobile-app/src/lib/api.ts`
- Create: `mobile-app/src/screens/TasksScreen.tsx`
- Modify: `mobile-app/src/navigation/AppNavigator.tsx`
- Modify: `mobile-app/src/screens/TimerScreen.tsx`

**Interfaces:**
- Consumes: `GET /api/tasks` (Task 3).

- [ ] **Step 1: Add the API method**

In `mobile-app/src/lib/api.ts`, add to the `api` object, mirroring `getSessions`'s shape:

```ts
async getTasks(): Promise<Task[]> {
  const res = await apiFetch('/api/tasks');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || 'Failed to fetch tasks', res.status, data.code);
  }
  const data = await res.json();
  return data.tasks || data;
},
```

Add a `Task` type near the file's other type definitions (`Session`, etc.):

```ts
export interface Task {
  id: string;
  title: string;
  status: 'TODO' | 'DOING' | 'DONE';
  tags: string[];
}
```

- [ ] **Step 2: Build the read-only screen**

Create `mobile-app/src/screens/TasksScreen.tsx`. Read `HistoryScreen.tsx` first and match its structure exactly (list rendering, loading/error states, theme usage from `src/lib/theme.ts`). Fetch via `api.getTasks()` on mount, render title + status + tags, no interactions (read-only per the roadmap — no create, no status change, no delete).

- [ ] **Step 3: Add the tab**

In `mobile-app/src/navigation/AppNavigator.tsx`, add a `Tab.Screen name="Tasks" component={TasksScreen}` entry, matching the existing tabs' icon/label configuration pattern exactly.

- [ ] **Step 4: Add a task picker to session start**

In `mobile-app/src/screens/TimerScreen.tsx`, read its current session-start flow first. Add an optional task picker (a simple picker/dropdown of non-DONE tasks from `api.getTasks()`) and thread the selected task's id into the session-start call — check `api.startSession`'s current signature (seen earlier: `plannedDuration, sessionType`) and extend it with an optional `taskId` parameter, passed as `taskId` in the POST body alongside `plannedDuration`/`sessionType`.

- [ ] **Step 5: Verify**

Run: `cd mobile-app && npx tsc --noEmit`
Expected: clean (mobile-app has no automated test suite per this repo's conventions — typecheck is the bar).

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/screens/TasksScreen.tsx src/navigation/AppNavigator.tsx src/screens/TimerScreen.tsx
git commit -m "feat(mobile): read-only task list and session-start task picker"
```

---

### Task 15: Browser extension — read-only task list (Chrome + Firefox)

**Files:**
- Modify: `browser-extension/chrome/background.js`
- Modify: `browser-extension/chrome/popup/popup.js`
- Modify: `browser-extension/chrome/popup/popup.html`
- Modify: `browser-extension/firefox/background.js`
- Modify: `browser-extension/firefox/popup/popup.js`
- Modify: `browser-extension/firefox/popup/popup.html`

**Interfaces:**
- Consumes: `GET /api/tasks` (Task 3).

Chrome and Firefox extensions are fully independent (per this repo's own convention — see `.claude/rules/browser-extension.md`); make the identical change in both, not a shared module.

- [ ] **Step 1: Chrome — fetch and cache tasks**

In `browser-extension/chrome/background.js`, add a `fetchTasks()` function mirroring `fetchUserPreferences()`'s exact shape (same try/catch-silently-fail pattern, same `chrome.storage.local.set` caching):

```js
async function fetchTasks() {
  const token = await getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    await chrome.storage.local.set({ tasks: data.tasks || [] });
  } catch {
    // silently fail
  }
}
```

Add `chrome.alarms.create('pollTasks', { periodInMinutes: 15 });` next to the existing `pollPreferences` alarm, and a matching `if (alarm.name === 'pollTasks') { await fetchTasks(); }` arm in the `chrome.alarms.onAlarm` listener. Call `fetchTasks()` once at the same point `fetchUserPreferences()` is already called on startup/login (find that call site first).

- [ ] **Step 2: Chrome — render read-only in the popup**

In `browser-extension/chrome/popup/popup.html`, add a container element (e.g. `<div id="task-list"></div>`) in a sensible spot near the existing session/distraction info.

In `browser-extension/chrome/popup/popup.js`, on popup open, read `chrome.storage.local.get('tasks')` and render each task's title + status as plain read-only rows into `#task-list`. No click handlers, no create/edit/delete — this is intentionally read-only per the roadmap.

- [ ] **Step 3: Repeat Steps 1-2 for Firefox**

Apply the same changes to `browser-extension/firefox/background.js`, `browser-extension/firefox/popup/popup.js`, and `browser-extension/firefox/popup/popup.html`, with one systematic difference: **the Firefox files use the `browser.*` namespace, not `chrome.*`** — `browser.storage.local`, `browser.alarms`, `browser.browserAction` throughout (`browser-extension/firefox/background.js` lines 26–182). So `fetchTasks()` there calls `browser.storage.local.set({ tasks })`, the alarm is `browser.alarms.create('pollTasks', { periodInMinutes: 15 })` next to the `pollPreferences` alarm at line 182, the arm goes in the `browser.alarms.onAlarm` listener (lines 185–191, one-line-per-alarm style), the startup/login call sits next to `await fetchUserPreferences();` at line 227, and the popup reads `browser.storage.local.get('tasks')`. Do not introduce MV3-only APIs.

- [ ] **Step 4: Verify**

Run: `cd browser-extension && npm run build`
Expected: succeeds, produces both zips.

Manual (Chrome): load `browser-extension/chrome/` unpacked, sign in, wait for or trigger the `pollTasks` alarm (or reload the extension to fire the startup fetch), open the popup, confirm tasks render read-only.

- [ ] **Step 5: Commit**

```bash
git add chrome/background.js chrome/popup/popup.js chrome/popup/popup.html firefox/background.js firefox/popup/popup.js firefox/popup/popup.html
git commit -m "feat(extension): read-only task list in the popup (Chrome + Firefox)"
```

---

### Task 16: Docs + OpenAPI + full verification

**Files:**
- Modify: `web-app/openapi.yaml`
- Modify: `.claude/rules/web-app.md`
- Modify: `.claude/rules/desktop-app-v3.md`
- Modify: `.claude/rules/mobile-app.md`
- Modify: `.claude/rules/browser-extension.md`
- Modify: `.claude/rules/testing.md`

- [ ] **Step 1: Update `openapi.yaml`**

Read the existing `/api/sessions` and `/api/projects` entries in `web-app/openapi.yaml` for the exact YAML shape this file uses, then add matching entries for `/api/tasks`, `/api/tasks/{id}`, and `/api/search` (path, method, summary, request/response schema references) in the same style — parameters (`tag`, `status` query params on the list endpoint; `q` on search), request bodies (`CreateTaskSchema`/`UpdateTaskSchema` shape), and response shapes (`{ task }` / `{ tasks }` / `{ tasks, projects, sessions }`).

- [ ] **Step 2: Update `.claude/rules/web-app.md`**

Add `Task` to the Prisma Models list. Add `TaskStatus` to the Enums list. Add the new routes to the API Routes table under a new `Tasks` tag row (`/api/tasks`, `/api/tasks/[id]`) and a `Search` tag row (`/api/search`).

- [ ] **Step 3: Update `.claude/rules/desktop-app-v3.md`**

In the Rust Modules table: add an `api/tasks.rs` mention to the `api/` row's file list, add `tasks` to the `commands/` row's list, add `pending_task_ops.rs (offline write queue for task mutations, same backoff as pending_sync)` to the `store/` row.

Under Frontend Layout `lib/`, add `tasks`.

- [ ] **Step 4: Update `.claude/rules/mobile-app.md`**

Add `TasksScreen` to the Screens list. Add `getTasks()` to the API Integration section's endpoint list. While there, fix the stale `FocusTimerScreen` entry — the file is `TimerScreen.tsx` (that drift predates this plan).

- [ ] **Step 5: Update `.claude/rules/browser-extension.md`**

Add a line to Key Behaviors noting the read-only task list, polled every 15 minutes alongside preferences.

- [ ] **Step 6: Update `.claude/rules/testing.md`**

Bump the Vitest count and file count in the Test Suites table and the `Web Unit Tests` breakdown by the number of new test files/cases this plan actually added (count them: `api/tasks` two files, `api/search` one file, `schemas.test.ts` additions, `api/sessions` additions). Bump the Rust test-module-file count in the same table by 1 (`pending_task_ops.rs`).

- [ ] **Step 7: Full verification**

Run each and record the result:

```bash
cd web-app && npm test                              # all pass, zero Redis stderr noise
cd web-app && npm run lint                           # zero errors
cd web-app && npm run build
cd desktop-app-v3/src-tauri && cargo test --lib
cd desktop-app-v3 && npm run typecheck
cd mobile-app && npx tsc --noEmit
cd browser-extension && npm run build
```

Then the end-to-end check from the roadmap's own exit criteria: create a task on web, start a session against it on desktop offline (disconnect network, or point `FLOWSHIELD_API_URL` at an unreachable host temporarily), come back online, confirm the session shows up attached to the task on web. Tag a task, filter the web task list by that tag. Type a word from the task's title into the dashboard search box, confirm the task and its session both appear in the results.

- [ ] **Step 8: Commit**

```bash
git add web-app/openapi.yaml .claude/rules/web-app.md .claude/rules/desktop-app-v3.md .claude/rules/mobile-app.md .claude/rules/browser-extension.md .claude/rules/testing.md
git commit -m "docs: Task entity, tags, search, and offline task queue across all clients"
```

---

## Self-review

**Spec coverage** (roadmap Phase 2 + 2026-09-04 amendment):

| Requirement | Task |
|---|---|
| `Task` model per the roadmap's exact shape | 1 |
| `Session.taskId` | 1, 5, 12 |
| Tags: free-form `String[]`, no `Tag` model | 1, 2, 3 |
| Web `/api/tasks` list/create with `?tag=`/`?status=` filters | 3 |
| Web `/api/tasks/[id]` patch/delete | 4 |
| Web `/api/search?q=` — one endpoint, capped 10/entity, scoped, no activity logs | 6 |
| Web quick-add + plain date field, no NL parsing | 7 |
| Web search box in dashboard header | 8 |
| Desktop task list sidebar, pick a task when starting a session, quick-add | 13 |
| Desktop offline queue `pending_task_ops`, same backoff as `pending_sync` | 10, 11, 12 |
| Mobile: read-only list + session-start task picker | 14 |
| Extension: read-only list (session start not applicable — extension never starts its own sessions) | 15 |
| No subtasks, no recurrence, no dependencies, no NL parsing anywhere | enforced by Global Constraints; no task adds any of these |
| Exit criteria: offline create-on-desktop → online → visible on web | 12 (sync_worker Job 3), 16 (manual check) |
| Exit criteria: tag filter | 3, 7, 16 |
| Exit criteria: search finds task + its session | 6, 8, 16 |
| Offline-created task cannot be mutated until synced; replay drops on 4xx / bad payload (not in the roadmap — correctness requirement found in review) | 11, 12, 13 |

**Type consistency:** `Task.status` is `TaskStatus` (`'TODO' \| 'DOING' \| 'DONE'`) everywhere — Prisma enum (Task 1), Zod enum in `UpdateTaskSchema` (Task 2), Rust `status: String` carrying the same three literal values (Task 9, matches the existing `Session.session_type: String` convention rather than a Rust enum, for consistency with how this codebase already handles server-defined enums on the client). `taskId`/`task_id` naming is consistent: camelCase on the wire and in TS, snake_case in Rust via `#[serde(rename_all = "camelCase")]`. `pending_task_ops`'s `op` field values (`"create"`/`"update"`/`"delete"`) are produced by Task 11's commands and consumed by Task 12's `sync_worker` match arms — same three literal strings, no drift.

**Placeholder scan:** none. Task 14 Step 2 asks the implementer to read `HistoryScreen.tsx` before matching its structure; Task 13 Step 2 gives the exact `DashboardPage.tsx` line numbers as of 2026-09-05 (746-line file) — re-grep for `selectedProjectId` if the file has moved.

**Review log (2026-09-05):** corrected against the tree — Firefox extension uses `browser.*` not a `chrome.*` shim; `sessions/route.test.ts` already exists (mock names now quoted); `api/mod.rs` re-exports confirmed; `tasks_update` returns `()` not `Task` (Interfaces summary fixed); `sync_worker` Job 3 no longer aborts the tick on a bad payload and drops 4xx-rejected ops; `pending-` ids are guarded in commands and hidden from the session picker; Zod is v4.
