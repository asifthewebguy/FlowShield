import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { triggerUserEvent } from '@/lib/pusher';
import { redis } from '@/lib/redis';
import { sendSessionEndPush } from '@/lib/pushNotify';
import { classifySessionProject } from '@/lib/project-classifier';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const GRACE_MINUTES = 5;

/**
 * POST /api/sessions/[id]/auto-end
 *
 * Called by the client when a session has been past its planned end for the grace
 * window and no user interaction has happened. Clamps actualDuration to the
 * planned end so a forgotten tab doesn't accrue hours of inflated focus time.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || session.userId !== userId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.completed) {
      return NextResponse.json({ error: 'Session already completed' }, { status: 409 });
    }

    const plannedEndMs = session.startTime.getTime() + session.plannedDuration * 60 * 1000;
    const graceEndMs = plannedEndMs + GRACE_MINUTES * 60 * 1000;
    const now = Date.now();

    if (now < graceEndMs) {
      return NextResponse.json(
        {
          error: 'Session is still within planned time plus grace window',
          msUntilGrace: graceEndMs - now,
        },
        { status: 400 }
      );
    }

    const plannedEnd = new Date(plannedEndMs);
    const actualDuration = session.plannedDuration; // clamp

    let updatedSession = await prisma.session.update({
      where: { id },
      data: {
        endTime: plannedEnd,
        actualDuration,
        completed: true,
      },
    });

    // Auto-classify only when the user didn't link the session to a project up front.
    if (!updatedSession.projectId) {
      try {
        const guessed = await classifySessionProject(id, userId);
        if (guessed) {
          updatedSession = await prisma.session.update({
            where: { id },
            data: { projectId: guessed },
          });
          logger.info(`Session ${id} auto-classified to project ${guessed} on auto-end`);
        }
      } catch (err) {
        logger.warn('Project auto-classify failed on auto-end', err);
      }
    }

    // Update DailyStats for the day the session ENDED (i.e. plannedEnd), not now.
    const statsDate = new Date(plannedEnd);
    statsDate.setHours(0, 0, 0, 0);
    await prisma.dailyStats.upsert({
      where: { userId_date: { userId, date: statsDate } },
      update: {
        totalFocusMinutes: { increment: actualDuration },
        sessionsCompleted: { increment: 1 },
      },
      create: {
        userId,
        date: statsDate,
        totalFocusMinutes: actualDuration,
        sessionsCompleted: 1,
        avgProductivityScore: 0,
      },
    });

    triggerUserEvent(userId, 'session-update');

    // Bust coach cache so next /coach visit reflects the new completion
    try {
      const dateKey = new Date().toISOString().slice(0, 10);
      await redis.del(`coach:${userId}:${dateKey}`);
    } catch (err) {
      logger.warn('Coach cache bust failed after auto-end', err);
    }

    // Fire a push notification so a closed tab still gets notified
    sendSessionEndPush(userId, id, session.plannedDuration).catch((err) => {
      logger.warn('Session-end push failed', err);
    });

    return NextResponse.json({ session: updatedSession, autoEnded: true });
  } catch (error) {
    logger.error('Session auto-end error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
