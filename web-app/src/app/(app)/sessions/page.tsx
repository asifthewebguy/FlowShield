'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getToken } from '@/lib/auth-token';
import EditDurationModal from '@/components/sessions/EditDurationModal';

interface SessionRow {
  id: string;
  startTime: string;
  endTime: string | null;
  plannedDuration: number;
  actualDuration: number | null;
  sessionType: string;
  completed: boolean;
  project: { id: string; name: string; color: string } | null;
}

const fetcher = async (url: string) => {
  const token = getToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionsHistoryPage() {
  const { data, error, mutate, isLoading } = useSWR<{ sessions: SessionRow[] }>(
    '/api/sessions?limit=50',
    fetcher
  );
  const [editing, setEditing] = useState<SessionRow | null>(null);

  const sessions = data?.sessions ?? [];

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Session history</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Review and correct past session durations.
        </p>
      </div>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger-500">Failed to load sessions. Please refresh.</p>
        </Card>
      )}

      {isLoading && (
        <Card>
          <p className="text-sm text-gray-500">Loading…</p>
        </Card>
      )}

      {!isLoading && sessions.length === 0 && (
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No sessions yet. Start one from the dashboard.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {sessions.map((s) => {
          const actualMin = s.actualDuration ?? (s.completed ? s.plannedDuration : null);
          const durationDiffers =
            s.completed &&
            s.actualDuration !== null &&
            Math.abs(s.actualDuration - s.plannedDuration) >= 1;

          return (
            <Card key={s.id} variant="elevated" padding="md">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatDate(s.startTime)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {s.sessionType.toLowerCase()}
                    </span>
                    {s.project && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${s.project.color}20`, color: s.project.color }}
                      >
                        {s.project.name}
                      </span>
                    )}
                    {!s.completed && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        In progress
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Planned {s.plannedDuration} min
                    {actualMin !== null && (
                      <>
                        {' · '}
                        Actual <span className={durationDiffers ? 'font-semibold text-amber-600' : ''}>
                          {actualMin} min
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(s)}
                  disabled={!s.completed}
                >
                  Edit duration
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {editing && (
        <EditDurationModal
          session={{
            id: editing.id,
            startTime: editing.startTime,
            endTime: editing.endTime,
            plannedDuration: editing.plannedDuration,
            actualDuration: editing.actualDuration,
          }}
          onClose={() => setEditing(null)}
          onSaved={() => mutate()}
        />
      )}
    </div>
  );
}
