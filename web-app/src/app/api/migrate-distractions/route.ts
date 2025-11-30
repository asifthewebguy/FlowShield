import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verify } from 'jsonwebtoken';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'your-secret-key';

function getUserIdFromToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = verify(token, JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch {
    return null;
  }
}

// Mapping of old distraction values to new ones
const distractionMapping: Record<string, string> = {
  'social_media': 'Social Media',
  'social-media': 'Social Media',
  'video_streaming': 'Video Streaming',
  'video-streaming': 'Video Streaming',
  'email': 'Email',
  'messaging': 'Messaging',
  'news': 'News Sites',
  'news_sites': 'News Sites',
  'news-sites': 'News Sites',
  'shopping': 'Shopping',
  'notifications': 'Messaging', // Map notifications to Messaging as closest match
  'meetings': 'Messaging', // Map meetings to Messaging as closest match
  'noise': 'Social Media', // Map noise to Social Media as default
  'multitasking': 'Social Media', // Map multitasking to Social Media as default
};

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get current preferences
    const preferences = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!preferences) {
      return NextResponse.json(
        { error: 'Preferences not found' },
        { status: 404 }
      );
    }

    const currentDistractions = preferences.primaryDistractions || [];

    // Convert old values to new values and remove duplicates
    const newDistractions = Array.from(new Set(
      currentDistractions.map(distraction => {
        // If it's already a new value, keep it
        const validNewValues = ['Social Media', 'Video Streaming', 'Email', 'Messaging', 'News Sites', 'Shopping'];
        if (validNewValues.includes(distraction)) {
          return distraction;
        }

        // Otherwise, map it to a new value
        return distractionMapping[distraction] || 'Social Media';
      })
    ));

    // Update preferences with migrated values
    const updated = await prisma.userPreferences.update({
      where: { userId },
      data: {
        primaryDistractions: newDistractions,
      },
    });

    return NextResponse.json({
      message: 'Distractions migrated successfully',
      oldDistractions: currentDistractions,
      newDistractions: newDistractions,
      preferences: updated,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
