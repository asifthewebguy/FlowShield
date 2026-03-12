'use client';
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
      className="py-24 bg-gray-950"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center mb-12 animate-reveal ${isVisible ? 'visible' : ''}`}>
          <p className="text-primary-400 text-sm font-semibold tracking-wider uppercase">
            Pricing
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">
            Free to Get Started
          </h2>
          <p className="text-gray-400 mt-4 max-w-xl mx-auto">
            All core features are free. No credit card required. No time limit.
          </p>
        </div>

        <div className={`max-w-md mx-auto animate-reveal animate-reveal-delay-2 ${isVisible ? 'visible' : ''}`}>
          <div className="bg-gray-800 border border-primary-600/50 rounded-2xl p-8 shadow-2xl shadow-primary-900/20">
            <div className="text-center mb-8">
              <p className="text-sm text-gray-400 mb-1">Everything included</p>
              <div className="text-5xl font-bold text-white">Free</div>
              <p className="text-sm text-gray-500 mt-1">forever</p>
            </div>

            <ul className="space-y-3 mb-8">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <a
              href="/auth/signup"
              className="block w-full py-3 text-center bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/25"
            >
              Get Started Free
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
