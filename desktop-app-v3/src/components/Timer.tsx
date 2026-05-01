import { useEffect, useState } from 'react';
import type { Session } from '../lib/sessions';

interface TimerProps {
  session: Session;
}

/**
 * Display-only countdown. Always recomputes from the server-issued
 * `startTime` on every tick — never `prev - 1` (avoids drift across
 * tab/focus changes and matches the project's "Timer drift" gotcha rule).
 *
 * When the session is paused, the display freezes at `pausedAt`.
 */
export function Timer({ session }: TimerProps) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (session.isPaused || session.completed) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session.isPaused, session.completed]);

  const startMs = new Date(session.startTime).getTime();
  const plannedEndMs = startMs + session.plannedDuration * 60 * 1000;
  const referenceMs =
    session.isPaused && session.pausedAt
      ? new Date(session.pausedAt).getTime()
      : tick;
  const remainingMs = Math.max(0, plannedEndMs - referenceMs);

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  const totalMs = session.plannedDuration * 60 * 1000;
  const progressPct = totalMs > 0 ? Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100)) : 0;

  const status = session.isPaused
    ? 'Paused'
    : remainingMs === 0
      ? 'Time up'
      : 'Focusing';

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {status}
      </div>
      <div className="text-7xl font-mono tabular-nums tracking-tight text-gray-900 dark:text-white">
        {mm}:{ss}
      </div>
      <div className="w-full max-w-xs h-2 rounded-full bg-surface-3 overflow-hidden">
        <div
          className="h-full bg-primary-500 transition-all duration-1000 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {session.plannedDuration} min · {session.sessionType.toLowerCase()}
      </div>
    </div>
  );
}
