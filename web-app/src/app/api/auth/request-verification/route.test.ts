import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(async () => ({})),
  sendEmail: vi.fn(async () => true),
  rateLimit: vi.fn(async () => ({ allowed: true, resetInMs: 0 })),
  getSettings: vi.fn(async () => ({
    email: { verification: { enabled: true, subject: 'Verify your email' } },
  })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique, update: mocks.update } },
}));
vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('@/lib/settings', () => ({ getSettings: mocks.getSettings }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/request-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/auth/request-verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ allowed: true, resetInMs: 0 });
  });

  it('returns 200 generic message and sends nothing when the email is unknown', async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ email: 'nobody@example.com' }));
    expect(res.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('generates a token and sends the verification email for an unverified user', async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: 'u-1', email: 'user@example.com', emailVerified: null });
    const res = await POST(makeRequest({ email: 'user@example.com' }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({
          verificationToken: expect.any(String),
          verificationTokenExpires: expect.any(Date),
        }),
      })
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' })
    );
  });

  it('sends nothing for an already-verified user (still returns 200)', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: 'u-2',
      email: 'done@example.com',
      emailVerified: new Date(),
    });
    const res = await POST(makeRequest({ email: 'done@example.com' }));
    expect(res.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects a malformed email with 400', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when the IP rate limit is exceeded (before touching the DB)', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, resetInMs: 5000 });
    const res = await POST(makeRequest({ email: 'user@example.com' }));
    expect(res.status).toBe(429);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('does not send when the per-email cap is hit, but still returns a generic 200', async () => {
    // 1st call = IP limit (allowed), 2nd call = per-email limit (blocked)
    mocks.rateLimit
      .mockResolvedValueOnce({ allowed: true, resetInMs: 0 })
      .mockResolvedValueOnce({ allowed: false, resetInMs: 5000 });
    mocks.findUnique.mockResolvedValueOnce({ id: 'u-3', email: 'spammed@example.com', emailVerified: null });
    const res = await POST(makeRequest({ email: 'spammed@example.com' }));
    expect(res.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
