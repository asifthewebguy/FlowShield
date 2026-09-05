import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { CreateTaskSchema } from '@/lib/schemas';

const VALID_STATUSES = ['TODO', 'DOING', 'DONE'] as const;

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tag = searchParams.get('tag');
    const status = searchParams.get('status');

    if (status && !VALID_STATUSES.includes(status as any)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const where: any = { userId };
    if (tag) where.tags = { has: tag };
    if (status) where.status = status;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    logger.error('Tasks fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    const { title, notes, projectId, estimateMinutes, dueAt, scheduledStart, scheduledEnd, tags } = parsed.data;

    if (projectId) {
      const owned = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
      if (!owned) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
    }

    const task = await prisma.task.create({
      data: {
        userId,
        title,
        notes: notes ?? null,
        projectId: projectId ?? null,
        estimateMinutes: estimateMinutes ?? null,
        dueAt: dueAt ? new Date(dueAt) : null,
        scheduledStart: scheduledStart ? new Date(scheduledStart) : null,
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
        tags: tags ?? [],
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    logger.error('Task creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
