'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { validatePassword } from '@/lib/auth';

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [validationErrors, setValidationErrors] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Realtime Email Validation
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setFormData({ ...formData, email });

    if (email.split('@').length > 2) {
      setValidationErrors(prev => ({ ...prev, email: 'Email cannot contain multiple "@" symbols' }));
    } else {
      setValidationErrors(prev => ({ ...prev, email: '' }));
    }
  };

  // On-Blur Password Validation
  const handlePasswordBlur = () => {
    const result = validatePassword(formData.password);
    if (!result.valid) {
      setValidationErrors(prev => ({ ...prev, password: result.error || 'Invalid password' }));
    } else {
      setValidationErrors(prev => ({ ...prev, password: '' }));
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, password: e.target.value });
    if (validationErrors.password) {
      // Clear error while typing if they fix it (optional better UX, but sticking to on-blur for check)
      // Actually, let's clear it to avoid annoyance, but full re-check happens on blur
      setValidationErrors(prev => ({ ...prev, password: '' }));
    }
  };

  // On-Blur Confirm Password Validation
  const handleConfirmBlur = () => {
    if (formData.password !== formData.confirmPassword) {
      setValidationErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
    } else {
      setValidationErrors(prev => ({ ...prev, confirmPassword: '' }));
    }
  };

  const handleConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, confirmPassword: e.target.value });
    if (validationErrors.confirmPassword) {
      // Clear error if they start typing again to fix it
      setValidationErrors(prev => ({ ...prev, confirmPassword: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Final check before submit
    const passResult = validatePassword(formData.password);
    if (!passResult.valid) {
      setValidationErrors(prev => ({ ...prev, password: passResult.error || 'Invalid password' }));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setValidationErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
      return;
    }

    if (validationErrors.email || validationErrors.password || validationErrors.confirmPassword) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Signup failed');
        return;
      }

      router.push('/auth/login?registered=true');
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Flow<span className="text-primary-600">Shield</span>
          </h1>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Start building better focus habits today
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email address *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleEmailChange}
                className={`mt-1 block w-full px-3 py-2 border ${validationErrors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white`}
                placeholder="you@example.com"
              />
              {validationErrors.email && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handlePasswordChange}
                onBlur={handlePasswordBlur}
                className={`mt-1 block w-full px-3 py-2 border ${validationErrors.password ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white`}
                placeholder="Min. 8 characters, 1 uppercase, 1 number"
              />
              {validationErrors.password && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.password}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm Password *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={handleConfirmChange}
                onBlur={handleConfirmBlur}
                className={`mt-1 block w-full px-3 py-2 border ${validationErrors.confirmPassword ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white`}
              />
              {validationErrors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.confirmPassword}</p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || !!validationErrors.email || !!validationErrors.password}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>

          <div className="text-center text-sm">
            <span className="text-gray-600 dark:text-gray-400">Already have an account? </span>
            <Link href="/auth/login" className="font-medium text-primary-600 hover:text-primary-500">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
