import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { useAuthStore } from '../lib/auth';
import { useSessionStore } from '../lib/sessions';
import { useProjectsStore, type Project } from '../lib/projects';
import { usePrefsStore } from '../lib/preferences';
import { Button } from '../components/Button';
import { Timer } from '../components/Timer';

const DURATION_OPTIONS = [15, 25, 45, 60, 90];
const SESSION_TYPES = ['WORK', 'STUDY', 'CREATIVE'] as const;

const COOLDOWN_KEY = 'flowshield_cooldown_until';
const COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Persistent 5-minute cool-down between sessions. Mirrors the web app's
 * `flowshield_cooldown_until` localStorage convention so users on both
 * clients get consistent UX and the cool-down isn't bypassable by
 * relaunching the desktop.
 */
function useCooldown() {
  const [until, setUntil] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10);
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until, now]);

  const remainingMs = Math.max(0, until - now);

  const start = () => {
    const u = Date.now() + COOLDOWN_MS;
    localStorage.setItem(COOLDOWN_KEY, String(u));
    setUntil(u);
  };

  return { remainingMs, start };
}

/**
 * Fires a desktop notification, requesting permission lazily on first use.
 * Best-effort — silently no-ops if the user denies.
 */
async function notifySessionDone() {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === 'granted';
    }
    if (granted) {
      await sendNotification({
        title: 'Focus session complete',
        body: 'Take a 5-minute break before starting the next one.',
      });
    }
  } catch {
    // Notification not critical — never block on it.
  }
}

export function DashboardPage() {
  const { user, logout } = useAuthStore();
  const { current, loading, error, refresh, start, end, togglePause } = useSessionStore();
  const projects = useProjectsStore();
  const [duration, setDuration] = useState(25);
  const [type, setType] = useState<typeof SESSION_TYPES[number]>('WORK');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const cooldown = useCooldown();
  const previousSessionIdRef = useRef<string | null>(null);
  // Set when we auto-end a session that was already past its planned time at
  // load time (stale cleanup). The next active→null transition skips the
  // cooldown so users aren't punished for the app force-quitting on them.
  const skipNextCooldownRef = useRef(false);

  // Pull active session from server on mount so we pick up sessions started elsewhere.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void projects.refresh();
  }, [projects.refresh]);

  const prefs = usePrefsStore();
  useEffect(() => {
    void prefs.refresh();
  }, [prefs.refresh]);

  // Detect the active → null transition (auto-end OR manual End) and fire
  // notification + start cooldown. Tracks previous session id via ref so we
  // only fire once per ended session, not on every re-render.
  useEffect(() => {
    const prev = previousSessionIdRef.current;
    const cur = current?.id ?? null;
    if (prev && !cur) {
      if (skipNextCooldownRef.current) {
        skipNextCooldownRef.current = false;
      } else {
        void notifySessionDone();
        cooldown.start();
      }
    }
    previousSessionIdRef.current = cur;
  }, [current, cooldown]);

  // Auto-end when the planned duration is up (matches web FocusTimer's
  // auto-end behavior). Single setTimeout that fires once at the planned
  // end; cancelled if the user pauses, ends manually, or the session
  // changes for any other reason.
  useEffect(() => {
    if (!current || current.isPaused || current.completed) return;
    const plannedEndMs =
      new Date(current.startTime).getTime() + current.plannedDuration * 60 * 1000;
    const remainingMs = plannedEndMs - Date.now();
    if (remainingMs <= 0) {
      // Stale session that was already past its end when we loaded it —
      // clean up silently without firing notification or cooldown.
      skipNextCooldownRef.current = true;
      void end();
      return;
    }
    const t = setTimeout(() => {
      void end();
    }, remainingMs);
    return () => clearTimeout(t);
  }, [current, end]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-surface-3">
        <div className="text-lg font-bold">
          Flow<span className="text-primary-500">Shield</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {user?.name ?? user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex-1 p-8 flex flex-col items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {current ? (
            <ActiveSessionView
              loading={loading}
              onPause={() => void togglePause('pause')}
              onResume={() => void togglePause('resume')}
              onEnd={() => void end()}
            />
          ) : (
            <SessionPicker
              duration={duration}
              setDuration={setDuration}
              type={type}
              setType={setType}
              loading={loading}
              cooldownRemainingMs={cooldown.remainingMs}
              projects={projects.items}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              onCreateProject={async (name) => {
                const created = await projects.create(name);
                setSelectedProjectId(created.id);
              }}
              onStart={() => void start(duration, type, selectedProjectId)}
            />
          )}

          <DeepWorkCard
            distractions={prefs.current?.primaryDistractions ?? []}
            loading={prefs.loading}
            error={prefs.error}
          />
        </div>
      </main>
    </div>
  );
}

function SessionPicker({
  duration,
  setDuration,
  type,
  setType,
  loading,
  cooldownRemainingMs,
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onStart,
}: {
  duration: number;
  setDuration: (n: number) => void;
  type: typeof SESSION_TYPES[number];
  setType: (t: typeof SESSION_TYPES[number]) => void;
  loading: boolean;
  cooldownRemainingMs: number;
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onCreateProject: (name: string) => Promise<void>;
  onStart: () => void;
}) {
  const inCooldown = cooldownRemainingMs > 0;
  const cdMin = Math.floor(cooldownRemainingMs / 60_000);
  const cdSec = Math.floor((cooldownRemainingMs % 60_000) / 1000);
  const cdLabel = `${cdMin}:${String(cdSec).padStart(2, '0')}`;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      await onCreateProject(name);
      setNewName('');
      setAdding(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">
          {inCooldown ? 'Take a break' : 'Start a focus session'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {inCooldown
            ? `Next session unlocks in ${cdLabel}.`
            : 'Pick a duration and a session type.'}
        </p>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          Duration
        </div>
        <div className="grid grid-cols-5 gap-2">
          {DURATION_OPTIONS.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => setDuration(min)}
              className={`h-10 rounded-lg border text-sm font-medium transition-colors ${
                duration === min
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-surface-1 text-gray-700 dark:text-gray-300 border-surface-3 hover:bg-surface-2'
              }`}
            >
              {min}m
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          Type
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SESSION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`h-10 rounded-lg border text-sm font-medium transition-colors ${
                type === t
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-surface-1 text-gray-700 dark:text-gray-300 border-surface-3 hover:bg-surface-2'
              }`}
            >
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Project
          </div>
          {!adding && (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setCreateError(null);
              }}
              className="text-xs text-primary-500 hover:underline"
            >
              + New project
            </button>
          )}
        </div>
        {adding ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setNewName('');
                    setCreateError(null);
                  }
                }}
                placeholder="Project name"
                className="flex-1 h-10 rounded-lg border border-surface-3 bg-surface-1 px-3 text-sm focus:outline-none focus:border-primary-500"
                disabled={creating}
              />
              <Button
                type="button"
                variant="primary"
                size="md"
                loading={creating}
                disabled={!newName.trim()}
                onClick={() => void handleCreate()}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                disabled={creating}
                onClick={() => {
                  setAdding(false);
                  setNewName('');
                  setCreateError(null);
                }}
              >
                Cancel
              </Button>
            </div>
            {createError && (
              <div className="text-xs text-red-600 dark:text-red-400">{createError}</div>
            )}
          </div>
        ) : (
          <select
            value={selectedProjectId ?? ''}
            onChange={(e) => onSelectProject(e.target.value || null)}
            className="w-full h-10 rounded-lg border border-surface-3 bg-surface-1 px-3 text-sm focus:outline-none focus:border-primary-500"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
        loading={loading}
        disabled={inCooldown}
        onClick={onStart}
      >
        {inCooldown ? `Cool-down · ${cdLabel}` : `Start ${duration}-minute session`}
      </Button>
    </div>
  );
}

/**
 * Deep-work toggle card. Shows the user's primaryDistractions (configured
 * on the web at flowshield.app/settings) and exposes Apply / Stop buttons
 * that invoke the blocking_apply / blocking_clear Tauri commands. Each
 * action triggers an OS-native elevation prompt (polkit / Keychain / UAC).
 *
 * Phase 6.7 keeps `blocking` UI-only: there's no auto-apply on session
 * start or auto-clear on session end yet. That lifecycle wiring lands in
 * 6.8 once we settle on whether Apply should fire silently or always
 * prompt for elevation.
 */
function DeepWorkCard({
  distractions,
  loading,
  error,
}: {
  distractions: string[];
  loading: boolean;
  error: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  const apply = async () => {
    setBusy(true);
    setOpError(null);
    try {
      await invoke('blocking_apply', { domains: distractions });
      setActive(true);
    } catch (err) {
      setOpError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to apply blocks',
      );
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setOpError(null);
    try {
      await invoke('blocking_clear');
      setActive(false);
    } catch (err) {
      setOpError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to clear blocks',
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading && distractions.length === 0) {
    return (
      <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          Deep work mode
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading distractions…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 p-4">
        <div className="text-xs uppercase tracking-wide text-red-700 dark:text-red-300 mb-1">
          Deep work mode
        </div>
        <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
      </div>
    );
  }

  if (distractions.length === 0) {
    return (
      <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          Deep work mode
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No distraction sites configured. Add some at{' '}
          <span className="font-mono">flowshield.app/settings</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-surface-3 bg-surface-1 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Deep work mode
        </div>
        {active && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">● blocking</span>
        )}
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Block {distractions.length} site{distractions.length === 1 ? '' : 's'} via the OS hosts
        file. Toggling will prompt for your password.
      </p>
      <div className="flex flex-wrap gap-1">
        {distractions.slice(0, 6).map((d) => (
          <span
            key={d}
            className="text-xs font-mono px-2 py-0.5 rounded bg-surface-2 text-gray-700 dark:text-gray-300"
          >
            {d}
          </span>
        ))}
        {distractions.length > 6 && (
          <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
            +{distractions.length - 6} more
          </span>
        )}
      </div>
      {opError && (
        <div className="text-xs text-red-600 dark:text-red-400">{opError}</div>
      )}
      {active ? (
        <Button variant="secondary" size="md" loading={busy} onClick={() => void clear()}>
          Stop blocking
        </Button>
      ) : (
        <Button variant="primary" size="md" loading={busy} onClick={() => void apply()}>
          Block now
        </Button>
      )}
    </div>
  );
}

function ActiveSessionView({
  loading,
  onPause,
  onResume,
  onEnd,
}: {
  loading: boolean;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
}) {
  const current = useSessionStore((s) => s.current);
  if (!current) return null;

  return (
    <div className="space-y-8">
      <Timer session={current} />

      <div className="flex justify-center gap-3">
        {current.isPaused ? (
          <Button variant="secondary" size="md" onClick={onResume} disabled={loading}>
            Resume
          </Button>
        ) : (
          <Button variant="secondary" size="md" onClick={onPause} disabled={loading}>
            Pause
          </Button>
        )}
        <Button variant="danger" size="md" onClick={onEnd} disabled={loading}>
          End session
        </Button>
      </div>
    </div>
  );
}
