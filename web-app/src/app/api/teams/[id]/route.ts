import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';

/**
 * GET /api/teams/[id] — get team details + leaderboard for team members.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    // Check membership
    const membership = await prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId: id, userId } },
    });
    if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            team: false,
          },
        },
      },
    });
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

    // Fetch member details + this-week focus minutes
    const memberIds = team.memberships.map(m => m.userId);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [users, weeklyStats] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, name: true, email: true },
      }),
      prisma.dailyStats.groupBy({
        by: ['userId'],
        where: { userId: { in: memberIds }, date: { gte: weekAgo } },
        _sum: { totalFocusMinutes: true },
      }),
    ]);

    const minutesByUser: Record<string, number> = {};
    for (const s of weeklyStats) {
      minutesByUser[s.userId] = s._sum.totalFocusMinutes || 0;
    }

    const leaderboard = users
      .map(u => ({
        userId: u.id,
        name: u.name || u.email,
        focusMinutes: minutesByUser[u.id] || 0,
        role: team.memberships.find(m => m.userId === u.id)?.role,
        isCurrentUser: u.id === userId,
      }))
      .sort((a, b) => b.focusMinutes - a.focusMinutes)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        ownerId: team.ownerId,
        inviteCode: membership.role !== 'MEMBER' ? team.inviteCode : undefined,
        myRole: membership.role,
        memberCount: team.memberships.length,
      },
      leaderboard,
    });
  } catch (error) {
    logger.error('Team GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/teams/[id] — update team name (owner/admin only).
 * Body: { name: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const membership = await prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId: id, userId } },
    });
    if (!membership || membership.role === 'MEMBER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { name } = await request.json();
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Team name must be at least 2 characters' }, { status: 400 });
    }

    const team = await prisma.team.update({
      where: { id },
      data: { name: name.trim() },
    });

    return NextResponse.json({ team: { id: team.id, name: team.name } });
  } catch (error) {
    logger.error('Team PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/teams/[id] — leave (member) or dissolve (owner) a team.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const membership = await prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId: id, userId } },
    });
    if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    if (membership.role === 'OWNER') {
      // Owner dissolves the team
      await prisma.team.delete({ where: { id } });
      return NextResponse.json({ message: 'Team dissolved' });
    } else {
      // Non-owner leaves
      await prisma.teamMembership.delete({
        where: { teamId_userId: { teamId: id, userId } },
      });
      return NextResponse.json({ message: 'Left team' });
    }
  } catch (error) {
    logger.error('Team DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
