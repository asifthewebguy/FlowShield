import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(async () => ({})),
  sendEmail: vi.fn(async () => true),
  rateLimit: vi.fn(() => ({ allowed: true, resetInMs: 0 })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique, update: mocks.update } },
}));

vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail }));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue({ allowed: true, resetInMs: 0 });
  });

  it('returns 200 with generic message even when email does not exist', async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ email: 'nobody@example.com' }));
    expect(res.status).toBe(200);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('generates a token and sends the reset email when user exists with a password', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: 'u-1',
      email: 'user@example.com',
      hashedPassword: 'bcrypt-hash',
      name: 'Asif',
    });
    const res = await POST(makeRequest({ email: 'user@example.com' }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({
          passwordResetToken: expect.any(String),
          passwordResetExpires: expect.any(Date),
        }),
      })
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Reset'),
      })
    );
  });

  it('does NOT send email for Google-only users (empty hashedPassword)', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: 'u-2',
      email: 'google@example.com',
      hashedPassword: '',
      name: null,
    });
    const res = await POST(makeRequest({ email: 'google@example.com' }));
    expect(res.status).toBe(200);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects malformed email payload', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mocks.rateLimit.mockReturnValueOnce({ allowed: false, resetInMs: 5000 });
    const res = await POST(makeRequest({ email: 'user@example.com' }));
    expect(res.status).toBe(429);
  });
});
