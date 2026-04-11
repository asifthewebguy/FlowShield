export interface WeekStat {
  weekLabel: string;
  weekStart: string;
  totalFocusHours: number;
  avgProductivityScore: number;
  sessionsCompleted: number;
}

export interface WeeklyStatsResult {
  weeks: WeekStat[];
  delta: {
    focusHours: { value: number; prev: number; pct: number; direction: 'up' | 'down' | 'same' };
    productivityScore: { value: number; prev: number; pts: number; direction: 'up' | 'down' | 'same' };
    sessionsCompleted: { value: number; prev: number; diff: number; direction: 'up' | 'down' | 'same' };
  };
}

interface DailyStatInput {
  date: Date | string;
  totalFocusMinutes: number;
  avgProductivityScore: number | null;
  sessionsCompleted: number;
}

function toLocalDateOnly(date: Date): Date {
  // Strip time — keep local calendar date
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysSinceEpochLocal(date: Date): number {
  return Math.floor(date.getTime() / 86400000);
}

function direction(curr: number, prev: number): 'up' | 'down' | 'same' {
  if (curr > prev) return 'up';
  if (curr < prev) return 'down';
  return 'same';
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Groups daily stats into rolling 7-day windows anchored to today.
 * Week 0 = days 0–6 ago (most recent), week 1 = days 7–13 ago, etc.
 * This ensures `dayAgo(0..6)` always maps to the same bucket regardless
 * of the current day of week.
 */
export function getWeeklyStats(dailyStats: DailyStatInput[], numWeeks = 8): WeeklyStatsResult {
  type Bucket = { focusMinutes: number; scoreSum: number; scoreCount: number; sessions: number; weekStartDay: number };

  const todayDay = daysSinceEpochLocal(toLocalDateOnly(new Date()));

  // bucketIndex 0 = most recent week; higher = older
  const buckets = new Map<number, Bucket>();

  for (const stat of dailyStats) {
    const d = toLocalDateOnly(new Date(stat.date));
    const dDay = daysSinceEpochLocal(d);
    const daysAgo = todayDay - dDay;
    if (daysAgo < 0) continue; // future date — skip
    const bucketIndex = Math.floor(daysAgo / 7);
    if (bucketIndex >= numWeeks) continue; // older than requested range

    const existing: Bucket = buckets.get(bucketIndex) ?? {
      focusMinutes: 0, scoreSum: 0, scoreCount: 0, sessions: 0,
      weekStartDay: todayDay - (bucketIndex + 1) * 7 + 1,
    };
    existing.focusMinutes += stat.totalFocusMinutes;
    if (stat.avgProductivityScore !== null) {
      existing.scoreSum += stat.avgProductivityScore;
      existing.scoreCount += 1;
    }
    existing.sessions += stat.sessionsCompleted;
    buckets.set(bucketIndex, existing);
  }

  // Sort by bucketIndex descending (oldest first for chart order)
  const sortedIndices = [...buckets.keys()].sort((a, b) => b - a); // oldest (highest index) first

  const weeks: WeekStat[] = sortedIndices.map(idx => {
    const agg = buckets.get(idx)!;
    // weekStart = today - (idx+1)*7 + 1 days ... today - idx*7
    const weekStartDayNum = todayDay - idx * 7 - 6;
    const weekStartDate = new Date((weekStartDayNum) * 86400000);
    const weekStart = toYMD(weekStartDate);
    return {
      weekLabel: weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      weekStart,
      totalFocusHours: Math.round((agg.focusMinutes / 60) * 10) / 10,
      avgProductivityScore: agg.scoreCount > 0 ? Math.round(agg.scoreSum / agg.scoreCount) : 0,
      sessionsCompleted: agg.sessions,
    };
  });

  const zero = { totalFocusHours: 0, avgProductivityScore: 0, sessionsCompleted: 0 };
  const current = weeks[weeks.length - 1] ?? zero;
  const previous = weeks[weeks.length - 2] ?? zero;

  const focusPct =
    previous.totalFocusHours > 0
      ? Math.round(
          ((current.totalFocusHours - previous.totalFocusHours) / previous.totalFocusHours) * 100
        )
      : 0;

  return {
    weeks,
    delta: {
      focusHours: {
        value: current.totalFocusHours,
        prev: previous.totalFocusHours,
        pct: focusPct,
        direction: direction(current.totalFocusHours, previous.totalFocusHours),
      },
      productivityScore: {
        value: current.avgProductivityScore,
        prev: previous.avgProductivityScore,
        pts: current.avgProductivityScore - previous.avgProductivityScore,
        direction: direction(current.avgProductivityScore, previous.avgProductivityScore),
      },
      sessionsCompleted: {
        value: current.sessionsCompleted,
        prev: previous.sessionsCompleted,
        diff: current.sessionsCompleted - previous.sessionsCompleted,
        direction: direction(current.sessionsCompleted, previous.sessionsCompleted),
      },
    },
  };
}
