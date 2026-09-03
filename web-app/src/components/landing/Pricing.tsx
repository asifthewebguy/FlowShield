'use client';
import Link from 'next/link';
import { useScrollReveal } from './useScrollReveal';

const freeFeatures = [
  'Unlimited focus sessions',
  'Activity tracking on desktop, browser, and mobile',
  'Analytics dashboard and weekly report',
  'Distraction blocking on desktop',
  'Projects with hourly rates and cost tracking',
  'Daily and weekly goals',
  'Cross-platform sync',
  'Data export (CSV and JSON)',
];

const plannedProFeatures = [
  'Plan your day against your calendar',
  'Plan vs. actual, with re-planning suggestions',
  'Clients, billable hours, and invoice export',
];

function CheckIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
  );
}

export default function Pricing() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      id="pricing"
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-surface-1"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center mb-12 animate-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white">
            Free today. Pro is on the way.
          </h2>
          <p className="text-gray-400 mt-4 max-w-xl mx-auto">
            Everything that ships today is free. No credit card, no time limit.
          </p>
        </div>

        <div className={`grid md:grid-cols-2 gap-6 max-w-3xl mx-auto animate-reveal animate-reveal-delay-2 ${isVisible ? 'visible' : ''}`}>
          {/* Free */}
          <div className="bg-surface-3/40 border border-surface-3 rounded-2xl p-8 flex flex-col">
            <div className="text-center mb-8">
              <p className="text-sm text-gray-400 mb-1">Everything shipped so far</p>
              <div className="font-display text-5xl font-bold text-white">Free</div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {freeFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckIcon className="w-5 h-5 text-primary-400 flex-shrink-0" />
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

          {/* Pro — planned */}
          <div className="bg-surface-2/40 border border-dashed border-surface-3 rounded-2xl p-8 flex flex-col">
            <div className="text-center mb-8">
              <p className="text-sm text-gray-400 mb-1">Planned</p>
              <div className="font-display text-5xl font-bold text-gray-300">Pro</div>
              <p className="text-sm text-gray-500 mt-1">Pricing announced when it ships</p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plannedProFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-gray-400">
                  <CheckIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <p className="text-center text-xs text-gray-500">
              Not available yet. Everything in the Free column works today.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
