'use client';

import { useState } from 'react';
import useSWR from 'swr';

interface LeaderboardEntry {
    rank: number;
    userId: string;
    name: string;
    minutes: number;
    isCurrentUser: boolean;
}

const fetcher = (url: string) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('No token');
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json());
};

export default function LeaderboardWidget() {
    const [period, setPeriod] = useState<'week' | 'all-time'>('week');
    const { data, isLoading } = useSWR(`/api/leaderboard?period=${period}`, fetcher);

    const entries: LeaderboardEntry[] = data?.leaderboard || [];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>🏆</span> Leaderboard
                </h2>
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                        onClick={() => setPeriod('week')}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${period === 'week'
                                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                    >
                        This Week
                    </button>
                    <button
                        onClick={() => setPeriod('all-time')}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${period === 'all-time'
                                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                    >
                        All Time
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {entries.length === 0 ? (
                        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                            No activity yet. Be the first to focus!
                        </div>
                    ) : (
                        entries.map((entry) => (
                            <div
                                key={entry.userId}
                                className={`flex items-center p-3 rounded-lg transition-colors ${entry.isCurrentUser
                                        ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
                                    }`}
                            >
                                <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold mr-3 ${entry.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                        entry.rank === 2 ? 'bg-gray-200 text-gray-700' :
                                            entry.rank === 3 ? 'bg-orange-100 text-orange-700' :
                                                'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm'
                                    }`}>
                                    {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                                </div>

                                <div className="flex-1">
                                    <div className={`font-medium ${entry.isCurrentUser ? 'text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-white'}`}>
                                        {entry.name} {entry.isCurrentUser && '(You)'}
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="font-bold text-gray-900 dark:text-white">
                                        {Math.round(entry.minutes / 60)}h {entry.minutes % 60}m
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                        focused
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
