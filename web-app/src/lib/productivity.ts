// Productivity scoring algorithm
// Score is 0-100 based on focus time, completion rate, and session quality

interface SessionForScoring {
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
