'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    workStyle: '',
    preferredDuration: 25,
    primaryDistractions: [] as string[],
    workEnvironment: '',
  });

  const handleDistractionsToggle = (distraction: string) => {
    setFormData((prev) => ({
      ...prev,
      primaryDistractions: prev.primaryDistractions.includes(distraction)
        ? prev.primaryDistractions.filter((d) => d !== distraction)
        : [...prev.primaryDistractions, distraction],
    }));
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          preferences: formData,
        }),
      });

      if (response.ok) {
        router.push('/dashboard');
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Let&apos;s get you started
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Answer a few questions to personalize your experience
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-2 w-12 rounded-full ${
                  s <= step ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                When do you work best?
              </h2>
              <div className="grid gap-4">
                {[
                  { value: 'morning', label: 'Morning Person', emoji: '🌅', desc: 'I am most productive in the morning' },
                  { value: 'evening', label: 'Night Owl', emoji: '🌙', desc: 'I work better in the evening' },
                  { value: 'flexible', label: 'Flexible', emoji: '🔄', desc: 'My schedule varies' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFormData({ ...formData, workStyle: option.value })}
                    className={`p-4 border-2 rounded-lg text-left transition-colors ${
                      formData.workStyle === option.value
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{option.emoji}</span>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">{option.label}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{option.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Preferred focus duration?
              </h2>
              <div className="space-y-4">
                <div className="text-center">
                  <span className="text-5xl font-bold text-primary-600">{formData.preferredDuration}</span>
                  <span className="text-2xl text-gray-600 dark:text-gray-400 ml-2">minutes</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="90"
                  step="5"
                  value={formData.preferredDuration}
                  onChange={(e) => setFormData({ ...formData, preferredDuration: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
                <div className="grid grid-cols-4 gap-2">
                  {[25, 45, 60, 90].map((duration) => (
                    <button
                      key={duration}
                      onClick={() => setFormData({ ...formData, preferredDuration: duration })}
                      className={`py-2 px-4 rounded-lg border ${
                        formData.preferredDuration === duration
                          ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {duration}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                What distracts you most?
              </h2>
              <p className="text-gray-600 dark:text-gray-400">Select all that apply</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: 'social-media', label: 'Social Media', emoji: '📱' },
                  { value: 'messaging', label: 'Messaging Apps', emoji: '💬' },
                  { value: 'news', label: 'News & Media', emoji: '📰' },
                  { value: 'email', label: 'Email', emoji: '📧' },
                  { value: 'youtube', label: 'YouTube/Videos', emoji: '🎥' },
                  { value: 'games', label: 'Games', emoji: '🎮' },
                ].map((distraction) => (
                  <button
                    key={distraction.value}
                    onClick={() => handleDistractionsToggle(distraction.value)}
                    className={`p-4 border-2 rounded-lg transition-colors ${
                      formData.primaryDistractions.includes(distraction.value)
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                    }`}
                  >
                    <div className="text-3xl mb-2">{distraction.emoji}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{distraction.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Where do you work?
              </h2>
              <div className="grid gap-4">
                {[
                  { value: 'home', label: 'Home', emoji: '🏠', desc: 'I work from home' },
                  { value: 'office', label: 'Office', emoji: '🏢', desc: 'I work in an office' },
                  { value: 'hybrid', label: 'Hybrid', emoji: '🔄', desc: 'Mix of home and office' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFormData({ ...formData, workEnvironment: option.value })}
                    className={`p-4 border-2 rounded-lg text-left transition-colors ${
                      formData.workEnvironment === option.value
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{option.emoji}</span>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">{option.label}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{option.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t dark:border-gray-700">
            <button
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>
            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={loading}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
