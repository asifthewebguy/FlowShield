import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthAdminId } from '@/lib/jwt';
import { invalidateUserTierCache } from '@/lib/subscription';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getAuthAdminId(request);
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      subscriptionTier: true,
      timezone: true,
      createdAt: true,
      emailVerified: true,
      _count: { select: { sessions: true, activityLogs: true } },
      sessions: {
        where: { completed: true },
        select: { actualDuration: true, startTime: true },
        orderBy: { startTime: 'desc' },
        take: 1,
      },
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tier: true,
          status: true,
          provider: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelledAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const totalMinutes = await prisma.session.aggregate({
    where: { userId: id, completed: true },
    _sum: { actualDuration: true },
  });

  return NextResponse.json({
    ...user,
    totalFocusMinutes: totalMinutes._sum.actualDuration ?? 0,
    lastActive: user.sessions[0]?.startTime ?? null,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getAuthAdminId(request);
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { role, subscriptionTier, name } = body as {
    role?: 'USER' | 'ADMIN';
    subscriptionTier?: 'FREE' | 'PRO' | 'TEAM';
    name?: string;
  };

  const current = await prisma.user.findUnique({
    where: { id },
    select: { subscriptionTier: true },
  });
  if (!current) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(role && { role }),
      ...(subscriptionTier && { subscriptionTier }),
      ...(name !== undefined && { name }),
    },
    select: { id: true, email: true, role: true, subscriptionTier: true, name: true },
  });

  // Record subscription change. Cancel any prior ACTIVE subscription so
  // `User.subscriptionTier` and the active Subscription row stay in sync.
  if (subscriptionTier && subscriptionTier !== current.subscriptionTier) {
    await prisma.subscription.updateMany({
      where: { userId: id, status: 'ACTIVE' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await prisma.subscription.create({
      data: {
        userId: id,
        tier: subscriptionTier,
        status: 'ACTIVE',
        provider: 'manual',
      },
    });
    await invalidateUserTierCache(id);
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getAuthAdminId(request);
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  // Prevent admin from deleting themselves
  if (id === adminId) {
    return NextResponse.json(
      { error: 'Cannot delete your own account' },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
