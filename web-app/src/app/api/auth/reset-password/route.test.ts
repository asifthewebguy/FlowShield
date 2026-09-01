import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(async () => ({})),
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  rateLimit: vi.fn(() => ({ allowed: true, resetInMs: 0 })),
  redisDel: vi.fn(async () => 1),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique, update: mocks.update } },
}));

vi.mock('@/lib/auth', () => ({ hashPassword: mocks.hashPassword }));

vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: mocks.redisDel },
  CACHE_TTL: 300,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

const VALID_TOKEN = 'a'.repeat(64);
const VALID_PASSWORD = 'NewPass123';

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue({ allowed: true, resetInMs: 0 });
  });

  it('rejects when token is missing or too short', async () => {
    const res = await POST(makeRequest({ token: 'short', newPassword: VALID_PASSWORD }));
    expect(res.status).toBe(400);
  });

  it('rejects weak passwords (no uppercase)', async () => {
    const res = await POST(makeRequest({ token: VALID_TOKEN, newPassword: 'lowercase1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when token does not match any user', async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ token: VALID_TOKEN, newPassword: VALID_PASSWORD }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when token is expired and clears the stale token', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: 'u-1',
      passwordResetExpires: new Date(Date.now() - 10_000),
    });
    const res = await POST(makeRequest({ token: VALID_TOKEN, newPassword: VALID_PASSWORD }));
    expect(res.status).toBe(400);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: { passwordResetToken: null, passwordResetExpires: null },
      })
    );
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it('hashes new password and clears reset token on success', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: 'u-1',
      passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000),
    });
    const res = await POST(makeRequest({ token: VALID_TOKEN, newPassword: VALID_PASSWORD }));
    expect(res.status).toBe(200);
    expect(mocks.hashPassword).toHaveBeenCalledWith(VALID_PASSWORD);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({
          hashedPassword: `hashed:${VALID_PASSWORD}`,
          passwordResetToken: null,
          passwordResetExpires: null,
          tokenVersion: { increment: 1 },
        }),
      })
    );
    expect(mocks.redisDel).toHaveBeenCalledWith('tv:u-1');
  });

  it('returns 429 when rate-limited', async () => {
    mocks.rateLimit.mockReturnValueOnce({ allowed: false, resetInMs: 5000 });
    const res = await POST(makeRequest({ token: VALID_TOKEN, newPassword: VALID_PASSWORD }));
    expect(res.status).toBe(429);
  });
});
