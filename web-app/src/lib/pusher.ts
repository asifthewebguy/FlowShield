import Pusher from 'pusher';
import { logger } from './logger';

export const pusher = new Pusher({
  appId:   process.env.PUSHER_APP_ID!,
  key:     process.env.PUSHER_KEY!,
  secret:  process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS:  true,
});

/**
 * Trigger a per-user channel event. Errors are logged (so a misconfigured
 * key or outage isn't invisible) but never thrown — keeping the request
 * path resilient when realtime is degraded.
 */
export function triggerUserEvent(
  userId: string,
  event: string,
  data: object = {}
): void {
  pusher.trigger(`user-${userId}`, event, data).catch((err) => {
    logger.warn('Pusher trigger failed', { userId, event, err });
  });
}
