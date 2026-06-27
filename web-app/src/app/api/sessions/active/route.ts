
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const userId = await getAuthUserId(request);

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Find the most recent uncompleted session
        const activeSession = await prisma.session.findFirst({
            where: {
                userId,
                completed: false,
            },
            orderBy: {
                startTime: 'desc',
            },
            include: {
                project: true,
            },
        });

        if (!activeSession) {
            // It's valid to not have an active session, return null or specific structure
            // The desktop app expects a SessionInfo object or null.
            // If we return 404, ApiClient might treat it as null (catch block) or error.
            // Let's look at ApiClient.cs:
            /*
              if (response.IsSuccessStatusCode) { ... return valid object }
              return null; 
            */
            // So returning 404 is fine, or 200 with empty body?
            // "JsonConvert.DeserializeObject<SessionInfo>(responseData)"
            // If we return 404, IsSuccessStatusCode is false, returns null. Correct.
            return NextResponse.json({ error: 'No active session' }, { status: 404 });
        }

        return NextResponse.json(activeSession);
    } catch (error) {
        logger.error('Active session fetch error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
