import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getAuthUserId(request);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { action } = await request.json(); // 'pause' or 'resume'

        if (action === 'pause') {
            const session = await prisma.session.findUnique({
                where: { id },
            });

            if (!session || session.userId !== userId) {
                return NextResponse.json({ error: 'Session not found' }, { status: 404 });
            }

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
            const updatedSession = await prisma.$transaction(async (tx) => {
                const session = await tx.session.findUnique({
                    where: { id },
                });

                if (!session || session.userId !== userId) {
                    throw Object.assign(new Error('Session not found'), { status: 404 });
                }

                if (!session.isPaused || !session.pausedAt) {
                    throw Object.assign(new Error('Session is not paused'), { status: 409 });
                }

                // Calculate how long it was paused
                const now = new Date();
                const pausedDurationMs = now.getTime() - new Date(session.pausedAt).getTime();

                // Shift startTime forward by the paused duration so the implied
                // end time (startTime + plannedDuration) stays correct and only
                // active time is counted.
                const newStartTime = new Date(session.startTime.getTime() + pausedDurationMs);

                return tx.session.update({
                    where: { id },
                    data: {
                        isPaused: false,
                        pausedAt: null,
                        startTime: newStartTime,
                    },
                });
            });

            return NextResponse.json({ session: updatedSession });
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const updatedSession = await prisma.session.findUnique({ where: { id } });
        return NextResponse.json({ session: updatedSession });

    } catch (error: any) {
        if (error?.status === 404) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }
        if (error?.status === 409) {
            return NextResponse.json({ message: 'Session is not paused' }, { status: 409 });
        }
        logger.error('Toggle pause error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
