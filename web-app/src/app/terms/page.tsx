export const metadata = {
  title: 'Terms of Service | FlowShield',
  description: 'Terms and conditions for using FlowShield.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-900 py-16 px-4">
      <div className="max-w-3xl mx-auto prose dark:prose-invert">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: March 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">1. Acceptance of Terms</h2>
          <p className="text-gray-600 dark:text-gray-400">
            By creating an account or using FlowShield (&ldquo;the Service&rdquo;), you agree to these Terms of Service.
            If you do not agree, do not use the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">2. Description of Service</h2>
          <p className="text-gray-600 dark:text-gray-400">
            FlowShield is a productivity and focus management platform that helps you track focus sessions,
            monitor application usage, and improve your deep work habits. The Service includes a web dashboard,
            desktop application, and associated APIs.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">3. Account Registration</h2>
          <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-1">
            <li>You must provide a valid email address to create an account</li>
            <li>You are responsible for maintaining the security of your account credentials</li>
            <li>You may not share your account with others or create accounts on behalf of others without their consent</li>
            <li>You must be at least 13 years old to use the Service</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">4. Acceptable Use</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-3">You agree not to:</p>
          <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-1">
            <li>Use the Service for any unlawful purpose</li>
            <li>Attempt to reverse engineer, hack, or gain unauthorized access to the Service or other users&apos; data</li>
            <li>Transmit malware, spam, or any harmful content through the Service</li>
            <li>Use automated scripts to abuse the Service or its APIs</li>
            <li>Impersonate any person or entity</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">5. Your Data</h2>
          <p className="text-gray-600 dark:text-gray-400">
            You retain ownership of all data you submit to FlowShield. We process your data solely to provide
            the Service as described in our{' '}
            <a href="/privacy" className="text-primary-600 hover:underline">Privacy Policy</a>.
            You can export or delete your data at any time via Settings.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">6. Service Availability</h2>
          <p className="text-gray-600 dark:text-gray-400">
            We strive for high availability but do not guarantee uninterrupted access to the Service.
            We may perform maintenance, updates, or suspend access in cases of abuse or technical issues
            without prior notice.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">7. Intellectual Property</h2>
          <p className="text-gray-600 dark:text-gray-400">
            FlowShield and its original content, features, and functionality are owned by FlowShield and are
            protected by applicable intellectual property laws. You may not copy, modify, or distribute the
            Service without our express written permission.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">8. Disclaimer of Warranties</h2>
          <p className="text-gray-600 dark:text-gray-400">
            The Service is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied.
            We do not warrant that the Service will be error-free, secure, or meet your specific requirements.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">9. Limitation of Liability</h2>
          <p className="text-gray-600 dark:text-gray-400">
            To the fullest extent permitted by law, FlowShield shall not be liable for any indirect, incidental,
            special, or consequential damages arising from your use of the Service, including loss of data or
            business interruption.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">10. Changes to Terms</h2>
          <p className="text-gray-600 dark:text-gray-400">
            We may update these terms from time to time. We will notify you of significant changes via email
            or a notice in the app. Continued use of the Service after changes constitutes acceptance of the
            updated terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">11. Termination</h2>
          <p className="text-gray-600 dark:text-gray-400">
            You may delete your account at any time via Settings &rarr; Delete Account. We reserve the right
            to suspend or terminate accounts that violate these terms. Upon termination, your data will be
            deleted in accordance with our Privacy Policy.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">12. Contact</h2>
          <p className="text-gray-600 dark:text-gray-400">
            For questions about these terms, email us at{' '}
            <a href="mailto:support@flowshield.app" className="text-primary-600 hover:underline">
              support@flowshield.app
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
