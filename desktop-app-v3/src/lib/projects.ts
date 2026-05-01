import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Project {
  id: string;
  name: string;
  color?: string | null;
}

interface ProjectsState {
  items: Project[];
  loading: boolean;
  error: string | null;
  /** Load (or refresh) the user's project list. */
  refresh: () => Promise<void>;
  /** Create a new project; appends to items + returns it. */
  create: (name: string) => Promise<Project>;
}

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as { message?: string; error?: string };
    return obj.message ?? obj.error ?? fallback;
  }
  return fallback;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const items = await invoke<Project[]>('projects_list');
      set({ items, loading: false });
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load projects'), loading: false });
    }
  },

  create: async (name) => {
    set({ loading: true, error: null });
    try {
      const created = await invoke<Project>('projects_create', { name });
      set({ items: [...get().items, created], loading: false });
      return created;
    } catch (err) {
      const msg = errorMessage(err, 'Failed to create project');
      set({ error: msg, loading: false });
      throw new Error(msg);
    }
  },
}));
