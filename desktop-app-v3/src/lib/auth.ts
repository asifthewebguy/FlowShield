import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  /** Restore persisted auth from the secure store (idempotent). */
  hydrate: () => Promise<void>;
  /** POST /api/auth/login — sets state and persists on success. */
  login: (email: string, password: string) => Promise<void>;
  /** Wipes session locally and on the secure store. */
  logout: () => Promise<void>;
}

/**
 * AuthError preserves the API's `code` (e.g. EMAIL_NOT_VERIFIED) so screens
 * can show specific copy / CTAs instead of parsing message strings.
 */
export class AuthError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, opts?: { code?: string; status?: number }) {
    super(message);
    this.name = 'AuthError';
    this.code = opts?.code;
    this.status = opts?.status;
  }
}

interface RawLoginResponse {
  token: string;
  user: AuthUser;
}

/**
 * Auth store. Token + user are mirrored to the Rust backend via Tauri commands
 * so background services (activity tracker, sync) can read them without going
 * through the webview.
 */
export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const stored = await invoke<{ token: string; user: AuthUser } | null>('auth_load');
      if (stored?.token && stored.user) {
        set({ token: stored.token, user: stored.user, hydrated: true });
        return;
      }
    } catch {
      // Hydration is best-effort. Failing here means the user just sees the login screen.
    }
    set({ hydrated: true });
  },

  login: async (email, password) => {
    const result = await invoke<RawLoginResponse>('auth_login', { email, password }).catch(
      (err: unknown) => {
        // Tauri command errors come back as strings or { error, code, status }.
        if (typeof err === 'string') {
          throw new AuthError(err);
        }
        if (err && typeof err === 'object') {
          const obj = err as { message?: string; error?: string; code?: string; status?: number };
          throw new AuthError(obj.message ?? obj.error ?? 'Login failed', {
            code: obj.code,
            status: obj.status,
          });
        }
        throw new AuthError('Login failed');
      }
    );

    set({ token: result.token, user: result.user });
  },

  logout: async () => {
    try {
      await invoke('auth_logout');
    } finally {
      set({ token: null, user: null });
    }
  },
}));
