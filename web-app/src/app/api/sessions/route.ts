import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { triggerUserEvent } from '@/lib/pusher';
import { invalidateAnalyticsCache } from '@/lib/analytics-cache';
import { CreateSessionSchema } from '@/lib/schemas';

// Create a new session
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { plannedDuration, sessionType, projectId } = parsed.data;

    // Race check: refuse to create a second active session for the same user.
    // A session is "active" when it hasn't been marked completed and has no
    // endTime yet. Returning 409 with the existing session id lets the client
    // recover gracefully (jump to the running session) without leaving stray
    // half-completed rows that would later confuse analytics.
    const existing = await prisma.session.findFirst({
      where: { userId, completed: false, endTime: null },
      select: { id: true, startTime: true },
      orderBy: { startTime: 'desc' },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: 'You already have an active session.',
          code: 'SESSION_ALREADY_ACTIVE',
          activeSessionId: existing.id,
        },
        { status: 409 }
      );
    }

    const session = await prisma.session.create({
      data: {
        userId,
        startTime: new Date(),
        plannedDuration,
        sessionType,
        projectId: projectId || null,
      },
      include: {
        project: true,
      },
    });

    triggerUserEvent(userId, 'session-update');
    await invalidateAnalyticsCache(userId);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    logger.error('Session creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get user's sessions
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50') || 50, 1), 200);
    const date = searchParams.get('date'); // YYYY-MM-DD format

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400 });
    }

    let where: any = { userId };

    if (date) {
      const startOfDay = new Date(date + 'T00:00:00.000Z');
      const endOfDay = new Date(date + 'T23:59:59.999Z');

      where.startTime = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { startTime: 'desc' },
      take: limit,
      include: {
        project: true,
      },
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    logger.error('Sessions fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
