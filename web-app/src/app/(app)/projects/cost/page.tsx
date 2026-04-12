'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AlertTriangle, Edit2, X, Check } from 'lucide-react';
import { getToken, removeToken } from '@/lib/auth-token';

interface ProjectCost {
  id: string;
  name: string;
  color: string;
  hourlyRate: number | null;
  budget: number | null;
  plannedHours: number | null;
  actualHours: number;
  earned: number | null;
  budgetPercent: number | null;
  isOverBudget: boolean;
  isOverHours: boolean;
}

interface CostData {
  summary: { totalEarned: number; totalHours: number; projectCount: number };
  projects: ProjectCost[];
  error?: string;
}

interface EditState {
  projectId: string;
  hourlyRate: string;
  budget: string;
  plannedHours: string;
}

const fetcher = (url: string) => {
  const token = getToken();
  if (!token) throw new Error('No token');
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
};

async function patchProject(
  id: string,
  data: { hourlyRate?: number | null; budget?: number | null; plannedHours?: number | null }
) {
  const token = getToken();
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update project');
}

export default function ProjectCostPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<'month' | 'lastMonth' | 'all'>('month');
  const [editing, setEditing] = useState<EditState | null>(null);

  const { data, isLoading, mutate } = useSWR<CostData>(
    `/api/projects/cost?period=${period}`,
    fetcher,
    { refreshInterval: 300000 }
  );

  if (data?.error === 'Unauthorized') {
    removeToken();
    router.push('/auth/login');
    return null;
  }

  function startEdit(p: ProjectCost) {
    setEditing({
      projectId: p.id,
      hourlyRate: p.hourlyRate != null ? String(p.hourlyRate) : '',
      budget: p.budget != null ? String(p.budget) : '',
      plannedHours: p.plannedHours != null ? String(p.plannedHours) : '',
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const payload = {
      hourlyRate: editing.hourlyRate ? parseFloat(editing.hourlyRate) : null,
      budget: editing.budget ? parseFloat(editing.budget) : null,
      plannedHours: editing.plannedHours ? parseFloat(editing.plannedHours) : null,
    };
    await patchProject(editing.projectId, payload);
    setEditing(null);
    mutate();
  }

  const summary = data?.summary ?? { totalEarned: 0, totalHours: 0, projectCount: 0 };
  const projects = data?.projects ?? [];
  const chartProjects = projects.filter(p => p.earned && p.earned > 0);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-1 bg-gray-800 rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
        <div className="bg-gray-800 rounded-xl h-64 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Project Cost Analysis</h1>
        <div className="bg-gray-800 rounded-lg p-1 flex gap-1">
          {(['month', 'lastMonth', 'all'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === p ? 'bg-sky-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {p === 'month' ? 'This Month' : p === 'lastMonth' ? 'Last Month' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="flex gap-4">
        <div className="bg-gray-800 rounded-xl p-4 flex-1">
          <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total Earned</div>
          <div className="text-2xl font-bold text-sky-400">
            ${summary.totalEarned.toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 flex-1">
          <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total Hours</div>
          <div className="text-2xl font-bold text-indigo-400">{summary.totalHours}h</div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 flex-1">
          <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Active Projects</div>
          <div className="text-2xl font-bold text-emerald-400">{summary.projectCount}</div>
        </div>
      </div>

      {/* Projects Table */}
      {projects.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-gray-500 text-sm">No projects found.</span>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_100px_90px_120px_40px] gap-2 px-4 py-3 border-b border-gray-700 text-xs text-gray-400 uppercase tracking-wide">
            <div>Project</div>
            <div>Rate</div>
            <div>Hours</div>
            <div>Earned</div>
            <div>Budget</div>
            <div />
          </div>

          {/* Rows */}
          {projects.map(p => {
            const isEditingThis = editing?.projectId === p.id;
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[1fr_80px_100px_90px_120px_40px] gap-2 px-4 py-3 border-b border-gray-700/50 items-center text-sm ${
                  p.isOverBudget ? 'border-l-2 border-l-red-500' : ''
                }`}
              >
                {/* Project Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span
                    className={`truncate ${p.isOverBudget ? 'text-red-300' : 'text-white'}`}
                  >
                    {p.name}
                  </span>
                  {p.isOverBudget && (
                    <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                  )}
                </div>

                {/* Rate */}
                {isEditingThis ? (
                  <input
                    type="number"
                    placeholder="$/hr"
                    value={editing.hourlyRate}
                    onChange={e => setEditing({ ...editing, hourlyRate: e.target.value })}
                    className="bg-gray-700 text-white text-sm rounded px-2 py-1 w-full"
                  />
                ) : (
                  <div className="text-gray-300">
                    {p.hourlyRate != null ? `$${p.hourlyRate}/hr` : '—'}
                  </div>
                )}

                {/* Hours */}
                {isEditingThis ? (
                  <input
                    type="number"
                    placeholder="plan hrs"
                    value={editing.plannedHours}
                    onChange={e => setEditing({ ...editing, plannedHours: e.target.value })}
                    className="bg-gray-700 text-white text-sm rounded px-2 py-1 w-full"
                  />
                ) : (
                  <div className={p.isOverHours ? 'text-amber-400' : 'text-gray-300'}>
                    {p.actualHours}h
                    {p.plannedHours != null && (
                      <span className="text-gray-500"> / {p.plannedHours}h</span>
                    )}
                  </div>
                )}

                {/* Earned */}
                {isEditingThis ? (
                  <div className="text-gray-500 text-sm">—</div>
                ) : (
                  <div
                    className={
                      p.earned != null
                        ? p.isOverBudget
                          ? 'text-red-400'
                          : 'text-sky-400'
                        : 'text-gray-500'
                    }
                  >
                    {p.earned != null ? `$${p.earned.toLocaleString()}` : '—'}
                  </div>
                )}

                {/* Budget */}
                {isEditingThis ? (
                  <input
                    type="number"
                    placeholder="$ budget"
                    value={editing.budget}
                    onChange={e => setEditing({ ...editing, budget: e.target.value })}
                    className="bg-gray-700 text-white text-sm rounded px-2 py-1 w-full"
                  />
                ) : p.budgetPercent != null ? (
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 bg-gray-700 rounded h-1.5">
                      <div
                        className={`h-1.5 rounded ${
                          p.isOverBudget ? 'bg-red-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(p.budgetPercent, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {Math.round(p.budgetPercent)}%
                    </span>
                  </div>
                ) : (
                  <div className="text-gray-500 text-xs">No budget</div>
                )}

                {/* Edit / Save / Cancel */}
                {isEditingThis ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={saveEdit}
                      className="text-emerald-400 hover:text-emerald-300 p-0.5"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="text-gray-400 hover:text-white p-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(p)}
                    className="text-gray-500 hover:text-gray-300 p-0.5"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Earnings Bar Chart */}
      {chartProjects.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Earnings by Project
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartProjects} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tickFormatter={v => `$${v}`} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                formatter={(v: number) => [`$${v.toLocaleString()}`, 'Earned']}
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8 }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Bar dataKey="earned" radius={[4, 4, 0, 0]}>
                {chartProjects.map(p => (
                  <Cell key={p.id} fill={p.isOverBudget ? '#ef4444' : p.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
