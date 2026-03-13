'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import { getToken, removeToken } from '@/lib/auth-token';

interface ActivitySummary {
  totalMinutes: number;
  totalHours: number;
  totalActivities: number;
  productivityScore: number;
  avgActivityLevel: number;
  mostProductiveHour: number;
  dateRange: {
    start: string;
    end: string;
  };
}

interface AppBreakdown {
  name: string;
  minutes: number;
  hours: number;
  count: number;
  category: string;
  percentage: number;
}

interface CategoryStat {
  category: string;
  minutes: number;
  hours: number;
  percentage: number;
}

interface DailyStat {
  date: string;
  minutes: number;
  hours: number;
}

interface HourlyStat {
  hour: number;
  minutes: number;
  percentage: number;
}

interface AnalysisData {
  summary: ActivitySummary;
  topApplications: AppBreakdown[];
  categoryStats: CategoryStat[];
  dailyStats: DailyStat[];
  hourlyStats: HourlyStat[];
}

const ALL_CATEGORIES = [
  'Development', 'Work', 'Communication', 'Entertainment',
  'Social Media', 'Browsing', 'Creative', 'Study', 'Unknown',
];

export default function ActivityAnalysisPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalysisData | null>(null);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [editingApp, setEditingApp] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const fetchAnalysis = useCallback(async (token: string, range: string) => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      let startDate: Date;

      switch (range) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(0); // All time
      }

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      });

      const response = await fetch(`/api/activity/analysis?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const analysisData = await response.json();
        setData(analysisData);
      } else if (response.status === 401) {
        removeToken();
        router.push('/auth/login');
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || 'Failed to fetch analysis data');
      }
    } catch (error) {
      console.error('Error fetching analysis:', error);
      setError('An unexpected error occurred while loading data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }
    fetchAnalysis(token, timeRange);
  }, [router, timeRange, fetchAnalysis]);

  const correctCategory = useCallback(async (appName: string, newCategory: string) => {
    const token = getToken();
    if (!token) return;

    setCorrecting(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      // Create a user rule so future activities get this category
      await fetch('/api/categories', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          keyword: appName.toLowerCase(),
          matchField: 'applicationName',
          category: newCategory,
        }),
      });

      // Re-categorize existing activities with this app name
      await fetch('/api/activity/recategorize', {
        method: 'POST',
        headers,
        body: JSON.stringify({ applicationName: appName, newCategory }),
      });

      setEditingApp(null);
      fetchAnalysis(token, timeRange);
    } catch (err) {
      console.error('Error correcting category:', err);
    } finally {
      setCorrecting(false);
    }
  }, [fetchAnalysis, timeRange]);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      Development: 'bg-blue-500',
      Work: 'bg-green-500',
      Communication: 'bg-purple-500',
      Entertainment: 'bg-pink-500',
      'Social Media': 'bg-red-500',
      Browsing: 'bg-yellow-500',
      Creative: 'bg-indigo-500',
      Study: 'bg-cyan-500',
      Unknown: 'bg-gray-500',
    };
    return colors[category] || 'bg-gray-500';
  };

  const getCategoryEmoji = (category: string) => {
    const emojis: Record<string, string> = {
      Development: '💻',
      Work: '📊',
      Communication: '💬',
      Entertainment: '🎮',
      'Social Media': '📱',
      Browsing: '🌐',
      Creative: '🎨',
      Study: '📚',
      Unknown: '❓',
    };
    return emojis[category] || '❓';
  };

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}${period}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-xl text-gray-600 dark:text-gray-400">Loading analysis...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-xl text-red-600 mb-4">{error}</div>
          <button
            onClick={() => fetchAnalysis(getToken() || '', timeRange)}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Try Again
          </button>
          <div className="mt-4">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-700">
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-xl text-gray-600 dark:text-gray-400 mb-4">No activity data available</div>
          <Link href="/dashboard" className="text-primary-600 hover:text-primary-700">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            📊 Activity Analysis
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Detailed breakdown of your time and productivity patterns
          </p>
        </div>

        {/* Time Range Selector */}
        <div className="mb-6 flex gap-2">
          {(['today', 'week', 'month', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${timeRange === range
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
            >
              {range === 'today' && 'Today'}
              {range === 'week' && 'Last 7 Days'}
              {range === 'month' && 'Last 30 Days'}
              {range === 'all' && 'All Time'}
            </button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Time</h3>
              <span className="text-2xl">⏱️</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {data.summary.totalHours}h
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {data.summary.totalMinutes} minutes tracked
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Productivity</h3>
              <span className="text-2xl">📈</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {data.summary.productivityScore}%
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Time in productive apps
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Activity Level</h3>
              <span className="text-2xl">⚡</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {data.summary.avgActivityLevel}/100
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Average intensity
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Peak Hour</h3>
              <span className="text-2xl">🔥</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatHour(data.summary.mostProductiveHour)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Most active time
            </p>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Time by Category
          </h3>
          <div className="space-y-4">
            {data.categoryStats.map((cat) => (
              <div key={cat.category}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getCategoryEmoji(cat.category)}</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {cat.category}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-gray-900 dark:text-white">
                      {cat.hours}h
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      ({cat.percentage}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className={`${getCategoryColor(cat.category)} h-3 rounded-full transition-all`}
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Applications */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Top Applications
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                    Application
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                    Category
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                    Time
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                    Usage
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topApplications.map((app, index) => (
                  <tr
                    key={app.name}
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400 font-mono text-sm">
                          #{index + 1}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {app.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {editingApp === app.name ? (
                        <select
                          className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1"
                          defaultValue={app.category}
                          disabled={correcting}
                          onChange={(e) => correctCategory(app.name, e.target.value)}
                          onBlur={() => setEditingApp(null)}
                          autoFocus
                        >
                          {ALL_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {getCategoryEmoji(cat)} {cat}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingApp(app.name)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:ring-2 hover:ring-primary-400 transition-all"
                          title="Click to change category"
                        >
                          {getCategoryEmoji(app.category)} {app.category}
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {app.hours}h
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {app.minutes} min
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="font-semibold text-primary-600">
                        {app.percentage}%
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {app.count} sessions
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hourly Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Activity by Hour
          </h3>
          <div className="flex items-end justify-between gap-1 h-64">
            {data.hourlyStats.map((stat) => {
              const maxMinutes = Math.max(...data.hourlyStats.map(s => s.minutes));
              const height = maxMinutes > 0 ? (stat.minutes / maxMinutes) * 100 : 0;

              return (
                <div key={stat.hour} className="flex-1 flex flex-col items-center gap-2">
                  <div className="relative w-full flex items-end justify-center" style={{ height: '200px' }}>
                    <div
                      className="w-full bg-primary-500 hover:bg-primary-600 rounded-t transition-all group relative"
                      style={{ height: `${height}%` }}
                    >
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                        {stat.minutes} min
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                    {formatHour(stat.hour)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Daily Activity Trend
          </h3>
          <div className="space-y-3">
            {data.dailyStats.slice(-14).map((day) => {
              const date = new Date(day.date);
              const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const maxHours = Math.max(...data.dailyStats.map(d => d.hours));
              const percentage = maxHours > 0 ? (day.hours / maxHours) * 100 : 0;

              return (
                <div key={day.date}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3 w-32">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {dayName}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {dateStr}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {day.hours}h
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
