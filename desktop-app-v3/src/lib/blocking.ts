import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface BlockingState {
  /** True if the FlowShield-managed region is currently in /etc/hosts. */
  active: boolean;
  /** True while an apply/clear elevation prompt is in flight. */
  busy: boolean;
  error: string | null;

  /** Cheap read-only sync — `blocking_status` Tauri command. No prompt. */
  refresh: () => Promise<void>;
  /** Spawns the privileged child to write the hosts region. Prompts. */
  apply: (domains: string[]) => Promise<void>;
  /** Spawns the privileged child to remove the region. Prompts. */
  clear: () => Promise<void>;
}

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as { message?: string; error?: string };
    return obj.message ?? obj.error ?? fallback;
  }
  return fallback;
}

export const useBlockingStore = create<BlockingState>((set) => ({
  active: false,
  busy: false,
  error: null,

  refresh: async () => {
    try {
      const active = await invoke<boolean>('blocking_status');
      set({ active, error: null });
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to read blocking status') });
    }
  },

  apply: async (domains) => {
    set({ busy: true, error: null });
    try {
      await invoke('blocking_apply', { domains });
      set({ active: true, busy: false });
    } catch (err) {
      set({
        error: errorMessage(err, 'Failed to apply blocks'),
        busy: false,
      });
      throw err;
    }
  },

  clear: async () => {
    set({ busy: true, error: null });
    try {
      await invoke('blocking_clear');
      set({ active: false, busy: false });
    } catch (err) {
      set({
        error: errorMessage(err, 'Failed to clear blocks'),
        busy: false,
      });
      throw err;
    }
  },
}));
