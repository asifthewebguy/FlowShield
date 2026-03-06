export const metadata = {
  title: 'Privacy Policy | FlowShield',
  description: 'How FlowShield collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-900 py-16 px-4">
      <div className="max-w-3xl mx-auto prose dark:prose-invert">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: March 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">1. What We Collect</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-3">FlowShield collects the following data to provide its service:</p>
          <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-1">
            <li><strong>Account data:</strong> email address and optional display name</li>
            <li><strong>Session data:</strong> focus session duration, type, and productivity scores</li>
            <li><strong>Activity data:</strong> application names, window titles (hashed), and website URLs used during sessions</li>
            <li><strong>Goals and preferences:</strong> your configured focus goals and app settings</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">2. How We Use Your Data</h2>
          <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-1">
            <li>To provide and improve the FlowShield service</li>
            <li>To calculate your productivity scores and generate insights</li>
            <li>To send session reminders and weekly summary emails (if enabled)</li>
            <li>We do <strong>not</strong> sell your data to third parties</li>
            <li>We do <strong>not</strong> use your data for advertising</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">3. Data Storage</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Activity data is collected locally by the desktop app and uploaded to our servers over HTTPS.
            All data is stored in an encrypted PostgreSQL database hosted on Neon.
            Desktop app data is encrypted locally using SQLCipher.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">4. Cookies</h2>
          <p className="text-gray-600 dark:text-gray-400">
            FlowShield uses only functional cookies necessary to keep you signed in.
            We do not use tracking or advertising cookies.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">5. Your Rights (GDPR)</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-3">If you are in the EU/EEA, you have the right to:</p>
          <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-1">
            <li><strong>Access:</strong> download all your data via Settings &rarr; Export Data</li>
            <li><strong>Erasure:</strong> delete your account and all associated data via Settings &rarr; Delete Account</li>
            <li><strong>Portability:</strong> your export is provided in JSON format</li>
            <li><strong>Objection:</strong> contact us at support@flowshield.app</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">6. Third-Party Services</h2>
          <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-1">
            <li><strong>Resend:</strong> used to send transactional emails</li>
            <li><strong>Sentry:</strong> used for error monitoring (no personal data in error reports)</li>
            <li><strong>Neon:</strong> database hosting provider</li>
            <li><strong>Netlify:</strong> web hosting provider</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">7. Contact</h2>
          <p className="text-gray-600 dark:text-gray-400">
            For privacy-related questions, email us at{' '}
            <a href="mailto:support@flowshield.app" className="text-primary-600 hover:underline">
              support@flowshield.app
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
