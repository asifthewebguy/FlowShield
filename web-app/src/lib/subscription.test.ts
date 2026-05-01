import { describe, it, expect, vi, beforeEach } from 'vitest';

// Explicit return type so `get` resolves to `string | null` (matches the real
// Redis surface). Without this, vi.fn infers Promise<null> from the initial
// value and `mockResolvedValueOnce('PRO')` fails strict typecheck.
const redisMocks = vi.hoisted(() => ({
  get: vi.fn<() => Promise<string | null>>(async () => null),
  setex: vi.fn(async () => 'OK'),
  del: vi.fn(async () => 1),
}));

const prismaMocks = vi.hoisted(() => ({
  subscriptionFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ redis: redisMocks }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findFirst: prismaMocks.subscriptionFindFirst },
    user: { findUnique: prismaMocks.userFindUnique },
  },
}));

import {
  isPaidTier,
  tierAtLeast,
  getUserTier,
  invalidateUserTierCache,
  userHasTier,
} from './subscription';

beforeEach(() => {
  vi.clearAllMocks();
  redisMocks.get.mockResolvedValue(null);
  redisMocks.setex.mockResolvedValue('OK');
});

// ─── isPaidTier / tierAtLeast ────────────────────────────────────────────────

describe('isPaidTier', () => {
  it('PRO and TEAM are paid', () => {
    expect(isPaidTier('PRO')).toBe(true);
    expect(isPaidTier('TEAM')).toBe(true);
  });
  it('FREE / null / unknown are not paid', () => {
    expect(isPaidTier('FREE')).toBe(false);
    expect(isPaidTier(null)).toBe(false);
    expect(isPaidTier('FOO')).toBe(false);
  });
});

describe('tierAtLeast', () => {
  it('orders FREE < PRO < TEAM', () => {
    expect(tierAtLeast('TEAM', 'PRO')).toBe(true);
    expect(tierAtLeast('PRO', 'PRO')).toBe(true);
    expect(tierAtLeast('FREE', 'PRO')).toBe(false);
    expect(tierAtLeast('PRO', 'TEAM')).toBe(false);
    expect(tierAtLeast('FREE', 'FREE')).toBe(true);
  });
  it('treats unknown tiers as FREE', () => {
    expect(tierAtLeast('UNKNOWN', 'FREE')).toBe(true);
    expect(tierAtLeast('UNKNOWN', 'PRO')).toBe(false);
  });
});

// ─── getUserTier ─────────────────────────────────────────────────────────────

describe('getUserTier', () => {
  it('returns cached tier without DB lookup when Redis hits', async () => {
    redisMocks.get.mockResolvedValueOnce('PRO');
    const tier = await getUserTier('u-1');
    expect(tier).toBe('PRO');
    expect(prismaMocks.subscriptionFindFirst).not.toHaveBeenCalled();
    expect(prismaMocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('ignores garbage cache values and falls through to DB', async () => {
    redisMocks.get.mockResolvedValueOnce('NOT_A_TIER');
    prismaMocks.subscriptionFindFirst.mockResolvedValueOnce(null);
    prismaMocks.userFindUnique.mockResolvedValueOnce({ subscriptionTier: 'FREE' });
    const tier = await getUserTier('u-1');
    expect(tier).toBe('FREE');
  });

  it('uses an active Subscription row when one exists', async () => {
    prismaMocks.subscriptionFindFirst.mockResolvedValueOnce({ tier: 'TEAM' });
    const tier = await getUserTier('u-1');
    expect(tier).toBe('TEAM');
    expect(prismaMocks.userFindUnique).not.toHaveBeenCalled();
    expect(redisMocks.setex).toHaveBeenCalledWith('tier:u-1', 300, 'TEAM');
  });

  it('falls back to User.subscriptionTier when no active Subscription exists (manual upgrade case)', async () => {
    prismaMocks.subscriptionFindFirst.mockResolvedValueOnce(null);
    prismaMocks.userFindUnique.mockResolvedValueOnce({ subscriptionTier: 'PRO' });
    const tier = await getUserTier('u-1');
    expect(tier).toBe('PRO');
  });

  it('defaults to FREE when neither Subscription nor User row exists', async () => {
    prismaMocks.subscriptionFindFirst.mockResolvedValueOnce(null);
    prismaMocks.userFindUnique.mockResolvedValueOnce(null);
    const tier = await getUserTier('u-1');
    expect(tier).toBe('FREE');
  });

  it('still resolves a tier when Redis read throws (degraded path)', async () => {
    redisMocks.get.mockRejectedValueOnce(new Error('upstash down'));
    prismaMocks.subscriptionFindFirst.mockResolvedValueOnce({ tier: 'PRO' });
    const tier = await getUserTier('u-1');
    expect(tier).toBe('PRO');
  });

  it('still resolves a tier when Redis write throws (does not leak)', async () => {
    redisMocks.get.mockResolvedValueOnce(null);
    redisMocks.setex.mockRejectedValueOnce(new Error('upstash down'));
    prismaMocks.subscriptionFindFirst.mockResolvedValueOnce({ tier: 'TEAM' });
    const tier = await getUserTier('u-1');
    expect(tier).toBe('TEAM');
  });
});

describe('invalidateUserTierCache', () => {
  it('deletes the cached tier key', async () => {
    await invalidateUserTierCache('u-9');
    expect(redisMocks.del).toHaveBeenCalledWith('tier:u-9');
  });

  it('swallows Redis errors so write paths stay resilient', async () => {
    redisMocks.del.mockRejectedValueOnce(new Error('upstash down'));
    await expect(invalidateUserTierCache('u-9')).resolves.toBeUndefined();
  });
});

describe('userHasTier', () => {
  it('grants TEAM access when user is TEAM', async () => {
    prismaMocks.subscriptionFindFirst.mockResolvedValueOnce({ tier: 'TEAM' });
    expect(await userHasTier('u-1', 'TEAM')).toBe(true);
  });

  it('grants PRO access when user is TEAM', async () => {
    prismaMocks.subscriptionFindFirst.mockResolvedValueOnce({ tier: 'TEAM' });
    expect(await userHasTier('u-1', 'PRO')).toBe(true);
  });

  it('denies PRO access for FREE user', async () => {
    prismaMocks.subscriptionFindFirst.mockResolvedValueOnce(null);
    prismaMocks.userFindUnique.mockResolvedValueOnce({ subscriptionTier: 'FREE' });
    expect(await userHasTier('u-1', 'PRO')).toBe(false);
  });
});
