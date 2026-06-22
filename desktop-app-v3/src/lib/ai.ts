import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// Mirrors the Rust `BriefingState` enum (serde tagged on `status`).
export type BriefingState =
  | { status: 'ready'; text: string; generated_at: string }
  | { status: 'generating' }
  | { status: 'empty_state' }
  | { status: 'hidden' }
  | { status: 'error'; message: string };

export interface AiSettings {
  labs_enabled: boolean;
  model_id: string;
  embedder_id: string;
  status: 'ready' | 'downloading' | 'error' | 'not_started' | 'disabled';
  disk_usage_bytes: number;
  indexed_chunk_count: number;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
}

interface AiStore {
  briefing: BriefingState;
  settings: AiSettings | null;
  downloadProgress: DownloadProgress | null;
  refreshBriefing: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setLabsEnabled: (enabled: boolean) => Promise<void>;
  bootstrap: () => Promise<UnlistenFn>;
}

export const useAIStore = create<AiStore>((set, get) => ({
  briefing: { status: 'hidden' },
  settings: null,
  downloadProgress: null,

  refreshBriefing: async () => {
    try {
      const state = await invoke<BriefingState>('ai_briefing_today');
      set({ briefing: state });
    } catch (e) {
      set({ briefing: { status: 'error', message: String(e) } });
    }
  },

  refreshSettings: async () => {
    try {
      const settings = await invoke<AiSettings>('ai_settings');
      set({ settings });
    } catch (e) {
      console.error('ai_settings failed:', e);
    }
  },

  setLabsEnabled: async (enabled) => {
    await invoke('ai_labs_set_enabled', { enabled });
    await get().refreshSettings();
    await get().refreshBriefing();
  },

  bootstrap: async () => {
    await get().refreshSettings();
    await get().refreshBriefing();

    const unReady = await listen<string>('ai-briefing-ready', () => {
      void get().refreshBriefing();
    });
    const unGenerating = await listen<string>('ai-briefing-generating', () => {
      set({ briefing: { status: 'generating' } });
    });
    const unError = await listen<string>('ai-briefing-error', (evt) => {
      set({ briefing: { status: 'error', message: String(evt.payload) } });
    });

    // Live model-download feedback. Backend emits `ai-model-progress` per
    // ~1MB chunk and `ai-model-status-changed` on every status transition.
    const unModelProgress = await listen<{
      overall_bytes_downloaded: number;
      overall_bytes_total: number;
    }>('ai-model-progress', (evt) => {
      set({
        downloadProgress: {
          downloaded: evt.payload.overall_bytes_downloaded,
          total: evt.payload.overall_bytes_total,
        },
      });
    });
    const unModelStatus = await listen<string>('ai-model-status-changed', async (evt) => {
      await get().refreshSettings();
      if (evt.payload !== 'downloading') {
        set({ downloadProgress: null });
      }
    });

    return () => {
      unReady();
      unGenerating();
      unError();
      unModelProgress();
      unModelStatus();
    };
  },
}));

export const selectBriefingVisible = (s: AiStore) =>
  s.briefing.status !== 'hidden';
