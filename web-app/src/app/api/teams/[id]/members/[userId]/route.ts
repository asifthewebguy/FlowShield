import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/teams/[id]/members/[userId]
 *
 * Remove (kick) a team member. OWNER and ADMIN can kick MEMBERs. OWNER can
 * also kick ADMINs. Nobody can kick the OWNER except the OWNER themselves
 * (which is the "dissolve team" path on /api/teams/[id] DELETE — refused
 * here for clarity).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const actingUserId = await getAuthUserId(request);
    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: teamId, userId: targetUserId } = await params;

    if (actingUserId === targetUserId) {
      // Self-leave goes through DELETE /api/teams/[id], not this endpoint.
      return NextResponse.json(
        { error: 'Use DELETE /api/teams/[id] to leave a team' },
        { status: 400 }
      );
    }

    const [actingMembership, targetMembership] = await Promise.all([
      prisma.teamMembership.findUnique({
        where: { teamId_userId: { teamId, userId: actingUserId } },
      }),
      prisma.teamMembership.findUnique({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      }),
    ]);

    if (!actingMembership) {
      return NextResponse.json({ error: 'Not a team member' }, { status: 403 });
    }
    if (!targetMembership) {
      return NextResponse.json({ error: 'Target user is not a member' }, { status: 404 });
    }

    if (targetMembership.role === 'OWNER') {
      return NextResponse.json(
        { error: 'Owner cannot be removed; transfer ownership or dissolve the team' },
        { status: 400 }
      );
    }

    // Permission rules:
    //   OWNER → can remove ADMIN or MEMBER
    //   ADMIN → can remove MEMBER only
    //   MEMBER → cannot remove anyone
    const canRemove =
      actingMembership.role === 'OWNER' ||
      (actingMembership.role === 'ADMIN' && targetMembership.role === 'MEMBER');

    if (!canRemove) {
      return NextResponse.json(
        { error: 'Insufficient permissions to remove this member' },
        { status: 403 }
      );
    }

    await prisma.teamMembership.delete({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });

    logger.info(`Team member removed: team=${teamId} user=${targetUserId} by=${actingUserId}`);

    return NextResponse.json({ message: 'Member removed' });
  } catch (error) {
    logger.error('Team member-remove error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
