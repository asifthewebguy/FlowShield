import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(async () => ({})),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  rateLimit: vi.fn(() => ({ allowed: true, resetInMs: 0 })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique, update: mocks.update } },
}));

vi.mock('@/lib/auth', () => ({
  verifyPassword: mocks.verifyPassword,
  hashPassword: mocks.hashPassword,
}));

vi.mock('@/lib/jwt', () => ({
  getUserIdFromToken: vi.fn(() => 'user-1'),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
}));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/user/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

const VALID_NEW = 'NewPass123';

describe('POST /api/user/password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue({ allowed: true, resetInMs: 0 });
  });

  it('rejects weak new password', async () => {
    const res = await POST(makeRequest({ currentPassword: 'old', newPassword: 'weak' }));
    expect(res.status).toBe(400);
  });

  it('rejects when current password is wrong', async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: 'user-1', hashedPassword: 'hash' });
    mocks.verifyPassword.mockResolvedValueOnce(false);
    const res = await POST(makeRequest({ currentPassword: 'wrong', newPassword: VALID_NEW }));
    expect(res.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects Google-only users (no current password to verify)', async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: 'user-1', hashedPassword: '' });
    const res = await POST(makeRequest({ currentPassword: 'anything', newPassword: VALID_NEW }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('NO_PASSWORD_SET');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('hashes and stores new password on success', async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: 'user-1', hashedPassword: 'old-hash' });
    mocks.verifyPassword.mockResolvedValueOnce(true);
    const res = await POST(makeRequest({ currentPassword: 'old', newPassword: VALID_NEW }));
    expect(res.status).toBe(200);
    expect(mocks.hashPassword).toHaveBeenCalledWith(VALID_NEW);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { hashedPassword: `hashed:${VALID_NEW}` },
      })
    );
  });

  it('returns 429 when rate-limited', async () => {
    mocks.rateLimit.mockReturnValueOnce({ allowed: false, resetInMs: 5000 });
    const res = await POST(makeRequest({ currentPassword: 'old', newPassword: VALID_NEW }));
    expect(res.status).toBe(429);
  });
});
