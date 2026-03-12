'use client';
import { useScrollReveal } from './useScrollReveal';

export default function AICoachShowcase() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      id="coach"
      ref={ref as React.RefObject<HTMLElement>}
      className="py-24 bg-gradient-to-br from-gray-900 via-primary-950/20 to-gray-900"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className={`text-center mb-12 animate-reveal ${isVisible ? 'visible' : ''}`}>
          <p className="text-primary-400 text-sm font-semibold tracking-wider uppercase">
            AI Coach
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">
            Your Personal AI Productivity Coach
          </h2>
          <p className="text-gray-400 mt-4">
            Powered by advanced AI, the coach analyzes your last 7 days of activity
            and delivers personalized strategies to help you focus better.
          </p>
        </div>

        {/* Mock chat */}
        <div className={`animate-reveal animate-reveal-delay-2 ${isVisible ? 'visible' : ''}`}>
          <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
            {/* Chat header */}
            <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-900/50 flex items-center justify-center">
                <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">AI Coach</p>
                <p className="text-xs text-green-400">Online</p>
              </div>
            </div>

            {/* Messages */}
            <div className="p-5 space-y-4">
              {/* User message */}
              <div className="flex justify-end">
                <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-primary-600 text-white text-sm">
                  How can I improve my focus during afternoons?
                </div>
              </div>

              {/* AI response */}
              <div className="flex justify-start">
                <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-bl-md bg-gray-700 text-gray-200 text-sm leading-relaxed">
                  Based on your activity data, your focus drops significantly between 1-3 PM.
                  Here are three strategies:
                  <br /><br />
                  <strong className="text-white">1. Schedule deep work before lunch.</strong> Your
                  peak hours are 9-11 AM — protect that window.
                  <br /><br />
                  <strong className="text-white">2. Use shorter sessions post-lunch.</strong> Switch
                  from 45-min to 25-min sessions after 1 PM.
                  <br /><br />
                  <strong className="text-white">3. Block social media 1-4 PM.</strong> Twitter and
                  Reddit account for 68% of your afternoon distractions
                  <span className="inline-block w-1 h-4 bg-primary-400 animate-pulse ml-0.5 align-middle" />
                </div>
              </div>
            </div>

            {/* Input bar */}
            <div className="px-5 py-3 border-t border-gray-700">
              <div className="flex items-center gap-3 bg-gray-700/50 rounded-xl px-4 py-2.5">
                <span className="text-sm text-gray-500 flex-1">Ask about your productivity...</span>
                <svg className="w-5 h-5 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
