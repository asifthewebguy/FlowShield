import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Session {
  id: string;
  userId?: string;
  startTime: string; // RFC 3339
  endTime?: string;
  plannedDuration: number; // minutes
  actualDuration?: number;
  sessionType: 'WORK' | 'STUDY' | 'CREATIVE';
  productivityScore?: number;
  completed: boolean;
  isPaused: boolean;
  pausedAt?: string;
  projectId?: string;
}

interface SessionState {
  current: Session | null;
  loading: boolean;
  error: string | null;

  /** Refresh active session from the server (idempotent). */
  refresh: () => Promise<void>;
  /** Start a new session. Throws on failure (e.g. SESSION_ALREADY_ACTIVE). */
  start: (plannedDuration: number, sessionType?: Session['sessionType']) => Promise<void>;
  /** Mark current session completed. */
  end: (productivityScore?: number) => Promise<void>;
  /** Pause or resume the current session. */
  togglePause: (action: 'pause' | 'resume') => Promise<void>;
}

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as { message?: string; error?: string };
    return obj.message ?? obj.error ?? fallback;
  }
  return fallback;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  current: null,
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const session = await invoke<Session | null>('session_active');
      set({ current: session, loading: false });
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load session'), loading: false });
    }
  },

  start: async (plannedDuration, sessionType = 'WORK') => {
    set({ loading: true, error: null });
    try {
      const session = await invoke<Session>('session_start', {
        plannedDuration,
        sessionType,
      });
      set({ current: session, loading: false });
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to start session'), loading: false });
      throw err;
    }
  },

  end: async (productivityScore) => {
    const session = get().current;
    if (!session) return;
    set({ loading: true, error: null });
    try {
      await invoke<Session>('session_end', {
        sessionId: session.id,
        productivityScore: productivityScore ?? null,
      });
      set({ current: null, loading: false });
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to end session'), loading: false });
      throw err;
    }
  },

  togglePause: async (action) => {
    const session = get().current;
    if (!session) return;
    set({ loading: true, error: null });
    try {
      const updated = await invoke<Session>('session_toggle_pause', {
        sessionId: session.id,
        action,
      });
      set({ current: updated, loading: false });
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to toggle pause'), loading: false });
      throw err;
    }
  },
}));
