'use client';

import { useState } from 'react';
import useSWR from 'swr';

const adminFetcher = (url: string) => {
  const token = localStorage.getItem('token');
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
};

const TIER_COLORS: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  PRO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  TEAM: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

export default function AdminSubscriptionsPage() {
  const { data: stats } = useSWR('/api/admin/stats', adminFetcher);
  const { data: recentData, mutate } = useSWR('/api/admin/users?limit=100&tier=PRO', adminFetcher);

  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradeTier, setUpgradeTier] = useState<'FREE' | 'PRO' | 'TEAM'>('PRO');
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<string | null>(null);

  const handleManualUpgrade = async () => {
    if (!upgradeEmail) return;
    setUpgrading(true);
    setUpgradeResult(null);

    const token = localStorage.getItem('token');

    // Find user by email
    const searchRes = await fetch(`/api/admin/users?search=${encodeURIComponent(upgradeEmail)}&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchData = await searchRes.json();
    const user = searchData.users?.[0];

    if (!user) {
      setUpgradeResult(`No user found with email: ${upgradeEmail}`);
      setUpgrading(false);
      return;
    }

    await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscriptionTier: upgradeTier }),
    });

    setUpgradeResult(`✓ ${upgradeEmail} upgraded to ${upgradeTier}`);
    setUpgradeEmail('');
    setUpgrading(false);
    mutate();
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Subscriptions</h1>

      {/* Tier breakdown */}
      <div className="grid grid-cols-3 gap-6">
        {['FREE', 'PRO', 'TEAM'].map(tier => (
          <div key={tier} className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 text-center">
            <span className={`inline-block text-xs px-3 py-1 rounded-full font-semibold mb-3 ${TIER_COLORS[tier]}`}>
              {tier}
            </span>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {stats ? stats.byTier[tier] : '—'}
            </div>
            <div className="text-xs text-gray-500 mt-1">users</div>
          </div>
        ))}
      </div>

      {/* Manual upgrade */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Manual Upgrade</h2>
        <div className="flex gap-3 flex-wrap">
          <input
            type="email"
            placeholder="User email"
            value={upgradeEmail}
            onChange={e => setUpgradeEmail(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select
            value={upgradeTier}
            onChange={e => setUpgradeTier(e.target.value as 'FREE' | 'PRO' | 'TEAM')}
            className="px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="FREE">Free</option>
            <option value="PRO">Pro</option>
            <option value="TEAM">Team</option>
          </select>
          <button
            onClick={handleManualUpgrade}
            disabled={upgrading || !upgradeEmail}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {upgrading ? 'Upgrading...' : 'Upgrade'}
          </button>
        </div>
        {upgradeResult && (
          <div className={`mt-3 text-sm ${upgradeResult.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
            {upgradeResult}
          </div>
        )}
      </div>

      {/* Pro/Team users list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Pro Users</h2>
        </div>
        {!recentData && <div className="p-6 text-gray-400 animate-pulse">Loading...</div>}
        {recentData?.users?.length === 0 && (
          <div className="p-6 text-gray-400 text-sm">No Pro users yet.</div>
        )}
        {recentData?.users?.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Sessions</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {recentData.users.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{u.name || '—'}</div>
                    <div className="text-gray-500 text-xs">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${TIER_COLORS[u.subscriptionTier]}`}>
                      {u.subscriptionTier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.sessionCount}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
