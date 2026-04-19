# Activity Page Data Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs on the Activity page — wrong hourly/daily time grouping due to UTC vs. local timezone, and wrong app categories due to browser extension data bypassing server-side category rules.

**Architecture:** Extract two pure helper libraries (`timezone.ts`, `activity-sync.ts`) tested with Vitest, then wire them into the existing analysis and sync API routes. No schema changes. No new API routes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma (PostgreSQL/Neon), Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `web-app/src/lib/timezone.ts` | Pure helpers: `getLocalHour`, `getLocalDate` |
| Create | `web-app/src/lib/timezone.test.ts` | Vitest unit tests for timezone helpers |
| Create | `web-app/src/lib/activity-sync.ts` | Pure helper: `resolveCategory` |
| Create | `web-app/src/lib/activity-sync.test.ts` | Vitest unit tests for resolveCategory |
| Modify | `web-app/src/app/api/activity/analysis/route.ts` | Read `timezone` param, use helpers for grouping |
| Modify | `web-app/src/app/api/activity/sync/route.ts` | Load CategoryRules once, apply resolveCategory |
| Modify | `web-app/src/app/(app)/activity/page.tsx` | Pass `timezone` query param |

---

## Task 1: Timezone helpers

**Files:**
- Create: `web-app/src/lib/timezone.ts`
- Create: `web-app/src/lib/timezone.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `web-app/src/lib/timezone.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getLocalHour, getLocalDate } from './timezone';

describe('getLocalHour', () => {
  it('converts UTC timestamp to local hour in Asia/Dhaka (UTC+6)', () => {
    // 2026-04-10T16:00:00Z = 2026-04-10T22:00+06:00 → hour 22
    const date = new Date('2026-04-10T16:00:00Z');
    expect(getLocalHour(date, 'Asia/Dhaka')).toBe(22);
  });

  it('converts UTC timestamp crossing midnight in Asia/Dhaka', () => {
    // 2026-04-10T20:00:00Z = 2026-04-11T02:00+06:00 → hour 2
    const date = new Date('2026-04-10T20:00:00Z');
    expect(getLocalHour(date, 'Asia/Dhaka')).toBe(2);
  });

  it('returns 0 for midnight (handles locales that return 24)', () => {
    // 2026-04-10T18:00:00Z = 2026-04-11T00:00+06:00 → hour 0
    const date = new Date('2026-04-10T18:00:00Z');
    expect(getLocalHour(date, 'Asia/Dhaka')).toBe(0);
  });

  it('falls back correctly with UTC timezone', () => {
    const date = new Date('2026-04-10T14:30:00Z');
    expect(getLocalHour(date, 'UTC')).toBe(14);
  });
});

describe('getLocalDate', () => {
  it('returns YYYY-MM-DD in local timezone, not UTC', () => {
    // 2026-04-10T20:00:00Z = 2026-04-11 in Asia/Dhaka
    const date = new Date('2026-04-10T20:00:00Z');
    expect(getLocalDate(date, 'Asia/Dhaka')).toBe('2026-04-11');
  });

  it('returns YYYY-MM-DD in UTC when timezone is UTC', () => {
    const date = new Date('2026-04-10T20:00:00Z');
    expect(getLocalDate(date, 'UTC')).toBe('2026-04-10');
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd web-app && npx vitest run src/lib/timezone.test.ts
```

Expected: FAIL — `Cannot find module './timezone'`

- [ ] **Step 1.3: Implement the helpers**

Create `web-app/src/lib/timezone.ts`:

```ts
/**
 * Returns the hour (0–23) of a UTC Date in the given IANA timezone.
 * Handles the edge case where some environments return "24" for midnight.
 */
export function getLocalHour(date: Date, timezone: string): number {
  const hourStr = date.toLocaleString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  const hour = parseInt(hourStr, 10);
  return hour === 24 ? 0 : hour;
}

/**
 * Returns the date as a YYYY-MM-DD string in the given IANA timezone.
 * Uses en-CA locale because it produces ISO-style date strings natively.
 */
export function getLocalDate(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone });
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd web-app && npx vitest run src/lib/timezone.test.ts
```

Expected: PASS — 6 tests

- [ ] **Step 1.5: Commit**

```bash
cd web-app && git add src/lib/timezone.ts src/lib/timezone.test.ts
git commit -m "feat(web): add timezone helpers for local hour and date conversion"
```

---

## Task 2: resolveCategory helper

**Files:**
- Create: `web-app/src/lib/activity-sync.ts`
- Create: `web-app/src/lib/activity-sync.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `web-app/src/lib/activity-sync.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveCategory } from './activity-sync';

// Minimal shape — only fields resolveCategory cares about
interface RuleStub {
  keyword: string;
  matchField: string;
  category: string;
}

const noRules: RuleStub[] = [];

describe('resolveCategory', () => {
  it('trusts client category when it is specific (not Browsing or Unknown)', () => {
    const rules: RuleStub[] = [
      { keyword: 'github', matchField: 'applicationName', category: 'Development' },
    ];
    // Client already sent 'Development' — no lookup needed
    expect(resolveCategory('github.com', 'Development', rules)).toBe('Development');
  });

  it('applies normalizeCategory alias when trusting client', () => {
    // Desktop sends 'Productivity' — should map to 'Work'
    expect(resolveCategory('word.exe', 'Productivity', noRules)).toBe('Work');
  });

  it('looks up rule when client sends Browsing', () => {
    const rules: RuleStub[] = [
      { keyword: 'messenger', matchField: 'applicationName', category: 'Communication' },
    ];
    expect(resolveCategory('messenger.com', 'Browsing', rules)).toBe('Communication');
  });

  it('looks up rule when client sends Unknown', () => {
    const rules: RuleStub[] = [
      { keyword: 'photos.google', matchField: 'applicationName', category: 'Creative' },
    ];
    expect(resolveCategory('photos.google.com', 'Unknown', rules)).toBe('Creative');
  });

  it('falls back to client category when no rule matches', () => {
    expect(resolveCategory('obscure-site.com', 'Browsing', noRules)).toBe('Browsing');
  });

  it('ignores rules with matchField other than applicationName', () => {
    const rules: RuleStub[] = [
      { keyword: 'messenger', matchField: 'windowTitle', category: 'Communication' },
    ];
    expect(resolveCategory('messenger.com', 'Browsing', rules)).toBe('Browsing');
  });

  it('uses first matching rule (rules pre-sorted by priority desc)', () => {
    // User rule (priority 10, isGlobal false) comes first in the pre-sorted array
    const rules: RuleStub[] = [
      { keyword: 'github', matchField: 'applicationName', category: 'Work' },       // user override
      { keyword: 'github', matchField: 'applicationName', category: 'Development' }, // global default
    ];
    expect(resolveCategory('github.com', 'Browsing', rules)).toBe('Work');
  });

  it('is case-insensitive on applicationName', () => {
    const rules: RuleStub[] = [
      { keyword: 'messenger', matchField: 'applicationName', category: 'Communication' },
    ];
    expect(resolveCategory('Messenger.COM', 'Browsing', rules)).toBe('Communication');
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd web-app && npx vitest run src/lib/activity-sync.test.ts
```

Expected: FAIL — `Cannot find module './activity-sync'`

- [ ] **Step 2.3: Implement the helper**

Create `web-app/src/lib/activity-sync.ts`:

```ts
// Desktop → Web category name mapping (mirrors categories/route.ts)
const CATEGORY_ALIASES: Record<string, string> = {
  Productivity: 'Work',
  Social: 'Social Media',
};

function normalizeCategory(category: string): string {
  return CATEGORY_ALIASES[category] || category;
}

// Generic categories that warrant a server-side rule lookup
const GENERIC_CATEGORIES = ['Browsing', 'Unknown'];

interface CategoryRuleLike {
  keyword: string;
  matchField: string;
  category: string;
}

/**
 * Resolves the category for a synced activity.
 *
 * - If the client already sent a specific category, trust it (after normalization).
 * - If the client sent a generic category (Browsing/Unknown), try to match a
 *   server-side CategoryRule by applicationName keyword.
 * - Falls back to the client-sent category if no rule matches.
 *
 * @param applicationName - e.g. "messenger.com" or "chrome.exe"
 * @param clientCategory  - category sent by the client
 * @param rules           - pre-loaded CategoryRules (sorted by priority desc, isGlobal asc)
 */
export function resolveCategory(
  applicationName: string,
  clientCategory: string,
  rules: CategoryRuleLike[]
): string {
  if (!GENERIC_CATEGORIES.includes(clientCategory)) {
    return normalizeCategory(clientCategory);
  }

  const lowerName = applicationName.toLowerCase();
  const matched = rules.find(
    (r) => r.matchField === 'applicationName' && lowerName.includes(r.keyword)
  );

  return matched ? matched.category : normalizeCategory(clientCategory);
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd web-app && npx vitest run src/lib/activity-sync.test.ts
```

Expected: PASS — 8 tests

- [ ] **Step 2.5: Commit**

```bash
cd web-app && git add src/lib/activity-sync.ts src/lib/activity-sync.test.ts
git commit -m "feat(web): add resolveCategory helper for server-side rule matching"
```

---

## Task 3: Wire timezone into the analysis route

**Files:**
- Modify: `web-app/src/app/api/activity/analysis/route.ts`

- [ ] **Step 3.1: Update the route**

Open `web-app/src/app/api/activity/analysis/route.ts`. Make these changes:

Add import at the top (after existing imports):
```ts
import { getLocalHour, getLocalDate } from '@/lib/timezone';
```

After line 20 (`const endDate = searchParams.get('endDate');`), add:
```ts
const timezone = searchParams.get('timezone') || 'UTC';
```

Replace line 93 (daily grouping):
```ts
// Before:
const date = new Date(log.timestamp).toISOString().split('T')[0];

// After:
const date = getLocalDate(new Date(log.timestamp), timezone);
```

Replace line 114 (hourly grouping):
```ts
// Before:
const hour = new Date(log.timestamp).getHours();

// After:
const hour = getLocalHour(new Date(log.timestamp), timezone);
```

- [ ] **Step 3.2: Run the full test suite to check for regressions**

```bash
cd web-app && npm test
```

Expected: 115 tests pass (no regressions — the route has no unit tests, the helpers do)

- [ ] **Step 3.3: Run lint**

```bash
cd web-app && npm run lint
```

Expected: 0 errors

- [ ] **Step 3.4: Commit**

```bash
cd web-app && git add src/app/api/activity/analysis/route.ts
git commit -m "fix(web): use local timezone for hourly and daily activity grouping"
```

---

## Task 4: Wire resolveCategory into the sync route

**Files:**
- Modify: `web-app/src/app/api/activity/sync/route.ts`

- [ ] **Step 4.1: Update the route**

Open `web-app/src/app/api/activity/sync/route.ts`. Make these changes:

Add import at the top (after existing imports):
```ts
import { resolveCategory } from '@/lib/activity-sync';
```

Remove the existing `normalizeCategory` import (it's no longer needed here — `resolveCategory` handles normalization internally):
```ts
// Remove this line:
import { normalizeCategory } from '@/app/api/categories/route';
```

Inside `POST`, after `const source: string = (body.source as string) || 'desktop';`, add the rule pre-load:
```ts
// Load CategoryRules once for the whole batch (browser source only)
const categoryRules = source === 'browser'
  ? await prisma.categoryRule.findMany({
      where: { OR: [{ isGlobal: true }, { userId }] },
      orderBy: [{ priority: 'desc' }, { isGlobal: 'asc' }],
    })
  : [];
```

In the `activityLogs` mapping, replace the `category` field:
```ts
// Before:
category: normalizeCategory(activity.category || 'Unknown'),

// After:
category: resolveCategory(
  activity.applicationName || activity.domain || 'Unknown',
  activity.category || 'Unknown',
  categoryRules
),
```

- [ ] **Step 4.2: Run the full test suite**

```bash
cd web-app && npm test
```

Expected: 115 tests pass

- [ ] **Step 4.3: Run lint**

```bash
cd web-app && npm run lint
```

Expected: 0 errors

- [ ] **Step 4.4: Commit**

```bash
cd web-app && git add src/app/api/activity/sync/route.ts
git commit -m "fix(web): apply server-side category rules to browser extension activity at sync time"
```

---

## Task 5: Pass timezone from the activity page

**Files:**
- Modify: `web-app/src/app/(app)/activity/page.tsx`

- [ ] **Step 5.1: Update fetchAnalysis**

Open `web-app/src/app/(app)/activity/page.tsx`. Find the `params` construction around line 95:

```ts
// Before:
const params = new URLSearchParams({
  startDate: startDate.toISOString(),
  endDate: new Date().toISOString(),
});

// After:
const params = new URLSearchParams({
  startDate: startDate.toISOString(),
  endDate: new Date().toISOString(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
```

No other changes to the page.

- [ ] **Step 5.2: Run lint**

```bash
cd web-app && npm run lint
```

Expected: 0 errors

- [ ] **Step 5.3: Run build to confirm TypeScript compiles**

```bash
cd web-app && npm run build
```

Expected: Build succeeds

- [ ] **Step 5.4: Commit**

```bash
cd web-app && git add src/app/(app)/activity/page.tsx
git commit -m "fix(web): pass browser timezone to activity analysis API"
```

---

## Task 6: Fix existing miscategorized data

This task uses the already-deployed `/api/activity/recategorize` endpoint to correct historical records. Run these against the production API (or dev if testing locally) with a valid JWT token.

- [ ] **Step 6.1: Get your auth token**

Log in to the web app, open DevTools → Application → Local Storage → copy the `token` value.

- [ ] **Step 6.2: Fix messenger.com → Communication**

```bash
curl -X POST https://flowshield.app/api/activity/recategorize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"applicationName": "messenger.com", "newCategory": "Communication"}'
```

Expected response: `{ "updated": <N> }` where N ≥ 0

- [ ] **Step 6.3: Fix photos.google.com → Creative**

```bash
curl -X POST https://flowshield.app/api/activity/recategorize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"applicationName": "photos.google.com", "newCategory": "Creative"}'
```

Expected response: `{ "updated": <N> }`

- [ ] **Step 6.4: Verify in the Activity page**

Reload the Activity page. Confirm:
- `messenger.com` now shows **Communication** in the category column
- `photos.google.com` now shows **Creative**
- The productivity score has updated accordingly

---

## Manual Smoke Test (after all tasks)

- [ ] Open the Activity page, select **Today**
- [ ] Verify the hourly chart peaks match your actual active hours (e.g. 10PM–2AM)
- [ ] Verify the Daily Activity Trend shows today's date in your local timezone (not UTC)
- [ ] Sync a browser extension activity (visit messenger.com, wait for the 1-min alarm) — reload and confirm it appears as **Communication**
- [ ] Switch time ranges (Last 7 Days, Last 30 Days, All Time) — confirm chart hours remain locally correct
