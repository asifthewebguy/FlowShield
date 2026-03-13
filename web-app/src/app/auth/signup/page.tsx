'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { validatePassword } from '@/lib/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Flow<span className="text-primary-500">Shield</span>
          </h1>
          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
            Create your account
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Start building better focus habits today
          </p>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/20 text-danger-600 dark:text-danger-400 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <Input
              label="Full Name"
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
            />

            <Input
              label="Email address *"
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleEmailChange}
              placeholder="you@example.com"
              error={validationErrors.email}
            />

            <Input
              label="Password *"
              id="password"
              name="password"
              type="password"
              required
              value={formData.password}
              onChange={handlePasswordChange}
              onBlur={handlePasswordBlur}
              placeholder="Min. 8 characters, 1 uppercase, 1 number"
              error={validationErrors.password}
            />

            <Input
              label="Confirm Password *"
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              value={formData.confirmPassword}
              onChange={handleConfirmChange}
              onBlur={handleConfirmBlur}
              error={validationErrors.confirmPassword}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={loading || !!validationErrors.email || !!validationErrors.password}
            className="w-full"
          >
            Create account
          </Button>

          <div className="text-center text-sm">
            <span className="text-gray-500 dark:text-gray-400">Already have an account? </span>
            <Link href="/auth/login" className="font-medium text-primary-500 hover:text-primary-400">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
