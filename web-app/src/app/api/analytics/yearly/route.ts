import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

/**
 * Format a Date as YYYY-MM-DD in the given IANA timezone. Falls back to UTC
 * if the timezone is unknown. Used so the yearly heatmap buckets stats into
 * the user's local days rather than UTC days, which would shift cells by a
 * day for users in negative-UTC timezones.
 */
function formatDateInTz(date: Date, timezone: string): string {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
    } catch {
        return date.toISOString().split('T')[0];
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

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { timezone: true },
        });
        const tz = user?.timezone ?? 'UTC';

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
            date: formatDateInTz(stat.date, tz),
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
