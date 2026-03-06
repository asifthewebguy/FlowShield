import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/user/delete
 * Permanently deletes the authenticated user and all their data.
 * All related records cascade via Prisma schema (onDelete: Cascade).
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Confirm the user exists before deleting
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete user — all related data cascades automatically:
    // sessions, activityLogs, goals, dailyStats, devices,
    // pushSubscriptions, projects, preferences
    await prisma.user.delete({ where: { id: userId } });

    logger.info(`User account deleted: ${userId}`);

    return NextResponse.json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('User delete error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
