import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { PRODUCTIVE_CATEGORIES } from '@/app/api/categories/route';

/**
 * GET /api/analytics/distractions?period=week|month
 *
 * Returns:
 * - Top distraction apps (non-productive, sorted by time)
 * - Daily distraction minutes for trend charting
 * - Week-over-week comparison
 */
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week';

    const days = period === 'month' ? 30 : 7;
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);

    // Current period activities
    const activities = await prisma.activityLog.findMany({
      where: {
        userId,
        timestamp: { gte: start, lte: now },
      },
      select: {
        applicationName: true,
        category: true,
        durationSeconds: true,
        timestamp: true,
      },
    });

    // Previous period for comparison
    const prevActivities = await prisma.activityLog.findMany({
      where: {
        userId,
        timestamp: { gte: prevStart, lt: start },
      },
      select: {
        category: true,
        durationSeconds: true,
      },
    });

    // Distraction = non-productive category
    const isDistraction = (cat: string) => !PRODUCTIVE_CATEGORIES.includes(cat) && cat !== 'Unknown';

    // Top distraction apps
    const appTimes: Record<string, { minutes: number; category: string }> = {};
    let totalDistractionMinutes = 0;
    let totalMinutes = 0;

    for (const act of activities) {
      const mins = act.durationSeconds / 60;
      totalMinutes += mins;

      if (isDistraction(act.category)) {
        totalDistractionMinutes += mins;
        if (!appTimes[act.applicationName]) {
          appTimes[act.applicationName] = { minutes: 0, category: act.category };
        }
        appTimes[act.applicationName].minutes += mins;
      }
    }

    // Per-app share is meaningful as "% of distracting time spent on this app"
    // (sums to 100% across the top distractions). The previous denominator
    // (totalMinutes = all activity) understated each app's distraction share
    // because productive time inflated the denominator.
    const topDistractions = Object.entries(appTimes)
      .map(([name, data]) => ({
        name,
        category: data.category,
        minutes: Math.round(data.minutes),
        percentage:
          totalDistractionMinutes > 0
            ? Math.round((data.minutes / totalDistractionMinutes) * 100)
            : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    // Daily distraction trend
    const dailyMap: Record<string, number> = {};
    for (let d = 0; d < days; d++) {
      const date = new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
      dailyMap[date.toISOString().split('T')[0]] = 0;
    }

    for (const act of activities) {
      if (isDistraction(act.category)) {
        const date = new Date(act.timestamp).toISOString().split('T')[0];
        if (dailyMap[date] !== undefined) {
          dailyMap[date] += act.durationSeconds / 60;
        }
      }
    }

    const dailyTrend = Object.entries(dailyMap)
      .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Previous period comparison
    let prevDistractionMinutes = 0;
    let prevTotalMinutes = 0;
    for (const act of prevActivities) {
      prevTotalMinutes += act.durationSeconds / 60;
      if (isDistraction(act.category)) {
        prevDistractionMinutes += act.durationSeconds / 60;
      }
    }

    const currentPct = totalMinutes > 0 ? (totalDistractionMinutes / totalMinutes) * 100 : 0;
    const prevPct = prevTotalMinutes > 0 ? (prevDistractionMinutes / prevTotalMinutes) * 100 : 0;
    const trendChange = Math.round((currentPct - prevPct) * 10) / 10; // positive = more distractions

    return NextResponse.json({
      period,
      totalDistractionMinutes: Math.round(totalDistractionMinutes),
      distractionPercentage: Math.round(currentPct),
      trendChange, // negative = improvement
      topDistractions,
      dailyTrend,
    });
  } catch (error) {
    logger.error('Distraction analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
