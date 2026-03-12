'use client';

export default function Hero() {
  return (
    <section className="relative pt-32 pb-20 bg-gray-950 overflow-hidden">
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-900/20 via-gray-950 to-gray-950" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-900/50 text-primary-400 border border-primary-800 mb-8">
          <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
          </svg>
          AI-Powered Productivity
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight leading-tight">
          Master Your Focus.
          <br />
          <span className="text-primary-400">Amplify Your Output.</span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
          The all-in-one platform that tracks your work, blocks distractions, and
          uses AI to coach you toward peak productivity.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
          <a
            href="/auth/signup"
            className="px-8 py-4 text-lg bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/25"
          >
            Get Started Free
          </a>
          <a
            href="/auth/login"
            className="px-8 py-4 text-lg border-2 border-gray-600 text-gray-300 rounded-xl font-semibold hover:border-primary-600 hover:text-primary-400 transition-colors"
          >
            Sign In
          </a>
        </div>

        {/* Mock Timer Card */}
        <div className="mt-16 max-w-lg mx-auto">
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-8 backdrop-blur shadow-2xl shadow-primary-900/10">
            {/* Session type pills */}
            <div className="flex justify-center gap-2 mb-6">
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-primary-600 text-white">
                Work
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-gray-700 text-gray-400">
                Study
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-gray-700 text-gray-400">
                Creative
              </span>
            </div>

            {/* Timer display */}
            <div className="text-7xl font-mono font-bold text-primary-400 tabular-nums">
              18:42
            </div>
            <p className="text-sm text-gray-500 mt-2">Focus Session in Progress</p>

            {/* Progress bar */}
            <div className="mt-6 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full"
                style={{ width: '62%' }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">62% complete</p>
          </div>
        </div>
      </div>
    </section>
  );
}
