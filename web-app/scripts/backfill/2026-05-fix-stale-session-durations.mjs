#!/usr/bin/env node
/**
 * One-shot backfill for the "24,552h weekly report" bug.
 *
 * Bug: PATCH /api/sessions/[id] used to write `actualDuration = (endTime -
 * startTime) / 60000` with no cap. A stale client (e.g. browser closed for
 * weeks then reopened) PATCHing endTime: now() against an old session
 * inflated `actualDuration` to days/weeks of "focus", which then propagated
 * into DailyStats.totalFocusMinutes. The forward fix is in route.ts; this
 * script cleans up the historical mess.
 *
 * Plan:
 *   1. Find every Session where actualDuration > plannedDuration + GRACE.
 *   2. Cap each one to plannedDuration (matches auto-end's contract).
 *   3. Recompute DailyStats from scratch for every (userId, day) touched.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill/2026-05-fix-stale-session-durations.mjs           # dry run
 *   node --env-file=.env.local scripts/backfill/2026-05-fix-stale-session-durations.mjs --apply   # actually write
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const GRACE_MINUTES = 5;

const mode = APPLY ? 'APPLY (writes DB)' : 'DRY RUN (no writes)';
console.log(`[backfill] mode: ${mode}\n`);

// 1. Identify bad sessions. We pull all completed sessions with actualDuration
//    set, then filter in-memory because Prisma can't compare two columns in
//    a where-clause without a raw query.
const allCompleted = await prisma.session.findMany({
  where: { completed: true, actualDuration: { not: null }, endTime: { not: null } },
  select: { id: true, userId: true, plannedDuration: true, actualDuration: true, endTime: true },
});

const bad = allCompleted.filter(
  (s) => (s.actualDuration ?? 0) > s.plannedDuration + GRACE_MINUTES,
);

console.log(`[backfill] scanned ${allCompleted.length} completed sessions`);
console.log(`[backfill] found ${bad.length} with actualDuration > plannedDuration + ${GRACE_MINUTES}\n`);

if (bad.length === 0) {
  console.log('[backfill] nothing to do.');
  await prisma.$disconnect();
  process.exit(0);
}

// Group affected (userId, dayKey) so we know which DailyStats rows to recompute.
const affectedDays = new Map(); // key = `${userId}|${YYYY-MM-DD}`, value = { userId, day: Date }
const userBuckets = new Map(); // userId -> count, for quick "blast radius" log
for (const s of bad) {
  const day = new Date(s.endTime);
  day.setUTCHours(0, 0, 0, 0); // matches DailyStats.date storage convention (midnight UTC for Netlify Functions)
  const key = `${s.userId}|${day.toISOString().slice(0, 10)}`;
  if (!affectedDays.has(key)) affectedDays.set(key, { userId: s.userId, day });
  userBuckets.set(s.userId, (userBuckets.get(s.userId) ?? 0) + 1);
}

console.log(`[backfill] affected users: ${userBuckets.size}`);
console.log(`[backfill] affected (user, day) DailyStats rows to recompute: ${affectedDays.size}\n`);

// Show a few samples so we can sanity-check before applying.
const SAMPLES = 8;
console.log(`[backfill] sample of bad sessions (first ${SAMPLES}):`);
for (const s of bad.slice(0, SAMPLES)) {
  console.log(
    `  ${s.id.slice(0, 8)}  user=${s.userId.slice(0, 8)}  planned=${s.plannedDuration}min  actualDuration=${s.actualDuration}min  → cap=${s.plannedDuration}min`,
  );
}

if (!APPLY) {
  console.log('\n[backfill] DRY RUN complete. Re-run with --apply to actually write.');
  await prisma.$disconnect();
  process.exit(0);
}

// 2. Cap each bad session's actualDuration to plannedDuration. Running in
//    chunks of 50 to keep transactions bounded.
console.log('\n[backfill] applying session caps...');
const CHUNK = 50;
let capped = 0;
for (let i = 0; i < bad.length; i += CHUNK) {
  const slice = bad.slice(i, i + CHUNK);
  await prisma.$transaction(
    slice.map((s) =>
      prisma.session.update({
        where: { id: s.id },
        data: { actualDuration: s.plannedDuration },
      }),
    ),
  );
  capped += slice.length;
  process.stdout.write(`\r  capped ${capped}/${bad.length}`);
}
console.log(`\n[backfill] capped ${capped} sessions.`);

// 3. Recompute DailyStats for every affected (userId, day) by re-summing
//    the now-fixed Session table. We replace, not increment, because the
//    original DailyStats values are corrupted.
console.log(`\n[backfill] recomputing DailyStats for ${affectedDays.size} (user, day) rows...`);
let recomputed = 0;
for (const { userId, day } of affectedDays.values()) {
  const dayEnd = new Date(day.getTime() + 24 * 3600 * 1000);

  const sessionsThatDay = await prisma.session.findMany({
    where: {
      userId,
      completed: true,
      endTime: { gte: day, lt: dayEnd },
    },
    select: { actualDuration: true, productivityScore: true },
  });

  const totalFocusMinutes = sessionsThatDay.reduce(
    (sum, s) => sum + (s.actualDuration ?? 0),
    0,
  );
  const sessionsCompleted = sessionsThatDay.length;
  const scoredSessions = sessionsThatDay.filter(
    (s) => s.productivityScore !== null && s.productivityScore !== undefined,
  );
  const avgProductivityScore =
    scoredSessions.length > 0
      ? Math.round(
          scoredSessions.reduce((a, s) => a + (s.productivityScore ?? 0), 0) /
            scoredSessions.length,
        )
      : 0;

  await prisma.dailyStats.upsert({
    where: { userId_date: { userId, date: day } },
    update: { totalFocusMinutes, sessionsCompleted, avgProductivityScore },
    create: { userId, date: day, totalFocusMinutes, sessionsCompleted, avgProductivityScore },
  });

  recomputed += 1;
  if (recomputed % 25 === 0) {
    process.stdout.write(`\r  recomputed ${recomputed}/${affectedDays.size}`);
  }
}
console.log(`\n[backfill] recomputed ${recomputed} DailyStats rows.`);

console.log('\n[backfill] done.');
await prisma.$disconnect();
