import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import webpush from 'web-push';
import { logger } from '@/lib/logger';
import { PushSendSchema } from '@/lib/schemas';

// Configure Web Push lazily in handler to avoid build errors if keys are missing

export async function POST(req: NextRequest) {
    try {
        const userId = getUserIdFromToken(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;

        if (!publicKey || !privateKey) {
            logger.error('VAPID keys are missing');
            return NextResponse.json({ error: 'Server configuration error: Missing VAPID keys' }, { status: 500 });
        }

        webpush.setVapidDetails(
            'mailto:support@flowshield.app',
            publicKey,
            privateKey
        );

        const rawBody = await req.json();
        const parsed = PushSendSchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }
        const { title, body, userId: targetUserId } = parsed.data;

        // Security: only allow users to message themselves
        if (userId !== targetUserId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId: targetUserId },
        });

        const payload = JSON.stringify({ title, body });

        const notifications = subscriptions.map((sub) => {
            const pushConfig = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                },
            };
            return webpush.sendNotification(pushConfig, payload).catch((err) => {
                logger.error('Error sending push', err);
                // Clean up invalid subscriptions
                if (err.statusCode === 410 || err.statusCode === 404) {
                    return prisma.pushSubscription.delete({ where: { id: sub.id } });
                }
            });
        });

        await Promise.all(notifications);

        return NextResponse.json({ success: true, count: notifications.length });
    } catch (error) {
        logger.error('Error sending notification', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
