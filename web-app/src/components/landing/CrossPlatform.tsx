'use client';
import { useScrollReveal } from './useScrollReveal';

const platforms = [
  {
    name: 'Web Dashboard',
    description: 'Full analytics, AI coach, team management, and real-time session tracking.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    name: 'Desktop App',
    description: 'Windows activity tracking, deep work mode, distraction blocking, and offline sync.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
      </svg>
    ),
  },
  {
    name: 'Browser Extension',
    description: 'Chrome and Firefox. Tracks active tabs, quick timer access, and site categorization.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58z" />
      </svg>
    ),
  },
  {
    name: 'Mobile App',
    description: 'iOS and Android. Phone usage tracking, on-the-go sessions, and push notifications.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
  },
];

export default function CrossPlatform() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      id="platforms"
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-gray-950"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center mb-16 animate-reveal ${isVisible ? 'visible' : ''}`}>
          <p className="text-primary-400 text-sm font-semibold tracking-wider uppercase">
            Cross-Platform
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">
            One Account. Every Device.
          </h2>
          <p className="text-gray-400 mt-4 max-w-2xl mx-auto">
            Your productivity data syncs seamlessly across all platforms.
            Start a session on your desktop, check progress on your phone.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {platforms.map((p, i) => (
            <div
              key={p.name}
              className={`bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 text-center hover:bg-gray-800 transition-colors animate-reveal animate-reveal-delay-${i + 1} ${isVisible ? 'visible' : ''}`}
            >
              <div className="w-12 h-12 rounded-xl bg-primary-900/50 flex items-center justify-center text-primary-400 mx-auto mb-4">
                {p.icon}
              </div>
              <h3 className="text-base font-semibold text-white mb-2">{p.name}</h3>
              <p className="text-xs text-gray-400">{p.description}</p>
            </div>
          ))}
        </div>

        {/* Sync visualization */}
        <div className={`mt-12 flex items-center justify-center gap-2 text-gray-600 animate-reveal animate-reveal-delay-3 ${isVisible ? 'visible' : ''}`}>
          <div className="w-2 h-2 rounded-full bg-gray-600" />
          <div className="w-8 h-px bg-gray-700" />
          <div className="w-2 h-2 rounded-full bg-gray-600" />
          <div className="w-8 h-px bg-gray-700" />
          <div className="w-8 h-8 rounded-full bg-primary-900/30 border border-primary-800/50 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
            </svg>
          </div>
          <div className="w-8 h-px bg-gray-700" />
          <div className="w-2 h-2 rounded-full bg-gray-600" />
          <div className="w-8 h-px bg-gray-700" />
          <div className="w-2 h-2 rounded-full bg-gray-600" />
        </div>
        <p className="text-center text-xs text-gray-600 mt-2">Real-time cloud sync</p>
      </div>
    </section>
  );
}
