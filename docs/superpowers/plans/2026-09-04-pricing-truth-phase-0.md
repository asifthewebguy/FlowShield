# Pricing Truth + Landing Page Honesty (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public landing page stops selling things the product does not do (AI coaching as the headline, gamification, team management, "free forever for everything") and starts describing what actually ships: focus sessions, activity tracking, distraction blocking, projects with hourly rates.

**Architecture:** Copy-only change to the Next.js landing page under `web-app/src/components/landing/` plus the page composition in `web-app/src/app/page.tsx` and the site title in `layout.tsx`. Two sections (`AICoachShowcase`, `TeamsSection`) are removed from the rendered page but their files stay on disk. No API, schema, or auth changes. No new dependencies.

**Tech Stack:** Next.js 16 App Router, React 19, TailwindCSS. Verification is `npm run lint`, `npm run build`, and two existing Playwright specs.

**Spec:** [2026-09-03-wedge-roadmap.md](2026-09-03-wedge-roadmap.md) section "Phase 0 — Pricing page truth" plus the "Amendments (2026-09-04)" section of the same document.

## Global Constraints

- No new npm dependencies.
- Web deploys continuously from `main`: every task must leave `cd web-app && npm run lint` at zero errors and `npm run build` green.
- Internal navigation uses `<Link>` from `next/link`; `<a>` only for external URLs and in-page `#anchors`. ESLint treats `@next/next/no-html-link-for-pages` as an error.
- Do **not** delete `AICoachShowcase.tsx` or `TeamsSection.tsx`. They are unrendered, not removed. Decision on their fate is deferred to after Phase 4.
- Do **not** add any privacy claim. That copy lands only after Phase 1 ships the `shareWindowDetails` toggle.
- Do **not** add prices, a payment provider, or a waitlist form. There is no backend for a waitlist; the Pro card is informational only.
- Commit messages: Conventional Commits. **No `Co-Authored-By` trailer.**
- Copy must describe shipped behaviour only. The verified-shipped list is: unlimited focus sessions (`/api/sessions`), activity tracking on desktop/browser/mobile (`/api/activity/sync`), analytics dashboard + weekly report (`/api/analytics`, `/api/reports/weekly`), distraction blocking on desktop (`desktop-app-v3/src-tauri/src/blocking/mod.rs`, hosts-file, domains only), projects with hourly rate and cost tracking (`Project.hourlyRate`, `/api/projects/cost`), cross-platform sync, data export as CSV and JSON (`/api/export?format=csv|json`), daily and weekly goals (`/api/goals`).

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `web-app/src/components/landing/Pricing.tsx` | rewrite | One honest Free card + one informational "Pro — planned" card |
| `web-app/src/components/landing/FeaturesGrid.tsx` | modify | Primary cards: Focus Timer, Activity Tracking, Analytics. Secondary: drop Gamification, fix Goals copy, add Projects |
| `web-app/src/app/page.tsx` | modify | Stop rendering `AICoachShowcase` and `TeamsSection` |
| `web-app/src/components/landing/Navbar.tsx` | modify | Remove the `AI Coach` nav link (its `#coach` anchor no longer exists) |
| `web-app/src/components/landing/Footer.tsx` | modify | Remove the `AI Coach` footer link; fix tagline |
| `web-app/src/components/landing/Hero.tsx` | modify | Badge and subtitle no longer lead with AI |
| `web-app/src/components/landing/CrossPlatform.tsx` | modify | Web Dashboard description no longer lists AI coach and team management |
| `web-app/src/components/landing/FAQ.tsx` | modify | Rewrite the free answer; drop the AI Coach and Teams questions |
| `web-app/src/app/layout.tsx` | modify | Site `<title>` no longer says "AI-Powered" |

---

### Task 1: Pricing section — honest Free card + planned Pro card

**Files:**
- Modify: `web-app/src/components/landing/Pricing.tsx`

**Interfaces:**
- Consumes: `useScrollReveal` from `./useScrollReveal` (exists).
- Produces: nothing consumed by other tasks. Section keeps `id="pricing"` so the Navbar `#pricing` link still works.

- [ ] **Step 1: Replace the file contents**

Overwrite `web-app/src/components/landing/Pricing.tsx` with:

```tsx
'use client';
import Link from 'next/link';
import { useScrollReveal } from './useScrollReveal';

const freeFeatures = [
  'Unlimited focus sessions',
  'Activity tracking on desktop, browser, and mobile',
  'Analytics dashboard and weekly report',
  'Distraction blocking on desktop',
  'Projects with hourly rates and cost tracking',
  'Daily and weekly goals',
  'Cross-platform sync',
  'Data export (CSV and JSON)',
];

const plannedProFeatures = [
  'Plan your day against your calendar',
  'Plan vs. actual, with re-planning suggestions',
  'Clients, billable hours, and invoice export',
];

function CheckIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
  );
}

export default function Pricing() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      id="pricing"
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-surface-1"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center mb-12 animate-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white">
            Free today. Pro is on the way.
          </h2>
          <p className="text-gray-400 mt-4 max-w-xl mx-auto">
            Everything that ships today is free. No credit card, no time limit.
          </p>
        </div>

        <div className={`grid md:grid-cols-2 gap-6 max-w-3xl mx-auto animate-reveal animate-reveal-delay-2 ${isVisible ? 'visible' : ''}`}>
          {/* Free */}
          <div className="bg-surface-3/40 border border-surface-3 rounded-2xl p-8 flex flex-col">
            <div className="text-center mb-8">
              <p className="text-sm text-gray-400 mb-1">Everything shipped so far</p>
              <div className="font-display text-5xl font-bold text-white">Free</div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {freeFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckIcon className="w-5 h-5 text-primary-400 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href="/auth/signup"
              className="block w-full py-3 text-center bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
            >
              Get Started Free
            </Link>
          </div>

          {/* Pro — planned */}
          <div className="bg-surface-2/40 border border-dashed border-surface-3 rounded-2xl p-8 flex flex-col">
            <div className="text-center mb-8">
              <p className="text-sm text-gray-400 mb-1">Planned</p>
              <div className="font-display text-5xl font-bold text-gray-300">Pro</div>
              <p className="text-sm text-gray-500 mt-1">Pricing announced when it ships</p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plannedProFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-gray-400">
                  <CheckIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <p className="text-center text-xs text-gray-500">
              Not available yet. Everything in the Free column works today.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Lint and build**

Run: `cd web-app && npm run lint && npm run build`
Expected: lint reports zero errors (warnings acceptable); build finishes with the `/` route listed as static.

- [ ] **Step 3: Visual check**

Run: `cd web-app && npm run dev`, open `http://localhost:3000/#pricing`.
Expected: two cards side by side on desktop, stacked on mobile. Free card has a filled primary button. Pro card has a dashed border, no button, the text "Not available yet".

- [ ] **Step 4: Commit**

```bash
git add web-app/src/components/landing/Pricing.tsx
git commit -m "fix(web): pricing section describes shipped Free plan and a planned Pro plan"
```

---

### Task 2: Features grid — lead with tracking, drop gamification

**Files:**
- Modify: `web-app/src/components/landing/FeaturesGrid.tsx` (the `primaryFeatures` and `secondaryFeatures` arrays only; the JSX below them is unchanged)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing. Section keeps `id="features"`.

- [ ] **Step 1: Replace `primaryFeatures`**

In `FeaturesGrid.tsx`, replace the whole `const primaryFeatures = [ ... ];` array with:

```tsx
const primaryFeatures = [
  {
    title: 'Focus Timer',
    description: 'Pomodoro-style sessions with Work, Study, and Creative modes. Pause, resume, and pick a project for every session.',
    iconBg: 'bg-primary-900/40',
    iconColor: 'text-primary-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Activity Tracking',
    description: 'The desktop app records which app and window you are in. The extension records sites. The mobile app records phone use. No manual logging.',
    iconBg: 'bg-surface-4',
    iconColor: 'text-gray-300',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
      </svg>
    ),
  },
  {
    title: 'Analytics Dashboard',
    description: 'Daily focus charts, productivity scores, yearly heatmaps, and trend tracking — understand your work patterns at a glance.',
    iconBg: 'bg-accent-900/40',
    iconColor: 'text-accent-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
      </svg>
    ),
  },
];
```

The Analytics entry is the existing one moved to third position; keep its SVG exactly as it is in the file if it differs from the two-path version above.

- [ ] **Step 2: Replace `secondaryFeatures`**

Replace the whole `const secondaryFeatures = [ ... ];` array with:

```tsx
const secondaryFeatures = [
  { title: 'Distraction Analysis', description: 'See which apps and sites steal your focus, with daily trends.' },
  { title: 'Deep Work Mode', description: 'Hosts-file blocking of distracting sites during focus sessions on desktop.' },
  { title: 'Projects & Hourly Rates', description: 'Attach sessions to projects, set a rate, and see hours and cost per project.' },
  { title: 'Goals', description: 'Daily and weekly focus targets tracked against your sessions.' },
  { title: 'Smart Sync', description: 'Your data follows you across web, desktop, mobile, and browser.' },
  { title: 'Data Export', description: 'Download your sessions as CSV or your full account as JSON at any time.' },
];
```

- [ ] **Step 3: Lint and build**

Run: `cd web-app && npm run lint && npm run build`
Expected: zero lint errors; build green.

- [ ] **Step 4: Commit**

```bash
git add web-app/src/components/landing/FeaturesGrid.tsx
git commit -m "fix(web): features grid leads with activity tracking and drops gamification copy"
```

---

### Task 3: Page composition, navigation, hero

**Files:**
- Modify: `web-app/src/app/page.tsx`
- Modify: `web-app/src/components/landing/Navbar.tsx:5-10`
- Modify: `web-app/src/components/landing/Footer.tsx:7` and `:48`
- Modify: `web-app/src/components/landing/Hero.tsx:13` and `:24-27`

**Interfaces:**
- Consumes: nothing new.
- Produces: the `#coach` anchor no longer exists anywhere on the page, so every link to it must go in this same task.

- [ ] **Step 1: Stop rendering the two sections**

In `web-app/src/app/page.tsx` delete these two import lines:

```tsx
import AICoachShowcase from '@/components/landing/AICoachShowcase';
import TeamsSection from '@/components/landing/TeamsSection';
```

and delete these two JSX lines inside `<main>`:

```tsx
        <AICoachShowcase />
        <TeamsSection />
```

The resulting `<main>` renders, in order: `Hero`, `SocialProof`, `FeaturesGrid`, `TimerShowcase`, `AnalyticsShowcase`, `CrossPlatform`, `Pricing`, `FAQ`.

- [ ] **Step 2: Remove the nav link**

In `Navbar.tsx`, change the `navLinks` array to:

```tsx
const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Analytics', href: '#analytics' },
  { label: 'Pricing', href: '#pricing' },
];
```

- [ ] **Step 3: Remove the footer link and fix the tagline**

In `Footer.tsx`, delete the line `{ label: 'AI Coach', href: '#coach' },` from the links array near line 7.

On line 48, replace the text `AI-powered productivity & focus management platform.` with `Focus sessions, automatic activity tracking, and distraction blocking.`

- [ ] **Step 4: Rewrite the hero badge and subtitle**

In `Hero.tsx`, replace line 13 (`AI-Powered Productivity`) with:

```tsx
          Automatic time tracking
```

Replace the subtitle paragraph text (lines 25-26) so the `<p>` reads:

```tsx
        <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Tracks where your time actually goes, blocks distractions during focus
          sessions, and shows you the numbers.
        </p>
```

- [ ] **Step 5: Lint and build**

Run: `cd web-app && npm run lint && npm run build`
Expected: zero lint errors. Build green. `AICoachShowcase.tsx` and `TeamsSection.tsx` still exist on disk; ESLint does not flag unreferenced files.

- [ ] **Step 6: Check for dangling anchors**

Run: `grep -rn "#coach\|#teams" web-app/src/`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add web-app/src/app/page.tsx web-app/src/components/landing/Navbar.tsx web-app/src/components/landing/Footer.tsx web-app/src/components/landing/Hero.tsx
git commit -m "fix(web): landing page no longer leads with AI coach or teams"
```

---

### Task 4: FAQ, cross-platform copy, site title

**Files:**
- Modify: `web-app/src/components/landing/FAQ.tsx:5-34`
- Modify: `web-app/src/components/landing/CrossPlatform.tsx:40`
- Modify: `web-app/src/app/layout.tsx:19`

- [ ] **Step 1: Replace the `faqs` array**

In `FAQ.tsx`, replace the whole `const faqs = [ ... ];` array with:

```tsx
const faqs = [
  {
    q: 'What platforms does FlowShield support?',
    a: 'FlowShield works on Windows (desktop app), Chrome and Firefox (browser extension), iOS and Android (mobile app), and any browser (web dashboard). All platforms sync in real-time.',
  },
  {
    q: 'Is FlowShield really free?',
    a: 'Everything that ships today is free, with no time limit and no credit card. A paid Pro plan is planned for the day-planning, calendar, and client-billing features listed under Pricing. Pricing will be announced when those ship.',
  },
  {
    q: 'How does activity tracking work?',
    a: 'The desktop app passively monitors your active window and process names. The browser extension tracks which sites you visit. The mobile app tracks phone usage and app time. Everything syncs to your dashboard automatically.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. Your activity data is stored securely and only visible to you. It is never sold or shared with third parties. You can export or delete your data at any time from the Profile page.',
  },
  {
    q: 'What is Deep Work Mode?',
    a: 'Deep Work Mode lets the desktop app block distracting websites at the system level during your focus sessions. You choose which sites to block in your profile preferences.',
  },
];
```

Two questions are removed (AI Coach, Teams). The Deep Work answer drops "and apps": blocking is hosts-file only, so it blocks sites, not applications.

- [ ] **Step 2: Fix the Web Dashboard description**

In `CrossPlatform.tsx` line 40, replace:

```tsx
    description: 'Full analytics, AI coach, team management, and real-time session tracking.',
```

with:

```tsx
    description: 'Full analytics, projects with hourly rates, session history, and real-time session tracking.',
```

- [ ] **Step 3: Fix the site title**

In `web-app/src/app/layout.tsx` line 19, replace:

```ts
  title: "FlowShield - AI-Powered Productivity & Focus Management",
```

with:

```ts
  title: "FlowShield - Focus Sessions & Automatic Time Tracking",
```

Leave the `description` line unchanged.

- [ ] **Step 4: Lint and build**

Run: `cd web-app && npm run lint && npm run build`
Expected: zero lint errors; build green.

- [ ] **Step 5: Commit**

```bash
git add web-app/src/components/landing/FAQ.tsx web-app/src/components/landing/CrossPlatform.tsx web-app/src/app/layout.tsx
git commit -m "fix(web): FAQ, platform copy, and site title match shipped features"
```

---

### Task 5: Full verification

**Files:** none modified.

- [ ] **Step 1: Confirm no stale copy remains**

Run:

```bash
grep -rniE 'ai coach|leaderboard|gamification|badges|achievements|streak|free forever|intelligent break|team management' web-app/src/app/page.tsx web-app/src/app/layout.tsx web-app/src/components/landing/Hero.tsx web-app/src/components/landing/Navbar.tsx web-app/src/components/landing/Footer.tsx web-app/src/components/landing/FeaturesGrid.tsx web-app/src/components/landing/Pricing.tsx web-app/src/components/landing/FAQ.tsx web-app/src/components/landing/CrossPlatform.tsx
```

Expected: no output. (`AICoachShowcase.tsx` and `TeamsSection.tsx` are intentionally excluded from the grep; they are unrendered.)

- [ ] **Step 2: Unit tests, lint, build**

Run: `cd web-app && npm test && npm run lint && npm run build`
Expected: 271 tests pass (this plan adds none), zero lint errors, build green.

- [ ] **Step 3: Playwright on the landing page**

Start the production build in one terminal: `cd web-app && npm run start`. In another:

```bash
cd web-app && npx playwright test e2e/accessibility.spec.ts e2e/navigation.spec.ts
```

Expected: all tests in both specs pass. These specs check landmark roles, heading structure, and unauthenticated redirects; none of them reference the removed sections.

- [ ] **Step 4: Manual scroll-through**

Open `http://localhost:3000`. Click each Navbar link (Features, Analytics, Pricing) and confirm the page scrolls to a section. Confirm no section on the page mentions AI coaching, teams, leaderboards, badges, or streaks.

- [ ] **Step 5: Push**

```bash
git push origin main
```

Netlify deploys `main` automatically. After deploy, open `https://flowshield.app` and repeat Step 4 once.

---

## Self-review

**Spec coverage** (roadmap Phase 0 + 2026-09-04 amendments):

| Requirement | Task |
|---|---|
| One honest Free plan | 1 |
| "Pro coming" card, no prices, no payment provider | 1 (informational card; waitlist dropped, no backend) |
| Remove "Intelligent break scheduling" from Focus Timer copy | 2 |
| Demote gamification on the landing page | 2 (removed from grid), 1 (removed from plan list) |
| Pull AI coach off landing hero and nav | 3 |
| Pull leaderboard / teams off the landing page | 3 (section unrendered), 4 (FAQ) |
| Keep `AICoachShowcase.tsx` and `TeamsSection.tsx` on disk | Global Constraints, 3 |
| No privacy claim yet | Global Constraints; FAQ privacy answer unchanged from current copy |
| `npm run lint` zero errors, `npm run build` green | every task |

**Placeholder scan:** none. Task 2 Step 1 asks the implementer to keep the existing Analytics SVG if it differs; that is a copy-existing-value instruction, not a placeholder.

**Type consistency:** no new types. `CheckIcon` is local to `Pricing.tsx`.
