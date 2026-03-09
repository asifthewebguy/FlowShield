import { AppState, AppStateStatus } from 'react-native';
import { syncWithFallback } from './offlineQueue';

/**
 * Phone usage tracker for focus sessions.
 *
 * Tracks when the user leaves the FlowShield app during a focus session
 * by monitoring AppState transitions. Records "phone usage" activities
 * when the app goes to background and comes back.
 *
 * Note: Android Usage Stats API (PACKAGE_USAGE_STATS) requires a native
 * module and is deferred to Sprint 9 polish. This implementation uses
 * the cross-platform AppState API as a lightweight alternative.
 */

interface UsageEvent {
  leftAt: Date;
  returnedAt?: Date;
}

let currentSessionId: string | null = null;
let usageEvents: UsageEvent[] = [];
let activeEvent: UsageEvent | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

export function startUsageTracking(sessionId: string) {
  currentSessionId = sessionId;
  usageEvents = [];
  activeEvent = null;

  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
}

export function stopUsageTracking(): UsageEvent[] {
  appStateSubscription?.remove();
  appStateSubscription = null;

  // Close any active event
  if (activeEvent && !activeEvent.returnedAt) {
    activeEvent.returnedAt = new Date();
    usageEvents.push(activeEvent);
    activeEvent = null;
  }

  const events = [...usageEvents];
  syncUsageEvents(events);

  currentSessionId = null;
  usageEvents = [];
  return events;
}

function handleAppStateChange(state: AppStateStatus) {
  if (!currentSessionId) return;

  if (state === 'background' || state === 'inactive') {
    // User left the app
    if (!activeEvent) {
      activeEvent = { leftAt: new Date() };
    }
  } else if (state === 'active') {
    // User returned
    if (activeEvent) {
      activeEvent.returnedAt = new Date();
      usageEvents.push(activeEvent);
      activeEvent = null;
    }
  }
}

async function syncUsageEvents(events: UsageEvent[]) {
  if (events.length === 0 || !currentSessionId) return;

  const activities = events
    .filter((e) => e.returnedAt)
    .map((e) => {
      const durationSeconds = Math.round(
        ((e.returnedAt as Date).getTime() - e.leftAt.getTime()) / 1000
      );
      return {
        timestamp: e.leftAt.toISOString(),
        windowTitle: 'Phone Usage (left FlowShield)',
        processName: 'phone',
        applicationName: 'Phone Usage',
        durationSeconds,
        category: 'Browsing',
        sessionId: currentSessionId || undefined,
      };
    })
    .filter((a) => a.durationSeconds > 5); // ignore very brief switches

  if (activities.length > 0) {
    await syncWithFallback(activities);
  }
}

export function getUsageStats(): { count: number; totalSeconds: number } {
  const allEvents = [...usageEvents];
  if (activeEvent) {
    allEvents.push({ ...activeEvent, returnedAt: new Date() });
  }

  let totalSeconds = 0;
  for (const e of allEvents) {
    if (e.returnedAt) {
      totalSeconds += (e.returnedAt.getTime() - e.leftAt.getTime()) / 1000;
    }
  }

  return { count: allEvents.length, totalSeconds: Math.round(totalSeconds) };
}
