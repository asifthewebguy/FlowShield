/**
 * Offline activity queue.
 *
 * Stores activity sync payloads in memory when the network request fails.
 * On the next successful sync, all queued items are flushed automatically.
 * This provides a lightweight "eventual consistency" guarantee without requiring
 * a native SQLite dependency.
 */

import { api } from './api';

type Activity = Parameters<typeof api.syncActivity>[0][number];

let queue: Activity[] = [];
let flushing = false;

/** Add failed activities to the offline queue. */
export function enqueue(activities: Activity[]): void {
  queue.push(...activities);
}

/** Return the current queue length (useful for UI indicators). */
export function queueLength(): number {
  return queue.length;
}

/**
 * Attempt to flush all queued activities.
 * Safe to call frequently — concurrent flushes are prevented.
 */
export async function flushQueue(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;

  const batch = [...queue];
  queue = [];

  try {
    await api.syncActivity(batch);
  } catch {
    // Put items back at the front of the queue so they're retried next time
    queue = [...batch, ...queue];
  } finally {
    flushing = false;
  }
}

/**
 * Sync activities with automatic offline fallback.
 *
 * Usage (replaces direct `api.syncActivity` calls):
 *   await syncWithFallback(activities);
 */
export async function syncWithFallback(activities: Activity[]): Promise<void> {
  // First try to flush any previously queued items
  await flushQueue();

  try {
    await api.syncActivity(activities);
  } catch {
    enqueue(activities);
    console.warn(
      `[OfflineQueue] Network unavailable — queued ${activities.length} activities (total: ${queue.length})`
    );
  }
}
