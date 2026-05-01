import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { triggerUserEvent } from '@/lib/pusher';
import { bustCoachCacheIfPaid } from '@/lib/coach-quota';
import { autoClassifyIfNeeded, nextWeightedAverage } from '@/lib/auto-classify-helper';
import { invalidateAnalyticsCache } from '@/lib/analytics-cache';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Update session (end session, update productivity score, etc.)
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { endTime, productivityScore, completed, projectId } = body;

    // Verify session belongs to user
    const existingSession = await prisma.session.findUnique({
      where: { id },
    });

    if (!existingSession || existingSession.userId !== userId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Validate projectId: undefined = no change, null = clear, string = set (must be user's project)
    const projectIdProvided = Object.prototype.hasOwnProperty.call(body, 'projectId');
    if (projectIdProvided && projectId !== null) {
      if (typeof projectId !== 'string') {
        return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 });
      }
      const owned = await prisma.project.findFirst({
        where: { id: projectId, userId },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
    }

    // Calculate actual duration if endTime is provided
    let actualDuration;
    if (endTime) {
      const start = new Date(existingSession.startTime);
      const end = new Date(endTime);
      actualDuration = Math.round((end.getTime() - start.getTime()) / 60000); // minutes
    }

    let updatedSession = await prisma.session.update({
      where: { id },
      data: {
        ...(endTime && { endTime: new Date(endTime) }),
        ...(actualDuration !== undefined && { actualDuration }),
        ...(productivityScore !== undefined && { productivityScore }),
        ...(completed !== undefined && { completed }),
        ...(projectIdProvided && { projectId: projectId ?? null }),
      },
    });

    // Auto-classify only when completing a session the user didn't link to a project.
    // Skip if the user explicitly set projectId in this request (respects user intent).
    if (completed && !projectIdProvided) {
      updatedSession = await autoClassifyIfNeeded(id, userId, updatedSession);
    }

    // Update DailyStats if session is completed. Use a weighted average so
    // every completed session contributes — was previously overwriting with
    // just the latest score.
    if (completed && actualDuration) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingStats = await prisma.dailyStats.findUnique({
        where: { userId_date: { userId, date: today } },
        select: { avgProductivityScore: true, sessionsCompleted: true },
      });

      const newAvg =
        productivityScore !== undefined
          ? nextWeightedAverage(
              existingStats?.avgProductivityScore ?? null,
              existingStats?.sessionsCompleted ?? 0,
              productivityScore
            )
          : existingStats?.avgProductivityScore ?? 0;

      await prisma.dailyStats.upsert({
        where: { userId_date: { userId, date: today } },
        update: {
          totalFocusMinutes: { increment: actualDuration },
          sessionsCompleted: { increment: 1 },
          ...(productivityScore !== undefined && { avgProductivityScore: newAvg }),
        },
        create: {
          userId,
          date: today,
          totalFocusMinutes: actualDuration,
          sessionsCompleted: 1,
          avgProductivityScore: productivityScore ?? 0,
        },
      });
    }

    triggerUserEvent(userId, 'session-update');
    await invalidateAnalyticsCache(userId);

    // Bust the AI Coach cache for paid tiers so their next visit gets fresh
    // advice that reflects this session. FREE users are intentionally NOT
    // busted — their monthly quota is gated by `User.lastCoachCallAt`.
    if (completed) {
      await bustCoachCacheIfPaid(userId);
    }

    return NextResponse.json({ session: updatedSession });
  } catch (error) {
    logger.error('Session update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Delete session
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Verify session belongs to user
    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session || session.userId !== userId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await prisma.session.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Session deleted successfully' });
  } catch (error) {
    logger.error('Session deletion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
