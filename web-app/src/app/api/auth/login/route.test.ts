import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decode } from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        id: 'user-1',
        email: 'user@example.com',
        role: 'USER',
        hashedPassword: 'hashed',
        preferences: null,
      })),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  verifyPassword: vi.fn(async () => true),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ allowed: true, resetInMs: 0 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/auth/login — JWT expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a 7-day token when rememberMe is false', async () => {
    const res = await POST(makeRequest({ email: 'user@example.com', password: 'password123', rememberMe: false }));
    expect(res.status).toBe(200);
    const data = await res.json();
    const decoded = decode(data.token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
  });

  it('issues a 30-day token when rememberMe is true', async () => {
    const res = await POST(makeRequest({ email: 'user@example.com', password: 'password123', rememberMe: true }));
    expect(res.status).toBe(200);
    const data = await res.json();
    const decoded = decode(data.token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(30 * 24 * 60 * 60);
  });
});
