import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';

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
    console.error('Error fetching goals:', error);
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
    const { targetValue, type = 'DAILY_TIME' } = body;

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

    return NextResponse.json({ goal: newGoal });
  } catch (error) {
    console.error('Error creating/updating goal:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
