'use client';

import { useState, useEffect, useCallback } from 'react';
import NotificationManager from '@/components/common/NotificationManager';
import { getToken, removeToken, setUserData } from '@/lib/auth-token';

// ... (inside the component's JSX, likely in a "Settings" or "Preferences" section)
// I need to see the file content first to know where to insert it.
// Wait, I am viewing it in parallel. I'll do a separate tool call to edit after viewing.
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
// Helper function to get distraction label
const getDistractionLabel = (value: string): string => {
  const labels: Record<string, string> = {
    'social-media': 'Social Media',
    'messaging': 'Messaging Apps',
    'news': 'News & Media',
    'email': 'Email',
    'youtube': 'YouTube/Videos',
    'games': 'Games',
  };
  return labels[value] || value;
};

export default function ProfilePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    timezone: '',
    preferences: {
      workStyle: '',
      preferredDuration: 25,
      primaryDistractions: [] as string[],
      workEnvironment: '',
    },
  });

  const [devices, setDevices] = useState<any[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);

  const fetchProfile = useCallback(async (token: string) => {
    try {
      const response = await fetch('/api/user/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const user = data.user; // API returns { user: {...} }

        setFormData({
          name: user.name || '',
          email: user.email || '',
          timezone: user.timezone || 'UTC',
          preferences: {
            workStyle: user.preferences?.workStyle || 'morning',
            preferredDuration: user.preferences?.preferredDuration || 25,
            primaryDistractions: user.preferences?.primaryDistractions || [],
            workEnvironment: user.preferences?.workEnvironment || 'home',
          },
        });
      } else if (response.status === 401) {
        removeToken();
        router.push('/auth/login');
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchDevices = useCallback(async (token: string) => {
    try {
      const response = await fetch('/api/devices', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      }
    } catch (error) {
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }

    fetchProfile(token);
    fetchDevices(token);
  }, [router, fetchProfile, fetchDevices]);



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const token = getToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          timezone: formData.timezone,
          preferences: formData.preferences,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessage({ type: 'success', text: 'Profile updated successfully!' });

        // Update stored user info, preserving the original storage location
        if (data.user) {
          const remember = !!localStorage.getItem('token');
          setUserData(data.user, remember);
        }
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to update profile' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred while updating profile' });
    } finally {
      setSaving(false);
    }
  };



  const disconnectDevice = async (deviceId: string) => {
    const token = getToken();
    if (!token) return;

    if (!confirm('Are you sure you want to disconnect this device?')) {
      return;
    }

    try {
      const response = await fetch(`/api/devices?deviceId=${deviceId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Device disconnected successfully' });
        fetchDevices(token);
      } else {
        setMessage({ type: 'error', text: 'Failed to disconnect device' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  const toggleDistraction = (distraction: string) => {
    setFormData((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        primaryDistractions: prev.preferences.primaryDistractions.includes(distraction)
          ? prev.preferences.primaryDistractions.filter((d) => d !== distraction)
          : [...prev.preferences.primaryDistractions, distraction],
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <div className="text-xl text-gray-600 dark:text-gray-400">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Profile Settings
        </h2>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${message.type === 'success'
              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
              : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
              }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Personal Information */}
          <Card>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Personal Information
              </h3>
              <NotificationManager />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Email cannot be changed
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Timezone
                </label>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                >
                  <option value="UTC">UTC (Coordinated Universal Time)</option>

                  <optgroup label="North America">
                    <option value="America/New_York">Eastern Time (New York)</option>
                    <option value="America/Chicago">Central Time (Chicago)</option>
                    <option value="America/Denver">Mountain Time (Denver)</option>
                    <option value="America/Phoenix">Mountain Time - Arizona (Phoenix)</option>
                    <option value="America/Los_Angeles">Pacific Time (Los Angeles)</option>
                    <option value="America/Anchorage">Alaska Time (Anchorage)</option>
                    <option value="Pacific/Honolulu">Hawaii Time (Honolulu)</option>
                    <option value="America/Toronto">Eastern Time (Toronto)</option>
                    <option value="America/Vancouver">Pacific Time (Vancouver)</option>
                    <option value="America/Mexico_City">Central Time (Mexico City)</option>
                  </optgroup>

                  <optgroup label="South America">
                    <option value="America/Sao_Paulo">Brasilia Time (São Paulo)</option>
                    <option value="America/Buenos_Aires">Argentina Time (Buenos Aires)</option>
                    <option value="America/Santiago">Chile Time (Santiago)</option>
                    <option value="America/Lima">Peru Time (Lima)</option>
                    <option value="America/Bogota">Colombia Time (Bogotá)</option>
                    <option value="America/Caracas">Venezuela Time (Caracas)</option>
                  </optgroup>

                  <optgroup label="Europe">
                    <option value="Europe/London">Greenwich Mean Time (London)</option>
                    <option value="Europe/Dublin">Greenwich Mean Time (Dublin)</option>
                    <option value="Europe/Lisbon">Western European Time (Lisbon)</option>
                    <option value="Europe/Paris">Central European Time (Paris)</option>
                    <option value="Europe/Berlin">Central European Time (Berlin)</option>
                    <option value="Europe/Rome">Central European Time (Rome)</option>
                    <option value="Europe/Madrid">Central European Time (Madrid)</option>
                    <option value="Europe/Amsterdam">Central European Time (Amsterdam)</option>
                    <option value="Europe/Brussels">Central European Time (Brussels)</option>
                    <option value="Europe/Vienna">Central European Time (Vienna)</option>
                    <option value="Europe/Stockholm">Central European Time (Stockholm)</option>
                    <option value="Europe/Athens">Eastern European Time (Athens)</option>
                    <option value="Europe/Helsinki">Eastern European Time (Helsinki)</option>
                    <option value="Europe/Istanbul">Turkey Time (Istanbul)</option>
                    <option value="Europe/Moscow">Moscow Time (Moscow)</option>
                  </optgroup>

                  <optgroup label="Africa">
                    <option value="Africa/Cairo">Eastern European Time (Cairo)</option>
                    <option value="Africa/Johannesburg">South Africa Time (Johannesburg)</option>
                    <option value="Africa/Lagos">West Africa Time (Lagos)</option>
                    <option value="Africa/Nairobi">East Africa Time (Nairobi)</option>
                    <option value="Africa/Casablanca">Western European Time (Casablanca)</option>
                  </optgroup>

                  <optgroup label="Asia">
                    <option value="Asia/Dubai">Gulf Standard Time (Dubai)</option>
                    <option value="Asia/Kolkata">India Standard Time (Kolkata)</option>
                    <option value="Asia/Dhaka">Bangladesh Time (Dhaka)</option>
                    <option value="Asia/Bangkok">Indochina Time (Bangkok)</option>
                    <option value="Asia/Singapore">Singapore Time (Singapore)</option>
                    <option value="Asia/Hong_Kong">Hong Kong Time (Hong Kong)</option>
                    <option value="Asia/Shanghai">China Standard Time (Shanghai)</option>
                    <option value="Asia/Taipei">Taipei Time (Taipei)</option>
                    <option value="Asia/Tokyo">Japan Standard Time (Tokyo)</option>
                    <option value="Asia/Seoul">Korea Standard Time (Seoul)</option>
                    <option value="Asia/Jakarta">Western Indonesia Time (Jakarta)</option>
                    <option value="Asia/Manila">Philippine Time (Manila)</option>
                    <option value="Asia/Karachi">Pakistan Standard Time (Karachi)</option>
                    <option value="Asia/Tehran">Iran Standard Time (Tehran)</option>
                    <option value="Asia/Jerusalem">Israel Time (Jerusalem)</option>
                  </optgroup>

                  <optgroup label="Australia & Pacific">
                    <option value="Australia/Sydney">Australian Eastern Time (Sydney)</option>
                    <option value="Australia/Melbourne">Australian Eastern Time (Melbourne)</option>
                    <option value="Australia/Brisbane">Australian Eastern Time (Brisbane)</option>
                    <option value="Australia/Perth">Australian Western Time (Perth)</option>
                    <option value="Australia/Adelaide">Australian Central Time (Adelaide)</option>
                    <option value="Pacific/Auckland">New Zealand Time (Auckland)</option>
                    <option value="Pacific/Fiji">Fiji Time (Fiji)</option>
                    <option value="Pacific/Guam">Chamorro Standard Time (Guam)</option>
                  </optgroup>
                </select>
              </div>
            </div>
          </Card>

          {/* Work Preferences */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Work Preferences
            </h3>

            <div className="space-y-6">
              {/* Best Work Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  When do you work best?
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { value: 'morning', label: 'Morning Person', emoji: '🌅' },
                    { value: 'evening', label: 'Night Owl', emoji: '🌙' },
                    { value: 'flexible', label: 'Flexible', emoji: '🔄' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          preferences: { ...formData.preferences, workStyle: option.value },
                        })
                      }
                      className={`p-4 rounded-lg border-2 transition-all ${formData.preferences.workStyle === option.value
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                        }`}
                    >
                      <div className="text-3xl mb-2">{option.emoji}</div>
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {option.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Preferred Focus Duration: {formData.preferences.preferredDuration} minutes
                </label>
                <input
                  type="range"
                  min="15"
                  max="90"
                  step="15"
                  value={formData.preferences.preferredDuration}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      preferences: {
                        ...formData.preferences,
                        preferredDuration: parseInt(e.target.value),
                      },
                    })
                  }
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span className="w-8">15m</span>
                  <span className="w-8 text-center">30m</span>
                  <span className="w-8 text-center">45m</span>
                  <span className="w-8 text-center">60m</span>
                  <span className="w-8 text-center">75m</span>
                  <span className="w-8 text-right">90m</span>
                </div>
              </div>

              {/* Distractions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Common Distractions
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                      type="button"
                      onClick={() => toggleDistraction(distraction.value)}
                      className={`p-3 rounded-lg border-2 transition-all ${formData.preferences.primaryDistractions.includes(distraction.value)
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                        }`}
                    >
                      <div className="text-2xl mb-1">{distraction.emoji}</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {distraction.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Work Environment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Work Environment
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { value: 'home', label: 'Home Office', emoji: '🏠' },
                    { value: 'office', label: 'Office', emoji: '🏢' },
                    { value: 'hybrid', label: 'Hybrid', emoji: '🔄' },
                  ].map((env) => (
                    <button
                      key={env.value}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          preferences: { ...formData.preferences, workEnvironment: env.value },
                        })
                      }
                      className={`p-4 rounded-lg border-2 transition-all ${formData.preferences.workEnvironment === env.value
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                        }`}
                    >
                      <div className="text-3xl mb-2">{env.emoji}</div>
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {env.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Website Blocking Info */}
          <Card className="border-2 border-primary-200 dark:border-primary-500/20">
            <div className="flex items-start gap-4">
              <div className="text-4xl">🛡️</div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Website Blocking Available
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Your selected distractions can be automatically blocked on your Windows desktop using the FlowShield desktop app.
                </p>

                {formData.preferences.primaryDistractions.length > 0 ? (
                  <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 mb-4">
                    <p className="text-sm font-medium text-primary-900 dark:text-primary-100 mb-2">
                      ✓ You have {formData.preferences.primaryDistractions.length} distraction{formData.preferences.primaryDistractions.length !== 1 ? 's' : ''} selected:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {formData.preferences.primaryDistractions.map((distraction) => (
                        <span
                          key={distraction}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-gray-800 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700"
                        >
                          {getDistractionLabel(distraction)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      ⚠️ No distractions selected. Select your common distractions above to enable website blocking.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-primary-600 dark:text-primary-400 font-bold">1.</span>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Install the desktop app</strong> on your Windows computer
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary-600 dark:text-primary-400 font-bold">2.</span>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Run as Administrator</strong> (required to block websites)
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary-600 dark:text-primary-400 font-bold">3.</span>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Right-click the system tray icon</strong> and select &quot;Block Distracting Sites&quot;
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    <strong>How it works:</strong>
                  </p>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• Blocks websites system-wide (all browsers)</li>
                    <li>• Uses Windows hosts file for reliable blocking</li>
                    <li>• Automatically syncs with your preferences</li>
                    <li>• Can be toggled on/off anytime</li>
                    <li>• Automatically disables when app closes</li>
                  </ul>
                </div>

                {formData.preferences.primaryDistractions.length > 0 && (
                  <div className="mt-4">
                    <details className="text-sm">
                      <summary className="cursor-pointer text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium">
                        View example blocked websites →
                      </summary>
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded text-xs space-y-2">
                        {formData.preferences.primaryDistractions.includes('Social Media') && (
                          <div>
                            <strong className="text-gray-900 dark:text-white">Social Media:</strong>
                            <span className="text-gray-600 dark:text-gray-400 ml-2">
                              facebook.com, twitter.com, instagram.com, linkedin.com, reddit.com, tiktok.com
                            </span>
                          </div>
                        )}
                        {formData.preferences.primaryDistractions.includes('Video Streaming') && (
                          <div>
                            <strong className="text-gray-900 dark:text-white">Video Streaming:</strong>
                            <span className="text-gray-600 dark:text-gray-400 ml-2">
                              youtube.com, netflix.com, hulu.com, twitch.tv, vimeo.com
                            </span>
                          </div>
                        )}
                        {formData.preferences.primaryDistractions.includes('Email') && (
                          <div>
                            <strong className="text-gray-900 dark:text-white">Email:</strong>
                            <span className="text-gray-600 dark:text-gray-400 ml-2">
                              gmail.com, outlook.com, yahoo.com, protonmail.com
                            </span>
                          </div>
                        )}
                        {formData.preferences.primaryDistractions.includes('Messaging') && (
                          <div>
                            <strong className="text-gray-900 dark:text-white">Messaging:</strong>
                            <span className="text-gray-600 dark:text-gray-400 ml-2">
                              discord.com, slack.com, web.whatsapp.com, messenger.com
                            </span>
                          </div>
                        )}
                        {formData.preferences.primaryDistractions.includes('News Sites') && (
                          <div>
                            <strong className="text-gray-900 dark:text-white">News Sites:</strong>
                            <span className="text-gray-600 dark:text-gray-400 ml-2">
                              news.google.com, cnn.com, bbc.com, buzzfeed.com
                            </span>
                          </div>
                        )}
                        {formData.preferences.primaryDistractions.includes('Shopping') && (
                          <div>
                            <strong className="text-gray-900 dark:text-white">Shopping:</strong>
                            <span className="text-gray-600 dark:text-gray-400 ml-2">
                              amazon.com, ebay.com, walmart.com, target.com
                            </span>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Connected Devices */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              💻 Connected Devices
            </h3>

            {loadingDevices ? (
              <p className="text-gray-600 dark:text-gray-400">Loading devices...</p>
            ) : devices.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400 mb-2">No devices connected</p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  Install the FlowShield desktop app to start tracking your activity
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {devices.map((device) => {
                  const lastActive = new Date(device.lastActiveAt);
                  const timeSinceActive = Date.now() - lastActive.getTime();
                  const isOnline = timeSinceActive < 5 * 60 * 1000; // Online if active within 5 minutes

                  return (
                    <div
                      key={device.id}
                      className="flex items-start justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className="text-3xl">
                          {device.platform === 'Windows' ? '🪟' : '💻'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-gray-900 dark:text-white">
                              {device.deviceName}
                            </h4>
                            {isOnline && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                <span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></span>
                                Online
                              </span>
                            )}
                            {!device.isActive && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                Disconnected
                              </span>
                            )}
                          </div>
                          <div className="mt-1 space-y-1">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {device.platform} {device.appVersion && `• v${device.appVersion}`}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-500">
                              Last active: {lastActive.toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-500">
                              Connected since: {new Date(device.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => disconnectDevice(device.deviceId)}
                        className="ml-4 px-3 py-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>💡 Tip:</strong> The desktop app automatically registers when you log in. You can manage your connected devices here.
              </p>
            </div>
          </Card>

          {/* Appearance Settings */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Appearance
            </h3>

            <div className="space-y-4">
              {/* Dark Mode Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Dark Mode
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Toggle between light and dark theme
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${theme === 'dark' ? 'bg-primary-600' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-7' : 'translate-x-1'
                      }`}
                  >
                    <span className="flex items-center justify-center h-full text-xs">
                      {theme === 'dark' ? '🌙' : '☀️'}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <Link href="/dashboard">
              <Button variant="secondary" size="md" type="button">Cancel</Button>
            </Link>
            <Button type="submit" variant="primary" size="md" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>

        <AccountAndPrivacyCard onMessage={setMessage} />
    </div>
  );
}

function AccountAndPrivacyCard({
  onMessage,
}: {
  onMessage: (m: { type: 'success' | 'error'; text: string } | null) => void;
}) {
  const router = useRouter();
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const [delPassword, setDelPassword] = useState('');
  const [delConfirm, setDelConfirm] = useState(false);
  const [delSaving, setDelSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    onMessage(null);
    if (pwNew !== pwConfirm) {
      onMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    const token = getToken();
    if (!token) return;
    setPwSaving(true);
    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage({ type: 'error', text: data.error || 'Failed to change password.' });
        return;
      }
      onMessage({ type: 'success', text: 'Password updated successfully.' });
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    } finally {
      setPwSaving(false);
    }
  };

  const handleExport = async () => {
    onMessage(null);
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        onMessage({ type: 'error', text: 'Failed to export your data.' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flowshield-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onMessage({ type: 'success', text: 'Your data has been downloaded.' });
    } catch {
      onMessage({ type: 'error', text: 'Failed to export your data.' });
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    onMessage(null);
    if (!delConfirm) {
      onMessage({ type: 'error', text: 'Please confirm you understand this is permanent.' });
      return;
    }
    const token = getToken();
    if (!token) return;
    setDelSaving(true);
    try {
      const res = await fetch('/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: delPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage({ type: 'error', text: data.error || 'Failed to delete account.' });
        return;
      }
      removeToken();
      router.push('/auth/signup?deleted=true');
    } finally {
      setDelSaving(false);
    }
  };

  return (
    <div className="mt-8 space-y-6">
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Change Password
        </h3>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <Input
            label="Current password"
            type="password"
            required
            value={pwCurrent}
            onChange={(e) => setPwCurrent(e.target.value)}
          />
          <Input
            label="New password"
            type="password"
            required
            minLength={8}
            value={pwNew}
            onChange={(e) => setPwNew(e.target.value)}
            placeholder="At least 8 characters"
          />
          <Input
            label="Confirm new password"
            type="password"
            required
            minLength={8}
            value={pwConfirm}
            onChange={(e) => setPwConfirm(e.target.value)}
          />
          <Button type="submit" variant="primary" size="sm" disabled={pwSaving}>
            {pwSaving ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          Your data (GDPR)
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Download a copy of all your FlowShield data at any time.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
          Download my data
        </Button>
      </Card>

      <Card className="border-2 border-red-200 dark:border-red-500/20">
        <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
          Danger zone — Delete account
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          This permanently deletes your account, sessions, activity logs, goals,
          devices, and projects. This cannot be undone.
        </p>
        <form onSubmit={handleDelete} className="space-y-4 max-w-md">
          <Input
            label="Confirm with your password"
            type="password"
            required
            value={delPassword}
            onChange={(e) => setDelPassword(e.target.value)}
          />
          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={delConfirm}
              onChange={(e) => setDelConfirm(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-white/20 text-red-500 focus:ring-red-500"
            />
            <span>I understand this is permanent and cannot be reversed.</span>
          </label>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={delSaving || !delConfirm || !delPassword}
            className="!bg-red-600 hover:!bg-red-700 !text-white !border-red-600"
          >
            {delSaving ? 'Deleting…' : 'Delete my account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
