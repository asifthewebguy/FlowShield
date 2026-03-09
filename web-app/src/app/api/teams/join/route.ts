import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

/**
 * POST /api/teams/join — join a team using an invite code.
 * Body: { inviteCode: string }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { inviteCode } = await request.json();
    if (!inviteCode || typeof inviteCode !== 'string') {
      return NextResponse.json({ error: 'inviteCode is required' }, { status: 400 });
    }

    const team = await prisma.team.findUnique({
      where: { inviteCode: inviteCode.trim() },
    });
    if (!team) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
    }

    // Check not already a member
    const existing = await prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId: team.id, userId } },
    });
    if (existing) {
      return NextResponse.json({ error: 'Already a member of this team' }, { status: 409 });
    }

    await prisma.teamMembership.create({
      data: { teamId: team.id, userId, role: 'MEMBER' },
    });

    return NextResponse.json({
      team: { id: team.id, name: team.name },
      message: `Joined team "${team.name}"`,
    }, { status: 201 });
  } catch (error) {
    logger.error('Teams join error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
