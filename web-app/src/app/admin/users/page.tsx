'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';

const adminFetcher = (url: string) => {
  const token = localStorage.getItem('token');
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
};

const TIER_COLORS: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  PRO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  TEAM: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const params = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(tier && { tier }),
  });

  const { data, error, mutate } = useSWR(`/api/admin/users?${params}`, adminFetcher);

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._adminSearchTimer);
    (window as any)._adminSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 300);
  };

  const handleTierChange = async (userId: string, newTier: string) => {
    const token = localStorage.getItem('token');
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscriptionTier: newTier }),
    });
    mutate();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
        />
        <select
          value={tier}
          onChange={e => { setTier(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All tiers</option>
          <option value="FREE">Free</option>
          <option value="PRO">Pro</option>
          <option value="TEAM">Team</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        {error && <div className="p-6 text-red-500">Failed to load users.</div>}
        {!data && !error && <div className="p-6 text-gray-400 animate-pulse">Loading...</div>}
        {data && (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Sessions</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{u.name || '—'}</div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.subscriptionTier}
                        onChange={e => handleTierChange(u.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${TIER_COLORS[u.subscriptionTier]}`}
                      >
                        <option value="FREE">Free</option>
                        <option value="PRO">Pro</option>
                        <option value="TEAM">Team</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        u.role === 'ADMIN'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.sessionCount}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="text-primary-600 hover:text-primary-700 text-xs font-medium"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="px-4 py-3 border-t dark:border-gray-700 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>{data.total} total users</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 rounded border dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    ← Prev
                  </button>
                  <span className="px-2 py-1">Page {page} of {data.totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                    disabled={page === data.totalPages}
                    className="px-3 py-1 rounded border dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
