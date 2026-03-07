import Pusher from 'pusher';

export const pusher = new Pusher({
  appId:   process.env.PUSHER_APP_ID!,
  key:     process.env.PUSHER_KEY!,
  secret:  process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS:  true,
});

/**
 * Trigger a per-user channel event. Errors are swallowed so a Pusher
 * outage never breaks the main API response.
 */
export function triggerUserEvent(
  userId: string,
  event: string,
  data: object = {}
): void {
  pusher.trigger(`user-${userId}`, event, data).catch(() => {});
}
