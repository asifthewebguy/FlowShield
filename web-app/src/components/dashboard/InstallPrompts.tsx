'use client';

import { useState, useEffect } from 'react';
import { getToken } from '@/lib/auth-token';

const DISMISS_KEY = 'flowshield:installPrompts';
const DISMISS_DAYS = 7;

type DismissState = Partial<Record<'chrome' | 'desktop', string>>;

function getDismissState(): DismissState {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
  } catch {
    return {};
  }
}

function dismiss(platform: 'chrome' | 'desktop'): void {
  const state = getDismissState();
  state[platform] = new Date(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  localStorage.setItem(DISMISS_KEY, JSON.stringify(state));
}

function isDismissed(platform: 'chrome' | 'desktop'): boolean {
  const until = getDismissState()[platform];
  return !!until && new Date(until) > new Date();
}

function detectEnv() {
  if (typeof navigator === 'undefined') return { isChromium: false, isWindows: false };
  const ua = navigator.userAgent;
  const isChromium = /Chrome\//.test(ua) && !/OPR\//.test(ua);
  const isWindows = /Windows NT/.test(ua);
  return { isChromium, isWindows };
}

type Device = { platform?: string; isActive?: boolean };

export default function InstallPrompts() {
  const [showChrome, setShowChrome] = useState(false);
  const [showDesktop, setShowDesktop] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { isChromium, isWindows } = detectEnv();

    // Defer sync state updates to a microtask so React doesn't flag
    // cascading renders (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (cancelled) return;
      if (isChromium && !isDismissed('chrome')) {
        setShowChrome(true);
      }
    });

    if (!isWindows || isDismissed('desktop')) return () => { cancelled = true; };

    const token = getToken();
    if (!token) return () => { cancelled = true; };

    fetch('/api/devices', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { devices?: Device[] } | null) => {
        if (cancelled) return;
        const hasDesktop = (data?.devices || []).some(
          d => d.platform === 'Windows' && d.isActive !== false
        );
        if (!hasDesktop) setShowDesktop(true);
      })
      .catch(() => {
        if (!cancelled) setShowDesktop(true);
      });

    return () => { cancelled = true; };
  }, []);

  const handleDismiss = (platform: 'chrome' | 'desktop') => {
    dismiss(platform);
    if (platform === 'chrome') setShowChrome(false);
    else setShowDesktop(false);
  };

  if (!showChrome && !showDesktop) return null;

  return (
    <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      {showChrome && (
        <PromptCard
          title="Track browser tabs"
          body="Add the FlowShield Chrome extension to track active tabs and categorize sites automatically."
          ctaLabel="Add to Chrome"
          ctaHref="https://chromewebstore.google.com/detail/flowshield/pjjmmmefbcmcckgmdoceapgbdnjbffdg"
          onDismiss={() => handleDismiss('chrome')}
        />
      )}
      {showDesktop && (
        <PromptCard
          title="Go deeper with the desktop app"
          body="Activity tracking, distraction blocking, and offline sync for Windows."
          ctaLabel="Get from Microsoft Store"
          ctaHref="https://apps.microsoft.com/detail/9MX8Q3FQ136L"
          onDismiss={() => handleDismiss('desktop')}
        />
      )}
    </div>
  );
}

function PromptCard({
  title,
  body,
  ctaLabel,
  ctaHref,
  onDismiss,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{title}</p>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{body}</p>
        <div className="mt-3 flex items-center gap-3">
          <a
            href={ctaHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
          >
            {ctaLabel}
          </a>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
