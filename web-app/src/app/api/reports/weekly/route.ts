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
    const rawWeeks = parseInt(searchParams.get('weeks') ?? '8', 10);
    const weeks = Math.min(isNaN(rawWeeks) || rawWeeks < 1 ? 8 : rawWeeks, 52);

    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);

    const [dailyStats, currentWeekLogs, sessionsInRange] = await Promise.all([
      prisma.dailyStats.findMany({
        where: { userId, date: { gte: since } },
        orderBy: { date: 'asc' },
      }),
      // Top categories are always for the current week (last 7 days), regardless of the `weeks` param
      prisma.activityLog.findMany({
        where: {
          userId,
          timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        select: { category: true, durationSeconds: true },
      }),
      // Sessions in the same range — fed to getWeeklyStats so productivity
      // score is derived from completion + duration-match (the same signal
      // /api/analytics uses) instead of read from DailyStats.avgProductivityScore
      // (which stays null/0 because the desktop client never collects ratings).
      prisma.session.findMany({
        where: { userId, completed: true, endTime: { gte: since } },
        select: {
          endTime: true,
          plannedDuration: true,
          actualDuration: true,
          completed: true,
        },
      }),
    ]);

    // Filter out the rare row where endTime is null despite completed=true
    // (older bad data); the SessionInput type requires a real timestamp.
    const sessionsForReport = sessionsInRange.flatMap((s) =>
      s.endTime ? [{ ...s, endTime: s.endTime }] : [],
    );
    const weeklyStats = getWeeklyStats(dailyStats, weeks, sessionsForReport);

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
