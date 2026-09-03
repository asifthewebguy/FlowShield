import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { triggerUserEvent } from '@/lib/pusher';
import { resolveCategory } from '@/lib/activity-sync';
import { rateLimit } from '@/lib/rate-limit';

const MAX_STRING = 2048;
const MAX_DURATION = 86400; // 1 day in seconds

const activityItemSchema = z.object({
  timestamp: z.string().refine((v) => {
    const d = new Date(v);
    return !isNaN(d.getTime());
  }, { message: 'timestamp must be a valid date string' }),
  windowTitle: z.string().max(MAX_STRING).optional(),
  processName: z.string().max(MAX_STRING).optional(),
  applicationName: z.string().max(MAX_STRING).optional(),
  domain: z.string().max(MAX_STRING).optional(),
  url: z.string().max(MAX_STRING).optional(),
  category: z.string().max(MAX_STRING).optional(),
  durationSeconds: z
    .number()
    .int()
    .finite()
    .min(0)
    .transform((v) => Math.min(v, MAX_DURATION)),
  activityLevel: z.number().min(0).max(100).optional(),
  sessionId: z.string().max(MAX_STRING).optional().nullable(),
});

const syncBodySchema = z.object({
  activities: z.array(activityItemSchema).min(1).max(500),
  source: z.string().max(64).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Per-user rate limit: 120 requests per minute
    const rl = await rateLimit('activity-sync:' + userId, 120, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const raw = await request.json();
    const parsed = syncBodySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const { activities, source: rawSource } = parsed.data;
    // Source identifies the client sending data: desktop | browser | mobile
    const source: string = rawSource || 'desktop';

    // Privacy switch. When the user turned off sharing, never persist window
    // titles or URLs — even from clients that did not strip them themselves.
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { shareWindowDetails: true },
    });
    const shareWindowDetails = prefs?.shareWindowDetails ?? true;

    // Load CategoryRules once for the whole batch (browser source only)
    const categoryRules = source === 'browser'
      ? await prisma.categoryRule.findMany({
          where: { OR: [{ isGlobal: true }, { userId }] },
          orderBy: [{ priority: 'desc' }, { isGlobal: 'asc' }],
        })
      : [];

    // Store activities in database
    const activityLogs = activities.map((activity) => ({
      userId,
      timestamp: new Date(activity.timestamp),
      windowTitle: shareWindowDetails
        ? (activity.windowTitle || activity.url || 'Unknown')
        : 'Hidden',
      processName: activity.processName || source,
      applicationName: activity.applicationName || activity.domain || 'Unknown',
      url: shareWindowDetails ? (activity.url || null) : null,
      durationSeconds: activity.durationSeconds,
      activityLevel: activity.activityLevel || 0,
      category: resolveCategory(
        activity.applicationName || activity.domain || 'Unknown',
        activity.category || 'Unknown',
        categoryRules
      ),
      sessionId: activity.sessionId || null,
      source,
    }));

    // Batch insert activities
    await prisma.activityLog.createMany({
      data: activityLogs,
      skipDuplicates: true,
    });

    triggerUserEvent(userId, 'activity-synced');
    return NextResponse.json({
      message: 'Activities synced successfully',
      count: activities.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Activity sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const whereClause: any = { userId };

    if (startDate && endDate) {
      whereClause.timestamp = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const activities = await prisma.activityLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });

    return NextResponse.json({
      activities,
      count: activities.length,
    });
  } catch (error) {
    logger.error('Activity fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
