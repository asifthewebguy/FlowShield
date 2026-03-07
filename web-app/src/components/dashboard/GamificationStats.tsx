'use client';

import { calculateUserLevel, checkBadges } from '@/lib/productivity';

interface GamificationStatsProps {
    totalMinutes: number;
    totalSessions: number;
    currentStreak: number;
}

export default function GamificationStats({
    totalMinutes,
    totalSessions,
    currentStreak
}: GamificationStatsProps) {
    const level = calculateUserLevel(totalMinutes);
    const badges = checkBadges(totalSessions, totalMinutes, currentStreak);
    const earnedBadges = badges.filter(b => b.achieved);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        Level {level.level}
                    </h3>
                    <div className="text-sm font-medium text-primary-600">
                        {level.title}
                    </div>
                </div>
                <div className="text-2xl">⚡</div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{Math.floor(level.currentLevelMinutes)} min</span>
                    <span>Next Level: {level.nextLevelMinutes - level.currentLevelMinutes}m left</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                    <div
                        className="bg-yellow-500 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${level.progressPercent}%` }}
                    ></div>
                </div>
            </div>

            {/* Badges */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Badges ({earnedBadges.length}/{badges.length})
                </h4>
                <div className="grid grid-cols-5 gap-2">
                    {badges.map((badge) => (
                        <div
                            key={badge.id}
                            className={`aspect-square rounded-lg flex items-center justify-center text-xl cursor-help relative group ${badge.achieved
                                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 grayscale'
                                }`}
                            title={badge.name}
                        >
                            {badge.icon}

                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                {badge.name}: {badge.description}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
