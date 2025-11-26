export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <main className="container mx-auto px-4 py-16">
        <div className="text-center space-y-8">
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white">
            Flow<span className="text-primary-600">Shield</span>
          </h1>
          <p className="text-2xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            AI-Powered Productivity & Focus Management Platform
          </p>
          <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
            Build better focus habits through structured work sessions,
            intelligent activity tracking, and actionable analytics.
          </p>
          <div className="flex gap-4 justify-center pt-8">
            <a
              href="/auth/signup"
              className="px-8 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors"
            >
              Get Started Free
            </a>
            <a
              href="/auth/login"
              className="px-8 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-semibold hover:border-primary-600 hover:text-primary-600 transition-colors"
            >
              Sign In
            </a>
          </div>
        </div>

        <div className="mt-24 grid md:grid-cols-3 gap-8">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">⏱️</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              Focus Session Manager
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Structured work blocks with intelligent break scheduling using proven productivity frameworks.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              Activity Monitor
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Passive tracking of computer and mobile usage during work sessions without manual logging.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">🧠</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              Productivity Intelligence
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Analytics engine that transforms raw activity data into actionable insights about your focus.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
