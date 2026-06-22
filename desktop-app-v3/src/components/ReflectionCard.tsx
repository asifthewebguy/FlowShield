import { useEffect, useState } from 'react';
import { useAIStore } from '../lib/ai';

/**
 * Evening reflection prompt. Renders only when the backend has a pending
 * question (status === 'pending'). The user types an answer and submits;
 * the answer feeds tomorrow's briefing. Hidden once answered or when no
 * question exists. Mirrors BriefingCard's render-from-store pattern.
 */
export function ReflectionCard() {
  const reflection = useAIStore((s) => s.reflection);
  const refresh = useAIStore((s) => s.refreshReflection);
  const submit = useAIStore((s) => s.submitReflectionAnswer);

  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (reflection.status !== 'pending') return null;

  const onSubmit = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      await submit(answer.trim());
      setAnswer('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4 mb-4">
      <div className="text-xs text-primary-600 dark:text-primary-400 mb-2">
        🌙 Evening reflection
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">{reflection.question}</p>
      <textarea
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
        rows={2}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="A sentence or two…"
        disabled={busy}
      />
      <div className="mt-2 flex justify-end">
        <button
          className="rounded bg-primary-500 px-3 py-1 text-sm text-white disabled:opacity-50"
          onClick={() => void onSubmit()}
          disabled={busy || !answer.trim()}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
