import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verify } from 'jsonwebtoken';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'your-secret-key';

function getUserIdFromToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = verify(token, JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Default to last 7 days if no dates provided
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Fetch activity logs within date range
    const activities = await prisma.activityLog.findMany({
      where: {
        userId,
        timestamp: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Calculate analytics
    const totalMinutes = activities.reduce((sum, log) => sum + (log.durationSeconds / 60), 0);
    const totalHours = Math.floor(totalMinutes / 60);

    // Group by application
    const appBreakdown: Record<string, { minutes: number; count: number; category: string }> = {};
    activities.forEach(log => {
      if (!appBreakdown[log.applicationName]) {
        appBreakdown[log.applicationName] = {
          minutes: 0,
          count: 0,
          category: log.category,
        };
      }
      appBreakdown[log.applicationName].minutes += log.durationSeconds / 60;
      appBreakdown[log.applicationName].count += 1;
    });

    // Sort by time spent
    const topApplications = Object.entries(appBreakdown)
      .map(([name, data]) => ({
        name,
        minutes: Math.round(data.minutes),
        hours: Math.round(data.minutes / 60 * 10) / 10,
        count: data.count,
        category: data.category,
        percentage: Math.round((data.minutes / totalMinutes) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10);

    // Group by category
    const categoryBreakdown: Record<string, number> = {};
    activities.forEach(log => {
      const category = log.category || 'Unknown';
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = 0;
      }
      categoryBreakdown[category] += log.durationSeconds / 60;
    });

    const categoryStats = Object.entries(categoryBreakdown)
      .map(([category, minutes]) => ({
        category,
        minutes: Math.round(minutes),
        hours: Math.round(minutes / 60 * 10) / 10,
        percentage: Math.round((minutes / totalMinutes) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    // Group by day
    const dailyActivity: Record<string, number> = {};
    activities.forEach(log => {
      const date = new Date(log.timestamp).toISOString().split('T')[0];
      if (!dailyActivity[date]) {
        dailyActivity[date] = 0;
      }
      dailyActivity[date] += log.durationSeconds / 60;
    });

    const dailyStats = Object.entries(dailyActivity)
      .map(([date, minutes]) => ({
        date,
        minutes: Math.round(minutes),
        hours: Math.round(minutes / 60 * 10) / 10,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Group by hour of day
    const hourlyActivity: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      hourlyActivity[i] = 0;
    }
    activities.forEach(log => {
      const hour = new Date(log.timestamp).getHours();
      hourlyActivity[hour] += log.durationSeconds / 60;
    });

    const hourlyStats = Object.entries(hourlyActivity)
      .map(([hour, minutes]) => ({
        hour: parseInt(hour),
        minutes: Math.round(minutes),
        percentage: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => a.hour - b.hour);

    // Calculate productivity score
    const productiveCategories = ['Development', 'Work', 'Creative', 'Study'];
    const productiveMinutes = activities
      .filter(log => productiveCategories.includes(log.category))
      .reduce((sum, log) => sum + (log.durationSeconds / 60), 0);

    const productivityScore = totalMinutes > 0
      ? Math.round((productiveMinutes / totalMinutes) * 100)
      : 0;

    // Average activity level
    const avgActivityLevel = activities.length > 0
      ? Math.round(activities.reduce((sum, log) => sum + log.activityLevel, 0) / activities.length)
      : 0;

    // Most productive hour
    const mostProductiveHour = hourlyStats.reduce((max, stat) =>
      stat.minutes > max.minutes ? stat : max
    , { hour: 0, minutes: 0, percentage: 0 });

    return NextResponse.json({
      summary: {
        totalMinutes: Math.round(totalMinutes),
        totalHours,
        totalActivities: activities.length,
        productivityScore,
        avgActivityLevel,
        mostProductiveHour: mostProductiveHour.hour,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      },
      topApplications,
      categoryStats,
      dailyStats,
      hourlyStats,
    });
  } catch (error) {
    console.error('Activity analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
