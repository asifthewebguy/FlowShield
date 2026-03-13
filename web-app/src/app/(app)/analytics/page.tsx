'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getProductivityLevel } from '@/lib/productivity';
import HeatmapWidget from '@/components/analytics/HeatmapWidget';
import { getToken, removeToken } from '@/lib/auth-token';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const fetcher = (url: string) => {
  const token = getToken();
  if (!token) throw new Error('No token');

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(res => res.json());
};

function HeatmapSection({ token }: { token: string | null }) {
  const { data, isLoading } = useSWR(
    token ? '/api/analytics/yearly' : null,
    fetcher
  );

  if (isLoading || !data?.heatmap) return <div className="mb-8 h-48 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse"></div>;

  return (
    <div className="mb-8">
      <HeatmapWidget data={data.heatmap} />
    </div>
  );
}

function DistractionTrends({ period }: { period: 'week' | 'month' }) {
  const { data, isLoading } = useSWR(
    `/api/analytics/distractions?period=${period}`,
    fetcher,
    { refreshInterval: 300000 }
  );

  if (isLoading || !data || data.error) {
    return <div className="mb-8 h-48 bg-gray-100 dark:bg-surface-2 rounded-xl animate-pulse"></div>;
  }

  const trendColor = data.trendChange <= 0 ? 'text-green-600' : 'text-red-600';
  const trendIcon = data.trendChange <= 0 ? '↓' : '↑';
  const trendLabel = data.trendChange <= 0 ? 'improvement' : 'increase';

  return (
    <Card className="mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚫</span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Distraction Analysis
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {data.distractionPercentage}%
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">of total time</div>
          </div>
          {data.trendChange !== 0 && (
            <div className={`text-sm font-medium ${trendColor}`}>
              {trendIcon} {Math.abs(data.trendChange)}% {trendLabel}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Daily distraction trend mini-chart */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
            Daily Distraction Time (min)
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                fontSize={11}
              />
              <YAxis fontSize={11} />
              <Tooltip
                labelFormatter={(d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              />
              <Bar dataKey="minutes" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top distracting apps */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
            Top Distracting Apps
          </h4>
          {data.topDistractions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No distraction data yet.</p>
          ) : (
            <div className="space-y-3">
              {data.topDistractions.map((app: { name: string; category: string; minutes: number; percentage: number }) => (
                <div key={app.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[60%]">
                      {app.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {app.minutes} min ({app.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-surface-3 rounded-full h-2">
                    <div
                      className="bg-red-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(app.percentage * 3, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<'week' | 'month'>('week');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/auth/login');
    }
  }, [router]);

  const { data, error, isLoading } = useSWR(
    `/api/analytics?period=${period}`,
    fetcher,
    { refreshInterval: 300000 } // Refresh every 5 minutes
  );

  const { data: insightsData } = useSWR('/api/analytics/insights', fetcher, {
    refreshInterval: 300000,
  });

  const handleExport = (format: 'json' | 'csv') => {
    const token = getToken();
    if (!token) return;

    const url = `/api/export?format=${format}&period=${period}`;

    // Create a temporary anchor element to trigger download
    // Using fetch to include auth header
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((response) => response.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flowshield-sessions-${period}-${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch((error) => {
        console.error('Export failed', error);
      });
  };

  if (error || (data && data.error)) {
    // If unauthorized, redirect to login
    if (data?.error === 'Unauthorized' || error?.message?.includes('Unauthorized')) {
      if (typeof window !== 'undefined') {
        removeToken();
        router.push('/auth/login');
      }
    }
    return <div>Failed to load analytics: {error?.message || data?.error}</div>;
  }
  if (isLoading || !data || !data.summary) {
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <div className="text-xl text-gray-600 dark:text-gray-400">Loading analytics...</div>
      </div>
    );
  }

  const productivityInfo = getProductivityLevel(data.summary.averageProductivityScore);

  // Format data for charts
  const chartData = data.dailyStats.map((stat: any) => ({
    date: new Date(stat.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    'Focus Time': Math.round(stat.totalMinutes / 60 * 10) / 10, // Convert to hours
    'Productivity Score': stat.productivityScore,
    Sessions: stat.completedCount,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Period Selector and Export */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Analytics Dashboard
          </h2>
          <div className="flex gap-2 flex-wrap items-center">
            <Button
              variant={period === 'week' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setPeriod('week')}
            >
              Last 7 Days
            </Button>
            <Button
              variant={period === 'month' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setPeriod('month')}
            >
              Last 30 Days
            </Button>
            <div className="w-px h-6 bg-gray-200 dark:bg-white/[0.08] mx-1" />
            <Button variant="secondary" size="sm" onClick={() => handleExport('csv')}>
              Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport('json')}>
              Export JSON
            </Button>
          </div>
        </div>

        {/* Heatmap Section - Yearly Data */}
        <HeatmapSection token={typeof window !== 'undefined' ? getToken() : null} />

        {/* Summary Cards */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Total Sessions</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {data.summary.totalSessions}
            </div>
          </Card>

          <Card>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Completed</div>
            <div className="text-3xl font-bold text-success-500">
              {data.summary.completedSessions}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {data.summary.completionRate}% completion rate
            </div>
          </Card>

          <Card>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Total Focus Time</div>
            <div className="text-3xl font-bold text-primary-500">
              {Math.floor(data.summary.totalFocusMinutes / 60)}h {data.summary.totalFocusMinutes % 60}m
            </div>
          </Card>

          <Card>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Productivity Score</div>
            <div className={`text-3xl font-bold ${productivityInfo.color}`}>
              {data.summary.averageProductivityScore}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {productivityInfo.level}
            </div>
          </Card>
        </div>

        {/* Peak Time Card */}
        <div className="rounded-xl p-6 mb-8 text-white bg-gradient-to-r from-accent-500 to-primary-600 shadow-lg shadow-accent-500/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium opacity-80 mb-1 uppercase tracking-wide">Your Peak Productivity Time</div>
              <div className="text-3xl font-bold">
                {data.peakTimes.peakPeriod}
              </div>
              <div className="text-sm opacity-80 mt-2">
                Schedule your most important work during this time for maximum focus!
              </div>
            </div>
            <div className="text-5xl opacity-80">⚡</div>
          </div>
        </div>

        {/* Productivity Message */}
        <div className={`mb-8 p-4 rounded-xl border font-medium text-center text-sm ${
          productivityInfo.color === 'text-green-600'  ? 'bg-success-50 border-success-100 text-success-700 dark:bg-success-500/10 dark:border-success-500/20 dark:text-success-400' :
          productivityInfo.color === 'text-blue-600'   ? 'bg-primary-50 border-primary-100 text-primary-700 dark:bg-primary-500/10 dark:border-primary-500/20 dark:text-primary-400' :
          productivityInfo.color === 'text-yellow-600' ? 'bg-warning-50 border-warning-100 text-warning-700 dark:bg-warning-500/10 dark:border-warning-500/20 dark:text-warning-400' :
          'bg-danger-50 border-danger-100 text-danger-700 dark:bg-danger-500/10 dark:border-danger-500/20 dark:text-danger-400'
        }`}>
          {productivityInfo.message}
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Daily Focus Time (Hours)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="Focus Time" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Productivity Score Trend
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis domain={[0, 100]} fontSize={11} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Productivity Score"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            Sessions Completed Per Day
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="Sessions" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Distraction Trends */}
        <DistractionTrends period={period} />

        {/* Insights Panel */}
        {insightsData?.insights && insightsData.insights.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xl">💡</span>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Your Insights
              </h3>
              {insightsData.streak > 0 && (
                <Badge variant="warning" className="ml-auto" dot>
                  🔥 {insightsData.streak}-day streak
                </Badge>
              )}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {insightsData.insights.map((insight: { id: string; type: string; title: string; description: string }) => {
                const iconMap: Record<string, string> = {
                  streak: '🔥',
                  trend: insight.title.includes('up') ? '📈' : '📉',
                  best_day: '🏆',
                  peak_hour: '⚡',
                  completion: '✅',
                  consistency: '📅',
                };
                const colorMap: Record<string, string> = {
                  streak: 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10',
                  trend: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10',
                  best_day: 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/10',
                  peak_hour: 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/10',
                  completion: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10',
                  consistency: 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30',
                };
                return (
                  <div
                    key={insight.id}
                    className={`rounded-lg border p-4 ${colorMap[insight.type] ?? colorMap.consistency}`}
                  >
                    <div className="text-2xl mb-2">{iconMap[insight.type] ?? '💡'}</div>
                    <div className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                      {insight.title}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {insight.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
    </div>
  );
}
