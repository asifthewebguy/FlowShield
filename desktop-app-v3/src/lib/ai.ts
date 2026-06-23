import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// Mirrors the Rust `BriefingState` enum (serde tagged on `status`).
export type BriefingState =
  | { status: 'ready'; text: string; generated_at: string }
  | { status: 'generating' }
  | { status: 'idle' }
  | { status: 'empty_state'; sessions: number; needed: number }
  | { status: 'hidden' }
  | { status: 'error'; message: string };

// Mirrors the Rust `ReflectionState` enum (serde tagged on `status`).
export type ReflectionState =
  | { status: 'pending'; question: string }
  | { status: 'answered' }
  | { status: 'hidden' };

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
  reflection: ReflectionState;
  settings: AiSettings | null;
  downloadProgress: DownloadProgress | null;
  refreshBriefing: () => Promise<void>;
  generateBriefing: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setLabsEnabled: (enabled: boolean) => Promise<void>;
  refreshReflection: () => Promise<void>;
  submitReflectionAnswer: (answer: string) => Promise<void>;
  bootstrap: () => Promise<UnlistenFn>;
}

export const useAIStore = create<AiStore>((set, get) => ({
  briefing: { status: 'hidden' },
  reflection: { status: 'hidden' },
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

  generateBriefing: async () => {
    // Optimistic: flip to generating immediately; the backend also emits
    // `ai-briefing-generating`, and `ai-briefing-ready` drives the refresh.
    set({ briefing: { status: 'generating' } });
    try {
      await invoke('ai_briefing_generate');
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

  refreshReflection: async () => {
    try {
      const state = await invoke<ReflectionState>('ai_reflection_today');
      set({ reflection: state });
    } catch (e) {
      console.error('ai_reflection_today failed:', e);
      set({ reflection: { status: 'hidden' } });
    }
  },

  submitReflectionAnswer: async (answer) => {
    await invoke('ai_reflection_answer', { answer });
    await get().refreshReflection();
  },

  bootstrap: async () => {
    await get().refreshSettings();
    await get().refreshBriefing();
    await get().refreshReflection();

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

    const unReflectionReady = await listen<string>('ai-reflection-ready', () => {
      void get().refreshReflection();
    });
    const unReflectionAnswered = await listen<string>('ai-reflection-answered', () => {
      void get().refreshReflection();
    });

    return () => {
      unReady();
      unGenerating();
      unError();
      unModelProgress();
      unModelStatus();
      unReflectionReady();
      unReflectionAnswered();
    };
  },
}));

export const selectBriefingVisible = (s: AiStore) =>
  s.briefing.status !== 'hidden';
