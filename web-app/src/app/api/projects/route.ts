import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';

export async function GET(request: NextRequest) {
    try {
        const userId = getUserIdFromToken(request);

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
        console.error('Error fetching projects:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const userId = getUserIdFromToken(request);

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, color } = body;

        if (!name) {
            return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
        }

        const project = await prisma.project.create({
            data: {
                userId,
                name,
                color: color || '#3b82f6', // Default blue
            },
        });

        return NextResponse.json(project, { status: 201 });
    } catch (error) {
        console.error('Error creating project:', error);
        // Unique constraint violation (P2002)
        if ((error as any).code === 'P2002') {
            return NextResponse.json({ error: 'Project with this name already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
