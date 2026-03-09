import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { normalizeCategory, CATEGORIES } from '@/app/api/categories/route';

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
    const userId = getUserIdFromToken(request);
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

      // Fetch all user activities
      const activities = await prisma.activityLog.findMany({
        where: { userId },
        select: { id: true, processName: true, windowTitle: true, applicationName: true, url: true },
      });

      let updatedCount = 0;

      // Process in batches to avoid overwhelming the DB
      const batchSize = 100;
      for (let i = 0; i < activities.length; i += batchSize) {
        const batch = activities.slice(i, i + batchSize);
        const updates: { id: string; category: string }[] = [];

        for (const act of batch) {
          const newCat = matchCategory(act, rules);
          if (newCat) {
            updates.push({ id: act.id, category: newCat });
          }
        }

        // Execute updates
        for (const update of updates) {
          await prisma.activityLog.update({
            where: { id: update.id },
            data: { category: update.category },
          });
          updatedCount++;
        }
      }

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
