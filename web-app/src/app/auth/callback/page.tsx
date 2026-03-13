'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setToken, setUserData } from '@/lib/auth-token';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');
    const redirect = searchParams.get('redirect') || '/dashboard';

    if (token && userParam) {
      try {
        const user = JSON.parse(userParam);
        setToken(token, true);
        setUserData(user, true);
        router.replace(redirect);
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
