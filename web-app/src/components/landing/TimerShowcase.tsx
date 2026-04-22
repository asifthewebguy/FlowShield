'use client';
import { useScrollReveal } from './useScrollReveal';

export default function TimerShowcase() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      id="timer"
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-surface-0"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center">
          {/* Text */}
          <div className={`animate-reveal ${isVisible ? 'visible' : ''}`}>
            <p className="text-primary-400 text-sm font-semibold tracking-wider uppercase">
              Focus Timer
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white mt-2">
              Structured Focus Sessions That Actually Work
            </h2>
            <p className="text-gray-400 mt-4">
              Choose your session type, set your duration, and let FlowShield handle the rest.
              Built-in break scheduling and project tracking keep you organized and on task.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Work, Study, and Creative session types',
                'Configurable durations from 15 to 90 minutes',
                'Pause and resume without losing progress',
                'Assign sessions to specific projects',
                'Break reminders based on your preferences',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-300">
                  <svg className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Mock Timer UI */}
          <div className={`mt-12 lg:mt-0 animate-reveal animate-reveal-delay-2 ${isVisible ? 'visible' : ''}`}>
            <div className="bg-surface-1 border border-surface-3 rounded-2xl p-8">
              {/* Session type selector */}
              <div className="flex justify-center gap-2 mb-4">
                <span className="px-4 py-1.5 text-sm font-medium rounded-full bg-primary-600 text-white">
                  Work
                </span>
                <span className="px-4 py-1.5 text-sm font-medium rounded-full bg-surface-3 text-gray-400 hover:bg-surface-4 cursor-pointer transition-colors">
                  Study
                </span>
                <span className="px-4 py-1.5 text-sm font-medium rounded-full bg-surface-3 text-gray-400 hover:bg-surface-4 cursor-pointer transition-colors">
                  Creative
                </span>
              </div>

              {/* Duration pills */}
              <div className="flex justify-center gap-2 mb-8">
                {[25, 45, 60, 90].map((d) => (
                  <span
                    key={d}
                    className={`px-3 py-1 text-xs rounded-md ${
                      d === 45
                        ? 'bg-primary-900/40 text-primary-400 border border-primary-800/60'
                        : 'bg-surface-3 text-gray-500'
                    }`}
                  >
                    {d}m
                  </span>
                ))}
              </div>

              {/* Timer */}
              <div className="text-center">
                <div className="text-7xl font-mono font-bold text-primary-400 tabular-nums">
                  32:15
                </div>
                <p className="text-sm text-gray-500 mt-2">of 45:00</p>
              </div>

              {/* Progress bar */}
              <div className="mt-8 h-2.5 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-[width] duration-1000"
                  style={{ width: '28%' }}
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-center gap-3 mt-6">
                <span className="px-6 py-2 text-sm font-medium bg-amber-600/20 text-amber-400 rounded-lg border border-amber-700/50">
                  Pause
                </span>
                <span className="px-6 py-2 text-sm font-medium bg-red-600/20 text-red-400 rounded-lg border border-red-700/50">
                  End Session
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
