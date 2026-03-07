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
import Header from '@/components/layout/Header';
import HeatmapWidget from '@/components/analytics/HeatmapWidget';

const fetcher = (url: string) => {
  const token = localStorage.getItem('token');
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

export default function AnalyticsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<'week' | 'month'>('week');

  useEffect(() => {
    const token = localStorage.getItem('token');
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
    const token = localStorage.getItem('token');
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
        localStorage.removeItem('token');
        router.push('/auth/login');
      }
    }
    return <div>Failed to load analytics: {error?.message || data?.error}</div>;
  }
  if (isLoading || !data || !data.summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Period Selector and Export */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Analytics Dashboard
          </h2>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setPeriod('week')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${period === 'week'
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${period === 'month'
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                }`}
            >
              Last 30 Days
            </button>
            <div className="border-l border-gray-300 dark:border-gray-600 mx-2"></div>
            <button
              onClick={() => handleExport('csv')}
              className="px-6 py-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              title="Export as CSV"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="px-6 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title="Export as JSON"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Heatmap Section - Yearly Data */}
        <HeatmapSection token={typeof window !== 'undefined' ? localStorage.getItem('token') : null} />

        {/* Summary Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Total Sessions</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {data.summary.totalSessions}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Completed</div>
            <div className="text-3xl font-bold text-green-600">
              {data.summary.completedSessions}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {data.summary.completionRate}% completion rate
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Total Focus Time</div>
            <div className="text-3xl font-bold text-blue-600">
              {Math.floor(data.summary.totalFocusMinutes / 60)}h {data.summary.totalFocusMinutes % 60}m
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Productivity Score</div>
            <div className={`text-3xl font-bold ${productivityInfo.color}`}>
              {data.summary.averageProductivityScore}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {productivityInfo.level}
            </div>
          </div>
        </div>

        {/* Peak Time Card */}
        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl shadow-lg p-6 mb-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm opacity-90 mb-2">Your Peak Productivity Time</div>
              <div className="text-3xl font-bold">
                {data.peakTimes.peakPeriod}
              </div>
              <div className="text-sm opacity-90 mt-2">
                Schedule your most important work during this time for maximum focus!
              </div>
            </div>
            <div className="text-6xl">⚡</div>
          </div>
        </div>

        {/* Productivity Message */}
        <div className={`mb-8 p-4 rounded-lg border ${productivityInfo.color} ${
          productivityInfo.color === 'text-green-600' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' :
          productivityInfo.color === 'text-blue-600'  ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' :
          productivityInfo.color === 'text-yellow-600' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800' :
          'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
        }`}>
          <p className="text-center font-medium">
            {productivityInfo.message}
          </p>
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Focus Time Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Daily Focus Time (Hours)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="Focus Time" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Productivity Score Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Productivity Score Trend
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Productivity Score"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sessions Completed Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Sessions Completed Per Day
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="Sessions" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Insights Panel */}
        {insightsData?.insights && insightsData.insights.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-2xl">💡</span>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Your Insights
              </h3>
              {insightsData.streak > 0 && (
                <span className="ml-auto text-sm font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-3 py-1 rounded-full">
                  🔥 {insightsData.streak}-day streak
                </span>
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
          </div>
        )}
      </main>
    </div>
  );
}
