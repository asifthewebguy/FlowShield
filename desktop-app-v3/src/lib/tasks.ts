import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Task {
  id: string;
  title: string;
  notes?: string | null;
  projectId?: string | null;
  estimateMinutes?: number | null;
  dueAt?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  status: 'TODO' | 'DOING' | 'DONE';
  tags: string[];
}

interface TasksState {
  items: Task[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (title: string, projectId?: string | null) => Promise<Task>;
  update: (id: string, patch: Record<string, unknown>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as { message?: string; error?: string };
    return obj.message ?? obj.error ?? fallback;
  }
  return fallback;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const items = await invoke<Task[]>('tasks_list');
      set({ items, loading: false });
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load tasks'), loading: false });
    }
  },

  create: async (title, projectId = null) => {
    set({ loading: true, error: null });
    try {
      const created = await invoke<Task>('tasks_create', { title, projectId });
      set({ items: [...get().items, created], loading: false });
      return created;
    } catch (err) {
      const msg = errorMessage(err, 'Failed to create task');
      set({ error: msg, loading: false });
      throw new Error(msg);
    }
  },

  update: async (id, patch) => {
    const previous = get().items;
    // Optimistic — the command queues offline and doesn't return the
    // server's copy, so we apply the patch locally right away.
    set({ items: previous.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    try {
      await invoke('tasks_update', { id, patch });
    } catch (err) {
      set({ items: previous, error: errorMessage(err, 'Failed to update task') });
      throw err;
    }
  },

  remove: async (id) => {
    const previous = get().items;
    set({ items: previous.filter((t) => t.id !== id) });
    try {
      await invoke('tasks_delete', { id });
    } catch (err) {
      set({ items: previous, error: errorMessage(err, 'Failed to delete task') });
      throw err;
    }
  },
}));
