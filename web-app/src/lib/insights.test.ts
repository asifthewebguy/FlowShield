import { describe, it, expect } from 'vitest';
import {
  getBestDay,
  getPeakHour,
  getWeeklyTrend,
  getCompletionRate,
  getStreakInsight,
  getConsistencyInsight,
  getPredictiveSchedule,
  generateInsights,
} from './insights';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDailyStats(days: number, overrides: Partial<{
  totalFocusMinutes: number;
  avgProductivityScore: number;
  sessionsCompleted: number;
  peakFocusHour: number | null;
}> = {}) {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return {
      date,
      totalFocusMinutes: overrides.totalFocusMinutes ?? 60,
      avgProductivityScore: overrides.avgProductivityScore ?? 75,
      sessionsCompleted: overrides.sessionsCompleted ?? 2,
      peakFocusHour: overrides.peakFocusHour !== undefined ? overrides.peakFocusHour : 9,
    };
  });
}

function makeSessions(count: number, completed = true, plannedDuration = 25) {
  return Array.from({ length: count }, (_, i) => ({
    startTime: new Date(Date.now() - i * 86400000),
    completed,
    plannedDuration,
    actualDuration: completed ? plannedDuration : null,
    productivityScore: completed ? 78 : null,
  }));
}

// ─── getBestDay ───────────────────────────────────────────────────────────────

describe('getBestDay', () => {
  it('returns null when fewer than 7 days of data', () => {
    expect(getBestDay(makeDailyStats(5))).toBeNull();
  });

  it('returns the day with highest average focus minutes', () => {
    // Pin a specific day-of-week with high focus
    const stats = makeDailyStats(14);
    // Set all Mondays (dow=1) to 120 min, rest to 30 min
    stats.forEach((s) => {
      const dow = new Date(s.date).getDay();
      s.totalFocusMinutes = dow === 1 ? 120 : 30;
    });

    const insight = getBestDay(stats);
    expect(insight).not.toBeNull();
    expect(insight!.type).toBe('best_day');
    expect(insight!.title).toContain('Monday');
  });

  it('returns null when best average is too low (< 10 min)', () => {
    const stats = makeDailyStats(14, { totalFocusMinutes: 5 });
    expect(getBestDay(stats)).toBeNull();
  });
});

// ─── getPeakHour ──────────────────────────────────────────────────────────────

describe('getPeakHour', () => {
  it('returns null when no peakFocusHour data', () => {
    const stats = makeDailyStats(10, { peakFocusHour: null });
    expect(getPeakHour(stats)).toBeNull();
  });

  it('returns null when a single hour appears fewer than 3 times', () => {
    const stats = makeDailyStats(2, { peakFocusHour: 9 });
    expect(getPeakHour(stats)).toBeNull();
  });

  it('returns the most frequent peak hour when it appears 3+ times', () => {
    const stats = makeDailyStats(10, { peakFocusHour: 10 });
    const insight = getPeakHour(stats);
    expect(insight).not.toBeNull();
    expect(insight!.type).toBe('peak_hour');
    expect(insight!.title).toContain('10 AM');
    expect(insight!.value).toBe(10);
  });
});

// ─── getWeeklyTrend ───────────────────────────────────────────────────────────

describe('getWeeklyTrend', () => {
  it('returns null with fewer than 7 days', () => {
    expect(getWeeklyTrend(makeDailyStats(5))).toBeNull();
  });

  it('detects an upward trend', () => {
    const stats = makeDailyStats(14);
    // Last 7 days: 120 min; days 8-14: 60 min → +100%
    stats.forEach((s, i) => {
      s.totalFocusMinutes = i < 7 ? 120 : 60;
    });

    const insight = getWeeklyTrend(stats);
    expect(insight).not.toBeNull();
    expect(insight!.type).toBe('trend');
    expect(insight!.value).toBeGreaterThan(0);
    expect(insight!.title).toContain('up');
  });

  it('detects a downward trend', () => {
    const stats = makeDailyStats(14);
    stats.forEach((s, i) => {
      s.totalFocusMinutes = i < 7 ? 30 : 120;
    });

    const insight = getWeeklyTrend(stats);
    expect(insight).not.toBeNull();
    expect(insight!.value).toBeLessThan(0);
  });

  it('returns null when change is within 5%', () => {
    const stats = makeDailyStats(14, { totalFocusMinutes: 60 });
    expect(getWeeklyTrend(stats)).toBeNull();
  });
});

// ─── getCompletionRate ────────────────────────────────────────────────────────

describe('getCompletionRate', () => {
  it('returns null with fewer than 5 sessions', () => {
    expect(getCompletionRate(makeSessions(3))).toBeNull();
  });

  it('reports a high completion rate (>=80%) correctly', () => {
    const sessions = [...makeSessions(9, true), ...makeSessions(1, false)];
    const insight = getCompletionRate(sessions);
    expect(insight).not.toBeNull();
    expect(insight!.type).toBe('completion');
    expect(insight!.value).toBe(90);
    expect(insight!.title).toContain('90%');
  });

  it('reports a low completion rate (<50%) correctly', () => {
    const sessions = [...makeSessions(2, true), ...makeSessions(8, false)];
    const insight = getCompletionRate(sessions);
    expect(insight).not.toBeNull();
    expect(insight!.value).toBe(20);
  });
});

// ─── getStreakInsight ─────────────────────────────────────────────────────────

describe('getStreakInsight', () => {
  it('returns null for streaks below 3', () => {
    expect(getStreakInsight(0)).toBeNull();
    expect(getStreakInsight(2)).toBeNull();
  });

  it('returns a streak insight for 3+ days', () => {
    const insight = getStreakInsight(3);
    expect(insight).not.toBeNull();
    expect(insight!.type).toBe('streak');
    expect(insight!.value).toBe(3);
  });

  it('returns the correct message for a 7-day streak', () => {
    const insight = getStreakInsight(7);
    expect(insight!.title).toContain('7-day');
    expect(insight!.description).toContain('week');
  });

  it('returns the correct message for a 30-day streak', () => {
    const insight = getStreakInsight(30);
    expect(insight!.description).toContain('month');
  });
});

// ─── getConsistencyInsight ────────────────────────────────────────────────────

describe('getConsistencyInsight', () => {
  it('returns null with fewer than 14 days', () => {
    expect(getConsistencyInsight(makeDailyStats(10))).toBeNull();
  });

  it('returns null when rate is very high (>=80%) — streak covers it', () => {
    const stats = makeDailyStats(20); // all with 60min focus
    expect(getConsistencyInsight(stats)).toBeNull();
  });

  it('returns insight for moderate consistency', () => {
    const stats = makeDailyStats(20);
    // Only 10 of 20 days have focus time (50%)
    stats.forEach((s, i) => {
      s.totalFocusMinutes = i % 2 === 0 ? 60 : 0;
    });
    const insight = getConsistencyInsight(stats);
    expect(insight).not.toBeNull();
    expect(insight!.type).toBe('consistency');
  });
});

// ─── generateInsights ─────────────────────────────────────────────────────────

describe('generateInsights', () => {
  it('returns an array (empty when insufficient data)', () => {
    const result = generateInsights({ dailyStats: [], sessions: [], streak: 0 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('includes streak insight when streak >= 3', () => {
    const result = generateInsights({
      dailyStats: makeDailyStats(14),
      sessions: makeSessions(10),
      streak: 5,
    });
    const streakInsight = result.find((i) => i.type === 'streak');
    expect(streakInsight).toBeDefined();
  });

  it('each insight has required fields', () => {
    const result = generateInsights({
      dailyStats: makeDailyStats(14),
      sessions: makeSessions(10),
      streak: 7,
    });
    for (const insight of result) {
      expect(insight).toHaveProperty('id');
      expect(insight).toHaveProperty('type');
      expect(insight).toHaveProperty('title');
      expect(insight).toHaveProperty('description');
    }
  });
});

// ─── getPredictiveSchedule ────────────────────────────────────────────────────

describe('getPredictiveSchedule', () => {
  it('returns null when fewer than 5 sessions', () => {
    expect(getPredictiveSchedule(makeDailyStats(7), makeSessions(4))).toBeNull();
  });

  it('returns a schedule insight with 5+ sessions', () => {
    const result = getPredictiveSchedule(makeDailyStats(14), makeSessions(10));
    expect(result).not.toBeNull();
    expect(result?.type).toBe('schedule');
    expect(result?.id).toBe('schedule');
    expect(result?.title).toMatch(/Best focus window/i);
    expect(result?.description).toMatch(/schedule/i);
  });

  it('value is a valid hour (0–23)', () => {
    const result = getPredictiveSchedule(makeDailyStats(14), makeSessions(10));
    expect(result?.value).toBeGreaterThanOrEqual(0);
    expect(result?.value).toBeLessThanOrEqual(23);
  });
});
