import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { getAuthUserId, revokeUserTokens } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { DeleteAccountSchema } from '@/lib/schemas';

/**
 * DELETE /api/user/delete
 * Permanently deletes the authenticated user and all their data.
 * Requires password re-entry to prevent accidental + token-replay deletion.
 * All related records cascade via Prisma schema (onDelete: Cascade).
 *
 * Body: { password: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = DeleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, hashedPassword: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Google-only users (empty hashedPassword) cannot confirm via password.
    // They must re-authenticate via Google before deleting — for now, refuse
    // and tell them to set a password first via the reset-password flow.
    if (!user.hashedPassword) {
      return NextResponse.json(
        {
          error: 'Set a password first via the password-reset flow to confirm deletion.',
          code: 'NO_PASSWORD_SET',
        },
        { status: 400 }
      );
    }

    const ok = await verifyPassword(password, user.hashedPassword);
    if (!ok) {
      return NextResponse.json(
        { error: 'Password is incorrect' },
        { status: 401 }
      );
    }

    // Delete user — all related data cascades automatically:
    // sessions, activityLogs, goals, dailyStats, devices,
    // pushSubscriptions, projects, preferences
    await prisma.user.delete({ where: { id: userId } });
    await revokeUserTokens(userId); // clear the tv cache — user row is already gone

    logger.info(`User account deleted: ${userId}`);

    return NextResponse.json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('User delete error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
