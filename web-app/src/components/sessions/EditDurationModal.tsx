'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { getToken } from '@/lib/auth-token';

interface SessionSummary {
  id: string;
  startTime: string;
  endTime: string | null;
  plannedDuration: number;
  actualDuration: number | null;
}

interface EditDurationModalProps {
  session: SessionSummary;
  onClose: () => void;
  onSaved: () => void;
}

function toDatetimeLocalValue(iso: string | null, fallback: Date): string {
  const d = iso ? new Date(iso) : fallback;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditDurationModal({ session, onClose, onSaved }: EditDurationModalProps) {
  const start = new Date(session.startTime);
  const defaultEnd = session.endTime
    ? new Date(session.endTime)
    : new Date(start.getTime() + session.plannedDuration * 60 * 1000);

  const [endValue, setEndValue] = useState<string>(toDatetimeLocalValue(session.endTime, defaultEnd));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewMinutes = (() => {
    const endMs = new Date(endValue).getTime();
    if (Number.isNaN(endMs)) return null;
    const diffMin = Math.round((endMs - start.getTime()) / 60000);
    return diffMin;
  })();

  const handleSave = async () => {
    setError(null);
    const endMs = new Date(endValue).getTime();
    if (Number.isNaN(endMs)) {
      setError('Please enter a valid end time.');
      return;
    }
    if (endMs <= start.getTime()) {
      setError('End time must be after the session start.');
      return;
    }

    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endTime: new Date(endMs).toISOString(),
          completed: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to update session.');
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Connection failed. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card variant="elevated" padding="lg" className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Edit session duration</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Adjust the end time. Duration is recalculated automatically.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Session started</label>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {start.toLocaleString()}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1" htmlFor="session-end-input">
              End time
            </label>
            <Input
              id="session-end-input"
              type="datetime-local"
              value={endValue}
              onChange={(e) => setEndValue(e.target.value)}
            />
          </div>

          {previewMinutes !== null && previewMinutes > 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              New duration: <span className="font-semibold">{previewMinutes} min</span>
              {session.actualDuration !== null && session.actualDuration !== previewMinutes && (
                <span className="text-gray-400"> (was {session.actualDuration} min)</span>
              )}
            </div>
          )}

          {error && <div className="text-sm text-danger-500">{error}</div>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}
