'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import FocusTimer from '@/components/dashboard/FocusTimer';
import GoalsWidget from '@/components/dashboard/GoalsWidget';
import GamificationStats from '@/components/dashboard/GamificationStats';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getPusherClient } from '@/lib/pusher-client';
import { getToken, removeToken, removeUserData, getUserData } from '@/lib/auth-token';

const fetcher = (url: string) => {
  const token = getToken();
  if (!token) {
    window.location.href = '/auth/login';
    throw new Error('No token');
  }

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(async res => {
    if (res.status === 401) {
      removeToken();
      removeUserData();
      window.location.href = '/auth/login';
      throw new Error('Session expired');
    }
    if (!res.ok) {
      throw new Error('An error occurred while fetching the data.');
    }
    return res.json();
  });
};

export default function DashboardPage() {
  const router = useRouter();
  const [user] = useState<any>(() => {
    if (typeof window === 'undefined') return null;
    const token = getToken();
    const userData = getUserData();
    if (!token || !userData) return null;
    return userData;
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
    }
  }, [router, user]);

  const today = new Date().toISOString().split('T')[0];
  const { data: sessionData, error: sessionError, mutate } = useSWR(
    user ? `/api/sessions?date=${today}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  // Stable mutate reference for Pusher effect
  const stableMutate = useCallback(() => { mutate(); }, [mutate]);

  // Real-time updates via Pusher
  useEffect(() => {
    if (!user?.id) return;
    const pusherClient = getPusherClient();
    const channel = pusherClient.subscribe(`user-${user.id}`);
    channel.bind('session-update', stableMutate);
    channel.bind('activity-synced', stableMutate);
    return () => {
      channel.unbind_all();
      pusherClient.unsubscribe(`user-${user.id}`);
    };
  }, [user?.id, stableMutate]);

  const todaySessions = sessionData?.sessions || [];

  // Calculate derived state
  const currentSession = todaySessions.find((s: any) => !s.completed && !s.endTime) || null;
  const completedSessions = todaySessions.filter((s: any) => s.completed);
  const totalFocusTime = completedSessions.reduce((sum: number, s: any) => sum + (s.actualDuration || 0), 0);

  // Note: Streak calculation is currently mocked or requires a dedicated endpoint. 
  // For now we use the fetched stats if available, or simpler derived logic
  const currentStreak = 0; // Placeholder until API support

  const handleSessionStart = async (duration: number, type: string, projectId?: string) => {
    try {
      const token = getToken();
      await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plannedDuration: duration,
          sessionType: type,
          projectId,
        }),
      });
      // Revalidate data
      mutate();
    } catch (error) {
      console.error('Failed to start session', error);
    }
  };

  const handleSessionEnd = async (sessionId: string) => {
    try {
      const token = getToken();
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endTime: new Date().toISOString(),
          completed: true,
        }),
      });
      mutate();
    } catch (error) {
      console.error('Failed to end session', error);
    }
  };

  if (!user || (!sessionData && !sessionError)) { // Show skeleton while checking auth OR fetching initial data
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Focus Timer */}
          <div className="lg:col-span-2">
            <FocusTimer
              onSessionStart={handleSessionStart}
              onSessionEnd={handleSessionEnd}
              onSessionUpdate={() => mutate()}
              currentSession={currentSession}
              defaultDuration={user?.preferences?.preferredDuration || 25}
            />

            {/* Today's Sessions */}
            <Card className="mt-8">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Today&apos;s Sessions
              </h3>
              {todaySessions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No sessions yet today</p>
              ) : (
                <div className="space-y-2">
                  {todaySessions.map((session: any) => (
                    <Card
                      key={session.id}
                      variant="elevated"
                      padding="sm"
                      className="flex items-center justify-between"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {session.sessionType.charAt(0) + session.sessionType.slice(1).toLowerCase()} Session
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {session.endTime && ` – ${new Date(session.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-primary-500">
                          {session.actualDuration || session.plannedDuration} min
                        </span>
                        <Badge variant={session.completed ? 'success' : 'warning'} dot>
                          {session.completed ? 'Completed' : 'In Progress'}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Stats Sidebar */}
          <div className="space-y-6">
            <GoalsWidget
              currentMinutes={totalFocusTime}
              onGoalUpdate={() => mutate()}
            />

            <GamificationStats
              totalMinutes={totalFocusTime}
              totalSessions={completedSessions.length}
              currentStreak={currentStreak}
            />

            <Card>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                Today&apos;s Stats
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="text-3xl font-bold text-primary-500">
                    {Math.floor(totalFocusTime / 60)}h {totalFocusTime % 60}m
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Focus Time</div>
                </div>
                <div className="pt-4 border-t border-gray-200/60 dark:border-white/[0.06]">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {completedSessions.length}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sessions Completed</div>
                </div>
                <div className="pt-4 border-t border-gray-200/60 dark:border-white/[0.06]">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {currentStreak} days
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Current Streak</div>
                </div>
              </div>
            </Card>

            <div className="rounded-xl p-6 text-white bg-gradient-to-br from-primary-500 via-primary-600 to-accent-600 shadow-lg shadow-primary-500/20">
              <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                <span>🤖</span> AI Coach
              </h3>
              <p className="text-sm opacity-90 mb-4">
                Get personalized productivity advice based on your activity data.
              </p>
              <Link
                href="/coach"
                className="inline-block px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/20 text-white font-semibold text-sm rounded-lg transition-colors"
              >
                Talk to Coach →
              </Link>
            </div>

            {/* Notification Manager */}
            {/* Moved to Profile Page */}
          </div>
        </div>
    </div>
  );
}
