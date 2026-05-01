'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Connection failed. Please try again.');
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
            Reset your password
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <div className="bg-success-50 dark:bg-success-500/10 border border-success-100 dark:border-success-500/20 text-success-700 dark:text-success-400 px-4 py-3 rounded-xl text-sm">
              If an account exists for <strong>{email}</strong>, a password-reset
              link has been sent. The link expires in 1 hour.
            </div>
            <Link
              href="/auth/login"
              className="block text-center text-sm font-medium text-primary-500 hover:text-primary-400"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/20 text-danger-600 dark:text-danger-400 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <Input
              label="Email address"
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
              Send reset link
            </Button>

            <div className="text-center text-sm">
              <Link
                href="/auth/login"
                className="font-medium text-primary-500 hover:text-primary-400"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
