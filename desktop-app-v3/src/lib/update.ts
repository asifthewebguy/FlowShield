import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// Mirrors the Rust enums in src-tauri/src/update.rs. Serde's
// `rename_all = "snake_case"` produces these exact strings.
export type InstallSource =
  | 'aur'
  | 'app_image_direct'
  | 'linux_package'
  | 'dmg_direct'
  | 'flatpak'
  | 'snap'
  | 'homebrew'
  | 'dev'
  | 'unknown';

export type PromptStyle = 'loud' | 'quiet' | 'none';

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  latest_tag: string;
  release_url: string;
  release_notes_url: string;
  source: InstallSource;
  prompt_style: PromptStyle;
  /** Recommended one-liner for PM channels (e.g. `yay -Syu flowshield-bin`). */
  update_command: string | null;
}

interface UpdateState {
  available: UpdateInfo | null;
  /**
   * Tag the user dismissed the banner for. In-memory only — re-appears on
   * next app launch if still applicable. Reset implicitly when a *newer*
   * tag arrives (the inequality below switches back to true).
   */
  dismissedTag: string | null;

  /** Subscribe to the backend's `update-available` event. App.tsx calls
   *  this once on mount and stores the unlisten fn for cleanup. */
  bootstrap: () => Promise<UnlistenFn>;
  /** Manual trigger — used from a future Settings → "Check for updates"
   *  button. Backend updates the tray itself; this just refreshes state. */
  checkNow: () => Promise<void>;
  /** Dismiss the banner for the currently-known available release. */
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: null,
  dismissedTag: null,

  bootstrap: async () => {
    return listen<UpdateInfo>('update-available', (event) => {
      set({ available: event.payload });
    });
  },

  checkNow: async () => {
    try {
      const info = await invoke<UpdateInfo | null>('update_check_now');
      if (info) set({ available: info });
    } catch (err) {
      // Surface to console — failures are non-fatal (network blip, GitHub
      // rate limit). Backend already logged via tracing.
      // eslint-disable-next-line no-console
      console.warn('[update] check failed', err);
    }
  },

  dismiss: () => {
    const current = get().available;
    if (current) set({ dismissedTag: current.latest_tag });
  },
}));

/** Selector: should the loud in-app banner render right now? */
export function selectShowBanner(state: UpdateState): boolean {
  if (!state.available) return false;
  if (state.available.prompt_style !== 'loud') return false;
  return state.available.latest_tag !== state.dismissedTag;
}
