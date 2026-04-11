'use client';

import useSWR from 'swr';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getToken } from '@/lib/auth-token';

const fetcher = (url: string) => {
  const token = getToken();
  if (!token) throw new Error('No token');
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
};

interface WeekStat {
  weekLabel: string;
  weekStart: string;
  totalFocusHours: number;
  avgProductivityScore: number;
  sessionsCompleted: number;
}

interface DeltaField {
  value: number;
  prev: number;
  direction: 'up' | 'down' | 'same';
  pct?: number;
  pts?: number;
  diff?: number;
}

interface WeeklyData {
  weeks: WeekStat[];
  delta: {
    focusHours: DeltaField & { pct: number };
    productivityScore: DeltaField & { pts: number };
    sessionsCompleted: DeltaField & { diff: number };
  };
  topCategories: { category: string; hours: number }[];
}

function DeltaCard({
  label,
  value,
  unit,
  deltaLabel,
  direction,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  deltaLabel: string;
  direction: 'up' | 'down' | 'same';
  color: string;
}) {
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const deltaColor =
    direction === 'up' ? 'text-emerald-400' : direction === 'down' ? 'text-red-400' : 'text-gray-400';
  return (
    <div className="bg-gray-800 rounded-xl p-4 flex-1 min-w-0">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>
        {value}
        {unit}
      </p>
      <div className={`flex items-center gap-1 mt-1 text-sm ${deltaColor}`}>
        <Icon size={14} />
        <span>{deltaLabel} vs last week</span>
      </div>
    </div>
  );
}

export default function WeeklyReportPage() {
  const { data, error, isLoading } = useSWR<WeeklyData>(
    '/api/reports/weekly?weeks=8',
    fetcher,
    { refreshInterval: 300000 }
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-gray-700 rounded w-64 animate-pulse" />
        <div className="flex gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-700 rounded-xl flex-1 animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-gray-700 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-6 text-red-400">Failed to load weekly report.</div>;
  }

  const { weeks, delta, topCategories } = data;
  const sign = (n: number) => (n > 0 ? '+' : '');

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-white">Weekly Performance Report</h1>

      {/* Delta cards */}
      <div className="flex gap-4">
        <DeltaCard
          label="Focus Hours"
          value={delta.focusHours.value}
          unit="h"
          deltaLabel={`${sign(delta.focusHours.pct)}${delta.focusHours.pct}%`}
          direction={delta.focusHours.direction}
          color="text-sky-400"
        />
        <DeltaCard
          label="Productivity Score"
          value={delta.productivityScore.value}
          unit="%"
          deltaLabel={`${sign(delta.productivityScore.pts)}${delta.productivityScore.pts}pts`}
          direction={delta.productivityScore.direction}
          color="text-indigo-400"
        />
        <DeltaCard
          label="Sessions"
          value={delta.sessionsCompleted.value}
          unit=""
          deltaLabel={`${sign(delta.sessionsCompleted.diff)}${delta.sessionsCompleted.diff}`}
          direction={delta.sessionsCompleted.direction}
          color="text-emerald-400"
        />
      </div>

      {/* Grouped bar chart */}
      <div className="bg-gray-800 rounded-xl p-4">
        <h2 className="text-white font-semibold mb-4">8-Week Trend</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={weeks} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="weekLabel" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: '#1f2937',
                border: '1px solid #374151',
                borderRadius: 8,
              }}
            />
            <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
            <Bar dataKey="totalFocusHours" name="Focus Hours" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
            <Bar dataKey="avgProductivityScore" name="Productivity %" fill="#6366f1" radius={[2, 2, 0, 0]} />
            <Bar dataKey="sessionsCompleted" name="Sessions" fill="#10b981" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top categories */}
      {topCategories.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h2 className="text-white font-semibold mb-3">Top Categories This Week</h2>
          <div className="flex gap-2 flex-wrap">
            {topCategories.map(c => (
              <span
                key={c.category}
                className="bg-sky-900/40 text-sky-400 px-3 py-1 rounded-full text-sm"
              >
                {c.category} {c.hours}h
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
