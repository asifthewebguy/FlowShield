'use client';

import useSWR from 'swr';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const adminFetcher = (url: string) => {
  const token = localStorage.getItem('token');
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
};

const TIER_COLORS: Record<string, string> = {
  FREE: '#6b7280',
  PRO: '#3b82f6',
  TEAM: '#8b5cf6',
};

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function AdminOverviewPage() {
  const { data, error } = useSWR('/api/admin/stats', adminFetcher, { refreshInterval: 60000 });

  if (error) return <div className="text-red-500">Failed to load stats.</div>;
  if (!data) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48" />
      <div className="grid grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl" />)}
      </div>
    </div>
  );

  const tierData = [
    { name: 'Free', value: data.byTier.FREE },
    { name: 'Pro', value: data.byTier.PRO },
    { name: 'Team', value: data.byTier.TEAM },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Overview</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Users" value={data.totalUsers} />
        <StatCard label="Active Today" value={data.activeToday} sub="unique users with sessions" />
        <StatCard label="Sessions Today" value={data.sessionsToday} />
        <StatCard
          label="Paid Subscribers"
          value={data.byTier.PRO + data.byTier.TEAM}
          sub={`${data.byTier.PRO} Pro · ${data.byTier.TEAM} Team`}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Signups bar chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
            New Signups — Last 7 Days
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.signupsByDay}>
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => new Date(d).toLocaleDateString('en', { weekday: 'short' })}
                tick={{ fontSize: 12 }}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tier donut */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Users by Tier
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={tierData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                {tierData.map(entry => (
                  <Cell key={entry.name} fill={TIER_COLORS[entry.name.toUpperCase()] ?? '#ccc'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* New signups this week banner */}
      <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-xl p-4 text-primary-700 dark:text-primary-300 text-sm">
        <strong>{data.newThisWeek}</strong> new user{data.newThisWeek !== 1 ? 's' : ''} signed up in the last 7 days.
      </div>
    </div>
  );
}
