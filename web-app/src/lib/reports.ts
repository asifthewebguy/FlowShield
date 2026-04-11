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

function dayNumToLocalDate(dayNum: number, todayDayNum: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (todayDayNum - dayNum));
  return d;
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
    const weekStartDate = dayNumToLocalDate(weekStartDayNum, todayDay);
    const weekStart = toYMD(weekStartDate);
    return {
      weekLabel: weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      weekStart,
      totalFocusHours: Math.round((agg.focusMinutes / 60) * 10) / 10,
      avgProductivityScore: agg.scoreCount > 0 ? Math.round(agg.scoreSum / agg.scoreCount) : 0,
      sessionsCompleted: agg.sessions,
    };
  });

  // Use bucket map keys directly so sparse data (missing weeks) never shifts which
  // bucket is "current" vs "previous". Bucket 0 = most recent week, 1 = one week prior.
  const emptyBucket = { focusMinutes: 0, scoreSum: 0, scoreCount: 0, sessions: 0, weekStartDay: 0 };
  const currentAgg = buckets.get(0) ?? emptyBucket;
  const previousAgg = buckets.get(1) ?? emptyBucket;

  const currentFocusHours = Math.round((currentAgg.focusMinutes / 60) * 10) / 10;
  const previousFocusHours = Math.round((previousAgg.focusMinutes / 60) * 10) / 10;
  const currentScore = currentAgg.scoreCount > 0 ? Math.round(currentAgg.scoreSum / currentAgg.scoreCount) : 0;
  const previousScore = previousAgg.scoreCount > 0 ? Math.round(previousAgg.scoreSum / previousAgg.scoreCount) : 0;
  const currentSessions = currentAgg.sessions;
  const previousSessions = previousAgg.sessions;

  const focusPct =
    previousFocusHours > 0
      ? Math.round(((currentFocusHours - previousFocusHours) / previousFocusHours) * 100)
      : 0;

  return {
    weeks,
    delta: {
      focusHours: {
        value: currentFocusHours,
        prev: previousFocusHours,
        pct: focusPct,
        direction: direction(currentFocusHours, previousFocusHours),
      },
      productivityScore: {
        value: currentScore,
        prev: previousScore,
        pts: currentScore - previousScore,
        direction: direction(currentScore, previousScore),
      },
      sessionsCompleted: {
        value: currentSessions,
        prev: previousSessions,
        diff: currentSessions - previousSessions,
        direction: direction(currentSessions, previousSessions),
      },
    },
  };
}
