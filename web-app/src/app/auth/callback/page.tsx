'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setToken, setUserData } from '@/lib/auth-token';

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const session = searchParams.get('session');

    // Legacy compatibility: if a token is still in the URL (e.g. an old
    // OAuth redirect from before the exchange flow), accept it once. New
    // redirects use the session-exchange path above.
    const legacyToken = searchParams.get('token');
    const legacyUser = searchParams.get('user');
    const legacyRedirect = searchParams.get('redirect') || '/dashboard';

    if (session) {
      let cancelled = false;
      (async () => {
        try {
          const res = await fetch('/api/auth/callback-exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session }),
          });
          if (!res.ok) {
            router.replace('/auth/login?error=oauth_failed');
            return;
          }
          const data = await res.json();
          if (cancelled) return;
          if (!data?.token || !data?.user) {
            router.replace('/auth/login?error=oauth_failed');
            return;
          }
          setToken(data.token, true);
          setUserData(data.user, true);
          router.replace(data.redirect || '/dashboard');
        } catch {
          if (!cancelled) router.replace('/auth/login?error=oauth_failed');
        }
      })();
      return () => {
        cancelled = true;
      };
    } else if (legacyToken && legacyUser) {
      try {
        const user = JSON.parse(legacyUser);
        setToken(legacyToken, true);
        setUserData(user, true);
        router.replace(legacyRedirect);
      } catch {
        router.replace('/auth/login?error=oauth_failed');
      }
    } else {
      router.replace('/auth/login?error=oauth_failed');
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackInner />
    </Suspense>
  );
}
