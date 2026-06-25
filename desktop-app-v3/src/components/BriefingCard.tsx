import { useEffect } from 'react';
import { useAIStore, selectBriefingVisible } from '../lib/ai';

/**
 * Top-of-dashboard card that renders the day's AI briefing. Four render
 * states: skeleton (generating), ready (text), error (with retry hint),
 * hidden (no labs / no model / empty state). The store decides which
 * state we're in; this component just renders.
 */
export function BriefingCard() {
  const briefing = useAIStore((s) => s.briefing);
  const visible = useAIStore(selectBriefingVisible);
  const refresh = useAIStore((s) => s.refreshBriefing);
  const generate = useAIStore((s) => s.generateBriefing);
  const deleteBriefing = useAIStore((s) => s.deleteBriefing);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!visible) return null;

  if (briefing.status === 'generating') {
    return (
      <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4 mb-4 animate-pulse">
        <div className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400">
          <span>✨</span>
          <span>Generating today's briefing… ~30s</span>
        </div>
      </div>
    );
  }

  if (briefing.status === 'empty_state') {
    const { sessions, needed } = briefing;
    const remaining = Math.max(0, needed - sessions);
    const pct = needed > 0 ? Math.min(100, (sessions / needed) * 100) : 0;
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 mb-4">
        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          ✨ {sessions} of {needed} focus sessions
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full bg-primary-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
          Complete {remaining} more to unlock your AI briefing · counts sessions completed since Local AI was enabled
        </div>
      </div>
    );
  }

  if (briefing.status === 'idle') {
    return (
      <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4 mb-4">
        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          ✨ Your AI briefing is ready to generate.
        </div>
        <button
          className="rounded bg-primary-500 px-3 py-1 text-sm text-white"
          onClick={() => void generate()}
        >
          Generate today's briefing
        </button>
      </div>
    );
  }

  if (briefing.status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 p-4 mb-4">
        <div className="text-sm text-red-700 dark:text-red-300">
          ✨ Briefing unavailable: {briefing.message}
        </div>
      </div>
    );
  }

  // status === 'ready' (hidden already excluded by the !visible guard above,
  // but TypeScript can't narrow through the Zustand selector, so assert here)
  if (briefing.status !== 'ready') return null;

  const generatedAt = new Date(briefing.generated_at);
  const generatedAtLabel = isNaN(generatedAt.getTime())
    ? ''
    : ` · generated ${generatedAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;

  return (
    <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-primary-600 dark:text-primary-400">
          ✨ Today's briefing{generatedAtLabel}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded px-2 py-0.5 text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-500/20"
            // Generation is gated on the Idle state, so a Ready card must first
            // clear today's row (-> Idle) before generate will actually run.
            onClick={() => void deleteBriefing().then(() => generate())}
          >
            Regenerate
          </button>
          <button
            aria-label="Delete briefing"
            className="rounded px-1.5 py-0.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-primary-500/20"
            onClick={() => void deleteBriefing()}
          >
            ✕
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{briefing.text}</p>
    </div>
  );
}
