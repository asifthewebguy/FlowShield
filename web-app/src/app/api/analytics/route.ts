import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verify } from 'jsonwebtoken';
import { calculateProductivityScore, detectPeakTimes } from '@/lib/productivity';

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week'; // 'week' or 'month'

    // Calculate date range
    const now = new Date();
    const startDate = new Date(now);

    if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate.setDate(now.getDate() - 30);
    }

    // Fetch all sessions in the period
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        startTime: {
          gte: startDate,
          lte: now,
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // Group sessions by date
    const sessionsByDate: { [key: string]: typeof sessions } = {};

    sessions.forEach((session) => {
      const dateKey = session.startTime.toISOString().split('T')[0];
      if (!sessionsByDate[dateKey]) {
        sessionsByDate[dateKey] = [];
      }
      sessionsByDate[dateKey].push(session);
    });

    // Calculate daily stats
    const dailyStats = Object.entries(sessionsByDate).map(([date, daySessions]) => {
      const completed = daySessions.filter((s) => s.completed);
      const totalMinutes = completed.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
      const productivityScore = calculateProductivityScore(
        completed.map((s) => ({
          plannedDuration: s.plannedDuration,
          actualDuration: s.actualDuration,
          completed: s.completed,
        }))
      );

      return {
        date,
        sessionsCount: daySessions.length,
        completedCount: completed.length,
        totalMinutes,
        productivityScore,
      };
    });

    // Fill in missing dates with zero values
    const filledStats = [];
    const daysToShow = period === 'week' ? 7 : 30;

    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];

      const existingStat = dailyStats.find((s) => s.date === dateKey);

      filledStats.push(
        existingStat || {
          date: dateKey,
          sessionsCount: 0,
          completedCount: 0,
          totalMinutes: 0,
          productivityScore: 0,
        }
      );
    }

    // Calculate overall stats
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.completed);
    const totalFocusMinutes = completedSessions.reduce(
      (sum, s) => sum + (s.actualDuration || 0),
      0
    );
    const averageProductivityScore = calculateProductivityScore(
      completedSessions.map((s) => ({
        plannedDuration: s.plannedDuration,
        actualDuration: s.actualDuration,
        completed: s.completed,
      }))
    );

    // Detect peak productivity times
    const peakTimeData = detectPeakTimes(
      sessions.map((s) => ({
        startTime: s.startTime,
        completed: s.completed,
        actualDuration: s.actualDuration,
        plannedDuration: s.plannedDuration,
      }))
    );

    return NextResponse.json({
      period,
      dailyStats: filledStats,
      summary: {
        totalSessions,
        completedSessions: completedSessions.length,
        totalFocusMinutes,
        averageProductivityScore,
        completionRate: totalSessions > 0
          ? Math.round((completedSessions.length / totalSessions) * 100)
          : 0,
      },
      peakTimes: {
        peakHour: peakTimeData.peakHour,
        peakPeriod: peakTimeData.peakPeriod,
        hourlyStats: peakTimeData.hourlyStats,
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
