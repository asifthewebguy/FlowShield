export interface Insight {
  id: string;
  type: 'best_day' | 'peak_hour' | 'trend' | 'completion' | 'streak' | 'consistency' | 'schedule';
  title: string;
  description: string;
  value?: number;
}

interface DailyStatInput {
  date: Date | string;
  totalFocusMinutes: number;
  avgProductivityScore: number | null;
  sessionsCompleted: number;
  peakFocusHour: number | null;
}

interface SessionInput {
  startTime: Date | string;
  completed: boolean;
  plannedDuration: number;
  actualDuration: number | null;
  productivityScore: number | null;
}

export interface InsightsInput {
  dailyStats: DailyStatInput[];
  sessions: SessionInput[];
  streak: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

/** Returns the day-of-week name with the highest average focus minutes. */
export function getBestDay(dailyStats: DailyStatInput[]): Insight | null {
  if (dailyStats.length < 7) return null;

  const byDay: Record<number, number[]> = {};
  for (const stat of dailyStats) {
    const d = new Date(stat.date);
    const dow = d.getDay();
    if (!byDay[dow]) byDay[dow] = [];
    byDay[dow].push(stat.totalFocusMinutes);
  }

  let bestDow = -1;
  let bestAvg = 0;
  for (const [dow, minutes] of Object.entries(byDay)) {
    const avg = minutes.reduce((a, b) => a + b, 0) / minutes.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestDow = Number(dow);
    }
  }

  if (bestDow === -1 || bestAvg < 10) return null;

  return {
    id: 'best_day',
    type: 'best_day',
    title: `${DAY_NAMES[bestDow]}s are your best day`,
    description: `You average ${Math.round(bestAvg)} minutes of focus on ${DAY_NAMES[bestDow]}s — more than any other day.`,
    value: bestAvg,
  };
}

/** Returns the hour-of-day with the most frequent peak-focus occurrence. */
export function getPeakHour(dailyStats: DailyStatInput[]): Insight | null {
  const hourCounts: Record<number, number> = {};
  for (const stat of dailyStats) {
    if (stat.peakFocusHour !== null && stat.peakFocusHour !== undefined) {
      hourCounts[stat.peakFocusHour] = (hourCounts[stat.peakFocusHour] || 0) + 1;
    }
  }

  const entries = Object.entries(hourCounts);
  if (entries.length === 0) return null;

  const [bestHour, count] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const hour = Number(bestHour);

  if (count < 3) return null;

  const endHour = hour + 2;
  return {
    id: 'peak_hour',
    type: 'peak_hour',
    title: `Focus peaks ${formatHour(hour)}–${formatHour(endHour)}`,
    description: `Your most productive window appeared ${count} times in the past 30 days. Schedule deep work during this time.`,
    value: hour,
  };
}

/** Compares last 7 days vs the 7 days before that for total focus minutes. */
export function getWeeklyTrend(dailyStats: DailyStatInput[]): Insight | null {
  if (dailyStats.length < 7) return null;

  const sorted = [...dailyStats].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const thisWeek = sorted.slice(0, 7).reduce((s, d) => s + d.totalFocusMinutes, 0);
  const lastWeek = sorted.slice(7, 14).reduce((s, d) => s + d.totalFocusMinutes, 0);

  if (lastWeek === 0) return null;

  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  if (Math.abs(pct) < 5) return null;

  const direction = pct > 0 ? 'up' : 'down';
  const absPct = Math.abs(pct);
  const thisHours = Math.round(thisWeek / 60);
  const lastHours = Math.round(lastWeek / 60);

  return {
    id: 'weekly_trend',
    type: 'trend',
    title: pct > 0 ? `Focus is trending up ${absPct}%` : `Focus dipped ${absPct}% this week`,
    description:
      pct > 0
        ? `You focused ${thisHours}h this week vs ${lastHours}h last week. Keep it up!`
        : `You focused ${thisHours}h this week vs ${lastHours}h last week. Try scheduling a session now.`,
    value: pct,
  };
}

/** Returns completion rate insight for sessions in the period. */
export function getCompletionRate(sessions: SessionInput[]): Insight | null {
  if (sessions.length < 5) return null;

  const completed = sessions.filter((s) => s.completed).length;
  const rate = Math.round((completed / sessions.length) * 100);

  let title: string;
  let description: string;

  if (rate >= 80) {
    title = `${rate}% session completion rate`;
    description = `You finish most sessions you start. Excellent discipline!`;
  } else if (rate >= 50) {
    title = `${rate}% session completion rate`;
    description = `You complete about half your sessions. Try shorter sessions to boost this number.`;
  } else {
    title = `${rate}% session completion rate`;
    description = `Many sessions end early. Consider reducing your planned duration to build momentum.`;
  }

  return {
    id: 'completion_rate',
    type: 'completion',
    title,
    description,
    value: rate,
  };
}

/** Returns a streak insight if the streak is notable. */
export function getStreakInsight(streak: number): Insight | null {
  if (streak < 3) return null;

  let title: string;
  let description: string;

  if (streak >= 30) {
    title = `${streak}-day focus streak`;
    description = `Incredible — you've had at least one focus session every day for a month!`;
  } else if (streak >= 14) {
    title = `${streak}-day focus streak`;
    description = `Two weeks strong. Consistency like this builds lasting habits.`;
  } else if (streak >= 7) {
    title = `${streak}-day focus streak`;
    description = `A full week of focused work! Protect this streak.`;
  } else {
    title = `${streak}-day focus streak`;
    description = `You're building a habit. Keep showing up daily!`;
  }

  return {
    id: 'streak',
    type: 'streak',
    title,
    description,
    value: streak,
  };
}

/** Returns a consistency insight based on how many of the last 30 days had any focus time. */
export function getConsistencyInsight(dailyStats: DailyStatInput[]): Insight | null {
  if (dailyStats.length < 14) return null;

  const activeDays = dailyStats.filter((d) => d.totalFocusMinutes > 0).length;
  const totalDays = dailyStats.length;
  const rate = Math.round((activeDays / totalDays) * 100);

  if (rate >= 80) return null; // Already covered by streak insight if high

  if (activeDays < 5) return null;

  return {
    id: 'consistency',
    type: 'consistency',
    title: `Active ${activeDays} of ${totalDays} days`,
    description: `You focused on ${rate}% of days this period. Aim for 5 days a week to build momentum.`,
    value: rate,
  };
}

/** Suggests the optimal time for the next session based on historical peak-hour + day patterns. */
export function getPredictiveSchedule(dailyStats: DailyStatInput[], sessions: SessionInput[]): Insight | null {
  if (sessions.length < 5) return null;

  const hourMinutes: Record<number, number> = {};
  for (const s of sessions) {
    const h = new Date(s.startTime).getHours();
    hourMinutes[h] = (hourMinutes[h] || 0) + (s.actualDuration || s.plannedDuration);
  }
  const hourEntries = Object.entries(hourMinutes);
  if (hourEntries.length === 0) return null;

  const [bestHourStr] = hourEntries.sort(([, a], [, b]) => b - a)[0];
  const bestHour = Number(bestHourStr);

  const dayMinutes: Record<number, number> = {};
  for (const stat of dailyStats) {
    const dow = new Date(stat.date).getDay();
    dayMinutes[dow] = (dayMinutes[dow] || 0) + stat.totalFocusMinutes;
  }
  const dayEntries = Object.entries(dayMinutes);
  if (dayEntries.length === 0) return null;

  const [bestDowStr] = dayEntries.sort(([, a], [, b]) => b - a)[0];
  const bestDow = Number(bestDowStr);

  const now = new Date();
  const today = now.getDay();
  const currentHour = now.getHours();

  let when: string;
  if (today === bestDow && currentHour < bestHour) {
    when = `today at ${formatHour(bestHour)}`;
  } else if ((bestDow - today + 7) % 7 === 1) {
    when = `tomorrow at ${formatHour(bestHour)}`;
  } else {
    when = `${DAY_NAMES[bestDow]} at ${formatHour(bestHour)}`;
  }

  return {
    id: 'schedule',
    type: 'schedule',
    title: `Best focus window: ${formatHour(bestHour)}`,
    description: `Based on your history, schedule your next deep work session ${when} for best results.`,
    value: bestHour,
  };
}

/** Master function: generates all applicable insights, sorted by relevance. */
export function generateInsights(data: InsightsInput): Insight[] {
  const insights: Insight[] = [];

  const streak = getStreakInsight(data.streak);
  if (streak) insights.push(streak);

  const trend = getWeeklyTrend(data.dailyStats);
  if (trend) insights.push(trend);

  const bestDay = getBestDay(data.dailyStats);
  if (bestDay) insights.push(bestDay);

  const peakHour = getPeakHour(data.dailyStats);
  if (peakHour) insights.push(peakHour);

  const completion = getCompletionRate(data.sessions);
  if (completion) insights.push(completion);

  const consistency = getConsistencyInsight(data.dailyStats);
  if (consistency) insights.push(consistency);

  const schedule = getPredictiveSchedule(data.dailyStats, data.sessions);
  if (schedule) insights.push(schedule);

  return insights;
}
