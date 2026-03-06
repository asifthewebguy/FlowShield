'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const CONSENT_KEY = 'flowshield_cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          FlowShield uses functional cookies to keep you signed in. We do not use tracking or
          advertising cookies.{' '}
          <Link href="/privacy" className="text-primary-600 hover:underline">
            Privacy Policy
          </Link>
        </p>
        <button
          onClick={accept}
          className="shrink-0 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
