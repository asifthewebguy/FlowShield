import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { update: vi.fn() } },
}));
vi.mock('@/lib/jwt', () => ({
  getAuthUserId: vi.fn(),
  revokeUserTokens: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

import { POST } from './route';
import { prisma } from '@/lib/prisma';
import { getAuthUserId, revokeUserTokens } from '@/lib/jwt';
import { rateLimit } from '@/lib/rate-limit';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/auth/logout-all', { method: 'POST' });
}

describe('POST /api/auth/logout-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetInMs: 0 });
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(getAuthUserId).mockResolvedValue('user-1');
    vi.mocked(rateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetInMs: 60000 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('bumps tokenVersion, busts the cache, and returns 204', async () => {
    vi.mocked(getAuthUserId).mockResolvedValue('user-1');
    const res = await POST(makeRequest());
    expect(res.status).toBe(204);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenVersion: { increment: 1 } },
    });
    expect(revokeUserTokens).toHaveBeenCalledWith('user-1');
  });

  it('returns 500 when the DB update throws', async () => {
    vi.mocked(getAuthUserId).mockResolvedValue('user-1');
    vi.mocked(prisma.user.update).mockRejectedValue(new Error('db down'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
