import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginPage } from './routes/LoginPage';
import { DashboardPage } from './routes/DashboardPage';
import { useAuthStore } from './lib/auth';

export default function App() {
  const { token, hydrated, hydrate } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Restore the saved token (if any) on first mount before deciding which route to land on.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Once hydration finishes, redirect unauthenticated users to /login and
  // authenticated users away from /login.
  useEffect(() => {
    if (!hydrated) return;
    const onLogin = location.pathname === '/login';
    if (!token && !onLogin) navigate('/login', { replace: true });
    if (token && onLogin) navigate('/', { replace: true });
  }, [hydrated, token, location.pathname, navigate]);

  if (!hydrated) {
    return <SplashScreen />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function SplashScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-3xl font-bold mb-2">
          Flow<span className="text-primary-500">Shield</span>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>
      </div>
    </div>
  );
}
