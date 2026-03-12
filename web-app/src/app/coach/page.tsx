'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';

export default function CoachPage() {
  const router = useRouter();
  const [advice, setAdvice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const adviceRef = useRef('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/login');
    }
  }, [router]);

  const fetchAdvice = () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setIsLoading(true);
    setError(null);
    setAdvice('');
    adviceRef.current = '';

    const eventSource = new EventSource(
      `/api/coach/advice?token=${encodeURIComponent(token)}`
    );

    // Pass token via query param for SSE (EventSource can't set headers)
    // The route reads it from Authorization header OR query param
    fetch('/api/coach/advice', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        setError('Failed to get advice. Please try again.');
        setIsLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) {
          setIsLoading(false);
          setHasLoaded(true);
          return;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              setIsLoading(false);
              setHasLoaded(true);
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                adviceRef.current += parsed.text;
                setAdvice(adviceRef.current);
              }
              if (parsed.error) {
                setError(parsed.error);
                setIsLoading(false);
                return;
              }
            } catch {
              // skip malformed lines
            }
          }
        }

        pump();
      };

      pump();
    }).catch(() => {
      setError('Connection failed. Please try again.');
      setIsLoading(false);
    });
  };

  useEffect(() => {
    fetchAdvice(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <span className="text-4xl">🤖</span>
            AI Productivity Coach
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Personalized advice based on your last 7 days of activity.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 min-h-[200px]">
          {isLoading && !advice && (
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <svg className="animate-spin h-5 w-5 text-sky-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Analyzing your productivity data…</span>
            </div>
          )}

          {error && (
            <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
          )}

          {advice && (
            <div className="prose dark:prose-invert max-w-none">
              <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                {advice}
                {isLoading && (
                  <span className="inline-block w-1 h-4 bg-sky-500 ml-0.5 animate-pulse align-middle" />
                )}
              </p>
            </div>
          )}
        </div>

        {hasLoaded && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={fetchAdvice}
              className="px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition-colors"
            >
              Refresh Advice
            </button>
          </div>
        )}

        {/* Teams Section */}
        <TeamsSection />
      </main>
    </div>
  );
}

function TeamsSection() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const authFetch = (url: string, opts: RequestInit = {}) =>
    fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

  useEffect(() => {
    authFetch('/api/teams')
      .then(r => r.json())
      .then(d => setTeams(d.teams || []))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    const res = await authFetch('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name: newTeamName }),
    });
    const data = await res.json();
    if (res.ok) {
      setTeams(prev => [...prev, data.team]);
      setNewTeamName('');
      setMessage('Team created!');
    } else {
      setMessage(data.error || 'Failed to create team');
    }
  };

  const joinTeam = async () => {
    if (!inviteCode.trim()) return;
    const res = await authFetch('/api/teams/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage(data.message || 'Joined!');
      setInviteCode('');
      // Refresh teams
      authFetch('/api/teams').then(r => r.json()).then(d => setTeams(d.teams || []));
    } else {
      setMessage(data.error || 'Failed to join team');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <span>👥</span> Teams
      </h2>

      {message && (
        <div className="mb-3 text-sm text-sky-600 dark:text-sky-400">{message}</div>
      )}

      {/* Create team */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 mb-4">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Create a new team</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            placeholder="Team name…"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            onClick={createTeam}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg"
          >
            Create
          </button>
        </div>
      </div>

      {/* Join team */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 mb-4">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Join with invite code</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            placeholder="Paste invite code…"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            onClick={joinTeam}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg"
          >
            Join
          </button>
        </div>
      </div>

      {/* Team list */}
      {loading ? (
        <div className="text-sm text-gray-500">Loading teams…</div>
      ) : teams.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          You haven&apos;t joined any teams yet. Create one or paste an invite code above.
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map(team => (
            <div key={team.id} className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{team.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {team.memberCount} member{team.memberCount !== 1 ? 's' : ''} · {team.myRole}
                  </div>
                </div>
                {team.inviteCode && (
                  <button
                    onClick={() => copyCode(team.inviteCode)}
                    className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {copied === team.inviteCode ? 'Copied!' : 'Copy Invite'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
