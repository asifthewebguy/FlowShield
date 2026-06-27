import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { UpdatePreferencesSchema } from '@/lib/schemas';
import { bustCoachCacheIfPaid } from '@/lib/coach-quota';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const preferences = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!preferences) {
      return NextResponse.json(
        { error: 'Preferences not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      preferences,
    });
  } catch (error) {
    logger.error('Preferences fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = UpdatePreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const updates = parsed.data;

    const updatedPreferences = await prisma.userPreferences.upsert({
      where: { userId },
      update: updates,
      create: { userId, ...updates },
    });

    // Preference changes (e.g. preferredDuration) feed into coach prompts;
    // bust paid-tier cache so next visit reflects the new preferences.
    await bustCoachCacheIfPaid(userId);

    return NextResponse.json({
      message: 'Preferences updated successfully',
      preferences: updatedPreferences,
    });
  } catch (error) {
    logger.error('Preferences update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
