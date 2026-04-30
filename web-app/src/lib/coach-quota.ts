import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

const ADVICE_CACHE_TTL_DAILY_SECONDS = 24 * 60 * 60;
const ADVICE_CACHE_TTL_MONTHLY_SECONDS = 31 * 24 * 60 * 60;

export function isPaidTier(tier: string | null | undefined): boolean {
  return tier === 'PRO' || tier === 'TEAM';
}

export function isSameCalendarMonthUTC(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

// FREE tier is allowed one Gemini coach call per calendar month. The DB column
// `User.lastCoachCallAt` is the durable source of truth so the quota survives
// Redis outages (cache is just a perf layer).
export function freeTierCanCall(
  lastCoachCallAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastCoachCallAt) return true;
  return !isSameCalendarMonthUTC(lastCoachCallAt, now);
}

// First moment of the next calendar month, UTC. Shown to FREE users so they
// know exactly when their next call unlocks.
export function nextFreeTierResetAt(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

export function coachCacheKey(userId: string, tier: string, now: Date = new Date()): string {
  const iso = now.toISOString();
  // FREE: monthly key (YYYY-MM) — rolls on the 1st alongside the DB quota.
  // Paid: daily key (YYYY-MM-DD) — busts whenever activity changes.
  const dateKey = tier === 'FREE' ? iso.slice(0, 7) : iso.slice(0, 10);
  return `coach:${userId}:${dateKey}`;
}

export function coachCacheTtl(tier: string): number {
  return tier === 'FREE' ? ADVICE_CACHE_TTL_MONTHLY_SECONDS : ADVICE_CACHE_TTL_DAILY_SECONDS;
}

// Invalidate the coach cache for paid users so fresh advice reflects their
// latest activity. FREE users are intentionally NOT busted: their monthly
// cache key carries the quota signal alongside the durable lastCoachCallAt
// column, and we don't want their own activity to "use up" their advice early.
export async function bustCoachCacheIfPaid(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });
    if (!user) return;
    const tier = user.subscriptionTier ?? 'FREE';
    if (!isPaidTier(tier)) return;
    await redis.del(coachCacheKey(userId, tier));
  } catch (err) {
    logger.warn('Coach cache bust failed', err);
  }
}
