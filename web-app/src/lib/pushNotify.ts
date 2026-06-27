import webpush from 'web-push';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

let vapidConfigured = false;

function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    logger.warn('VAPID keys are missing; skipping push send');
    return false;
  }
  webpush.setVapidDetails('mailto:support@flowshield.app', publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/**
 * Send a web-push notification to every registered device of `userId`.
 * Returns the number of successful sends. Cleans up subscriptions that return 410/404.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; tag?: string }
): Promise<number> {
  if (!configureVapid()) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return 0;

  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
        return true;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          logger.warn('Push send failed', err);
        }
        return false;
      }
    })
  );

  return results.filter((r) => r.status === 'fulfilled' && r.value).length;
}

/**
 * Convenience wrapper for session-end push notifications.
 */
export function sendSessionEndPush(userId: string, sessionId: string, plannedMinutes: number) {
  return sendPushToUser(userId, {
    title: 'Focus session complete',
    body: `Your ${plannedMinutes}-minute session is up.`,
    tag: `session-end-${sessionId}`,
  });
}
