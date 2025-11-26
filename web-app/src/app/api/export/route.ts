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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json'; // 'json' or 'csv'
    const period = searchParams.get('period') || 'month'; // 'week', 'month', or 'all'

    // Calculate date range
    let startDate: Date | undefined;
    const now = new Date();

    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
    }
    // If 'all', startDate remains undefined (no filter)

    // Fetch sessions
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        ...(startDate && {
          startTime: {
            gte: startDate,
          },
        }),
      },
      orderBy: { startTime: 'desc' },
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'Session ID',
        'Start Time',
        'End Time',
        'Session Type',
        'Planned Duration (min)',
        'Actual Duration (min)',
        'Completed',
        'Productivity Score',
      ];

      const rows = sessions.map((session) => [
        session.id,
        session.startTime.toISOString(),
        session.endTime?.toISOString() || 'N/A',
        session.sessionType,
        session.plannedDuration.toString(),
        session.actualDuration?.toString() || 'N/A',
        session.completed ? 'Yes' : 'No',
        session.productivityScore?.toString() || 'N/A',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
      ].join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="flowshield-sessions-${period}-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    } else {
      // Return JSON
      const exportData = {
        exportDate: new Date().toISOString(),
        period,
        totalSessions: sessions.length,
        sessions: sessions.map((session) => ({
          id: session.id,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime?.toISOString() || null,
          sessionType: session.sessionType,
          plannedDuration: session.plannedDuration,
          actualDuration: session.actualDuration,
          completed: session.completed,
          productivityScore: session.productivityScore,
        })),
      };

      return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="flowshield-sessions-${period}-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
