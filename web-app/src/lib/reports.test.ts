import { describe, it, expect } from 'vitest';
import { getWeeklyStats } from './reports';

function dayAgo(
  n: number,
  overrides: Partial<{
    totalFocusMinutes: number;
    avgProductivityScore: number | null;
    sessionsCompleted: number;
  }> = {}
) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return {
    date: d,
    totalFocusMinutes: overrides.totalFocusMinutes ?? 60,
    avgProductivityScore:
      overrides.avgProductivityScore !== undefined ? overrides.avgProductivityScore : 75,
    sessionsCompleted: overrides.sessionsCompleted ?? 2,
  };
}

describe('getWeeklyStats', () => {
  it('returns empty weeks and zero delta when no data', () => {
    const result = getWeeklyStats([]);
    expect(result.weeks).toHaveLength(0);
    expect(result.delta.focusHours.value).toBe(0);
    expect(result.delta.focusHours.direction).toBe('same');
  });

  it('aggregates daily stats into weekly buckets', () => {
    // 14 days × 60 min/day = 2 weeks of 7h each
    const stats = Array.from({ length: 14 }, (_, i) =>
      dayAgo(i, { totalFocusMinutes: 60 })
    );
    const result = getWeeklyStats(stats, 2);
    expect(result.weeks.length).toBeGreaterThanOrEqual(1);
    result.weeks.forEach(w => {
      expect(w.totalFocusHours).toBeGreaterThan(0);
    });
  });

  it('computes focus hour delta — up when current > previous', () => {
    const stats = [
      // Previous week: 60 min/day × 7 = 7h
      ...Array.from({ length: 7 }, (_, i) => dayAgo(7 + i, { totalFocusMinutes: 60 })),
      // Current week: 120 min/day × 7 = 14h
      ...Array.from({ length: 7 }, (_, i) => dayAgo(i, { totalFocusMinutes: 120 })),
    ];
    const result = getWeeklyStats(stats, 2);
    expect(result.delta.focusHours.direction).toBe('up');
    expect(result.delta.focusHours.pct).toBe(100); // +100%
  });

  it('computes focus hour delta — down when current < previous', () => {
    const stats = [
      ...Array.from({ length: 7 }, (_, i) => dayAgo(7 + i, { totalFocusMinutes: 120 })),
      ...Array.from({ length: 7 }, (_, i) => dayAgo(i, { totalFocusMinutes: 60 })),
    ];
    const result = getWeeklyStats(stats, 2);
    expect(result.delta.focusHours.direction).toBe('down');
    expect(result.delta.focusHours.pct).toBe(-50);
  });

  it('reports direction as same when values are equal', () => {
    const stats = Array.from({ length: 14 }, (_, i) =>
      dayAgo(i, { totalFocusMinutes: 60 })
    );
    const result = getWeeklyStats(stats, 2);
    expect(result.delta.focusHours.direction).toBe('same');
  });

  it('computes productivity score delta in points', () => {
    const stats = [
      ...Array.from({ length: 7 }, (_, i) =>
        dayAgo(7 + i, { avgProductivityScore: 70 })
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        dayAgo(i, { avgProductivityScore: 80 })
      ),
    ];
    const result = getWeeklyStats(stats, 2);
    expect(result.delta.productivityScore.pts).toBe(10);
    expect(result.delta.productivityScore.direction).toBe('up');
  });

  it('handles null avgProductivityScore — scores as 0', () => {
    const stats = Array.from({ length: 7 }, (_, i) =>
      dayAgo(i, { avgProductivityScore: null })
    );
    const result = getWeeklyStats(stats, 1);
    expect(result.weeks[0].avgProductivityScore).toBe(0);
  });

  it('caps result to numWeeks even with more data', () => {
    const stats = Array.from({ length: 56 }, (_, i) => dayAgo(i));
    const result = getWeeklyStats(stats, 8);
    expect(result.weeks.length).toBeLessThanOrEqual(8);
  });

  it('returns weekStart as YYYY-MM-DD string', () => {
    const stats = Array.from({ length: 7 }, (_, i) => dayAgo(i));
    const result = getWeeklyStats(stats, 1);
    expect(result.weeks[0].weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
