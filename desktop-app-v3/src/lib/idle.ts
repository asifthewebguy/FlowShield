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
  /** Set when `resume`/`endSession` fails; shown inline in the prompt.
   *  The prompt stays open (state isn't cleared) so the failure is visible
   *  rather than the dialog silently vanishing while the session is left
   *  in a possibly-wrong state. */
  error: string | null;

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
  error: null,

  bootstrap: async () => {
    const unlistenStarted = await listen<IdlePayload>('tracker-idle-started', async () => {
      const session = useSessionStore.getState().current;
      // Nothing running, or the user paused it themselves: leave it alone.
      if (!session || session.completed || session.isPaused) return;
      try {
        await useSessionStore.getState().togglePause('pause');
        set({ autoPausedSessionId: session.id, awaySeconds: null, error: null });
      } catch (err) {
        // Non-fatal: the auto-pause call failed, so the session is left
        // running unpaused (no store state changes here — just a log).
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
    set({ error: null });
    try {
      // `IdlePrompt` is mounted app-wide (App.tsx), but the store's two
      // freshness mechanisms (Pusher subscription, 30s poll) both live in
      // `DashboardPage`, which may be unmounted (e.g. user idled on a
      // settings route). Refresh explicitly so the identity check below
      // sees real state, not a stale snapshot.
      await useSessionStore.getState().refresh();
      const { autoPausedSessionId } = get();
      const session = useSessionStore.getState().current;
      // The session may have been ended or resumed from another device
      // while we were away; only resume the exact session we paused, and
      // only if it is still paused. If it's no longer relevant, there's
      // nothing to resume — just close the prompt.
      if (!session || session.id !== autoPausedSessionId || !session.isPaused) {
        set({ autoPausedSessionId: null, awaySeconds: null });
        return;
      }
      await useSessionStore.getState().togglePause('resume');
      set({ autoPausedSessionId: null, awaySeconds: null });
    } catch (err) {
      // Keep the prompt open (don't clear autoPausedSessionId/awaySeconds)
      // so the failure is visible instead of the dialog silently closing
      // while the session sits in a possibly-wrong state.
      // eslint-disable-next-line no-console
      console.warn('[idle] resume failed', err);
      set({ error: 'Could not resume the session. Please try again.' });
    }
  },

  endSession: async () => {
    set({ error: null });
    try {
      await useSessionStore.getState().refresh();
      const { autoPausedSessionId } = get();
      const session = useSessionStore.getState().current;
      // Only end the exact session we auto-paused. If it was already
      // ended or replaced elsewhere while we were away, there's nothing
      // for us to end — just close the prompt.
      if (!session || session.id !== autoPausedSessionId) {
        set({ autoPausedSessionId: null, awaySeconds: null });
        return;
      }
      await useSessionStore.getState().end();
      set({ autoPausedSessionId: null, awaySeconds: null });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[idle] end session failed', err);
      set({ error: 'Could not end the session. Please try again.' });
    }
  },

  dismiss: () => set({ autoPausedSessionId: null, awaySeconds: null, error: null }),
}));

/** Selector: should the "welcome back" dialog render right now? */
export function selectShowIdlePrompt(state: IdleState): boolean {
  return state.awaySeconds !== null && state.autoPausedSessionId !== null;
}
