'use client';
import { useState } from 'react';
import { useScrollReveal } from './useScrollReveal';

const faqs = [
  {
    q: 'What platforms does FlowShield support?',
    a: 'FlowShield works on Windows (desktop app), Chrome and Firefox (browser extension), iOS and Android (mobile app), and any browser (web dashboard). All platforms sync in real-time.',
  },
  {
    q: 'Is FlowShield really free?',
    a: 'Yes — all core features are free with no time limit and no credit card required. You get unlimited focus sessions, full analytics, AI coach, teams, and cross-platform sync at no cost.',
  },
  {
    q: 'How does activity tracking work?',
    a: 'The desktop app passively monitors your active window and process names. The browser extension tracks which sites you visit. The mobile app tracks phone usage and app time. Everything syncs to your dashboard automatically.',
  },
  {
    q: 'What does the AI Coach do?',
    a: 'The AI Coach analyzes your last 7 days of productivity data and generates personalized recommendations — like which hours to protect for deep work, which apps distract you most, and how to structure your sessions for better results.',
  },
  {
    q: 'Can I use FlowShield with my team?',
    a: 'Yes. Create a team from the Coach page, copy your invite code, and share it. Team members appear on a shared leaderboard. It\'s great for building accountability and a healthy focus culture.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. Your activity data is stored securely and only visible to you. It is never sold or shared with third parties. You can export or delete your data at any time from the Profile page.',
  },
  {
    q: 'What is Deep Work Mode?',
    a: 'Deep Work Mode lets the desktop app block distracting websites and apps at the system level during your focus sessions. You choose which sites to block in your profile preferences.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-gray-900"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center mb-12 animate-reveal ${isVisible ? 'visible' : ''}`}>
          <p className="text-primary-400 text-sm font-semibold tracking-wider uppercase">FAQ</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">
            Common Questions
          </h2>
        </div>

        <div className={`divide-y divide-gray-700/50 animate-reveal animate-reveal-delay-1 ${isVisible ? 'visible' : ''}`}>
          {faqs.map((faq, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between py-5 text-left"
              >
                <span className="text-sm font-medium text-gray-200">{faq.q}</span>
                <svg
                  className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-4 transition-transform duration-200 ${openIndex === i ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${openIndex === i ? 'max-h-48 pb-5' : 'max-h-0'}`}
              >
                <p className="text-sm text-gray-400 leading-relaxed">{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
