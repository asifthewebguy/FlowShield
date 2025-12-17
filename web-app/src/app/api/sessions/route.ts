import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

// Create a new session
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { plannedDuration, sessionType = 'WORK', projectId } = body;

    if (!plannedDuration) {
      return NextResponse.json(
        { error: 'plannedDuration is required' },
        { status: 400 }
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
    const limit = parseInt(searchParams.get('limit') || '50');
    const date = searchParams.get('date'); // YYYY-MM-DD format

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
