import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link } from 'react-router-dom';
import type { Preferences } from '../lib/preferences';

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as { message?: string; error?: string };
    return obj.message ?? obj.error ?? fallback;
  }
  return fallback;
}

export default function SettingsTrackingPage() {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [share, setShare] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, prefs] = await Promise.all([
          invoke<boolean>('tracking_paused_get'),
          invoke<Preferences>('prefs_load'),
        ]);
        if (!cancelled) {
          setPaused(p);
          setShare(prefs.shareWindowDetails);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Could not load tracking settings'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePaused = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await invoke('tracking_set_paused', { paused: next });
      setPaused(next);
    } catch (err) {
      setError(errorMessage(err, 'Could not update tracking state'));
    } finally {
      setBusy(false);
    }
  };

  const toggleShare = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const prefs = await invoke<Preferences>('prefs_set_share_window_details', { enabled: next });
      setShare(prefs.shareWindowDetails);
    } catch (err) {
      setError(errorMessage(err, 'Could not update privacy setting'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-surface-3">
        <div className="text-lg font-bold">Tracking &amp; privacy</div>
        <Link to="/" className="text-sm text-primary-500 hover:underline">
          Back to dashboard
        </Link>
      </header>

      <main className="flex-1 px-6 py-6 max-w-2xl space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="rounded-lg border border-surface-3 bg-surface-1 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            Activity tracking
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              disabled={busy || paused === null}
              checked={paused === true}
              onChange={(e) => void togglePaused(e.target.checked)}
            />
            <span>
              <span className="font-medium">Pause tracking</span>
              <span className="block text-sm text-gray-600 dark:text-gray-400">
                While paused, FlowShield records nothing about which apps or windows you use.
                Tracking resumes automatically the next time the app starts.
              </span>
            </span>
          </label>
        </section>

        <section className="rounded-lg border border-surface-3 bg-surface-1 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            What leaves this computer
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              disabled={busy || share === null}
              checked={share === true}
              onChange={(e) => void toggleShare(e.target.checked)}
            />
            <span>
              <span className="font-medium">Share window titles and URLs with FlowShield</span>
              <span className="block text-sm text-gray-600 dark:text-gray-400">
                Off: only app names and durations are uploaded. Window titles and page URLs stay
                in the local database on this computer. This setting is shared with the web app.
              </span>
            </span>
          </label>
        </section>
      </main>
    </div>
  );
}
