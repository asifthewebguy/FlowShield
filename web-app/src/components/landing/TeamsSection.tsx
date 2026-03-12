'use client';
import { useScrollReveal } from './useScrollReveal';

const leaderboard = [
  { rank: 1, name: 'Sarah K.', hours: '32h 15m', medal: '\u{1f947}' },
  { rank: 2, name: 'Alex M.', hours: '28h 40m', medal: '\u{1f948}' },
  { rank: 3, name: 'You', hours: '24h 55m', medal: '\u{1f949}', isYou: true },
  { rank: 4, name: 'Jordan R.', hours: '22h 10m', medal: '' },
  { rank: 5, name: 'Casey T.', hours: '19h 30m', medal: '' },
];

export default function TeamsSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-gray-900"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center">
          {/* Text */}
          <div className={`animate-reveal ${isVisible ? 'visible' : ''}`}>
            <p className="text-primary-400 text-sm font-semibold tracking-wider uppercase">
              Teams & Community
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">
              Focus Better Together
            </h2>
            <p className="text-gray-400 mt-4">
              Create or join teams, share invite codes, and compete on the leaderboard.
              Accountability and friendly competition make focus sessions more engaging.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Create teams and invite colleagues',
                'Share simple invite codes to join',
                'Team and global leaderboards',
                'Weekly challenges with badges',
                'See who\'s focusing in real-time',
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

          {/* Mock leaderboard */}
          <div className={`mt-12 lg:mt-0 animate-reveal animate-reveal-delay-2 ${isVisible ? 'visible' : ''}`}>
            <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 1a.75.75 0 01.65.375l1.852 3.2 3.617.573a.75.75 0 01.416 1.279l-2.603 2.58.6 3.636a.75.75 0 01-1.088.791L10 11.347l-3.244 1.687a.75.75 0 01-1.088-.79l.6-3.637-2.603-2.58a.75.75 0 01.416-1.28l3.617-.572 1.852-3.2A.75.75 0 0110 1z" clipRule="evenodd" />
                </svg>
                <h4 className="text-sm font-medium text-white">Team Leaderboard</h4>
                <span className="ml-auto text-xs text-gray-500">This Week</span>
              </div>
              <div className="divide-y divide-gray-700/50">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.rank}
                    className={`flex items-center px-5 py-3 ${
                      entry.isYou ? 'bg-primary-900/20' : ''
                    }`}
                  >
                    <span className="w-8 text-sm text-gray-500">
                      {entry.medal || `#${entry.rank}`}
                    </span>
                    <span className={`flex-1 text-sm ${entry.isYou ? 'text-primary-400 font-medium' : 'text-gray-300'}`}>
                      {entry.name}
                      {entry.isYou && (
                        <span className="ml-2 text-xs bg-primary-900/50 text-primary-400 px-1.5 py-0.5 rounded">
                          You
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-gray-400 font-mono">{entry.hours}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
