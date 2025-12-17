import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
    try {
        const userId = getUserIdFromToken(request);

        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 365);

        const stats = await prisma.dailyStats.findMany({
            where: {
                userId,
                date: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            select: {
                date: true,
                totalFocusMinutes: true,
            },
            orderBy: {
                date: 'asc',
            },
        });

        const formattedStats = stats.map((stat) => ({
            date: stat.date.toISOString().split('T')[0],
            count: stat.totalFocusMinutes,
        }));

        return NextResponse.json({ heatmap: formattedStats });
    } catch (error) {
        logger.error('Yearly stats fetch error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
