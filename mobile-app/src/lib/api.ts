import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://flowshield.app';

const TOKEN_KEY = 'flowshield_token';
const USER_KEY = 'flowshield_user';

export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface Session {
  id: string;
  startTime: string;
  endTime: string | null;
  plannedDuration: number;
  actualDuration: number | null;
  sessionType: 'WORK' | 'STUDY' | 'CREATIVE';
  productivityScore: number | null;
  completed: boolean;
  isPaused: boolean;
}

export interface AnalyticsSummary {
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  totalFocusMinutes: number;
  averageProductivityScore: number;
}

export interface DailyStat {
  date: string;
  totalMinutes: number;
  productivityScore: number;
  completedCount: number;
}

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function getStoredUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function setStoredUser(user: User): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

async function removeStoredUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
}

export const api = {
  getToken,
  setToken,
  removeToken,
  getStoredUser,
  setStoredUser,
  removeStoredUser,

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Login failed');
    }
    const data = await res.json();
    await setToken(data.token);
    await setStoredUser(data.user);
    return data;
  },

  async logout(): Promise<void> {
    await removeToken();
    await removeStoredUser();
  },

  async getAnalytics(period: 'week' | 'month' = 'week'): Promise<{
    summary: AnalyticsSummary;
    dailyStats: DailyStat[];
    peakTimes: { peakPeriod: string };
  }> {
    const res = await apiFetch(`/api/analytics?period=${period}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  },

  async getSessions(limit = 20): Promise<Session[]> {
    const res = await apiFetch(`/api/sessions?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch sessions');
    const data = await res.json();
    return data.sessions || data;
  },

  async startSession(plannedDuration: number, sessionType: string = 'WORK'): Promise<Session> {
    const res = await apiFetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        plannedDuration,
        sessionType,
        startTime: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to start session');
    }
    return res.json();
  },

  async endSession(sessionId: string, actualDuration: number): Promise<Session> {
    const res = await apiFetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        endTime: new Date().toISOString(),
        actualDuration,
        completed: true,
      }),
    });
    if (!res.ok) throw new Error('Failed to end session');
    return res.json();
  },

  async cancelSession(sessionId: string): Promise<Session> {
    const res = await apiFetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        endTime: new Date().toISOString(),
        completed: false,
      }),
    });
    if (!res.ok) throw new Error('Failed to cancel session');
    return res.json();
  },

  async syncActivity(activities: Array<{
    timestamp: string;
    windowTitle: string;
    processName: string;
    applicationName: string;
    durationSeconds: number;
    category: string;
    sessionId?: string;
  }>): Promise<void> {
    const res = await apiFetch('/api/activity/sync', {
      method: 'POST',
      body: JSON.stringify({ activities, source: 'mobile' }),
    });
    if (!res.ok) throw new Error('Failed to sync activity');
  },

  async registerPushToken(pushToken: string): Promise<void> {
    const res = await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ pushToken, platform: 'expo' }),
    });
    if (!res.ok) {
      console.warn('Push token registration failed');
    }
  },
};
