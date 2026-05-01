import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import type { SubscriptionTier } from '@prisma/client';

const TIER_CACHE_TTL_SECONDS = 5 * 60;

const TIER_RANK: Record<string, number> = { FREE: 0, PRO: 1, TEAM: 2 };

export function isPaidTier(tier: string | null | undefined): boolean {
  return tier === 'PRO' || tier === 'TEAM';
}

/**
 * Returns true when `tier` is at least as privileged as `minTier`.
 * Ordering: FREE < PRO < TEAM. Unknown tiers are treated as FREE.
 */
export function tierAtLeast(tier: string, minTier: string): boolean {
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[minTier] ?? 0);
}

function tierCacheKey(userId: string): string {
  return `tier:${userId}`;
}

/**
 * Resolve the user's effective subscription tier.
 *
 * Resolution order (first match wins):
 *   1. Most-privileged ACTIVE Subscription whose `currentPeriodEnd` is in the
 *      future (or null = perpetual).
 *   2. `User.subscriptionTier` — covers manual admin upgrades that didn't
 *      create a Subscription row.
 *   3. 'FREE' — default.
 *
 * Result is cached in Redis for 5 minutes to keep gating cheap. Use
 * `invalidateUserTierCache(userId)` after any tier-changing write so callers
 * see the new tier immediately.
 */
export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  try {
    const cached = await redis.get<string>(tierCacheKey(userId));
    if (cached === 'FREE' || cached === 'PRO' || cached === 'TEAM') {
      return cached as SubscriptionTier;
    }
  } catch (err) {
    logger.warn('Tier cache read failed', err);
  }

  const now = new Date();
  const sub = await prisma.subscription.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    },
    orderBy: [{ tier: 'desc' }, { currentPeriodStart: 'desc' }],
    select: { tier: true },
  });

  let tier: SubscriptionTier = 'FREE';
  if (sub) {
    tier = sub.tier;
  } else {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });
    tier = user?.subscriptionTier ?? 'FREE';
  }

  try {
    await redis.setex(tierCacheKey(userId), TIER_CACHE_TTL_SECONDS, tier);
  } catch (err) {
    logger.warn('Tier cache write failed', err);
  }

  return tier;
}

/** Drop the cached tier for a user. Call after any tier-changing write. */
export async function invalidateUserTierCache(userId: string): Promise<void> {
  try {
    await redis.del(tierCacheKey(userId));
  } catch (err) {
    logger.warn('Tier cache invalidation failed', err);
  }
}

/** Convenience gate. Returns true when the user is at least `minTier`. */
export async function userHasTier(userId: string, minTier: SubscriptionTier): Promise<boolean> {
  const tier = await getUserTier(userId);
  return tierAtLeast(tier, minTier);
}
