import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

// Canonical category list — used by all clients
export const CATEGORIES = [
  'Development',
  'Work',
  'Communication',
  'Entertainment',
  'Social Media',
  'Browsing',
  'Creative',
  'Study',
  'Unknown',
] as const;

export const PRODUCTIVE_CATEGORIES = ['Development', 'Work', 'Creative', 'Study'];

// Desktop → Web category name mapping
export const CATEGORY_ALIASES: Record<string, string> = {
  Productivity: 'Work',
  Social: 'Social Media',
};

export function normalizeCategory(category: string): string {
  return CATEGORY_ALIASES[category] || category;
}

/**
 * GET /api/categories — returns global + user-specific rules, plus canonical category list.
 * Used by desktop/extension clients to sync categorization rules.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rules = await prisma.categoryRule.findMany({
      where: {
        OR: [
          { isGlobal: true },
          { userId },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { isGlobal: 'asc' }, // user rules override global
      ],
    });

    return NextResponse.json({
      categories: CATEGORIES,
      productiveCategories: PRODUCTIVE_CATEGORIES,
      aliases: CATEGORY_ALIASES,
      rules: rules.map((r) => ({
        id: r.id,
        keyword: r.keyword,
        matchField: r.matchField,
        category: r.category,
        isProductive: r.isProductive,
        isGlobal: r.isGlobal,
        priority: r.priority,
      })),
    });
  } catch (error) {
    logger.error('Categories GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/categories — create a user-specific category correction rule.
 * Body: { keyword, matchField?, category, isProductive? }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { keyword, matchField, category, isProductive } = body;

    if (!keyword || !category) {
      return NextResponse.json(
        { error: 'keyword and category are required' },
        { status: 400 }
      );
    }

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    const rule = await prisma.categoryRule.create({
      data: {
        keyword: keyword.toLowerCase(),
        matchField: matchField || 'applicationName',
        category,
        isProductive: isProductive ?? PRODUCTIVE_CATEGORIES.includes(category),
        isGlobal: false,
        userId,
        priority: 200, // user corrections always override global rules
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    logger.error('Categories POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
