import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const ALLOWED_PUSH_SUFFIXES = [
    '.googleapis.com',
    '.google.com',
    '.mozilla.com',
    '.mozaws.net',
    '.windows.com',
    '.microsoft.com',
    '.apple.com',
];

const PRIVATE_HOSTNAME_PATTERNS = [
    'localhost',
    '127.',
    '10.',
    '192.168.',
    '169.254.',
    '::1',
];

function isAllowedPushEndpoint(url: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
        PRIVATE_HOSTNAME_PATTERNS.some((p) => hostname === p || hostname.startsWith(p)) ||
        hostname.endsWith('.local')
    ) {
        return false;
    }
    return ALLOWED_PUSH_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getAuthUserId(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rl = await rateLimit('push-sub:' + userId, 20, 60 * 60 * 1000);
        if (!rl.allowed) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const subscription = await req.json();

        if (!subscription.endpoint || !subscription.keys) {
            return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
        }

        if (!isAllowedPushEndpoint(subscription.endpoint)) {
            return NextResponse.json({ error: 'Invalid push endpoint' }, { status: 400 });
        }

        // Upsert subscription
        const existing = await prisma.pushSubscription.findUnique({
            where: { endpoint: subscription.endpoint },
        });

        if (existing) {
            await prisma.pushSubscription.update({
                where: { id: existing.id },
                data: {
                    updatedAt: new Date(),
                    userId, // Ensure ownership is correct
                },
            });
        } else {
            const count = await prisma.pushSubscription.count({ where: { userId } });
            if (count >= 10) {
                return NextResponse.json({ error: 'Subscription limit reached' }, { status: 400 });
            }

            await prisma.pushSubscription.create({
                data: {
                    userId,
                    endpoint: subscription.endpoint,
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth,
                },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error saving subscription', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
