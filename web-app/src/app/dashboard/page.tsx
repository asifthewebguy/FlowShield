'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import FocusTimer from '@/components/dashboard/FocusTimer';
import GoalsWidget from '@/components/dashboard/GoalsWidget';
import GamificationStats from '@/components/dashboard/GamificationStats';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import Header from '@/components/layout/Header';

const fetcher = (url: string) => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No token');

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(async res => {
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
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (!token || !userData) return null;
    return JSON.parse(userData);
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
    { refreshInterval: 60000 } // Auto-refresh every minute
  );

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
      const token = localStorage.getItem('token');
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
      const token = localStorage.getItem('token');
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <main className="container mx-auto px-4 py-8">
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
            <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Today&apos;s Sessions
              </h3>
              {todaySessions.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No sessions yet today</p>
              ) : (
                <div className="space-y-3">
                  {todaySessions.map((session: any) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {session.sessionType.charAt(0) + session.sessionType.slice(1).toLowerCase()} Session
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {session.endTime && ` - ${new Date(session.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-primary-600">
                          {session.actualDuration || session.plannedDuration} min
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {session.completed ? 'Completed' : 'In Progress'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                Today&apos;s Stats
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="text-3xl font-bold text-primary-600">
                    {Math.floor(totalFocusTime / 60)}h {totalFocusTime % 60}m
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Focus Time</div>
                </div>
                <div className="pt-4 border-t dark:border-gray-700">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {completedSessions.length}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Sessions Completed</div>
                </div>
                <div className="pt-4 border-t dark:border-gray-700">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {currentStreak} days
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current Streak</div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl shadow-lg p-6 text-white">
              <h3 className="text-lg font-bold mb-2">Quick Tips</h3>
              <ul className="text-sm space-y-2 opacity-90">
                <li>Take short breaks between sessions</li>
                <li>Eliminate distractions before starting</li>
                <li>Stay hydrated during focus time</li>
              </ul>
            </div>

            {/* Notification Manager */}
            {/* Moved to Profile Page */}
          </div>
        </div>
      </main>
    </div>
  );
}
