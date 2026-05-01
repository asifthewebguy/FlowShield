import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { triggerUserEvent } from '@/lib/pusher';
import { CreateGoalSchema } from '@/lib/schemas';

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    const whereClause: any = {
      userId,
      active: true,
    };

    if (type) {
      whereClause.goalType = type;
    }

    const goals = await prisma.goal.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ goals });
  } catch (error: any) {
    logger.error('Error fetching goals', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CreateGoalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { targetValue, type } = parsed.data;

    // Check if an active goal of this type already exists
    const existingGoal = await prisma.goal.findFirst({
      where: {
        userId,
        goalType: type,
        active: true,
      },
    });

    if (existingGoal) {
      // Update existing goal
      const updatedGoal = await prisma.goal.update({
        where: { id: existingGoal.id },
        data: {
          targetValue,
          updatedAt: new Date(),
        },
      });
      triggerUserEvent(userId, 'goal-update', { id: updatedGoal.id });
      return NextResponse.json({ goal: updatedGoal });
    }

    // Create new goal
    const newGoal = await prisma.goal.create({
      data: {
        userId,
        goalType: type,
        targetValue,
        startDate: new Date(),
      },
    });

    triggerUserEvent(userId, 'goal-update', { id: newGoal.id });
    return NextResponse.json({ goal: newGoal });
  } catch (error) {
    logger.error('Error creating/updating goal', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
