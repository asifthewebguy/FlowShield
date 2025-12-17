import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
    try {
        const userId = getUserIdFromToken(request);

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'week'; // 'week' | 'all-time'

        let dateFilter = {};
        if (period === 'week') {
            const today = new Date();
            const lastWeek = new Date(today);
            lastWeek.setDate(today.getDate() - 7);
            dateFilter = {
                date: {
                    gte: lastWeek,
                },
            };
        }

        // Group by userId and sum minutes
        const leaderboard = await prisma.dailyStats.groupBy({
            by: ['userId'],
            where: dateFilter,
            _sum: {
                totalFocusMinutes: true,
            },
            orderBy: {
                _sum: {
                    totalFocusMinutes: 'desc',
                },
            },
            take: 10,
        });

        // Fetch user details for these IDs
        const userIds = leaderboard.map((entry) => entry.userId);
        const users = await prisma.user.findMany({
            where: {
                id: { in: userIds },
            },
            select: {
                id: true,
                name: true,
            },
        });

        // Combine data
        const formattedLeaderboard = leaderboard.map((entry, index) => {
            const user = users.find((u) => u.id === entry.userId);
            return {
                rank: index + 1,
                userId: entry.userId,
                name: user?.name || 'Anonymous User',
                minutes: entry._sum.totalFocusMinutes || 0,
                isCurrentUser: entry.userId === userId,
            };
        });

        return NextResponse.json({ leaderboard: formattedLeaderboard });

    } catch (error) {
        logger.error('Leaderboard fetch error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
