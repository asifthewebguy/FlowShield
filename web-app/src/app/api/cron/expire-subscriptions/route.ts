import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { invalidateUserTierCache } from '@/lib/subscription';

/**
 * POST /api/cron/expire-subscriptions
 *
 * Called by an external scheduler (cron-job.org / Netlify scheduled function).
 * Auth: `x-cron-secret` header must equal `CRON_SECRET` env var. Header-only
 * (no query string) to keep the secret out of access logs.
 *
 * Sweep:
 *   1. Find ACTIVE subscriptions whose `currentPeriodEnd` is in the past.
 *   2. Flip them to EXPIRED.
 *   3. For each affected user, if they no longer have any active subscription,
 *      downgrade `User.subscriptionTier` to FREE.
 *   4. Invalidate the tier cache so the next request reflects the downgrade.
 */
export async function POST(request: NextRequest) {
  const provided = request.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    logger.error('Cron disabled: CRON_SECRET is not set');
    return NextResponse.json(
      { error: 'Cron not configured' },
      { status: 503 }
    );
  }

  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    const expiredRows = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { lt: now, not: null },
      },
      select: { id: true, userId: true },
    });

    let downgraded = 0;

    if (expiredRows.length > 0) {
      await prisma.subscription.updateMany({
        where: { id: { in: expiredRows.map((s) => s.id) } },
        data: { status: 'EXPIRED' },
      });

      const affectedUsers = Array.from(new Set(expiredRows.map((s) => s.userId)));
      for (const userId of affectedUsers) {
        const stillActive = await prisma.subscription.count({
          where: {
            userId,
            status: 'ACTIVE',
            OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
          },
        });
        if (stillActive === 0) {
          await prisma.user.update({
            where: { id: userId },
            data: { subscriptionTier: 'FREE' },
          });
          await invalidateUserTierCache(userId);
          downgraded++;
        }
      }
    }

    return NextResponse.json({
      message: 'Subscription expiry sweep complete',
      expired: expiredRows.length,
      downgraded,
    });
  } catch (error) {
    logger.error('Subscription expiry cron error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
