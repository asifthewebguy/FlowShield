import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  subscriptionFindMany: vi.fn(),
  subscriptionUpdateMany: vi.fn(async () => ({ count: 0 })),
  subscriptionCount: vi.fn(),
  userUpdate: vi.fn(async () => ({})),
  invalidateUserTierCache: vi.fn(async () => undefined),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      findMany: mocks.subscriptionFindMany,
      updateMany: mocks.subscriptionUpdateMany,
      count: mocks.subscriptionCount,
    },
    user: { update: mocks.userUpdate },
  },
}));

vi.mock('@/lib/subscription', () => ({
  invalidateUserTierCache: mocks.invalidateUserTierCache,
}));

import { POST } from './route';

function makeRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/cron/expire-subscriptions', {
    method: 'POST',
    headers,
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/cron/expire-subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret-xyz';
  });

  it('returns 503 when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeRequest({ 'x-cron-secret': 'anything' }));
    expect(res.status).toBe(503);
  });

  it('returns 401 when secret header is missing or wrong', async () => {
    const r1 = await POST(makeRequest({}));
    expect(r1.status).toBe(401);

    const r2 = await POST(makeRequest({ 'x-cron-secret': 'wrong' }));
    expect(r2.status).toBe(401);
  });

  it('returns 200 with zero counts when nothing is expired', async () => {
    mocks.subscriptionFindMany.mockResolvedValueOnce([]);
    const res = await POST(makeRequest({ 'x-cron-secret': 'test-secret-xyz' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.expired).toBe(0);
    expect(data.downgraded).toBe(0);
    expect(mocks.subscriptionUpdateMany).not.toHaveBeenCalled();
  });

  it('flips expired subs to EXPIRED and downgrades users with no other active sub', async () => {
    mocks.subscriptionFindMany.mockResolvedValueOnce([
      { id: 's-1', userId: 'u-1' },
      { id: 's-2', userId: 'u-2' },
    ]);
    // Neither user has another active subscription
    mocks.subscriptionCount.mockResolvedValue(0);

    const res = await POST(makeRequest({ 'x-cron-secret': 'test-secret-xyz' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.expired).toBe(2);
    expect(data.downgraded).toBe(2);

    expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['s-1', 's-2'] } },
        data: { status: 'EXPIRED' },
      })
    );
    expect(mocks.userUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-1' }, data: { subscriptionTier: 'FREE' } })
    );
    expect(mocks.invalidateUserTierCache).toHaveBeenCalledWith('u-1');
    expect(mocks.invalidateUserTierCache).toHaveBeenCalledWith('u-2');
  });

  it('does NOT downgrade users who still have another active subscription', async () => {
    mocks.subscriptionFindMany.mockResolvedValueOnce([{ id: 's-1', userId: 'u-1' }]);
    mocks.subscriptionCount.mockResolvedValueOnce(1); // user still has one active

    const res = await POST(makeRequest({ 'x-cron-secret': 'test-secret-xyz' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.expired).toBe(1);
    expect(data.downgraded).toBe(0);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('deduplicates affected users when one user has multiple expired subs', async () => {
    mocks.subscriptionFindMany.mockResolvedValueOnce([
      { id: 's-1', userId: 'u-1' },
      { id: 's-2', userId: 'u-1' },
    ]);
    mocks.subscriptionCount.mockResolvedValue(0);

    await POST(makeRequest({ 'x-cron-secret': 'test-secret-xyz' }));

    // userUpdate should be called only once even though two subs expired for u-1
    expect(mocks.userUpdate).toHaveBeenCalledTimes(1);
  });
});
