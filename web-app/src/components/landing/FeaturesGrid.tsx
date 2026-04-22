'use client';
import { useScrollReveal } from './useScrollReveal';

const primaryFeatures = [
  {
    title: 'Focus Timer',
    description: 'Pomodoro-style sessions with Work, Study, and Creative modes. Intelligent break scheduling keeps you fresh and on task.',
    iconBg: 'bg-primary-900/40',
    iconColor: 'text-primary-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Analytics Dashboard',
    description: 'Daily focus charts, productivity scores, yearly heatmaps, and trend tracking — understand your work patterns at a glance.',
    iconBg: 'bg-accent-900/40',
    iconColor: 'text-accent-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
      </svg>
    ),
  },
  {
    title: 'AI Coach',
    description: 'Personalized productivity advice powered by AI. Analyzes your patterns, spots weak points, and suggests concrete improvements.',
    iconBg: 'bg-surface-4',
    iconColor: 'text-gray-300',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
];

const secondaryFeatures = [
  { title: 'Activity Tracking', description: 'Passive monitoring across desktop, mobile, and browser. No manual logging.' },
  { title: 'Distraction Analysis', description: 'See which apps and sites steal your focus, with daily trends.' },
  { title: 'Deep Work Mode', description: 'System-level blocking of distracting sites during focus sessions.' },
  { title: 'Goals & Streaks', description: 'Daily and weekly focus targets that build accountability over time.' },
  { title: 'Smart Sync', description: 'Your data follows you across web, desktop, mobile, and browser.' },
  { title: 'Gamification', description: 'Badges, levels, and achievements that reward consistent focus.' },
];

export default function FeaturesGrid() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      id="features"
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-surface-1"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header — left-aligned */}
        <div className={`max-w-2xl mb-16 animate-reveal ${isVisible ? 'visible' : ''}`}>
          <p className="text-primary-400 text-sm font-semibold tracking-wider uppercase">
            Features
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white mt-2">
            Everything You Need to Stay Focused
          </h2>
          <p className="text-gray-400 mt-4">
            From intelligent tracking to AI coaching, FlowShield gives you the complete toolkit
            to understand and improve your productivity.
          </p>
        </div>

        {/* Primary features — 3 cards with varied icon treatments */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {primaryFeatures.map((feature, i) => (
            <div
              key={feature.title}
              className={`bg-surface-3/40 border border-surface-3 rounded-xl p-8 animate-reveal animate-reveal-delay-${i + 1} ${isVisible ? 'visible' : ''}`}
            >
              <div className={`w-10 h-10 rounded-lg ${feature.iconBg} flex items-center justify-center ${feature.iconColor} mb-5`}>
                {feature.icon}
              </div>
              <h3 className="font-display text-lg font-semibold text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Secondary features — compact grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
          {secondaryFeatures.map((feature, i) => (
            <div
              key={feature.title}
              className={`flex items-start gap-3 animate-reveal animate-reveal-delay-${(i % 3) + 1} ${isVisible ? 'visible' : ''}`}
            >
              <svg className="w-4 h-4 text-primary-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-gray-200">{feature.title}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
