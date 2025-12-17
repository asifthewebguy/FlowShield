import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import webpush from 'web-push';

// Configure Web Push
webpush.setVapidDetails(
    'mailto:support@flowshield.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: NextRequest) {
    try {
        const userId = getUserIdFromToken(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { title, body, userId: targetUserId } = await req.json();

        // Security check: Only allow users to message themselves for now
        // In a real app, this could be admin-only or system-triggered
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
                console.error('Error sending push:', err);
                // Clean up invalid subscriptions
                if (err.statusCode === 410 || err.statusCode === 404) {
                    return prisma.pushSubscription.delete({ where: { id: sub.id } });
                }
            });
        });

        await Promise.all(notifications);

        return NextResponse.json({ success: true, count: notifications.length });
    } catch (error) {
        console.error('Error sending notification:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
