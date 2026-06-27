import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

/**
 * GET /api/teams — list teams the current user belongs to.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const memberships = await prisma.teamMembership.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            memberships: {
              include: { team: false },
            },
          },
        },
      },
    });

    const teams = memberships.map(m => ({
      id: m.team.id,
      name: m.team.name,
      ownerId: m.team.ownerId,
      inviteCode: m.team.inviteCode,
      myRole: m.role,
      memberCount: m.team.memberships.length,
      joinedAt: m.joinedAt,
    }));

    return NextResponse.json({ teams });
  } catch (error) {
    logger.error('Teams GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/teams — create a new team.
 * Body: { name: string }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name } = await request.json();
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Team name must be at least 2 characters' }, { status: 400 });
    }

    const owned = await prisma.team.count({ where: { ownerId: userId } });
    if (owned >= 5) {
      return NextResponse.json({ error: 'Team limit reached (max 5)' }, { status: 429 });
    }

    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        ownerId: userId,
        memberships: {
          create: { userId, role: 'OWNER' },
        },
      },
      include: { memberships: true },
    });

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        ownerId: team.ownerId,
        inviteCode: team.inviteCode,
        myRole: 'OWNER',
        memberCount: team.memberships.length,
      },
    }, { status: 201 });
  } catch (error) {
    logger.error('Teams POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
