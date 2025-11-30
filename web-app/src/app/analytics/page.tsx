'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

export default function AnalyticsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/login');
      return;
    }

    fetchAnalytics(token, period);
  }, [router, period]);

  const fetchAnalytics = async (token: string, selectedPeriod: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics?period=${selectedPeriod}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const analyticsData = await response.json();
        setData(analyticsData);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (format: 'json' | 'csv') => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const url = `/api/export?format=${format}&period=${period}`;

    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = `flowshield-sessions-${period}-${new Date().toISOString().split('T')[0]}.${format}`;

    // Add authorization header by fetching and downloading
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
        console.error('Export failed:', error);
      });
  };

  if (loading || !data) {
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
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                period === 'week'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                period === 'month'
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
        <div className={`mb-8 p-4 rounded-lg border ${productivityInfo.color} bg-opacity-10 border-opacity-50`}>
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
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
      </main>
    </div>
  );
}
