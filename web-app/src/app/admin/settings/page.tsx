'use client';

import { useState, useEffect } from 'react';
import { getToken } from '@/lib/auth-token';

interface Settings {
  payment: {
    lemonsqueezy: { enabled: boolean };
    bkash: { enabled: boolean };
  };
  email: {
    welcome: { enabled: boolean; subject: string; body: string };
    verification: { enabled: boolean; subject: string };
    digest: { enabled: boolean; subject: string; body: string };
  };
}

function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between py-3">
      <div>
        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
        {description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
          checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 space-y-2">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

const TEMPLATE_VARS: Record<string, string[]> = {
  welcome: ['{{name}}', '{{email}}', '{{appUrl}}'],
  digest: ['{{name}}', '{{sessionCount}}', '{{totalTime}}', '{{appUrl}}'],
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    fetch('/api/admin/settings', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setSettings)
      .catch(() => setError('Failed to load settings'));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    const token = getToken();

    const flat: Record<string, unknown> = {
      'payment.lemonsqueezy.enabled': settings.payment.lemonsqueezy.enabled,
      'payment.bkash.enabled': settings.payment.bkash.enabled,
      'email.welcome.enabled': settings.email.welcome.enabled,
      'email.welcome.subject': settings.email.welcome.subject,
      'email.welcome.body': settings.email.welcome.body,
      'email.verification.enabled': settings.email.verification.enabled,
      'email.verification.subject': settings.email.verification.subject,
      'email.digest.enabled': settings.email.digest.enabled,
      'email.digest.subject': settings.email.digest.subject,
      'email.digest.body': settings.email.digest.body,
    };

    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(flat),
    });

    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError('Failed to save settings');
    }
  };

  const update = (path: string[], value: unknown) => {
    setSettings(prev => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as Settings;
       
      let obj: any = next;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = value;
      return next;
    });
  };

  if (error && !settings) {
    return <div className="text-red-500 text-sm">{error}</div>;
  }
  if (!settings) {
    return <div className="animate-pulse text-gray-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-red-500">{error}</span>}
          {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Payment providers */}
      <Section title="Payment Providers" icon="💳">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Enable the payment providers you want to accept. Disabled providers will not show up on the pricing/upgrade page.
        </p>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <Toggle
            label="Lemon Squeezy"
            description="International card payments and subscriptions"
            checked={settings.payment.lemonsqueezy.enabled}
            onChange={v => update(['payment', 'lemonsqueezy', 'enabled'], v)}
          />
          <Toggle
            label="bKash"
            description="Bangladesh mobile banking — one-time payments"
            checked={settings.payment.bkash.enabled}
            onChange={v => update(['payment', 'bkash', 'enabled'], v)}
          />
        </div>
      </Section>

      {/* Welcome email */}
      <Section title="Welcome Email" icon="👋">
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <Toggle
            label="Send welcome email on signup"
            checked={settings.email.welcome.enabled}
            onChange={v => update(['email', 'welcome', 'enabled'], v)}
          />
        </div>
        {settings.email.welcome.enabled && (
          <div className="space-y-3 pt-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Subject</label>
              <input
                type="text"
                value={settings.email.welcome.subject}
                onChange={e => update(['email', 'welcome', 'subject'], e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Body (HTML)
                <span className="ml-2 font-normal text-gray-400">
                  Variables: {TEMPLATE_VARS.welcome.join(', ')}
                </span>
              </label>
              <textarea
                value={settings.email.welcome.body}
                onChange={e => update(['email', 'welcome', 'body'], e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-y focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        )}
      </Section>

      {/* Verification email */}
      <Section title="Email Verification" icon="✉️">
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <Toggle
            label="Send verification email on signup"
            description="Disabling this means users can log in without verifying their email"
            checked={settings.email.verification.enabled}
            onChange={v => update(['email', 'verification', 'enabled'], v)}
          />
        </div>
        {settings.email.verification.enabled && (
          <div className="pt-3">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Subject</label>
            <input
              type="text"
              value={settings.email.verification.subject}
              onChange={e => update(['email', 'verification', 'subject'], e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}
      </Section>

      {/* Weekly digest */}
      <Section title="Weekly Digest Email" icon="📊">
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <Toggle
            label="Send weekly digest every Monday"
            description="Users will receive a summary of their focus sessions from the previous week"
            checked={settings.email.digest.enabled}
            onChange={v => update(['email', 'digest', 'enabled'], v)}
          />
        </div>
        {settings.email.digest.enabled && (
          <div className="space-y-3 pt-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Subject</label>
              <input
                type="text"
                value={settings.email.digest.subject}
                onChange={e => update(['email', 'digest', 'subject'], e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Body (HTML)
                <span className="ml-2 font-normal text-gray-400">
                  Variables: {TEMPLATE_VARS.digest.join(', ')}
                </span>
              </label>
              <textarea
                value={settings.email.digest.body}
                onChange={e => update(['email', 'digest', 'body'], e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-y focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
