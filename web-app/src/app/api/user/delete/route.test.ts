import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  delete: vi.fn(async () => ({})),
  verifyPassword: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique, delete: mocks.delete } },
}));

vi.mock('@/lib/auth', () => ({
  verifyPassword: mocks.verifyPassword,
}));

vi.mock('@/lib/jwt', () => ({
  getUserIdFromToken: vi.fn(() => 'user-1'),
}));

import { DELETE } from './route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/user/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

describe('DELETE /api/user/delete — password confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when password is missing', async () => {
    const res = await DELETE(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('rejects when password is wrong', async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: 'user-1', hashedPassword: 'hash' });
    mocks.verifyPassword.mockResolvedValueOnce(false);
    const res = await DELETE(makeRequest({ password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('rejects Google-only users with NO_PASSWORD_SET', async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: 'user-1', hashedPassword: '' });
    const res = await DELETE(makeRequest({ password: 'anything' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('NO_PASSWORD_SET');
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('deletes the user when password is correct', async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: 'user-1', hashedPassword: 'hash' });
    mocks.verifyPassword.mockResolvedValueOnce(true);
    const res = await DELETE(makeRequest({ password: 'correct' }));
    expect(res.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });
});
