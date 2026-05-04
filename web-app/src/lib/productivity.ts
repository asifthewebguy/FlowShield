// Productivity scoring algorithm
// Score is 0-100 based on focus time, completion rate, and session quality

export interface SessionForScoring {
  plannedDuration: number;
  actualDuration: number | null;
  completed: boolean;
}

export function calculateProductivityScore(sessions: SessionForScoring[]): number {
  if (sessions.length === 0) return 0;

  let totalScore = 0;

  for (const session of sessions) {
    let sessionScore = 0;

    // Base score for completing the session (40 points)
    if (session.completed) {
      sessionScore += 40;
    }

    // Score for session duration match (30 points)
    if (session.actualDuration && session.plannedDuration) {
      const durationRatio = session.actualDuration / session.plannedDuration;

      // Perfect score if within 90-110% of planned duration
      if (durationRatio >= 0.9 && durationRatio <= 1.1) {
        sessionScore += 30;
      } else if (durationRatio >= 0.7 && durationRatio <= 1.3) {
        // Good score if within 70-130%
        sessionScore += 20;
      } else if (durationRatio >= 0.5 && durationRatio <= 1.5) {
        // OK score if within 50-150%
        sessionScore += 10;
      }
    }

    // Bonus for longer sessions (30 points max)
    if (session.actualDuration) {
      if (session.actualDuration >= 90) {
        sessionScore += 30; // Deep work session
      } else if (session.actualDuration >= 45) {
        sessionScore += 20; // Good length
      } else if (session.actualDuration >= 25) {
        sessionScore += 15; // Standard Pomodoro
      } else {
        sessionScore += 5; // Short session
      }
    }

    totalScore += sessionScore;
  }

  // Average score across all sessions
  const averageScore = totalScore / sessions.length;

  // Normalize to 0-100
  return Math.round(Math.min(100, averageScore));
}

export function getProductivityLevel(score: number): {
  level: string;
  color: string;
  message: string;
} {
  if (score >= 80) {
    return {
      level: 'Excellent',
      color: 'text-green-600',
      message: 'Outstanding focus! Keep up the great work!',
    };
  } else if (score >= 60) {
    return {
      level: 'Good',
      color: 'text-blue-600',
      message: 'Good productivity! You\'re on the right track.',
    };
  } else if (score >= 40) {
    return {
      level: 'Fair',
      color: 'text-yellow-600',
      message: 'Room for improvement. Try completing more sessions.',
    };
  } else {
    return {
      level: 'Needs Work',
      color: 'text-red-600',
      message: 'Let\'s build better focus habits together.',
    };
  }
}

// Peak time detection - finds the time of day with highest productivity
export interface HourlyStats {
  hour: number;
  sessionCount: number;
  completedCount: number;
  totalMinutes: number;
  averageScore: number;
}

export function detectPeakTimes(sessions: Array<{
  startTime: Date;
  completed: boolean;
  actualDuration: number | null;
  plannedDuration: number;
}>): {
  peakHour: number;
  peakPeriod: string;
  hourlyStats: HourlyStats[];
} {
  if (sessions.length === 0) {
    return {
      peakHour: 9,
      peakPeriod: 'Morning (9 AM)',
      hourlyStats: [],
    };
  }

  // Group sessions by hour of day
  const hourlyMap: { [hour: number]: typeof sessions } = {};

  sessions.forEach((session) => {
    const hour = new Date(session.startTime).getHours();
    if (!hourlyMap[hour]) {
      hourlyMap[hour] = [];
    }
    hourlyMap[hour].push(session);
  });

  // Calculate stats for each hour
  const hourlyStats: HourlyStats[] = Object.entries(hourlyMap).map(([hour, hourSessions]) => {
    const completed = hourSessions.filter((s) => s.completed);
    const totalMinutes = completed.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
    const averageScore = calculateProductivityScore(
      hourSessions.map((s) => ({
        plannedDuration: s.plannedDuration,
        actualDuration: s.actualDuration,
        completed: s.completed,
      }))
    );

    return {
      hour: parseInt(hour),
      sessionCount: hourSessions.length,
      completedCount: completed.length,
      totalMinutes,
      averageScore,
    };
  });

  // Sort by productivity score to find peak hour
  hourlyStats.sort((a, b) => b.averageScore - a.averageScore);

  const peakHour = hourlyStats[0]?.hour || 9;
  const peakPeriod = formatPeakPeriod(peakHour);

  return {
    peakHour,
    peakPeriod,
    hourlyStats: hourlyStats.sort((a, b) => a.hour - b.hour), // Sort by hour for display
  };
}

function formatPeakPeriod(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  let timeOfDay = '';
  if (hour >= 5 && hour < 12) {
    timeOfDay = 'Morning';
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = 'Afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = 'Evening';
  } else {
    timeOfDay = 'Night';
  }

  return `${timeOfDay} (${displayHour} ${period})`;
}

// Gamification Logic

export interface UserLevel {
  level: number;
  title: string;
  nextLevelMinutes: number;
  currentLevelMinutes: number; // Minutes into this level
  progressPercent: number;
}

export const LEVELS = [
  { level: 1, minMinutes: 0, title: 'Novice Focus' },
  { level: 2, minMinutes: 120, title: 'Apprentice' }, // 2 hours
  { level: 3, minMinutes: 600, title: 'Focus Initiate' }, // 10 hours
  { level: 4, minMinutes: 1500, title: 'Deep Worker' }, // 25 hours
  { level: 5, minMinutes: 3000, title: 'Flow Walker' }, // 50 hours
  { level: 6, minMinutes: 6000, title: 'Time Master' }, // 100 hours
  { level: 7, minMinutes: 12000, title: 'Grandmaster' }, // 200 hours
  { level: 8, minMinutes: 30000, title: 'Zen Focused' }, // 500 hours
];

export function calculateUserLevel(totalMinutes: number): UserLevel {
  let currentLevel = LEVELS[0];
  let nextLevel = LEVELS[1];

  for (let i = 0; i < LEVELS.length; i++) {
    if (totalMinutes >= LEVELS[i].minMinutes) {
      currentLevel = LEVELS[i];
      nextLevel = LEVELS[i + 1];
    } else {
      break;
    }
  }

  // Cap at max level
  if (!nextLevel) {
    return {
      level: currentLevel.level,
      title: currentLevel.title,
      nextLevelMinutes: totalMinutes, // No next level
      currentLevelMinutes: totalMinutes - currentLevel.minMinutes,
      progressPercent: 100,
    };
  }

  const minutesInLevel = totalMinutes - currentLevel.minMinutes;
  const minutesNeeded = nextLevel.minMinutes - currentLevel.minMinutes;
  const progress = Math.min(100, (minutesInLevel / minutesNeeded) * 100);

  return {
    level: currentLevel.level,
    title: currentLevel.title,
    nextLevelMinutes: nextLevel.minMinutes,
    currentLevelMinutes: minutesInLevel,
    progressPercent: progress,
  };
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  achieved: boolean;
}

export function checkBadges(totalSessions: number, totalMinutes: number, streak: number): Badge[] {
  const badges: Badge[] = [
    {
      id: 'first_step',
      name: 'First Step',
      description: 'Completed your first focus session',
      icon: '🌱',
      achieved: totalSessions >= 1,
    },
    {
      id: 'on_fire',
      name: 'On Fire',
      description: 'Reached a 3-day streak',
      icon: '🔥',
      achieved: streak >= 3,
    },
    {
      id: 'unstoppable',
      name: 'Unstoppable',
      description: 'Reached a 7-day streak',
      icon: '🚀',
      achieved: streak >= 7,
    },
    {
      id: 'marathon',
      name: 'Marathoner',
      description: 'Focused for over 10 hours total',
      icon: '🏃',
      achieved: totalMinutes >= 600,
    },
    {
      id: 'dedication',
      name: 'Pure Dedication',
      description: 'Completed 50 sessions',
      icon: '🏆',
      achieved: totalSessions >= 50,
    },
  ];

  return badges;
}
