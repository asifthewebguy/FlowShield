'use client';
import Link from 'next/link';

export default function Hero() {
  return (
    <section className="relative pt-32 pb-20 bg-surface-0 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-900/40 text-primary-400 border border-primary-800/60 mb-8">
          <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
          </svg>
          AI-Powered Productivity
        </div>

        {/* Headline */}
        <h1 className="font-display text-5xl md:text-7xl font-bold text-white tracking-tight leading-[1.1]">
          Master Your Focus.
          <br />
          <span className="text-primary-400">Amplify Your Output.</span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          The all-in-one platform that tracks your work, blocks distractions, and
          uses AI to coach you toward peak productivity.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
          <Link
            href="/auth/signup"
            className="px-8 py-4 text-lg bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
          >
            Get Started Free
          </Link>
          <Link
            href="/auth/login"
            className="px-8 py-4 text-lg border border-gray-700 text-gray-300 rounded-xl font-semibold hover:border-primary-700 hover:text-primary-400 transition-colors"
          >
            Sign In
          </Link>
        </div>

        {/* Mock Timer Card */}
        <div className="mt-16 max-w-lg mx-auto">
          <div className="bg-surface-1 border border-surface-3 rounded-2xl p-8">
            {/* Session type pills */}
            <div className="flex justify-center gap-2 mb-6">
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-primary-600 text-white">
                Work
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-surface-3 text-gray-400">
                Study
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-surface-3 text-gray-400">
                Creative
              </span>
            </div>

            {/* Timer display */}
            <div className="text-7xl font-mono font-bold text-primary-400 tabular-nums">
              18:42
            </div>
            <p className="text-sm text-gray-500 mt-2">Focus Session in Progress</p>

            {/* Progress bar */}
            <div className="mt-6 h-2 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full"
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
