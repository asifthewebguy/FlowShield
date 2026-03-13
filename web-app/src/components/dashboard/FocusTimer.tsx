'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { soundManager } from '@/lib/SoundManager';
import { getToken } from '@/lib/auth-token';

type BreakPhase = 'none' | 'suggested' | 'active';

const COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown between sessions
const COOLDOWN_KEY = 'flowshield_cooldown_until';

function suggestedBreakMinutes(plannedDurationMin: number): number {
  if (plannedDurationMin >= 90) return 15;
  if (plannedDurationMin >= 50) return 10;
  return 5;
}

interface Project {
  id: string;
  name: string;
  color: string;
}

interface FocusTimerProps {
  onSessionStart: (duration: number, type: string, projectId?: string) => void;
  onSessionEnd: (sessionId: string) => void;
  onSessionUpdate?: () => void;
  currentSession: any;
  defaultDuration?: number;
}

const fetcher = async (url: string) => {
  const token = getToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error('An error occurred while fetching the data.');
  }
  return res.json();
};

export default function FocusTimer({
  onSessionStart,
  onSessionEnd,
  onSessionUpdate,
  currentSession: propSession,
  defaultDuration = 25
}: FocusTimerProps) {
  const [currentSession, setCurrentSession] = useState(propSession);
  const { data: projects, mutate: refreshProjects } = useSWR<Project[]>('/api/projects', fetcher);

  // Sync state with propSession from server
  useEffect(() => {
    setCurrentSession(propSession);
  }, [propSession]);

  const [timeRemaining, setTimeRemaining] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState(defaultDuration);
  const [sessionType, setSessionType] = useState('WORK');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundType, setSoundType] = useState<'white' | 'pink' | 'brown'>('brown');
  const [volume, setVolume] = useState(0.5);

  // Post-session cooldown
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const until = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10);
    return Math.max(0, until - Date.now());
  });

  // Break phase state machine
  const [breakPhase, setBreakPhase] = useState<BreakPhase>('none');
  const [breakTimeRemaining, setBreakTimeRemaining] = useState(0);
  const [breakDurationSecs, setBreakDurationSecs] = useState(0);
  const timerWasRunning = useRef(false);

  // Project Creation State
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    if (defaultDuration) {
      setSelectedDuration(defaultDuration);
    }
  }, [defaultDuration]);

  // Handle Sound Playback
  useEffect(() => {
    if (currentSession && !currentSession.completed && !currentSession.isPaused && soundEnabled) {
      soundManager.setVolume(volume);
      if (!soundManager.getIsPlaying()) {
        soundManager.play(soundType);
      }
    } else {
      soundManager.stop();
    }
  }, [currentSession, soundEnabled, soundType, volume]);

  useEffect(() => {
    if (currentSession && !currentSession.completed) {
      if (currentSession.isPaused) {
        if (currentSession.pausedAt) {
          const elapsedMs = new Date(currentSession.pausedAt).getTime() - new Date(currentSession.startTime).getTime();
          const elapsedSeconds = Math.floor(elapsedMs / 1000);
          const remaining = (currentSession.plannedDuration * 60) - elapsedSeconds;
          setTimeRemaining(Math.max(0, remaining));
        }
      } else {
        const plannedEnd = new Date(currentSession.startTime).getTime() + (currentSession.plannedDuration * 60 * 1000);
        const remaining = Math.max(0, Math.floor((plannedEnd - Date.now()) / 1000));
        setTimeRemaining(remaining);
      }
    } else {
      setTimeRemaining(0);
    }
  }, [currentSession]);

  const handleEndSession = useCallback(async () => {
    if (currentSession) {
      try {
        await onSessionEnd(currentSession.id);
        setTimeRemaining(0);
        onSessionUpdate?.();
        setSoundEnabled(false);
        const until = Date.now() + COOLDOWN_MS;
        localStorage.setItem(COOLDOWN_KEY, String(until));
        setCooldownRemaining(COOLDOWN_MS);
      } catch (error) {
        console.error('Failed to end session:', error);
      }
    }
  }, [currentSession, onSessionEnd, onSessionUpdate]);

  // Main focus timer countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (currentSession && !currentSession.isPaused && timeRemaining > 0 && breakPhase === 'none') {
      timerWasRunning.current = true;
      interval = setInterval(() => {
        // Recalculate from server-anchored startTime every tick to prevent drift
        const plannedEnd = new Date(currentSession.startTime).getTime()
          + currentSession.plannedDuration * 60 * 1000;
        setTimeRemaining(Math.max(0, Math.floor((plannedEnd - Date.now()) / 1000)));
      }, 1000);
    } else if (
      timerWasRunning.current &&
      timeRemaining === 0 &&
      currentSession &&
      !currentSession.isPaused &&
      breakPhase === 'none'
    ) {
      // Timer ran out naturally — suggest a break for WORK sessions ≥ 15 min
      timerWasRunning.current = false;
      const plannedMin: number = currentSession.plannedDuration ?? 0;
      if (currentSession.sessionType === 'WORK' && plannedMin >= 15) {
        const breakSecs = suggestedBreakMinutes(plannedMin) * 60;
        setBreakDurationSecs(breakSecs);
        setBreakTimeRemaining(breakSecs);
        setBreakPhase('suggested');
      } else {
        handleEndSession();
      }
    }

    return () => clearInterval(interval);
  }, [currentSession, timeRemaining, handleEndSession, breakPhase]);

  // Break countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (breakPhase === 'active' && breakTimeRemaining > 0) {
      interval = setInterval(() => {
        setBreakTimeRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
    } else if (breakPhase === 'active' && breakTimeRemaining === 0) {
      // Break finished naturally
      handleEndSession();
      setBreakPhase('none');
    }

    return () => clearInterval(interval);
  }, [breakPhase, breakTimeRemaining, handleEndSession]);

  // Cooldown countdown tick
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      const until = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10);
      const remaining = Math.max(0, until - Date.now());
      setCooldownRemaining(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const handleStartBreak = () => {
    setBreakPhase('active');
  };

  const handleSkipBreak = useCallback(async () => {
    setBreakPhase('none');
    timerWasRunning.current = false;
    await handleEndSession();
  }, [handleEndSession]);

  const handleEndBreak = useCallback(async () => {
    setBreakPhase('none');
    setBreakTimeRemaining(0);
    await handleEndSession();
  }, [handleEndSession]);

  const handleStartSession = async () => {
    try {
      setIsProcessing(true);
      await onSessionStart(selectedDuration, sessionType, selectedProjectId || undefined);
      setTimeRemaining(selectedDuration * 60);
      onSessionUpdate?.();
      setSoundEnabled(true); // Auto-enable sound on start
    } catch (error) {
      console.error('Failed to start session:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const token = getToken();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newProjectName, color: '#3b82f6' })
      });
      if (res.ok) {
        const project = await res.json();
        await refreshProjects();
        setSelectedProjectId(project.id);
        setIsCreatingProject(false);
        setNewProjectName('');
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };



  const handleTogglePause = async () => {
    if (!currentSession) return;

    const action = currentSession.isPaused ? 'resume' : 'pause';
    const activeState = !currentSession.isPaused;

    // OPTIMISTIC UPDATE
    setCurrentSession((prev: any) => ({
      ...prev,
      isPaused: activeState,
      pausedAt: activeState ? new Date().toISOString() : null,
    }));

    try {
      setIsProcessing(true);
      const token = getToken();
      await fetch(`/api/sessions/${currentSession.id}/toggle-pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      onSessionUpdate?.();
    } catch (error) {
      console.error('Failed to toggle pause:', error);
      setCurrentSession(propSession); // Revert
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = currentSession
    ? ((currentSession.plannedDuration * 60 - timeRemaining) / (currentSession.plannedDuration * 60)) * 100
    : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Focus Session
        </h2>
        {/* Sound Controls */}
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-md transition-colors ${soundEnabled ? 'text-primary-600 bg-white dark:bg-gray-600 shadow-sm' : 'text-gray-400'}`}
            title={soundEnabled ? "Mute Focus Sound" : "Enable Focus Sound"}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          {soundEnabled && (
            <>
              <select
                value={soundType}
                onChange={(e) => setSoundType(e.target.value as any)}
                className="bg-transparent text-sm font-medium text-gray-700 dark:text-gray-200 border-none focus:ring-0 cursor-pointer"
              >
                <option value="brown">Brown Noise</option>
                <option value="pink">Pink Noise</option>
                <option value="white">White Noise</option>
              </select>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-600"
              />
            </>
          )}
        </div>
      </div>

      {/* Break suggestion overlay — shown after a WORK session ends naturally */}
      {currentSession && breakPhase === 'suggested' && (
        <div className="space-y-6 text-center">
          <div className="text-5xl mb-2">☕</div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              Great work! Take a break?
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              You just completed a {currentSession.plannedDuration}-minute session.
              A {Math.round(breakDurationSecs / 60)}-minute break is recommended.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleStartBreak}
              className="py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
            >
              Take {Math.round(breakDurationSecs / 60)}-min Break
            </button>
            <button
              onClick={handleSkipBreak}
              className="py-3 px-4 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Skip Break
            </button>
          </div>
        </div>
      )}

      {/* Active break timer */}
      {currentSession && breakPhase === 'active' && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="text-4xl font-bold mb-2 text-green-600 dark:text-green-400">
              {formatTime(breakTimeRemaining)}
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Break time — step away from the screen</p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-4">
              <div
                className="h-2 rounded-full bg-green-500 transition-all duration-1000"
                style={{
                  width: `${breakDurationSecs > 0 ? ((breakDurationSecs - breakTimeRemaining) / breakDurationSecs) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <button
            onClick={handleEndBreak}
            className="w-full py-3 px-4 border-2 border-green-500 text-green-600 dark:text-green-400 rounded-lg font-semibold hover:bg-green-50 dark:hover:bg-green-900/20"
          >
            End Break Early
          </button>
        </div>
      )}

      {!currentSession && breakPhase === 'none' ? (
        <div className="space-y-6">
          {/* Project Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Project <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            {!isCreatingProject ? (
              <div className="flex gap-2">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-3 py-2"
                >
                  <option value="">No Project</option>
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setIsCreatingProject(true)}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
                  title="Create New Project"
                >
                  +
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="New Project Name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-3 py-2"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                />
                <button
                  onClick={handleCreateProject}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsCreatingProject(false)}
                  className="px-3 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Session Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'WORK', label: 'Work' },
                { value: 'STUDY', label: 'Study' },
                { value: 'CREATIVE', label: 'Creative' },
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSessionType(type.value)}
                  className={`py-2 px-4 rounded-lg border ${sessionType === type.value
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                    }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Duration (minutes)
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(() => {
                const defaults = [25, 45, 60, 90];
                let options: number[];

                if (!defaults.includes(selectedDuration)) {
                  const sortedDefaults = [...defaults].sort((a, b) =>
                    Math.abs(a - selectedDuration) - Math.abs(b - selectedDuration)
                  );
                  options = [selectedDuration, ...sortedDefaults.slice(0, 3)];
                } else {
                  options = defaults;
                }

                return options.sort((a, b) => a - b).map((duration) => (
                  <button
                    key={duration}
                    onClick={() => setSelectedDuration(duration)}
                    className={`py-3 px-4 rounded-lg border font-semibold ${selectedDuration === duration
                      ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                  >
                    {duration}
                  </button>
                ));
              })()}
            </div>
          </div>

          {cooldownRemaining > 0 ? (
            <div className="w-full py-4 rounded-lg bg-gray-100 dark:bg-gray-700 text-center">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Cooldown — rest before next session
              </div>
              <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                {formatTime(Math.ceil(cooldownRemaining / 1000))}
              </div>
            </div>
          ) : (
            <button
              onClick={handleStartSession}
              disabled={isProcessing}
              className="w-full bg-primary-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {isProcessing ? 'Starting...' : 'Start Focus Session'}
            </button>
          )}
        </div>
      ) : currentSession && breakPhase === 'none' ? (
        <div className="space-y-6">
          <div className="text-center">
            <div className={`text-6xl font-bold mb-4 ${currentSession.isPaused ? 'text-gray-400' : 'text-primary-600'}`}>
              {formatTime(timeRemaining)}
            </div>
            <div className="text-gray-600 dark:text-gray-400 flex flex-col items-center justify-center gap-1">
              <div className="flex items-center gap-2">
                <span>{currentSession.sessionType.charAt(0) + currentSession.sessionType.slice(1).toLowerCase()} Session</span>
                {currentSession.isPaused && <span className="text-amber-500 font-bold">(Paused)</span>}
              </div>
              {/* Show Project Name if exists */}
              {currentSession.projectId && projects && (
                <span className="text-sm px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
                  {projects.find((p: Project) => p.id === currentSession.projectId)?.name}
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-1000 ${currentSession.isPaused ? 'bg-gray-400' : 'bg-primary-600'}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleEndSession}
              className="py-3 px-4 border-2 border-red-500 text-red-500 rounded-lg font-semibold hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              End Session
            </button>
            <button
              onClick={handleTogglePause}
              disabled={isProcessing}
              className={`py-3 px-4 border-2 rounded-lg font-semibold transition-colors disabled:opacity-50 ${currentSession.isPaused
                ? 'border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              {currentSession.isPaused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
