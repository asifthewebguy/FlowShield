'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { setToken, setUserData } from '@/lib/auth-token';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setSuccess('Account created successfully! Please sign in.');
    }
    if (searchParams.get('error') === 'oauth_cancelled') {
      setError('Google sign-in was cancelled.');
    } else if (searchParams.get('error')) {
      setError('Google sign-in failed. Please try again.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, rememberMe }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setError('Please verify your email before signing in. Check your inbox for the verification link.');
        } else {
          setError(data.error || 'Login failed');
        }
        return;
      }

      setToken(data.token, rememberMe);
      setUserData(data.user, rememberMe);

      // Check if user has completed onboarding
      if (!data.user.preferences?.workStyle) {
        router.push('/onboarding');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Flow<span className="text-primary-500">Shield</span>
          </h1>
          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Sign in to continue your focus journey
          </p>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/20 text-danger-600 dark:text-danger-400 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-success-50 dark:bg-success-500/10 border border-success-100 dark:border-success-500/20 text-success-700 dark:text-success-400 px-4 py-3 rounded-xl text-sm">
              {success}
            </div>
          )}

          <div className="space-y-4">
            <Input
              label="Email address"
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="you@example.com"
            />

            <Input
              label="Password"
              id="password"
              name="password"
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-white/20 text-primary-500 focus:ring-primary-500"
              />
              Remember me
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-primary-500 hover:text-primary-400"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
            Sign in
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-background text-gray-500">Or continue with</span>
            </div>
          </div>

          <a
            href="/api/auth/google"
            className="w-full flex items-center justify-center gap-3 h-10 px-4 border border-gray-200 dark:border-white/[0.08] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-surface-2 hover:bg-gray-50 dark:hover:bg-surface-3 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </a>

          <div className="text-center text-sm">
            <span className="text-gray-500 dark:text-gray-400">Don&apos;t have an account? </span>
            <Link href="/auth/signup" className="font-medium text-primary-500 hover:text-primary-400">
              Sign up
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
