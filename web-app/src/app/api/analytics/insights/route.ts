import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { generateInsights } from '@/lib/insights';

/** Compute current focus streak from daily stats (consecutive days with >0 focus minutes). */
function computeStreak(dailyStats: { date: Date | string; totalFocusMinutes: number }[]): number {
  if (dailyStats.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build a Set of date strings for days that had activity
  const activeDates = new Set(
    dailyStats
      .filter((d) => d.totalFocusMinutes > 0)
      .map((d) => {
        const date = new Date(d.date);
        date.setHours(0, 0, 0, 0);
        return date.toISOString().split('T')[0];
      })
  );

  let streak = 0;
  const cursor = new Date(today);

  // Allow streak to start from yesterday if today has no data yet
  const todayStr = today.toISOString().split('T')[0];
  if (!activeDates.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (true) {
    const dateStr = cursor.toISOString().split('T')[0];
    if (!activeDates.has(dateStr)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const [dailyStats, sessions] = await Promise.all([
      prisma.dailyStats.findMany({
        where: { userId, date: { gte: thirtyDaysAgo } },
        orderBy: { date: 'desc' },
      }),
      prisma.session.findMany({
        where: { userId, startTime: { gte: thirtyDaysAgo } },
        select: {
          startTime: true,
          completed: true,
          plannedDuration: true,
          actualDuration: true,
          productivityScore: true,
        },
        orderBy: { startTime: 'desc' },
      }),
    ]);

    const streak = computeStreak(dailyStats);
    const insights = generateInsights({ dailyStats, sessions, streak });

    return NextResponse.json({ insights, streak });
  } catch (error) {
    logger.error('Error fetching insights:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
