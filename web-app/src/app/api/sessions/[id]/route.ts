import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

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
    const { endTime, productivityScore, completed } = body;

    // Verify session belongs to user
    const existingSession = await prisma.session.findUnique({
      where: { id },
    });

    if (!existingSession || existingSession.userId !== userId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Calculate actual duration if endTime is provided
    let actualDuration;
    if (endTime) {
      const start = new Date(existingSession.startTime);
      const end = new Date(endTime);
      actualDuration = Math.round((end.getTime() - start.getTime()) / 60000); // minutes
    }

    const updatedSession = await prisma.session.update({
      where: { id },
      data: {
        ...(endTime && { endTime: new Date(endTime) }),
        ...(actualDuration !== undefined && { actualDuration }),
        ...(productivityScore !== undefined && { productivityScore }),
        ...(completed !== undefined && { completed }),
      },
    });

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
