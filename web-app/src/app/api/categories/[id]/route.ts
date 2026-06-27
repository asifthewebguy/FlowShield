import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { CATEGORIES, PRODUCTIVE_CATEGORIES } from '@/app/api/categories/route';

const ALLOWED_MATCH_FIELDS = ['processName', 'windowTitle', 'applicationName', 'url'];

/**
 * Common ownership check: only allow editing/deleting category rules that
 * the user created themselves (isGlobal=false, userId=current user). System
 * (isGlobal=true) rules cannot be modified through this endpoint.
 */
async function findOwnedRule(id: string, userId: string) {
  return prisma.categoryRule.findFirst({
    where: { id, userId, isGlobal: false },
  });
}

/**
 * PUT /api/categories/[id] — update a user's own category rule.
 * Body: { keyword?, matchField?, category?, isProductive? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const owned = await findOwnedRule(id, userId);
    if (!owned) {
      return NextResponse.json(
        { error: 'Rule not found or not owned by you' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { keyword, matchField, category, isProductive } = body as {
      keyword?: unknown;
      matchField?: unknown;
      category?: unknown;
      isProductive?: unknown;
    };

    const data: Record<string, unknown> = {};

    if (keyword !== undefined) {
      if (typeof keyword !== 'string' || keyword.trim().length === 0) {
        return NextResponse.json({ error: 'keyword must be a non-empty string' }, { status: 400 });
      }
      data.keyword = keyword.toLowerCase();
    }
    if (matchField !== undefined) {
      if (typeof matchField !== 'string' || !ALLOWED_MATCH_FIELDS.includes(matchField)) {
        return NextResponse.json(
          { error: `matchField must be one of: ${ALLOWED_MATCH_FIELDS.join(', ')}` },
          { status: 400 }
        );
      }
      data.matchField = matchField;
    }
    if (category !== undefined) {
      if (typeof category !== 'string' || !CATEGORIES.includes(category as typeof CATEGORIES[number])) {
        return NextResponse.json(
          { error: `category must be one of: ${CATEGORIES.join(', ')}` },
          { status: 400 }
        );
      }
      data.category = category;
      // Re-derive isProductive from the new category unless explicitly overridden.
      if (isProductive === undefined) {
        data.isProductive = PRODUCTIVE_CATEGORIES.includes(category);
      }
    }
    if (isProductive !== undefined) {
      if (typeof isProductive !== 'boolean') {
        return NextResponse.json({ error: 'isProductive must be a boolean' }, { status: 400 });
      }
      data.isProductive = isProductive;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    const updated = await prisma.categoryRule.update({
      where: { id },
      data,
    });

    return NextResponse.json({ rule: updated });
  } catch (error) {
    logger.error('Categories PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/categories/[id] — remove a user's own category rule.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const owned = await findOwnedRule(id, userId);
    if (!owned) {
      return NextResponse.json(
        { error: 'Rule not found or not owned by you' },
        { status: 404 }
      );
    }

    await prisma.categoryRule.delete({ where: { id } });
    return NextResponse.json({ message: 'Rule removed' });
  } catch (error) {
    logger.error('Categories DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
