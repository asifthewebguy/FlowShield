import { Button } from './Button';
import { useIdleStore, selectShowIdlePrompt } from '../lib/idle';

function formatAway(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins === 1 ? '1 minute' : `${mins} minutes`;
}

/**
 * Modal shown when the user returns after the tracker auto-paused their
 * focus session for inactivity. Three exits: resume, end, or leave paused.
 * Mounted once in App.tsx so it works on every route.
 */
export function IdlePrompt() {
  const visible = useIdleStore(selectShowIdlePrompt);
  const awaySeconds = useIdleStore((s) => s.awaySeconds);
  const resume = useIdleStore((s) => s.resume);
  const endSession = useIdleStore((s) => s.endSession);
  const dismiss = useIdleStore((s) => s.dismiss);

  if (!visible || awaySeconds === null) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-xl border border-surface-3 bg-surface-1 p-6 shadow-lg">
        <h2 id="idle-prompt-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Welcome back
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          You were away for {formatAway(awaySeconds)}. Your focus session was paused while you were gone.
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => void resume()}>
            Resume session
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => void endSession()}>
            End session
          </Button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 w-full text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Keep it paused
        </button>
      </div>
    </div>
  );
}
