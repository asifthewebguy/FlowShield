import { describe, it, expect } from 'vitest';
import { getLocalHour, getLocalDate } from './timezone';

describe('getLocalHour', () => {
  it('converts UTC timestamp to local hour in Asia/Dhaka (UTC+6)', () => {
    // 2026-04-10T16:00:00Z = 2026-04-10T22:00+06:00 → hour 22
    const date = new Date('2026-04-10T16:00:00Z');
    expect(getLocalHour(date, 'Asia/Dhaka')).toBe(22);
  });

  it('converts UTC timestamp crossing midnight in Asia/Dhaka', () => {
    // 2026-04-10T20:00:00Z = 2026-04-11T02:00+06:00 → hour 2
    const date = new Date('2026-04-10T20:00:00Z');
    expect(getLocalHour(date, 'Asia/Dhaka')).toBe(2);
  });

  it('returns 0 for midnight (handles locales that return 24)', () => {
    // 2026-04-10T18:00:00Z = 2026-04-11T00:00+06:00 → hour 0
    const date = new Date('2026-04-10T18:00:00Z');
    expect(getLocalHour(date, 'Asia/Dhaka')).toBe(0);
  });

  it('falls back correctly with UTC timezone', () => {
    const date = new Date('2026-04-10T14:30:00Z');
    expect(getLocalHour(date, 'UTC')).toBe(14);
  });

  it('throws RangeError for an invalid timezone string', () => {
    expect(() => getLocalHour(new Date(), 'Not/ATimezone')).toThrow(RangeError);
  });

  it('handles half-hour offset timezone (Asia/Kolkata UTC+5:30)', () => {
    // 2026-04-10T12:30:00Z = 2026-04-10T18:00+05:30 → hour 18
    const date = new Date('2026-04-10T12:30:00Z');
    expect(getLocalHour(date, 'Asia/Kolkata')).toBe(18);
  });
});

describe('getLocalDate', () => {
  it('returns YYYY-MM-DD in local timezone, not UTC', () => {
    // 2026-04-10T20:00:00Z = 2026-04-11 in Asia/Dhaka
    const date = new Date('2026-04-10T20:00:00Z');
    expect(getLocalDate(date, 'Asia/Dhaka')).toBe('2026-04-11');
  });

  it('returns YYYY-MM-DD in UTC when timezone is UTC', () => {
    const date = new Date('2026-04-10T20:00:00Z');
    expect(getLocalDate(date, 'UTC')).toBe('2026-04-10');
  });
});
