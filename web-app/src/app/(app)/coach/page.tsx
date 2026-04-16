'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth-token';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function CoachPage() {
  const router = useRouter();
  const [advice, setAdvice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const adviceRef = useRef('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/auth/login');
    }
  }, [router]);

  const fetchAdvice = async (cacheOnly = false) => {
    const token = getToken();
    if (!token) return;

    setIsLoading(true);
    setError(null);
    setAdvice('');
    adviceRef.current = '';

    try {
      const url = cacheOnly ? '/api/coach/advice?cacheOnly=1' : '/api/coach/advice';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 204 No Content = cache probe miss. Show empty state + let the Generate button handle it.
      if (res.status === 204) {
        setIsLoading(false);
        setHasLoaded(false);
        return;
      }

      if (!res.ok || !res.body) {
        setError('Failed to get advice. Please try again.');
        setIsLoading(false);
        return;
      }

      const contentType = res.headers.get('Content-Type') || '';

      // JSON response — cached advice, zero-activity empty state, or probe hit.
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else if (typeof data.advice === 'string') {
          adviceRef.current = data.advice;
          setAdvice(data.advice);
        }
        setIsLoading(false);
        setHasLoaded(true);
        return;
      }

      // SSE stream — live Claude generation
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
    } catch {
      setError('Connection failed. Please try again.');
      setIsLoading(false);
    }
  };

  // On mount, probe the cache only. If cached or zero-activity, render instantly.
  // Otherwise the user clicks "Generate advice" to burn a Claude call explicitly.
  useEffect(() => {
    fetchAdvice(true); // eslint-disable-line react-hooks/set-state-in-effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <span className="text-4xl">🤖</span>
            AI Productivity Coach
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Personalized advice based on your last 7 days of activity.
          </p>
        </div>

        <Card className="min-h-[200px]">
          {isLoading && !advice && (
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400 text-sm">
              <svg className="animate-spin h-5 w-5 text-primary-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Analyzing your productivity data…</span>
            </div>
          )}

          {error && (
            <div className="text-danger-500 dark:text-danger-400 text-sm">{error}</div>
          )}

          {advice && (
            <div className="prose dark:prose-invert max-w-none">
              <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">
                {advice}
                {isLoading && (
                  <span className="inline-block w-1 h-4 bg-primary-500 ml-0.5 animate-pulse align-middle" />
                )}
              </p>
            </div>
          )}

          {!isLoading && !advice && !error && !hasLoaded && (
            <div className="flex flex-col items-start gap-3 text-gray-600 dark:text-gray-300 text-sm">
              <p>
                Nothing cached yet. Click below to generate fresh advice from your last 7 days of activity.
              </p>
              <Button variant="primary" size="sm" onClick={() => fetchAdvice(false)}>
                Generate advice
              </Button>
            </div>
          )}
        </Card>

        {hasLoaded && advice && (
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => fetchAdvice(false)}>
              Refresh Advice
            </Button>
          </div>
        )}

        {/* Teams Section */}
        <TeamsSection />
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

  const token = typeof window !== 'undefined' ? getToken() : null;

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
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <span>👥</span> Teams
      </h2>

      {message && (
        <div className="mb-3 text-sm text-primary-600 dark:text-primary-400">{message}</div>
      )}

      <Card className="mb-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Create a new team</p>
        <div className="flex gap-2">
          <Input
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            placeholder="Team name…"
            className="flex-1"
          />
          <Button variant="primary" size="sm" onClick={createTeam}>Create</Button>
        </div>
      </Card>

      <Card className="mb-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Join with invite code</p>
        <div className="flex gap-2">
          <Input
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            placeholder="Paste invite code…"
            className="flex-1"
          />
          <Button variant="secondary" size="sm" onClick={joinTeam}>Join</Button>
        </div>
      </Card>

      {loading ? (
        <div className="text-sm text-gray-500">Loading teams…</div>
      ) : teams.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          You haven&apos;t joined any teams yet. Create one or paste an invite code above.
        </p>
      ) : (
        <div className="space-y-3">
          {teams.map(team => (
            <Card key={team.id} variant="elevated" padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{team.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {team.memberCount} member{team.memberCount !== 1 ? 's' : ''} · {team.myRole}
                  </div>
                </div>
                {team.inviteCode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyCode(team.inviteCode)}
                  >
                    {copied === team.inviteCode ? 'Copied!' : 'Copy Invite'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
