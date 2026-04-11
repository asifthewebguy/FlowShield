import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { getWeeklyStats } from '@/lib/reports';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const weeks = Math.min(parseInt(searchParams.get('weeks') ?? '8', 10), 52);

    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);

    const [dailyStats, currentWeekLogs] = await Promise.all([
      prisma.dailyStats.findMany({
        where: { userId, date: { gte: since } },
        orderBy: { date: 'asc' },
      }),
      prisma.activityLog.findMany({
        where: {
          userId,
          timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        select: { category: true, durationSeconds: true },
      }),
    ]);

    const weeklyStats = getWeeklyStats(dailyStats, weeks);

    const catMap = new Map<string, number>();
    for (const log of currentWeekLogs) {
      const cat = log.category || 'Unknown';
      catMap.set(cat, (catMap.get(cat) ?? 0) + log.durationSeconds);
    }
    const topCategories = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, seconds]) => ({
        category,
        hours: Math.round((seconds / 3600) * 10) / 10,
      }));

    return NextResponse.json({ ...weeklyStats, topCategories });
  } catch (error) {
    logger.error('Weekly report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
