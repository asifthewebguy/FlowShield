'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { getToken } from '@/lib/auth-token';
import { authFetcher } from '@/lib/swr-fetcher';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface Task {
    id: string;
    title: string;
    status: 'TODO' | 'DOING' | 'DONE';
    tags: string[];
}

const STATUS_ORDER = ['TODO', 'DOING', 'DONE'] as const;

const STATUS_LABELS: Record<Task['status'], string> = {
    TODO: 'To Do',
    DOING: 'Doing',
    DONE: 'Done',
};

const NEXT_STATUS: Record<Task['status'], Task['status']> = {
    TODO: 'DOING',
    DOING: 'DONE',
    DONE: 'TODO',
};

export default function TaskList() {
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [writeError, setWriteError] = useState<string | null>(null);

    const query = activeTag ? `?tag=${encodeURIComponent(activeTag)}` : '';
    const { data, error, mutate } = useSWR(`/api/tasks${query}`, authFetcher);
    // Unfiltered fetch so the tag-filter chips stay stable while a filter is active.
    // Shares SWR's cache when activeTag is null (same key as above).
    const { data: allTasksData, mutate: mutateAllTasks } = useSWR('/api/tasks', authFetcher);

    const tasks: Task[] = data?.tasks || [];
    const allTags = Array.from(new Set<string>((allTasksData?.tasks || []).flatMap((t: Task) => t.tags))).sort();

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle) return;

        setSubmitting(true);
        setWriteError(null);
        try {
            const token = getToken();
            const body: Record<string, unknown> = { title: trimmedTitle };
            if (dueDate) body.dueAt = new Date(dueDate).toISOString();

            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                setTitle('');
                setDueDate('');
                mutate();
                mutateAllTasks();
            } else {
                const data = await response.json().catch(() => ({}));
                setWriteError(data.error || 'Failed to add task');
            }
        } catch (error) {
            console.error('Failed to add task', error);
            setWriteError('Failed to add task');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCycleStatus = async (task: Task) => {
        setWriteError(null);
        try {
            const token = getToken();
            const response = await fetch(`/api/tasks/${task.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: NEXT_STATUS[task.status] }),
            });
            if (response.ok) {
                mutate();
                mutateAllTasks();
            } else {
                const data = await response.json().catch(() => ({}));
                setWriteError(data.error || 'Failed to update task');
            }
        } catch (error) {
            console.error('Failed to update task', error);
            setWriteError('Failed to update task');
        }
    };

    return (
        <Card>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                Tasks
            </h3>

            <form onSubmit={handleAdd} className="flex flex-wrap gap-2 mb-4">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Add a task..."
                    className="flex-1 min-w-[140px] px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
                <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    aria-label="Due date"
                    className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
                <button
                    type="submit"
                    disabled={submitting || !title.trim()}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
                >
                    Add
                </button>
            </form>

            {allTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                    <button
                        type="button"
                        onClick={() => setActiveTag(null)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${activeTag === null
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                            }`}
                    >
                        All
                    </button>
                    {allTags.map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => setActiveTag(tag)}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${activeTag === tag
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                }`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            )}

            {writeError && (
                <p className="text-sm text-danger-600 dark:text-danger-400 mb-2">{writeError}</p>
            )}

            {error ? (
                <p className="text-sm text-danger-600 dark:text-danger-400">Failed to load tasks.</p>
            ) : tasks.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No tasks yet</p>
            ) : (
                <div className="space-y-4">
                    {STATUS_ORDER.map((status) => {
                        const group = tasks.filter((t) => t.status === status);
                        if (group.length === 0) return null;

                        return (
                            <div key={status}>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                                    {STATUS_LABELS[status]}
                                </div>
                                <div className="space-y-2">
                                    {group.map((task) => (
                                        <div
                                            key={task.id}
                                            className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                                        >
                                            <div className="min-w-0">
                                                <div className="text-sm text-gray-900 dark:text-white truncate">
                                                    {task.title}
                                                </div>
                                                {task.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {task.tags.map((tag) => (
                                                            <Badge key={tag} variant="default">
                                                                {tag}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleCycleStatus(task)}
                                                className="shrink-0 text-xs px-2.5 py-1 rounded-full font-medium bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-colors"
                                            >
                                                {STATUS_LABELS[task.status]}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
