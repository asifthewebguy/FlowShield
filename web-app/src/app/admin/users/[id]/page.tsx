'use client';

import { useState, use } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const adminFetcher = (url: string) => {
  const token = localStorage.getItem('token');
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
};

const TIER_COLORS: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-700',
  PRO: 'bg-blue-100 text-blue-700',
  TEAM: 'bg-purple-100 text-purple-700',
};

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: user, error, mutate } = useSWR(`/api/admin/users/${id}`, adminFetcher);

  const [selectedTier, setSelectedTier] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [digestSent, setDigestSent] = useState(false);
  const [announceSubject, setAnnounceSubject] = useState('');
  const [announceBody, setAnnounceBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const tierValue = selectedTier || user?.subscriptionTier || 'FREE';
  const roleValue = selectedRole || user?.role || 'USER';

  const save = async () => {
    setSaving(true);
    const token = localStorage.getItem('token');
    await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subscriptionTier: tierValue,
        role: roleValue,
      }),
    });
    setSaving(false);
    mutate();
  };

  const sendDigest = async () => {
    const token = localStorage.getItem('token');
    await fetch('/api/admin/email/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: id }),
    });
    setDigestSent(true);
    setTimeout(() => setDigestSent(false), 3000);
  };

  const sendCustomEmail = async () => {
    if (!announceSubject || !announceBody) return;
    setSendingEmail(true);
    const token = localStorage.getItem('token');
    await fetch('/api/admin/email/announce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject: announceSubject, html: `<p>${announceBody}</p>` }),
    });
    setSendingEmail(false);
    setAnnounceSubject('');
    setAnnounceBody('');
  };

  const deleteUser = async () => {
    setDeleting(true);
    const token = localStorage.getItem('token');
    await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    router.push('/admin/users');
  };

  if (error) return <div className="text-red-500">Failed to load user.</div>;
  if (!user) return <div className="animate-pulse text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/admin/users" className="text-gray-400 hover:text-gray-600 text-sm">← Users</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{user.name || user.email}</h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Profile */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 space-y-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Profile</h2>
          <div className="text-sm space-y-2 text-gray-600 dark:text-gray-400">
            <div><span className="font-medium text-gray-700 dark:text-gray-300">Email:</span> {user.email}</div>
            <div><span className="font-medium text-gray-700 dark:text-gray-300">Name:</span> {user.name || '—'}</div>
            <div><span className="font-medium text-gray-700 dark:text-gray-300">Timezone:</span> {user.timezone}</div>
            <div><span className="font-medium text-gray-700 dark:text-gray-300">Joined:</span> {new Date(user.createdAt).toLocaleDateString()}</div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Email verified:</span>{' '}
              {user.emailVerified ? new Date(user.emailVerified).toLocaleDateString() : <span className="text-red-500">Not verified</span>}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 space-y-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Usage Stats</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-primary-600">{user._count?.sessions ?? 0}</div>
              <div className="text-xs text-gray-500">Total Sessions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary-600">
                {Math.floor((user.totalFocusMinutes ?? 0) / 60)}h {(user.totalFocusMinutes ?? 0) % 60}m
              </div>
              <div className="text-xs text-gray-500">Focus Time</div>
            </div>
          </div>
          {user.lastActive && (
            <div className="text-xs text-gray-400">
              Last active: {new Date(user.lastActive).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Subscription management */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Subscription & Role</h2>

          <div className="flex items-center gap-3">
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${TIER_COLORS[user.subscriptionTier]}`}>
              {user.subscriptionTier}
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Tier</label>
              <select
                value={tierValue}
                onChange={e => setSelectedTier(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="FREE">Free</option>
                <option value="PRO">Pro</option>
                <option value="TEAM">Team</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Role</label>
              <select
                value={roleValue}
                onChange={e => setSelectedRole(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {/* Subscription history */}
          {user.subscriptions?.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">History</div>
              <div className="space-y-1">
                {user.subscriptions.map((s: any) => (
                  <div key={s.id} className="text-xs text-gray-500 flex justify-between">
                    <span>{s.tier} via {s.provider || 'manual'}</span>
                    <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Email actions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Email</h2>
          <button
            onClick={sendDigest}
            className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {digestSent ? '✓ Digest Sent!' : 'Send Weekly Digest'}
          </button>

          <div className="space-y-2">
            <input
              type="text"
              placeholder="Email subject"
              value={announceSubject}
              onChange={e => setAnnounceSubject(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <textarea
              placeholder="Email body (plain text)"
              value={announceBody}
              onChange={e => setAnnounceBody(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
            />
            <button
              onClick={sendCustomEmail}
              disabled={sendingEmail || !announceSubject || !announceBody}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {sendingEmail ? 'Sending...' : 'Send Email to This User'}
            </button>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 border border-red-200 dark:border-red-800">
        <h2 className="text-base font-semibold text-red-600 mb-3">Danger Zone</h2>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-300 dark:border-red-700 rounded-lg text-sm hover:bg-red-100 transition-colors"
          >
            Delete Account
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-red-600">This cannot be undone. Are you sure?</span>
            <button
              onClick={deleteUser}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 text-gray-600 text-sm hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
