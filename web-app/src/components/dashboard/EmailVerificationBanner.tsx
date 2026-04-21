'use client';

import { useState, useEffect } from 'react';
import { getToken, getUserData, setUserData } from '@/lib/auth-token';
import { Button } from '@/components/ui/Button';

type StoredUser = {
  email?: string;
  emailVerified?: string | null;
};

export default function EmailVerificationBanner() {
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const userData = getUserData() as StoredUser | null;
    if (!userData) {
      setIsVerified(true);
      return;
    }
    setEmail(userData.email || '');

    if (userData.emailVerified) {
      setIsVerified(true);
      return;
    }

    // Unverified locally — double-check against the server in case the user
    // just verified in another tab.
    const token = getToken();
    if (!token) {
      setIsVerified(false);
      return;
    }
    fetch('/api/user/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.emailVerified) {
          const remember = !!localStorage.getItem('user');
          setUserData({ ...userData, emailVerified: data.user.emailVerified }, remember);
          setIsVerified(true);
        } else {
          setIsVerified(false);
        }
      })
      .catch(() => setIsVerified(false));
  }, []);

  if (isVerified !== false) return null;

  const handleResend = async () => {
    setSending(true);
    setMessage(null);
    try {
      const token = getToken();
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessage(res.ok ? 'Verification email sent. Check your inbox.' : data.error || 'Failed to send verification email.');
    } catch {
      setMessage('Failed to send verification email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Please verify your email address
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            {email ? (
              <>We sent a verification link to <strong>{email}</strong>. Check your inbox to activate your account fully.</>
            ) : (
              <>Check your inbox for the verification link to activate your account fully.</>
            )}
          </p>
          {message && (
            <p className="mt-2 text-xs text-amber-900 dark:text-amber-100">{message}</p>
          )}
          <div className="mt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleResend}
              disabled={sending}
            >
              {sending ? 'Sending…' : 'Resend verification email'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
