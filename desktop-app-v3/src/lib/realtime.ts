import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import Pusher, { type Channel } from 'pusher-js';
import { useSessionStore } from './sessions';

interface RealtimeConfig {
  key: string;
  cluster: string;
}

type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'failed';

interface RealtimeState {
  status: RealtimeStatus;
  error: string | null;

  /**
   * Spin up the Pusher client and subscribe to `user-${userId}` channel.
   * Idempotent — calling twice while already connected is a no-op. Calling
   * with a different userId disconnects and reconnects.
   */
  connect: (userId: string) => Promise<void>;
  /** Tear down the Pusher client + channel subscription. */
  disconnect: () => void;
}

// Module-private — held outside the Zustand store because Pusher's client
// instance isn't serializable and shouldn't trigger re-renders. The store
// only tracks observable status flags.
let client: Pusher | null = null;
let channel: Channel | null = null;
let connectedUserId: string | null = null;

function teardown(): void {
  if (channel) {
    channel.unbind_all();
    channel = null;
  }
  if (client) {
    client.disconnect();
    client = null;
  }
  connectedUserId = null;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  status: 'idle',
  error: null,

  connect: async (userId: string) => {
    if (connectedUserId === userId && client) {
      return; // Already connected to the right channel.
    }
    teardown();
    set({ status: 'connecting', error: null });

    let config: RealtimeConfig;
    try {
      config = await invoke<RealtimeConfig>('realtime_config');
    } catch (err) {
      set({ status: 'failed', error: errorMessage(err, 'failed to fetch realtime config') });
      return;
    }

    if (!config.key || !config.cluster) {
      // Server hasn't configured Pusher (placeholder env, etc). Stay idle so
      // callers know real-time is off; the 30s session-active poll keeps the
      // dashboard fresh as a fallback.
      set({ status: 'idle', error: null });
      return;
    }

    try {
      client = new Pusher(config.key, {
        cluster: config.cluster,
        forceTLS: true,
      });
      channel = client.subscribe(`user-${userId}`);
      // session-update is the canonical "something changed" ping; the web
      // sends it for start/end/pause/resume. Empty payload — we always
      // re-fetch authoritative state from /api/sessions/active to avoid
      // trusting partial events.
      channel.bind('session-update', () => {
        void useSessionStore.getState().refresh();
      });

      client.connection.bind('connected', () => {
        set({ status: 'connected', error: null });
      });
      client.connection.bind('error', (err: unknown) => {
        // Pusher auto-reconnects; we just surface the most recent error
        // for diagnostics. Status stays 'connected' / 'connecting' as it
        // walks through reconnect states.
        set({ error: errorMessage(err, 'realtime connection error') });
      });

      connectedUserId = userId;
    } catch (err) {
      teardown();
      set({ status: 'failed', error: errorMessage(err, 'failed to connect to realtime') });
    }
  },

  disconnect: () => {
    teardown();
    set({ status: 'idle', error: null });
  },
}));

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as { message?: string; error?: string };
    return obj.message ?? obj.error ?? fallback;
  }
  return fallback;
}
