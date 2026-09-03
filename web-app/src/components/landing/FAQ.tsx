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
    a: 'Everything that ships today is free, with no time limit and no credit card. A paid Pro plan is planned for the day-planning, calendar, and client-billing features listed under Pricing. Pricing will be announced when those ship.',
  },
  {
    q: 'How does activity tracking work?',
    a: 'The desktop app passively monitors your active window and process names. The browser extension tracks which sites you visit. The mobile app tracks phone usage and app time. Everything syncs to your dashboard automatically.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. Your activity data is stored securely and only visible to you. It is never sold or shared with third parties. You can export or delete your data at any time from the Profile page.',
  },
  {
    q: 'What is Deep Work Mode?',
    a: 'Deep Work Mode lets the desktop app block distracting websites at the system level during your focus sessions. You choose which sites to block in your profile preferences.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-surface-1"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Larger heading, no label — varies from other sections */}
        <div className={`text-center mb-12 animate-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-white">
            Common Questions
          </h2>
        </div>

        <div className={`divide-y divide-surface-3 animate-reveal animate-reveal-delay-1 ${isVisible ? 'visible' : ''}`}>
          {faqs.map((faq, i) => (
            <div key={i}>
              <button
                id={`faq-button-${i}`}
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between py-5 text-left"
                aria-expanded={openIndex === i}
                aria-controls={`faq-panel-${i}`}
              >
                <span className="text-sm font-medium text-gray-200">{faq.q}</span>
                <svg
                  className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-4 transition-transform duration-200 ${openIndex === i ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <div
                id={`faq-panel-${i}`}
                role="region"
                aria-labelledby={`faq-button-${i}`}
                className="grid transition-[grid-template-rows] duration-300 ease-out"
                style={{ gridTemplateRows: openIndex === i ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <p className="pb-5 text-sm text-gray-400 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
