'use client';

import { useState, useEffect, useCallback } from 'react';

interface FocusTimerProps {
  onSessionStart: (duration: number, type: string) => void;
  onSessionEnd: (sessionId: string) => void;
  currentSession: any;
}

export default function FocusTimer({ onSessionStart, onSessionEnd, currentSession }: FocusTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(25);
  const [sessionType, setSessionType] = useState('WORK');

  useEffect(() => {
    if (currentSession && !currentSession.completed) {
      const plannedEnd = new Date(currentSession.startTime).getTime() + (currentSession.plannedDuration * 60 * 1000);
      const remaining = Math.max(0, Math.floor((plannedEnd - Date.now()) / 1000));
      setTimeRemaining(remaining);
      setIsRunning(true);
    }
  }, [currentSession]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            if (currentSession) {
              handleEndSession();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining]);

  const handleStartSession = async () => {
    try {
      setTimeRemaining(selectedDuration * 60);
      setIsRunning(true);
      await onSessionStart(selectedDuration, sessionType);
    } catch (error) {
      console.error('Failed to start session:', error);
      setIsRunning(false);
    }
  };

  const handleEndSession = useCallback(async () => {
    if (currentSession) {
      setIsRunning(false);
      await onSessionEnd(currentSession.id);
      setTimeRemaining(0);
    }
  }, [currentSession, onSessionEnd]);

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
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Focus Session
      </h2>

      {!isRunning ? (
        <div className="space-y-6">
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
                  className={`py-2 px-4 rounded-lg border ${
                    sessionType === type.value
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
              {[25, 45, 60, 90].map((duration) => (
                <button
                  key={duration}
                  onClick={() => setSelectedDuration(duration)}
                  className={`py-3 px-4 rounded-lg border font-semibold ${
                    selectedDuration === duration
                      ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {duration}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartSession}
            className="w-full bg-primary-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-primary-700 transition-colors"
          >
            Start Focus Session
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="text-center">
            <div className="text-6xl font-bold text-primary-600 mb-4">
              {formatTime(timeRemaining)}
            </div>
            <div className="text-gray-600 dark:text-gray-400">
              {sessionType.charAt(0) + sessionType.slice(1).toLowerCase()} Session
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className="bg-primary-600 h-3 rounded-full transition-all duration-1000"
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
              onClick={() => setIsRunning(false)}
              className="py-3 px-4 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Pause
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
