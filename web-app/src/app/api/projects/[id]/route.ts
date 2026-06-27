import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { triggerUserEvent } from '@/lib/pusher';
import { UpdateProjectCostSchema } from '@/lib/schemas';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = UpdateProjectCostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const project = await prisma.project.findFirst({
      where: { id, userId },
    });
    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: parsed.data,
    });

    triggerUserEvent(userId, 'project-update', { id });
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('Error updating project:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const project = await prisma.project.findFirst({
      where: { id, userId },
    });
    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Sessions with this projectId get their projectId nulled out by the DB
    // foreign-key constraint (ON DELETE SET NULL). History is preserved.
    await prisma.project.delete({ where: { id } });
    logger.info(`Project deleted: ${id} by user ${userId}`);

    triggerUserEvent(userId, 'project-update', { id, deleted: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
