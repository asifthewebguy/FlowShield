'use client';
import { useScrollReveal } from './useScrollReveal';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

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

const heatmapColors = ['bg-gray-800', 'bg-green-900', 'bg-green-700', 'bg-green-500', 'bg-green-400'];

export default function AnalyticsShowcase() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      id="analytics"
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-gray-900"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center">
          {/* Mock visuals (left on desktop) */}
          <div className={`order-2 lg:order-1 mt-12 lg:mt-0 space-y-6 animate-reveal ${isVisible ? 'visible' : ''}`}>
            {/* Mini heatmap */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
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
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Weekly Focus Time</h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} barSize={24}>
                    <XAxis
                      dataKey="day"
                      tick={{ fill: '#9ca3af', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#e5e7eb',
                      }}
                      formatter={(value: number) => [`${value} min`, 'Focus']}
                      cursor={{ fill: 'rgba(2, 132, 199, 0.1)' }}
                    />
                    <Bar dataKey="minutes" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Productivity score */}
            <div className="flex gap-4">
              <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-5 text-center">
                <div
                  className="w-20 h-20 rounded-full mx-auto flex items-center justify-center"
                  style={{
                    background: 'conic-gradient(#0284c7 0deg, #0284c7 313deg, #374151 313deg, #374151 360deg)',
                  }}
                >
                  <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
                    <span className="text-2xl font-bold text-primary-400">87</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Productivity Score</p>
              </div>
              <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-5">
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
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">
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
                  <svg className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
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
