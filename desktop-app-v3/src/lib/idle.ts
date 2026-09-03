import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useSessionStore } from './sessions';

/** Mirrors `IdlePayload` in src-tauri/src/tracker/mod.rs (serde camelCase). */
export interface IdlePayload {
  idleSeconds: number;
}

interface IdleState {
  /** Session we auto-paused when the user went idle. Null = we paused nothing. */
  autoPausedSessionId: string | null;
  /** Total away time once the user returns; non-null drives the prompt. */
  awaySeconds: number | null;

  /** Subscribe to the tracker's idle events. App.tsx calls this once on
   *  mount and stores the unlisten fn for cleanup. */
  bootstrap: () => Promise<UnlistenFn>;
  /** Prompt: "Resume session". */
  resume: () => Promise<void>;
  /** Prompt: "End session". */
  endSession: () => Promise<void>;
  /** Prompt: "Keep it paused" — close the dialog, leave the session paused. */
  dismiss: () => void;
}

export const useIdleStore = create<IdleState>((set, get) => ({
  autoPausedSessionId: null,
  awaySeconds: null,

  bootstrap: async () => {
    const unlistenStarted = await listen<IdlePayload>('tracker-idle-started', async () => {
      const session = useSessionStore.getState().current;
      // Nothing running, or the user paused it themselves: leave it alone.
      if (!session || session.completed || session.isPaused) return;
      try {
        await useSessionStore.getState().togglePause('pause');
        set({ autoPausedSessionId: session.id, awaySeconds: null });
      } catch (err) {
        // Non-fatal: the session simply keeps running. Store already set `error`.
        // eslint-disable-next-line no-console
        console.warn('[idle] auto-pause failed', err);
      }
    });

    const unlistenEnded = await listen<IdlePayload>('tracker-idle-ended', (event) => {
      if (!get().autoPausedSessionId) return;
      set({ awaySeconds: event.payload.idleSeconds });
    });

    return () => {
      unlistenStarted();
      unlistenEnded();
    };
  },

  resume: async () => {
    const { autoPausedSessionId } = get();
    const session = useSessionStore.getState().current;
    set({ autoPausedSessionId: null, awaySeconds: null });
    // The session may have been ended or resumed from another device while
    // we were away; only resume the exact session we paused, and only if it
    // is still paused.
    if (!session || session.id !== autoPausedSessionId || !session.isPaused) return;
    await useSessionStore.getState().togglePause('resume');
  },

  endSession: async () => {
    set({ autoPausedSessionId: null, awaySeconds: null });
    await useSessionStore.getState().end();
  },

  dismiss: () => set({ autoPausedSessionId: null, awaySeconds: null }),
}));

/** Selector: should the "welcome back" dialog render right now? */
export function selectShowIdlePrompt(state: IdleState): boolean {
  return state.awaySeconds !== null && state.autoPausedSessionId !== null;
}
