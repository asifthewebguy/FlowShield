'use client';
import { useScrollReveal } from './useScrollReveal';
import dynamic from 'next/dynamic';

// Chart color constants — reference the primary palette
const CHART_PRIMARY = '#0284c7';   // primary-600
const CHART_SURFACE = '#222429';   // surface-3
const CHART_SURFACE_BG = '#1a1c21'; // surface-2
const CHART_CURSOR = 'rgba(14, 165, 233, 0.1)';
const CHART_TEXT = '#9ca3af';      // gray-400

const weeklyData = [
  { day: 'Mon', minutes: 85 },
  { day: 'Tue', minutes: 120 },
  { day: 'Wed', minutes: 65 },
  { day: 'Thu', minutes: 145 },
  { day: 'Fri', minutes: 110 },
  { day: 'Sat', minutes: 40 },
  { day: 'Sun', minutes: 75 },
];

// Generate a static mini heatmap (12 weeks x 7 days)
const heatmapData: number[] = [
  0,1,2,3,2,1,0, 1,2,3,4,3,2,1, 0,1,1,2,3,2,0,
  2,3,4,3,2,1,0, 1,2,3,4,4,3,1, 0,0,1,2,3,2,1,
  1,2,3,4,3,2,0, 0,1,2,2,3,4,2, 1,1,2,3,4,3,1,
  0,1,2,3,2,1,0, 2,3,4,4,3,2,1, 0,1,1,2,3,3,2,
];

const heatmapColors = ['bg-surface-3', 'bg-primary-900', 'bg-primary-700', 'bg-primary-500', 'bg-primary-400'];

const WeeklyChart = dynamic(
  () => import('recharts').then((mod) => {
    const { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } = mod;
    function Chart() {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyData} barSize={24}>
            <XAxis
              dataKey="day"
              tick={{ fill: CHART_TEXT, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: CHART_SURFACE_BG,
                border: `1px solid ${CHART_SURFACE}`,
                borderRadius: '8px',
                fontSize: '12px',
                color: '#e5e7eb',
              }}
              formatter={(value: number) => [`${value} min`, 'Focus']}
              cursor={{ fill: CHART_CURSOR }}
            />
            <Bar dataKey="minutes" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    return Chart;
  }),
  {
    ssr: false,
    loading: () => <div className="h-40 rounded bg-surface-3/50 animate-pulse" />,
  }
);

export default function AnalyticsShowcase() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      id="analytics"
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-surface-1"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center">
          {/* Mock visuals (left on desktop) */}
          <div className={`order-2 lg:order-1 mt-12 lg:mt-0 space-y-6 animate-reveal ${isVisible ? 'visible' : ''}`}>
            {/* Mini heatmap */}
            <div className="bg-surface-3/40 border border-surface-3 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-300">Yearly Activity</h4>
                <span className="text-xs text-gray-500">847 active days</span>
              </div>
              <div className="flex flex-wrap gap-[3px]">
                {heatmapData.map((level, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-sm ${heatmapColors[level]}`}
                  />
                ))}
              </div>
            </div>

            {/* Bar chart */}
            <div className="bg-surface-3/40 border border-surface-3 rounded-xl p-5">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Weekly Focus Time</h4>
              <div className="h-40">
                <WeeklyChart />
              </div>
            </div>

            {/* Productivity score */}
            <div className="flex gap-4">
              <div className="flex-1 bg-surface-3/40 border border-surface-3 rounded-xl p-5 text-center">
                <div
                  className="w-20 h-20 rounded-full mx-auto flex items-center justify-center"
                  style={{
                    background: `conic-gradient(${CHART_PRIMARY} 0deg, ${CHART_PRIMARY} 313deg, ${CHART_SURFACE} 313deg, ${CHART_SURFACE} 360deg)`,
                  }}
                >
                  <div className="w-16 h-16 rounded-full bg-surface-1 flex items-center justify-center">
                    <span className="text-2xl font-bold text-primary-400">87</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Productivity Score</p>
              </div>
              <div className="flex-1 bg-surface-3/40 border border-surface-3 rounded-xl p-5">
                <div className="text-2xl font-bold text-white">14</div>
                <p className="text-xs text-gray-500">Day Streak</p>
                <div className="mt-2 text-2xl font-bold text-white">2:30 PM</div>
                <p className="text-xs text-gray-500">Peak Hour</p>
              </div>
            </div>
          </div>

          {/* Text (right on desktop) */}
          <div className={`order-1 lg:order-2 animate-reveal animate-reveal-delay-2 ${isVisible ? 'visible' : ''}`}>
            <p className="text-primary-400 text-sm font-semibold tracking-wider uppercase">
              Analytics
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white mt-2">
              Understand Your Productivity Deeply
            </h2>
            <p className="text-gray-400 mt-4">
              Go beyond time tracking. FlowShield reveals patterns in your work,
              identifies peak hours, and shows exactly where your time goes.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Daily and weekly focus time charts',
                'GitHub-style yearly activity heatmap',
                'Productivity score with trend tracking',
                'Distraction analysis with top offending apps',
                'Peak productivity hour detection',
                'Export to CSV or JSON anytime',
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
        </div>
      </div>
    </section>
  );
}
