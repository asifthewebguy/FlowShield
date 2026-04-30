'use client';

import { useState } from 'react';

interface HeatmapData {
    date: string;
    count: number;
}

interface HeatmapWidgetProps {
    data: HeatmapData[];
    year?: number;
}

/**
 * Longest run of consecutive days with focus minutes > 0. Days are walked
 * in calendar order (the `days` array is already chronological).
 */
function computeMaxStreak(days: HeatmapData[]): number {
    let best = 0;
    let current = 0;
    for (const day of days) {
        if (day.count > 0) {
            current++;
            if (current > best) best = current;
        } else {
            current = 0;
        }
    }
    return best;
}

export default function HeatmapWidget({ data, year = new Date().getFullYear() }: HeatmapWidgetProps) {
    const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number } | null>(null);

    // Helper to get color intensity
    const getColor = (count: number) => {
        if (count === 0) return 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
        if (count < 30) return 'bg-green-100 dark:bg-green-900 border-green-200 dark:border-green-800';
        if (count < 60) return 'bg-green-300 dark:bg-green-700 border-green-400 dark:border-green-600';
        if (count < 120) return 'bg-green-500 dark:bg-green-500 border-green-600 dark:border-green-400';
        return 'bg-green-700 dark:bg-green-400 border-green-800 dark:border-green-300';
    };

    // Generate calendar grid
    const days = [];
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    // Adjust start date to align with Sunday (optional, standard calendar view)
    // For a contribution graph, usually we show columns by week.
    // Let's stick to a simple grid for now or a week-by-week layout.
    // GitHub style: Rows = Days of Week (Mon-Sun), Cols = Weeks.

    // Let's do a simplified version: Flex wrap of squares.
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        // Use local date string YYYY-MM-DD to match API which returns YYYY-MM-DD based on DB date
        // CA locale is YYYY-MM-DD
        const isoDate = d.toLocaleDateString('en-CA');
        const dayData = data.find(item => item.date === isoDate) || { date: isoDate, count: 0 };
        days.push(dayData);
    }

    // Calculate stats
    const totalMinutes = data.reduce((sum, item) => sum + item.count, 0);
    const activeDays = data.filter(item => item.count > 0).length;
    const maxStreak = computeMaxStreak(days);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        Focus Year {year}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                        {totalMinutes} minutes focused across {activeDays} active days
                        {maxStreak > 0 && ` · ${maxStreak}-day streak`}
                    </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Less</span>
                    <div className="w-3 h-3 bg-gray-100 dark:bg-gray-800 rounded-sm border border-gray-200 dark:border-gray-700"></div>
                    <div className="w-3 h-3 bg-green-100 dark:bg-green-900 rounded-sm"></div>
                    <div className="w-3 h-3 bg-green-300 dark:bg-green-700 rounded-sm"></div>
                    <div className="w-3 h-3 bg-green-500 dark:bg-green-500 rounded-sm"></div>
                    <div className="w-3 h-3 bg-green-700 dark:bg-green-400 rounded-sm"></div>
                    <span>More</span>
                </div>
            </div>

            {/* Heatmap Grid */}
            <div className="relative">
                <div className="flex flex-wrap gap-1">
                    {days.map((day) => (
                        <div
                            key={day.date}
                            onMouseEnter={() => setHoveredDay(day)}
                            onMouseLeave={() => setHoveredDay(null)}
                            className={`w-3 h-3 md:w-4 md:h-4 rounded-sm border transition-colors cursor-pointer ${getColor(day.count)}`}
                            title={`${day.count} minutes on ${day.date}`}
                        />
                    ))}
                </div>

                {/* Tooltip */}
                {hoveredDay && (
                    <div className="absolute top-0 right-0 bg-gray-900 text-white text-xs py-1 px-2 rounded shadow-lg pointer-events-none z-10">
                        <div className="font-bold">{new Date(hoveredDay.date).toLocaleDateString()}</div>
                        <div>{hoveredDay.count} minutes</div>
                    </div>
                )}
            </div>
        </div>
    );
}
