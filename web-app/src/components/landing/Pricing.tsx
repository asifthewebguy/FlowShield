'use client';
import Link from 'next/link';
import { useScrollReveal } from './useScrollReveal';

const features = [
  'Unlimited focus sessions',
  'Activity tracking across all devices',
  'Full analytics dashboard',
  'AI productivity coach',
  'Teams & leaderboard',
  'Cross-platform sync',
  'Distraction blocking (desktop)',
  'Data export (CSV & JSON)',
  'Goals & streak tracking',
  'Badges & achievements',
];

export default function Pricing() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      id="pricing"
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-surface-1"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header — no label, simpler treatment */}
        <div className={`text-center mb-12 animate-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white">
            Free to Get Started
          </h2>
          <p className="text-gray-400 mt-4 max-w-xl mx-auto">
            All core features are free. No credit card required. No time limit.
          </p>
        </div>

        <div className={`max-w-md mx-auto animate-reveal animate-reveal-delay-2 ${isVisible ? 'visible' : ''}`}>
          <div className="bg-surface-3/40 border border-surface-3 rounded-2xl p-8">
            <div className="text-center mb-8">
              <p className="text-sm text-gray-400 mb-1">Everything included</p>
              <div className="font-display text-5xl font-bold text-white">Free</div>
              <p className="text-sm text-gray-500 mt-1">forever</p>
            </div>

            <ul className="space-y-3 mb-8">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                  <svg className="w-5 h-5 text-primary-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href="/auth/signup"
              className="block w-full py-3 text-center bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
