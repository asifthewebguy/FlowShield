# Reports & Project Cost Analysis — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Web app — two new pages, one Prisma migration, two new API routes, nav updates

---

## Problem

FlowShield tracks focus sessions, productivity scores, and project time but has no way to view week-over-week performance trends or understand the financial value of time spent per project. Users doing freelance or client work have no visibility into earnings vs. budget.

---

## Solution Overview

Two standalone pages added to the main navigation:

1. **`/reports/weekly`** — Rolling 8-week performance trend
2. **`/projects/cost`** — Per-project time and cost analysis

---

## Page 1: Weekly Performance Report (`/reports/weekly`)

### What it shows

- **Week-over-week delta cards (3):** Focus Hours, Productivity Score, Sessions Completed — each shows current week value and % / point change vs last week (e.g. "↑12%", "↓3pts")
- **Grouped bar chart:** 8 weeks on x-axis, 3 bars per group (blue = focus hours, purple = productivity score, green = sessions completed). Current week highlighted.
- **Top categories row:** Tags showing the top 3 activity categories for the current week with hours spent (e.g. "Development 8h", "Work 6h", "Creative 4h")

### Data source

- `DailyStats` model — `totalFocusMinutes`, `avgProductivityScore`, `sessionsCompleted` fields
- Aggregated by ISO week (Monday–Sunday)
- `ActivityLog.category` for top-3 categories of the current week

### API

**`GET /api/reports/weekly?weeks=8`**

Response shape:
```json
{
  "weeks": [
    {
      "weekLabel": "Mar 31",
      "weekStart": "2026-03-31",
      "totalFocusHours": 21.5,
      "avgProductivityScore": 73,
      "sessionsCompleted": 10
    }
  ],
  "currentWeekDelta": {
    "focusHours": { "value": 24, "delta": 12, "direction": "up" },
    "productivityScore": { "value": 78, "delta": 5, "direction": "up" },
    "sessionsCompleted": { "value": 12, "delta": 2, "direction": "up" }
  },
  "topCategories": [
    { "category": "Development", "hours": 8 },
    { "category": "Work", "hours": 6 },
    { "category": "Creative", "hours": 4 }
  ]
}
```

### Reuse

- Extend `getWeeklyTrend()` in `web-app/src/lib/insights.ts` to return N weeks of data (currently returns only 2-week comparison)
- Client-side SWR fetch with `Authorization: Bearer` header — matches existing analytics page pattern

### No schema changes

---

## Page 2: Project Cost Analysis (`/projects/cost`)

### What it shows

- **Summary header (3 stat cards):** Total Earned (across all projects), Total Hours, Active Projects count
- **Period filter:** "This Month" | "Last Month" | "All Time" — tab switcher, default This Month
- **Compact table:**

  | Project | Rate | Hours | Earned | Budget |
  |---------|------|-------|--------|--------|
  | Client A | $75/hr | 16 / 20h | $1,200 | ████░░ 60% |
  | Client B | $100/hr | 22.5 / 20h ⚠ | $2,250 | ████████ OVER |

  - Over-budget rows: red text on earnings + red progress bar + ⚠ icon
  - Projects with no `hourlyRate` set show "—" for earnings columns
- **Earnings bar chart:** One bar per project showing total earnings for the selected period

### Calculations

- `actualHours = sum(session.actualDuration) / 3600` for sessions in the period, grouped by project
- `earnings = actualHours × project.hourlyRate`
- `budgetPercent = earnings / project.budget × 100`
- Over budget: `earnings > project.budget`
- Hours over: `actualHours > project.plannedHours`

### Schema migration

Add three optional fields to the `Project` model in `web-app/prisma/schema.prisma`:

```prisma
model Project {
  // existing fields ...
  hourlyRate   Decimal?
  budget       Decimal?
  plannedHours Float?
}
```

Migration: `npx prisma migrate dev --name add_project_cost_fields`

### API

**`GET /api/projects/cost?period=month`**

- `period`: `month` | `lastMonth` | `all` (default: `month`)
- Fetches user's projects with `hourlyRate`, `budget`, `plannedHours`
- Joins sessions in the period, sums `actualDuration`
- Returns per-project cost data + summary totals

Response shape:
```json
{
  "summary": {
    "totalEarned": 3930,
    "totalHours": 46.5,
    "projectCount": 3
  },
  "projects": [
    {
      "id": "...",
      "name": "Client A",
      "color": "#f59e0b",
      "hourlyRate": 75,
      "budget": 2000,
      "plannedHours": 20,
      "actualHours": 16,
      "earned": 1200,
      "budgetPercent": 60,
      "isOverBudget": false,
      "isOverHours": false
    }
  ]
}
```

### Update existing project routes

- `POST /api/projects` — add `hourlyRate`, `budget`, `plannedHours` to `CreateProjectSchema` (Zod, all optional)
- `GET /api/projects` — include new fields in the response

---

## Navigation

Add two entries to the sidebar nav component (`web-app/src/components/` — nav component to be identified during implementation):

- **Reports** → `/reports/weekly` (icon: BarChart2 or similar)
- **Project Cost** → `/projects/cost` (icon: DollarSign or similar)

---

## Fetching Pattern

Both pages follow the existing analytics page pattern:
- `"use client"` component
- `useSWR` with custom fetcher adding `Authorization: Bearer ${token}` header
- Loading skeleton while data is fetched
- Error state if fetch fails

---

## Files to Create / Modify

| Action | File | Notes |
|--------|------|-------|
| Create | `web-app/src/app/(app)/reports/weekly/page.tsx` | Weekly report page |
| Create | `web-app/src/app/(app)/projects/cost/page.tsx` | Project cost page |
| Create | `web-app/src/app/api/reports/weekly/route.ts` | Weekly aggregation API |
| Create | `web-app/src/app/api/projects/cost/route.ts` | Project cost API |
| Modify | `web-app/prisma/schema.prisma` | Add 3 fields to Project |
| Modify | `web-app/src/app/api/projects/route.ts` | Add new fields to schema + response |
| Modify | `web-app/src/lib/insights.ts` | Extend `getWeeklyTrend()` to return N weeks |
| Modify | Nav component | Add Reports + Project Cost nav items |

---

## What Does Not Change

- No changes to desktop, mobile, or browser extension
- No changes to session tracking or activity sync
- No changes to existing analytics, dashboard, or activity pages
- `DailyStats` schema unchanged

---

## Verification

1. `npm run lint` — 0 errors
2. `npm run build` — TypeScript compiles cleanly
3. `npm test` — existing 115 Vitest tests still pass (no regressions)
4. Manual: create a project with hourlyRate=$75, budget=$1000, plannedHours=10 → log sessions → verify `/projects/cost` shows correct earnings and progress bars
5. Manual: verify `/reports/weekly` shows 8 weeks of bars and delta cards reflect actual DailyStats data
6. Manual: verify over-budget project shows red warning
