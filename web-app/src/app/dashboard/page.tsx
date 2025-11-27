'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import FocusTimer from '@/components/dashboard/FocusTimer';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [todaySessions, setTodaySessions] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalFocusTime: 0,
    sessionsCompleted: 0,
    currentStreak: 0,
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token || !userData) {
      router.push('/auth/login');
      return;
    }

    setUser(JSON.parse(userData));
    fetchTodaySessions(token);
  }, [router]);

  const fetchTodaySessions = async (token: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/sessions?date=${today}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTodaySessions(data.sessions);

        // Find active session
        const active = data.sessions.find((s: any) => !s.completed && !s.endTime);
        if (active) {
          setCurrentSession(active);
        }

        // Calculate stats
        const completed = data.sessions.filter((s: any) => s.completed);
        const totalMinutes = completed.reduce((sum: number, s: any) => sum + (s.actualDuration || 0), 0);

        setStats({
          totalFocusTime: totalMinutes,
          sessionsCompleted: completed.length,
          currentStreak: 0, // TODO: Calculate streak
        });
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const handleSessionStart = async (duration: number, type: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plannedDuration: duration,
          sessionType: type,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentSession(data.session);
        fetchTodaySessions(token!);
      }
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const handleSessionEnd = async (sessionId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/sessions/${sessionId}`, {
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

      if (response.ok) {
        setCurrentSession(null);
        fetchTodaySessions(token!);
      }
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Flow<span className="text-primary-600">Shield</span>
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-gray-900 dark:text-white font-semibold"
            >
              Dashboard
            </Link>
            <Link
              href="/analytics"
              className="text-gray-600 dark:text-gray-400 hover:text-primary-600"
            >
              Analytics
            </Link>
            <Link
              href="/profile"
              className="text-gray-600 dark:text-gray-400 hover:text-primary-600"
            >
              Profile
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Focus Timer */}
          <div className="lg:col-span-2">
            <FocusTimer
              onSessionStart={handleSessionStart}
              onSessionEnd={handleSessionEnd}
              currentSession={currentSession}
            />

            {/* Today's Sessions */}
            <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Today's Sessions
              </h3>
              {todaySessions.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No sessions yet today</p>
              ) : (
                <div className="space-y-3">
                  {todaySessions.map((session) => (
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
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                Today's Stats
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="text-3xl font-bold text-primary-600">
                    {Math.floor(stats.totalFocusTime / 60)}h {stats.totalFocusTime % 60}m
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Focus Time</div>
                </div>
                <div className="pt-4 border-t dark:border-gray-700">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.sessionsCompleted}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Sessions Completed</div>
                </div>
                <div className="pt-4 border-t dark:border-gray-700">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.currentStreak} days
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
          </div>
        </div>
      </main>
    </div>
  );
}
