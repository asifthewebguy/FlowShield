import { describe, it, expect } from 'vitest';
import {
  calculateProductivityScore,
  getProductivityLevel,
  detectPeakTimes,
  calculateUserLevel,
  checkBadges,
  LEVELS,
} from './productivity';

describe('calculateProductivityScore', () => {
  it('returns 0 for empty sessions array', () => {
    expect(calculateProductivityScore([])).toBe(0);
  });

  it('returns max score for a perfect completed 90-min session', () => {
    const sessions = [
      { plannedDuration: 90, actualDuration: 90, completed: true },
    ];
    // 40 (completed) + 30 (perfect ratio) + 30 (>=90 min) = 100
    expect(calculateProductivityScore(sessions)).toBe(100);
  });

  it('gives partial score for incomplete session', () => {
    const sessions = [
      { plannedDuration: 25, actualDuration: 25, completed: false },
    ];
    // 0 (not completed) + 30 (perfect ratio) + 15 (>=25 min) = 45
    expect(calculateProductivityScore(sessions)).toBe(45);
  });

  it('handles null actualDuration', () => {
    const sessions = [
      { plannedDuration: 25, actualDuration: null, completed: false },
    ];
    // 0 (not completed) + 0 (no duration) + 0 (no duration) = 0
    expect(calculateProductivityScore(sessions)).toBe(0);
  });

  it('averages scores across multiple sessions', () => {
    const sessions = [
      { plannedDuration: 90, actualDuration: 90, completed: true }, // 100
      { plannedDuration: 25, actualDuration: null, completed: false }, // 0
    ];
    expect(calculateProductivityScore(sessions)).toBe(50);
  });

  it('gives good score for 70-130% duration ratio', () => {
    const sessions = [
      { plannedDuration: 60, actualDuration: 42, completed: true }, // 70% ratio
    ];
    // 40 (completed) + 20 (good ratio) + 15 (>=25 min) = 75
    expect(calculateProductivityScore(sessions)).toBe(75);
  });

  it('caps score at 100', () => {
    const sessions = [
      { plannedDuration: 90, actualDuration: 90, completed: true },
    ];
    expect(calculateProductivityScore(sessions)).toBeLessThanOrEqual(100);
  });
});

describe('getProductivityLevel', () => {
  it('returns Excellent for score >= 80', () => {
    expect(getProductivityLevel(80).level).toBe('Excellent');
    expect(getProductivityLevel(100).level).toBe('Excellent');
  });

  it('returns Good for score 60-79', () => {
    expect(getProductivityLevel(60).level).toBe('Good');
    expect(getProductivityLevel(79).level).toBe('Good');
  });

  it('returns Fair for score 40-59', () => {
    expect(getProductivityLevel(40).level).toBe('Fair');
    expect(getProductivityLevel(59).level).toBe('Fair');
  });

  it('returns Needs Work for score < 40', () => {
    expect(getProductivityLevel(0).level).toBe('Needs Work');
    expect(getProductivityLevel(39).level).toBe('Needs Work');
  });
});

describe('detectPeakTimes', () => {
  it('returns default 9 AM for empty sessions', () => {
    const result = detectPeakTimes([]);
    expect(result.peakHour).toBe(9);
    expect(result.hourlyStats).toHaveLength(0);
  });

  it('detects peak hour from sessions', () => {
    const sessions = [
      { startTime: new Date('2024-01-01T09:00:00'), completed: true, actualDuration: 90, plannedDuration: 90 },
      { startTime: new Date('2024-01-01T09:30:00'), completed: true, actualDuration: 45, plannedDuration: 45 },
      { startTime: new Date('2024-01-01T14:00:00'), completed: false, actualDuration: 10, plannedDuration: 25 },
    ];
    const result = detectPeakTimes(sessions);
    expect(result.peakHour).toBe(9);
    expect(result.peakPeriod).toContain('Morning');
  });
});

describe('calculateUserLevel', () => {
  it('returns level 1 for 0 minutes', () => {
    const result = calculateUserLevel(0);
    expect(result.level).toBe(1);
    expect(result.title).toBe('Novice Focus');
  });

  it('returns level 2 for 120+ minutes', () => {
    const result = calculateUserLevel(120);
    expect(result.level).toBe(2);
    expect(result.title).toBe('Apprentice');
  });

  it('returns max level for very high minutes', () => {
    const result = calculateUserLevel(50000);
    expect(result.level).toBe(LEVELS[LEVELS.length - 1].level);
    expect(result.progressPercent).toBe(100);
  });

  it('calculates progress percentage correctly', () => {
    // Level 1 is 0-119, level 2 starts at 120
    const result = calculateUserLevel(60); // 50% through level 1
    expect(result.level).toBe(1);
    expect(result.progressPercent).toBe(50);
  });
});

describe('checkBadges', () => {
  it('awards First Step badge for 1+ sessions', () => {
    const badges = checkBadges(1, 10, 0);
    const firstStep = badges.find(b => b.id === 'first_step');
    expect(firstStep?.achieved).toBe(true);
  });

  it('does not award badges with no progress', () => {
    const badges = checkBadges(0, 0, 0);
    expect(badges.every(b => !b.achieved)).toBe(true);
  });

  it('awards streak badges at correct thresholds', () => {
    const badges = checkBadges(0, 0, 7);
    expect(badges.find(b => b.id === 'on_fire')?.achieved).toBe(true);
    expect(badges.find(b => b.id === 'unstoppable')?.achieved).toBe(true);
  });

  it('awards marathon badge for 600+ minutes', () => {
    const badges = checkBadges(0, 600, 0);
    expect(badges.find(b => b.id === 'marathon')?.achieved).toBe(true);
  });
});
