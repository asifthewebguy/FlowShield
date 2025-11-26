import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get all sessions without date filter
    const allSessions = await prisma.session.findMany({
      orderBy: { startTime: 'desc' },
      take: 10,
    });

    const today = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    return NextResponse.json({
      today,
      startOfDay,
      endOfDay,
      allSessions: allSessions.map(s => ({
        id: s.id,
        startTime: s.startTime,
        completed: s.completed,
        actualDuration: s.actualDuration,
      })),
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
