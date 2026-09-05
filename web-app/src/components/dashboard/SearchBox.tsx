'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { authFetcher } from '@/lib/swr-fetcher';

interface SearchTask {
    id: string;
    title: string;
}

interface SearchProject {
    id: string;
    name: string;
}

interface SearchSession {
    id: string;
    sessionType: string;
    startTime: string;
    project?: { name: string } | null;
    task?: { title: string } | null;
}

interface SearchResults {
    tasks: SearchTask[];
    projects: SearchProject[];
    sessions: SearchSession[];
}

const DEBOUNCE_MS = 300;

function sessionLabel(session: SearchSession): string {
    if (session.task?.title) return session.task.title;
    if (session.project?.name) return session.project.name;
    const type = session.sessionType.charAt(0) + session.sessionType.slice(1).toLowerCase();
    const time = new Date(session.startTime).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    return `${type} Session – ${time}`;
}

export default function SearchBox() {
    const [value, setValue] = useState('');
    const [debouncedValue, setDebouncedValue] = useState('');
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Debounce: only update the SWR key (and therefore fire a request) 300ms
    // after the user stops typing. Clearing the timer on every change/unmount
    // guarantees at most one pending request per pause in typing.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value.trim()), DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [value]);

    // SWR keys by the debounced query string, so responses are cached per-query —
    // a stale response for an earlier keystroke can never overwrite the latest query's data.
    const { data, error } = useSWR<SearchResults>(
        debouncedValue ? `/api/search?q=${encodeURIComponent(debouncedValue)}` : null,
        authFetcher
    );

    useEffect(() => {
        if (!open) return;

        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    const tasks = data?.tasks || [];
    const projects = data?.projects || [];
    const sessions = data?.sessions || [];
    const hasResults = tasks.length > 0 || projects.length > 0 || sessions.length > 0;
    const showDropdown = open && debouncedValue.length > 0;

    return (
        <div ref={containerRef} className="relative w-full max-w-sm">
            <label htmlFor="dashboard-search" className="sr-only">
                Search tasks, projects, and sessions
            </label>
            <input
                id="dashboard-search"
                type="text"
                value={value}
                onChange={(e) => {
                    setValue(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder="Search tasks, projects, sessions..."
                role="combobox"
                aria-expanded={showDropdown}
                aria-controls="dashboard-search-results"
                aria-autocomplete="list"
                autoComplete="off"
                className="w-full h-10 px-4 rounded-lg bg-white dark:bg-surface-2 border border-gray-200 dark:border-white/[0.08] text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none transition-all duration-150 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 dark:focus:border-primary-500/50"
            />
            {showDropdown && (
                <div
                    id="dashboard-search-results"
                    role="listbox"
                    aria-label="Search results"
                    className="absolute z-40 mt-1 w-full max-h-96 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-surface-2 shadow-lg"
                >
                    {error ? (
                        <p className="p-3 text-sm text-danger-500">Search failed. Try again.</p>
                    ) : !data ? (
                        <p className="p-3 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
                    ) : !hasResults ? (
                        <p className="p-3 text-sm text-gray-500 dark:text-gray-400">No results found</p>
                    ) : (
                        <div className="py-1">
                            {tasks.length > 0 && (
                                <div className="px-3 py-1">
                                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 py-1">
                                        Tasks
                                    </div>
                                    {tasks.map((task) => (
                                        <div
                                            key={task.id}
                                            role="option"
                                            aria-selected="false"
                                            className="px-2 py-1.5 text-sm text-gray-900 dark:text-white truncate rounded-md hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                                        >
                                            {task.title}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {projects.length > 0 && (
                                <div className="px-3 py-1">
                                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 py-1">
                                        Projects
                                    </div>
                                    {projects.map((project) => (
                                        <div
                                            key={project.id}
                                            role="option"
                                            aria-selected="false"
                                            className="px-2 py-1.5 text-sm text-gray-900 dark:text-white truncate rounded-md hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                                        >
                                            {project.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {sessions.length > 0 && (
                                <div className="px-3 py-1">
                                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 py-1">
                                        Sessions
                                    </div>
                                    {sessions.map((session) => (
                                        <div
                                            key={session.id}
                                            role="option"
                                            aria-selected="false"
                                            className="px-2 py-1.5 text-sm text-gray-900 dark:text-white truncate rounded-md hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                                        >
                                            {sessionLabel(session)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
