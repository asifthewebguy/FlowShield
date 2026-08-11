import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId, revokeUserTokens } from '@/lib/jwt';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * Log out of all devices: bump the user's tokenVersion so every token minted
 * before now fails the `tv` check in getAuthUserId, then bust the Redis cache
 * so the new version takes effect immediately. The caller clears its own
 * stored token after a 204.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 5 per hour per user
    const rl = await rateLimit(`logout-all:${userId}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await revokeUserTokens(userId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error('Logout-all error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
