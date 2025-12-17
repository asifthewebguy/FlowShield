import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = getUserIdFromToken(request);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { action } = await request.json(); // 'pause' or 'resume'

        const session = await prisma.session.findUnique({
            where: { id },
        });

        if (!session || session.userId !== userId) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        if (action === 'pause') {
            if (session.isPaused) {
                return NextResponse.json({ message: 'Session already paused' });
            }

            await prisma.session.update({
                where: { id },
                data: {
                    isPaused: true,
                    pausedAt: new Date(),
                },
            });
        } else if (action === 'resume') {
            if (!session.isPaused || !session.pausedAt) {
                return NextResponse.json({ message: 'Session is not paused' });
            }

            // Calculate how long it was paused
            const now = new Date();
            const pausedDurationMs = now.getTime() - new Date(session.pausedAt).getTime();

            // We need to push the startTime (or endTime if it existed?)
            // Actually, simplest logic for a deadline-based timer:
            // If we have a 'startTime' and 'plannedDuration', the 'endTime' is implied.
            // If we pause, we stop the clock. When we resume, we must shift the 'startTime' forward by the pause duration
            // so that (now - startTime) reflects only active time? 
            // OR better: shift the implied end time.
            // Let's shift the startTime forward, effectively "ignoring" the paused block.

            const newStartTime = new Date(session.startTime.getTime() + pausedDurationMs);

            await prisma.session.update({
                where: { id },
                data: {
                    isPaused: false,
                    pausedAt: null, // Clear it
                    startTime: newStartTime,
                },
            });
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const updatedSession = await prisma.session.findUnique({ where: { id } });
        return NextResponse.json({ session: updatedSession });

    } catch (error) {
        logger.error('Toggle pause error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
