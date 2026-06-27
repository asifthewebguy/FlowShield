import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

/**
 * RFC-4180-safe CSV cell: doubles internal quotes, wraps in quotes, and
 * prefixes with a single quote if the value starts with a formula trigger
 * character (= + - @ TAB CR) to prevent CSV injection in spreadsheet apps.
 */
function csvCell(value: unknown): string {
  const str = String(value ?? '');
  const escaped = str.replace(/"/g, '""');
  const needsPrefix = /^[=+\-@\t\r]/.test(str);
  return needsPrefix ? `"'${escaped}"` : `"${escaped}"`;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const period = searchParams.get('period') || 'all';

    let startDate: Date | undefined;
    const now = new Date();

    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
    }

    const dateFilter = startDate ? { gte: startDate } : undefined;

    // Fetch all user data in parallel
    const [user, preferences, sessions, activityLogs, goals, dailyStats, projects, devices] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, timezone: true, createdAt: true },
        }),
        prisma.userPreferences.findUnique({ where: { userId } }),
        prisma.session.findMany({
          where: { userId, ...(dateFilter && { startTime: dateFilter }) },
          orderBy: { startTime: 'desc' },
        }),
        prisma.activityLog.findMany({
          where: { userId, ...(dateFilter && { timestamp: dateFilter }) },
          orderBy: { timestamp: 'desc' },
        }),
        prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
        prisma.dailyStats.findMany({
          where: { userId, ...(dateFilter && { date: dateFilter }) },
          orderBy: { date: 'desc' },
        }),
        prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
        prisma.deviceConnection.findMany({ where: { userId } }),
      ]);

    if (format === 'csv') {
      // CSV export: sessions only (activity logs are too large for a flat CSV)
      const headers = [
        'Session ID', 'Start Time', 'End Time', 'Session Type',
        'Planned Duration (min)', 'Actual Duration (min)', 'Completed', 'Productivity Score',
      ];
      const rows = sessions.map((s) => [
        s.id,
        s.startTime.toISOString(),
        s.endTime?.toISOString() || 'N/A',
        s.sessionType,
        s.plannedDuration.toString(),
        s.actualDuration?.toString() || 'N/A',
        s.completed ? 'Yes' : 'No',
        s.productivityScore?.toString() || 'N/A',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map(csvCell).join(',')),
      ].join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="flowshield-sessions-${period}-${now.toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Full JSON export — all user data (GDPR-compliant)
    const exportData = {
      exportDate: now.toISOString(),
      period,
      account: user,
      preferences,
      sessions: sessions.map((s) => ({
        id: s.id,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime?.toISOString() || null,
        sessionType: s.sessionType,
        plannedDuration: s.plannedDuration,
        actualDuration: s.actualDuration,
        completed: s.completed,
        productivityScore: s.productivityScore,
        projectId: s.projectId,
      })),
      activityLogs: activityLogs.map((a) => ({
        id: a.id,
        timestamp: a.timestamp.toISOString(),
        applicationName: a.applicationName,
        windowTitle: a.windowTitle,
        url: a.url,
        category: a.category,
        durationSeconds: a.durationSeconds,
        activityLevel: a.activityLevel,
      })),
      goals: goals.map((g) => ({
        id: g.id,
        goalType: g.goalType,
        targetValue: g.targetValue,
        currentValue: g.currentValue,
        startDate: g.startDate.toISOString(),
        endDate: g.endDate?.toISOString() || null,
        active: g.active,
      })),
      dailyStats: dailyStats.map((d) => ({
        date: d.date.toISOString(),
        totalFocusMinutes: d.totalFocusMinutes,
        avgProductivityScore: d.avgProductivityScore,
        sessionsCompleted: d.sessionsCompleted,
        peakFocusHour: d.peakFocusHour,
      })),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        createdAt: p.createdAt.toISOString(),
      })),
      devices: devices.map((d) => ({
        deviceName: d.deviceName,
        platform: d.platform,
        lastSyncAt: d.lastSyncAt.toISOString(),
      })),
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="flowshield-export-${period}-${now.toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    logger.error('Export error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
