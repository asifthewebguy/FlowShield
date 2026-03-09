import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { triggerUserEvent } from '@/lib/pusher';
import { normalizeCategory } from '@/app/api/categories/route';

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { activities } = body;

    if (!Array.isArray(activities) || activities.length === 0) {
      return NextResponse.json(
        { error: 'No activities provided' },
        { status: 400 }
      );
    }

    // Source identifies the client sending data: desktop | browser | mobile
    const source: string = (body.source as string) || 'desktop';

    // Store activities in database
    const activityLogs = activities.map((activity: any) => ({
      userId,
      timestamp: new Date(activity.timestamp),
      windowTitle: activity.windowTitle || activity.url || 'Unknown',
      processName: activity.processName || source,
      applicationName: activity.applicationName || activity.domain || 'Unknown',
      url: activity.url || null,
      durationSeconds: activity.durationSeconds,
      activityLevel: activity.activityLevel || 0,
      category: normalizeCategory(activity.category || 'Unknown'),
      sessionId: activity.sessionId || null,
      source,
    }));

    // Batch insert activities
    await prisma.activityLog.createMany({
      data: activityLogs,
      skipDuplicates: true,
    });

    triggerUserEvent(userId, 'activity-synced');
    return NextResponse.json({
      message: 'Activities synced successfully',
      count: activities.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Activity sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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

    const whereClause: any = { userId };

    if (startDate && endDate) {
      whereClause.timestamp = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const activities = await prisma.activityLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });

    return NextResponse.json({
      activities,
      count: activities.length,
    });
  } catch (error) {
    logger.error('Activity fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
