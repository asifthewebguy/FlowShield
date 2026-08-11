import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, User, setOnUnauthorized } from './api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  sessionExpired: false,
  login: async () => {},
  logout: async () => {},
  logoutAll: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    // Flag expiry instead of hard-logout: a running focus timer must keep
    // running; the user re-authenticates via the banner when they choose.
    setOnUnauthorized(() => setSessionExpired(true));
    (async () => {
      try {
        const token = await api.getToken();
        if (token) {
          const stored = await api.getStoredUser();
          if (stored) {
            setUser(stored);
          }
        }
      } catch {
        // Token invalid or storage error
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const { user: u } = await api.login(email, password);
    setUser(u);
    setSessionExpired(false);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setSessionExpired(false);
  };

  const logoutAll = async () => {
    await api.logoutAll();
    setUser(null);
    setSessionExpired(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, login, logout, logoutAll }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
