import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

/**
 * Drop the cached analytics payload for a user across all periods so the
 * next /api/analytics request returns fresh data instead of waiting up to
 * 5 minutes for the TTL to expire after a session/activity write.
 *
 * Call this from any route that creates, updates, or deletes a session,
 * activity log, or daily stats row.
 */
export async function invalidateAnalyticsCache(userId: string): Promise<void> {
  try {
    await Promise.all([
      redis.del(`analytics:${userId}:week`),
      redis.del(`analytics:${userId}:month`),
    ]);
  } catch (err) {
    logger.warn('Analytics cache invalidation failed', err);
  }
}
