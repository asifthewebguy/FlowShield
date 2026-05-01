import { describe, it, expect } from 'vitest';
import {
  isPaidTier,
  isSameCalendarMonthUTC,
  freeTierCanCall,
  nextFreeTierResetAt,
  coachCacheKey,
  coachCacheTtl,
} from './coach-quota';

// ─── isPaidTier ──────────────────────────────────────────────────────────────

describe('isPaidTier', () => {
  it('treats PRO and TEAM as paid', () => {
    expect(isPaidTier('PRO')).toBe(true);
    expect(isPaidTier('TEAM')).toBe(true);
  });

  it('treats FREE, null, undefined, and unknown strings as not paid', () => {
    expect(isPaidTier('FREE')).toBe(false);
    expect(isPaidTier(null)).toBe(false);
    expect(isPaidTier(undefined)).toBe(false);
    expect(isPaidTier('UNKNOWN')).toBe(false);
  });
});

// ─── isSameCalendarMonthUTC ──────────────────────────────────────────────────

describe('isSameCalendarMonthUTC', () => {
  it('is true for two dates in the same UTC month', () => {
    expect(
      isSameCalendarMonthUTC(new Date('2026-05-01T00:00:00Z'), new Date('2026-05-31T23:59:59Z'))
    ).toBe(true);
  });

  it('is false across a month boundary', () => {
    expect(
      isSameCalendarMonthUTC(new Date('2026-05-31T23:59:59Z'), new Date('2026-06-01T00:00:00Z'))
    ).toBe(false);
  });

  it('is false across a year boundary', () => {
    expect(
      isSameCalendarMonthUTC(new Date('2026-12-31T23:59:59Z'), new Date('2027-01-01T00:00:00Z'))
    ).toBe(false);
  });
});

// ─── freeTierCanCall ─────────────────────────────────────────────────────────

describe('freeTierCanCall', () => {
  it('allows the call when there is no prior call recorded', () => {
    expect(freeTierCanCall(null)).toBe(true);
    expect(freeTierCanCall(undefined)).toBe(true);
  });

  it('blocks when a call was made earlier this calendar month', () => {
    const now = new Date('2026-05-15T10:00:00Z');
    const earlierThisMonth = new Date('2026-05-01T00:00:00Z');
    expect(freeTierCanCall(earlierThisMonth, now)).toBe(false);
  });

  it('blocks even on the same instant', () => {
    const t = new Date('2026-05-10T12:00:00Z');
    expect(freeTierCanCall(t, t)).toBe(false);
  });

  it('allows when last call was last month', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const lastMonth = new Date('2026-04-30T23:59:59Z');
    expect(freeTierCanCall(lastMonth, now)).toBe(true);
  });

  it('allows across year rollover', () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const lastYear = new Date('2026-12-31T23:00:00Z');
    expect(freeTierCanCall(lastYear, now)).toBe(true);
  });
});

// ─── nextFreeTierResetAt ─────────────────────────────────────────────────────

describe('nextFreeTierResetAt', () => {
  it('returns the first instant of next month, UTC', () => {
    const now = new Date('2026-05-15T10:30:00Z');
    const next = nextFreeTierResetAt(now);
    expect(next.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('rolls year correctly in December', () => {
    const now = new Date('2026-12-25T00:00:00Z');
    const next = nextFreeTierResetAt(now);
    expect(next.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

// ─── coachCacheKey ───────────────────────────────────────────────────────────

describe('coachCacheKey', () => {
  it('uses month granularity (YYYY-MM) for FREE tier', () => {
    const now = new Date('2026-05-15T10:00:00Z');
    expect(coachCacheKey('user-1', 'FREE', now)).toBe('coach:user-1:2026-05');
  });

  it('uses day granularity (YYYY-MM-DD) for paid tiers', () => {
    const now = new Date('2026-05-15T10:00:00Z');
    expect(coachCacheKey('user-1', 'PRO', now)).toBe('coach:user-1:2026-05-15');
    expect(coachCacheKey('user-1', 'TEAM', now)).toBe('coach:user-1:2026-05-15');
  });

  it('rolls FREE key on the 1st of each month', () => {
    const apr30 = new Date('2026-04-30T23:59:59Z');
    const may1 = new Date('2026-05-01T00:00:00Z');
    expect(coachCacheKey('u', 'FREE', apr30)).toBe('coach:u:2026-04');
    expect(coachCacheKey('u', 'FREE', may1)).toBe('coach:u:2026-05');
  });
});

// ─── coachCacheTtl ───────────────────────────────────────────────────────────

describe('coachCacheTtl', () => {
  it('FREE is 31 days', () => {
    expect(coachCacheTtl('FREE')).toBe(31 * 24 * 60 * 60);
  });

  it('paid tiers are 24 hours', () => {
    expect(coachCacheTtl('PRO')).toBe(24 * 60 * 60);
    expect(coachCacheTtl('TEAM')).toBe(24 * 60 * 60);
  });

  it('unknown tier defaults to daily (paid) TTL', () => {
    expect(coachCacheTtl('SOMETHING_NEW')).toBe(24 * 60 * 60);
  });
});
