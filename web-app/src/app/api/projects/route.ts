import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { CreateProjectSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
    try {
        const userId = await getAuthUserId(request);

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const projects = await prisma.project.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { sessions: true }
                }
            }
        });

        return NextResponse.json(projects);
    } catch (error) {
        logger.error('Error fetching projects:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const userId = await getAuthUserId(request);

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const parsed = CreateProjectSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }
        const { name, color, hourlyRate, budget, plannedHours } = parsed.data;

        const project = await prisma.project.create({
            data: {
                userId,
                name,
                color: color || '#3b82f6',
                ...(hourlyRate !== undefined && { hourlyRate }),
                ...(budget !== undefined && { budget }),
                ...(plannedHours !== undefined && { plannedHours }),
            },
        });

        return NextResponse.json(project, { status: 201 });
    } catch (error) {
        logger.error('Error creating project:', error);
        // Unique constraint violation (P2002)
        if ((error as any).code === 'P2002') {
            return NextResponse.json({ error: 'Project with this name already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
