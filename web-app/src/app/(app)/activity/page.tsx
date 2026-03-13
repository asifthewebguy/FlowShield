'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, removeToken } from '@/lib/auth-token';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

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
      <div className="flex items-center justify-center min-h-full p-8">
        <div className="text-xl text-gray-600 dark:text-gray-400">Loading analysis...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-full p-8">
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
      <div className="flex items-center justify-center min-h-full p-8">
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
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
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
        <div className="mb-6 flex gap-2 flex-wrap">
          {(['today', 'week', 'month', 'all'] as const).map((range) => (
            <Button
              key={range}
              size="sm"
              variant={timeRange === range ? 'primary' : 'secondary'}
              onClick={() => setTimeRange(range)}
            >
              {range === 'today' && 'Today'}
              {range === 'week' && 'Last 7 Days'}
              {range === 'month' && 'Last 30 Days'}
              {range === 'all' && 'All Time'}
            </Button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Time</h3>
              <span className="text-xl">⏱️</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{data.summary.totalHours}h</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{data.summary.totalMinutes} minutes tracked</p>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Productivity</h3>
              <span className="text-xl">📈</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{data.summary.productivityScore}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Time in productive apps</p>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Activity Level</h3>
              <span className="text-xl">⚡</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{data.summary.avgActivityLevel}/100</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Average intensity</p>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Peak Hour</h3>
              <span className="text-xl">🔥</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{formatHour(data.summary.mostProductiveHour)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Most active time</p>
          </Card>
        </div>

        {/* Category Breakdown */}
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-6">
            Time by Category
          </h3>
          <div className="space-y-4">
            {data.categoryStats.map((cat) => (
              <div key={cat.category}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getCategoryEmoji(cat.category)}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{cat.category}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{cat.hours}h</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({cat.percentage}%)</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-surface-3 rounded-full h-2.5">
                  <div
                    className={`${getCategoryColor(cat.category)} h-2.5 rounded-full transition-all`}
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Applications */}
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-6">
            Top Applications
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/[0.06]">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Application</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Category</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Time</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Usage</th>
                </tr>
              </thead>
              <tbody>
                {data.topApplications.map((app, index) => (
                  <tr
                    key={app.name}
                    className="border-b border-gray-100/60 dark:border-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.02]"
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 hover:ring-2 hover:ring-primary-400/50 transition-all"
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
        </Card>

        {/* Hourly Distribution */}
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-6">
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
        </Card>

        {/* Daily Trend */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-6">
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
                  <div className="w-full bg-gray-100 dark:bg-surface-3 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
    </div>
  );
}
