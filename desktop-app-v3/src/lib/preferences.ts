import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Preferences {
  primaryDistractions: string[];
  shareWindowDetails: boolean;
}

interface PrefsState {
  current: Preferences | null;
  loading: boolean;
  error: string | null;
  /** Pull the user's preferences from the FlowShield API. Idempotent. */
  refresh: () => Promise<void>;
}

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as { message?: string; error?: string };
    return obj.message ?? obj.error ?? fallback;
  }
  return fallback;
}

export const usePrefsStore = create<PrefsState>((set) => ({
  current: null,
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const prefs = await invoke<Preferences>('prefs_load');
      set({ current: prefs, loading: false });
    } catch (err) {
      set({
        error: errorMessage(err, 'Failed to load preferences'),
        loading: false,
      });
    }
  },
}));
