import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const RESULTS_PER_ENTITY = 10;

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit('search:' + userId, 60, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    if (!q) {
      return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
    }

    const contains = { contains: q, mode: 'insensitive' as const };

    const [tasks, projects, sessions] = await Promise.all([
      prisma.task.findMany({
        where: { userId, title: contains },
        take: RESULTS_PER_ENTITY,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.project.findMany({
        where: { userId, name: contains },
        take: RESULTS_PER_ENTITY,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.session.findMany({
        where: {
          userId,
          OR: [
            { project: { name: contains } },
            { task: { title: contains } },
          ],
        },
        take: RESULTS_PER_ENTITY,
        orderBy: { startTime: 'desc' },
        include: { project: true, task: true },
      }),
    ]);

    return NextResponse.json({ tasks, projects, sessions });
  } catch (error) {
    logger.error('Search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
