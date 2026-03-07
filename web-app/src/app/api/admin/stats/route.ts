import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/jwt';

export async function GET(request: NextRequest) {
  const adminId = getAdminFromToken(request);
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeToday,
    sessionsToday,
    usersByTier,
    newThisWeek,
    recentSignups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.session.groupBy({
      by: ['userId'],
      where: { startTime: { gte: todayStart } },
    }).then(r => r.length),
    prisma.session.count({ where: { startTime: { gte: todayStart } } }),
    prisma.user.groupBy({
      by: ['subscriptionTier'],
      _count: { id: true },
    }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    // Last 7 days signup counts grouped by day
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE("createdAt") as date, COUNT(*) as count
      FROM users
      WHERE "createdAt" >= ${weekAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
  ]);

  const tierMap = Object.fromEntries(
    usersByTier.map(t => [t.subscriptionTier, t._count.id])
  );

  return NextResponse.json({
    totalUsers,
    activeToday,
    sessionsToday,
    newThisWeek,
    byTier: {
      FREE: tierMap['FREE'] ?? 0,
      PRO: tierMap['PRO'] ?? 0,
      TEAM: tierMap['TEAM'] ?? 0,
    },
    signupsByDay: recentSignups.map(r => ({
      date: r.date,
      count: Number(r.count),
    })),
  });
}
