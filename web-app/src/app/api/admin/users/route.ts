import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/jwt';

export async function GET(request: NextRequest) {
  const adminId = getAdminFromToken(request);
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20'));
  const search = searchParams.get('search') ?? '';
  const tier = searchParams.get('tier') ?? '';
  const role = searchParams.get('role') ?? '';

  const where = {
    ...(search && {
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { name: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
    ...(tier && { subscriptionTier: tier as 'FREE' | 'PRO' | 'TEAM' }),
    ...(role && { role: role as 'USER' | 'ADMIN' }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscriptionTier: true,
        createdAt: true,
        emailVerified: true,
        _count: { select: { sessions: true } },
        sessions: {
          where: { completed: true },
          orderBy: { startTime: 'desc' },
          take: 1,
          select: { startTime: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const result = users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    subscriptionTier: u.subscriptionTier,
    createdAt: u.createdAt,
    emailVerified: u.emailVerified,
    sessionCount: u._count.sessions,
    lastActive: u.sessions[0]?.startTime ?? null,
  }));

  return NextResponse.json({
    users: result,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
