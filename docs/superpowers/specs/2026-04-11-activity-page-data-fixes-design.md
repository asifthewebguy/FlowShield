# Activity Page Data Fixes — Design Spec

**Date:** 2026-04-11  
**Status:** Approved  
**Scope:** Web app — `web-app/src/app/(app)/activity/page.tsx`, `web-app/src/app/api/activity/analysis/route.ts`, `web-app/src/app/api/activity/sync/route.ts`

---

## Problem

Two bugs cause the Activity page to display inaccurate data:

1. **Timezone bug** — The hourly bar chart and daily trend show activity in the wrong time slots. A user active 10PM–2AM sees bars at 4PM–8PM because the analysis API uses `getHours()` (server UTC) and `toISOString().split('T')[0]` (UTC date) instead of the user's local timezone.

2. **Categorization bug** — Browser extension activity arrives with generic categories (`Browsing`, `Unknown`) because the extension has no awareness of server-side CategoryRules. The sync API stores whatever the client sends verbatim. This causes `messenger.com` to appear as Browsing instead of Communication, distorting the category breakdown and depressing the productivity score.

---

## Fix 1: Timezone-aware grouping

### Root cause

`analysis/route.ts` line 93 (daily grouping):
```js
const date = new Date(log.timestamp).toISOString().split('T')[0]; // always UTC
```

`analysis/route.ts` line 114 (hourly grouping):
```js
const hour = new Date(log.timestamp).getHours(); // server local time (UTC on Netlify)
```

### Solution

**Frontend change — `activity/page.tsx`**

Pass the browser's IANA timezone string as a query param. No user input required — `Intl.DateTimeFormat` is available in all modern browsers.

```js
const params = new URLSearchParams({
  startDate: startDate.toISOString(),
  endDate: new Date().toISOString(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, // e.g. "Asia/Dhaka"
});
```

**Backend change — `analysis/route.ts`**

Read the timezone param (fall back to `'UTC'` if absent):

```js
const timezone = searchParams.get('timezone') || 'UTC';
```

Replace daily grouping (line 93):
```js
// Before:
const date = new Date(log.timestamp).toISOString().split('T')[0];

// After:
const date = new Date(log.timestamp).toLocaleDateString('en-CA', { timeZone: timezone });
// en-CA locale produces YYYY-MM-DD format — same shape as before, now timezone-correct
```

Replace hourly grouping (line 114):
```js
// Before:
const hour = new Date(log.timestamp).getHours();

// After:
const hour = parseInt(
  new Date(log.timestamp).toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false })
);
```

No schema changes. No new dependencies. Safe fallback to UTC for clients that don't send the param (desktop, mobile).

---

## Fix 2: Server-side category resolution at sync time

### Root cause

`sync/route.ts` stores whatever `category` the client sends:
```js
category: normalizeCategory(activity.category || 'Unknown'),
```

The browser extension has no access to server CategoryRules, so domains without a built-in mapping default to `'Browsing'`.

### Solution

**Backend change — `sync/route.ts`**

Add a `resolveCategory` helper that applies server-side CategoryRules when the client sends a generic category:

```ts
// Load once before the activities.map() loop:
const categoryRules = source === 'browser'
  ? await prisma.categoryRule.findMany({
      where: { OR: [{ isGlobal: true }, { userId }] },
      orderBy: [{ priority: 'desc' }, { isGlobal: 'asc' }],
    })
  : [];

// Helper — called per activity:
function resolveCategory(
  applicationName: string,
  clientCategory: string,
  rules: typeof categoryRules
): string {
  const genericCategories = ['Browsing', 'Unknown'];
  // Trust the client if it already sent a specific category
  if (!genericCategories.includes(clientCategory)) {
    return normalizeCategory(clientCategory);
  }
  // Try to match a server rule by applicationName keyword
  const lowerName = applicationName.toLowerCase();
  const matched = rules.find(
    r => r.matchField === 'applicationName' && lowerName.includes(r.keyword)
  );
  return matched ? matched.category : normalizeCategory(clientCategory);
}
```

**Implementation details:**
- Rules loaded **once per sync request** before the `activities.map(...)` loop — single DB query
- Rules ordered by `priority desc`, `isGlobal asc` (same order as the GET endpoint — user rules override global)
- Match condition: `applicationName.toLowerCase().includes(rule.keyword)` where `rule.matchField === 'applicationName'`
- If no rule matches, fall back to `normalizeCategory(clientCategory)`
- `categoryRules` is only fetched when `source === 'browser'` — desktop's CategoryService already handles this correctly, so no extra DB query for desktop syncs

**Fixing existing data**

After deploying, call the existing `/api/activity/recategorize` endpoint for known miscategorized domains:
- `messenger.com` → `Communication`
- `photos.google.com` → `Creative`

This endpoint already exists and updates all ActivityLog records for a given applicationName.

---

## Files Changed

| File | Change |
|------|--------|
| `web-app/src/app/(app)/activity/page.tsx` | Add `timezone` to query params in `fetchAnalysis` |
| `web-app/src/app/api/activity/analysis/route.ts` | Read `timezone` param; use in daily and hourly grouping |
| `web-app/src/app/api/activity/sync/route.ts` | Add `resolveCategory` helper; apply it in activity mapping for browser source |

---

## What Does Not Change

- No Prisma schema migration
- No new API routes
- No changes to desktop or mobile sync paths
- No changes to the frontend rendering logic — only the query param sent

---

## Testing

1. Verify hourly chart matches actual local activity times (compare with browser history)
2. Verify daily trend dates are correct for the user's timezone
3. Sync browser extension data and confirm `messenger.com` → Communication, `mail.google.com` → Communication, `github.com` → Development
4. Run existing 115 Vitest unit tests — no regressions expected (no lib changes)
5. Confirm `npm run lint` passes (no new ESLint errors)
