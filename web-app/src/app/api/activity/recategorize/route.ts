import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { normalizeCategory, CATEGORIES } from '@/app/api/categories/route';
import { bustCoachCacheIfPaid } from '@/lib/coach-quota';

/**
 * POST /api/activity/recategorize
 *
 * Three modes:
 * 1. Single correction:  { activityId, newCategory }
 *    — Updates one activity and all matching by applicationName.
 * 2. App-name correction: { applicationName, newCategory }
 *    — Updates all activities with that applicationName.
 * 3. Bulk re-apply rules: { bulk: true }
 *    — Re-categorizes all user activities using the current rule set.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Mode 1: Single activity correction
    if (body.activityId && body.newCategory) {
      const { activityId, newCategory } = body;

      if (!CATEGORIES.includes(newCategory)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}` },
          { status: 400 }
        );
      }

      // Update the specific activity
      const activity = await prisma.activityLog.findFirst({
        where: { id: activityId, userId },
      });

      if (!activity) {
        return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
      }

      await prisma.activityLog.update({
        where: { id: activityId },
        data: { category: newCategory },
      });

      // Also update all matching activities with the same applicationName
      const updated = await prisma.activityLog.updateMany({
        where: {
          userId,
          applicationName: activity.applicationName,
          category: { not: newCategory },
        },
        data: { category: newCategory },
      });

      // Recategorization changes coach context; bust paid-tier cache.
      await bustCoachCacheIfPaid(userId);

      return NextResponse.json({
        message: 'Category corrected',
        updatedCount: updated.count + 1,
        applicationName: activity.applicationName,
        newCategory,
      });
    }

    // Mode 2: App-name correction
    if (body.applicationName && body.newCategory) {
      const { applicationName, newCategory } = body;

      if (!CATEGORIES.includes(newCategory)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}` },
          { status: 400 }
        );
      }

      const updated = await prisma.activityLog.updateMany({
        where: {
          userId,
          applicationName,
        },
        data: { category: newCategory },
      });

      await bustCoachCacheIfPaid(userId);

      return NextResponse.json({
        message: 'Category corrected for application',
        updatedCount: updated.count,
        applicationName,
        newCategory,
      });
    }

    // Mode 3: Bulk re-categorize using current rules
    if (body.bulk) {
      // Fetch all rules for this user (global + personal)
      const rules = await prisma.categoryRule.findMany({
        where: {
          OR: [{ isGlobal: true }, { userId }],
        },
        orderBy: [{ priority: 'desc' }, { isGlobal: 'asc' }],
      });

      const activities = await prisma.activityLog.findMany({
        where: { userId },
        select: { id: true, processName: true, windowTitle: true, applicationName: true, url: true },
      });

      // Group activity ids by their resolved new category, then issue one
      // updateMany per bucket. For thousands of rows this is dramatically
      // faster than the previous one-at-a-time loop.
      const buckets = new Map<string, string[]>();
      for (const act of activities) {
        const newCat = matchCategory(act, rules);
        if (newCat) {
          const ids = buckets.get(newCat);
          if (ids) ids.push(act.id);
          else buckets.set(newCat, [act.id]);
        }
      }

      let updatedCount = 0;
      for (const [category, ids] of buckets) {
        // Chunk to avoid Postgres parameter limits (~32k); 1000 is plenty.
        const CHUNK = 1000;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const result = await prisma.activityLog.updateMany({
            where: { id: { in: slice } },
            data: { category },
          });
          updatedCount += result.count;
        }
      }

      await bustCoachCacheIfPaid(userId);

      return NextResponse.json({
        message: 'Bulk recategorization complete',
        totalActivities: activities.length,
        updatedCount,
      });
    }

    return NextResponse.json(
      { error: 'Provide { activityId, newCategory } or { bulk: true }' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Recategorize error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface RuleLike {
  keyword: string;
  matchField: string;
  category: string;
}

interface ActivityFields {
  processName: string;
  windowTitle: string;
  applicationName: string;
  url: string | null;
}

function matchCategory(activity: ActivityFields, rules: RuleLike[]): string | null {
  for (const rule of rules) {
    const fieldValue = getField(activity, rule.matchField);
    if (fieldValue && fieldValue.toLowerCase().includes(rule.keyword.toLowerCase())) {
      return normalizeCategory(rule.category);
    }
  }
  return null;
}

function getField(activity: ActivityFields, field: string): string | null {
  switch (field) {
    case 'processName': return activity.processName;
    case 'windowTitle': return activity.windowTitle;
    case 'applicationName': return activity.applicationName;
    case 'url': return activity.url;
    default: return null;
  }
}
