import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';

export async function POST(req: NextRequest) {
    try {
        const userId = getUserIdFromToken(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const subscription = await req.json();

        if (!subscription.endpoint || !subscription.keys) {
            return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
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
        console.error('Error saving subscription:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
