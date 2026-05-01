import { useEffect, useRef, useState } from 'react';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { useAuthStore } from '../lib/auth';
import { useSessionStore } from '../lib/sessions';
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
  const [duration, setDuration] = useState(25);
  const [type, setType] = useState<typeof SESSION_TYPES[number]>('WORK');
  const cooldown = useCooldown();
  const previousSessionIdRef = useRef<string | null>(null);

  // Pull active session from server on mount so we pick up sessions started elsewhere.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Detect the active → null transition (auto-end OR manual End) and fire
  // notification + start cooldown. Tracks previous session id via ref so we
  // only fire once per ended session, not on every re-render.
  useEffect(() => {
    const prev = previousSessionIdRef.current;
    const cur = current?.id ?? null;
    if (prev && !cur) {
      void notifySessionDone();
      cooldown.start();
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
              onStart={() => void start(duration, type)}
            />
          )}
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
  onStart,
}: {
  duration: number;
  setDuration: (n: number) => void;
  type: typeof SESSION_TYPES[number];
  setType: (t: typeof SESSION_TYPES[number]) => void;
  loading: boolean;
  cooldownRemainingMs: number;
  onStart: () => void;
}) {
  const inCooldown = cooldownRemainingMs > 0;
  const cdMin = Math.floor(cooldownRemainingMs / 60_000);
  const cdSec = Math.floor((cooldownRemainingMs % 60_000) / 1000);
  const cdLabel = `${cdMin}:${String(cdSec).padStart(2, '0')}`;

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
