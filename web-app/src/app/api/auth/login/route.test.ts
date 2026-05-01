import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decode } from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

// Explicit return type so emailVerified is `Date | null` (allowing tests to
// override with `null` for the unverified-user gate); without this, TS infers
// the narrow `Date` from the initial value and `mockResolvedValueOnce({...,
// emailVerified: null})` fails strict typecheck.
type MockUser = {
  id: string;
  email: string;
  role: string;
  hashedPassword: string;
  emailVerified: Date | null;
  preferences: { workStyle?: string } | null;
};

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn<() => Promise<MockUser>>(async () => ({
    id: 'user-1',
    email: 'user@example.com',
    role: 'USER',
    hashedPassword: 'hashed',
    emailVerified: new Date(),
    preferences: null,
  })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
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
    mocks.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      hashedPassword: 'hashed',
      emailVerified: new Date(),
      preferences: null,
    });
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

describe('POST /api/auth/login — email-verified gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
  });

  it('allows unverified users when REQUIRE_EMAIL_VERIFICATION is unset (default off)', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      hashedPassword: 'hashed',
      emailVerified: null,
      preferences: null,
    });
    const res = await POST(makeRequest({ email: 'user@example.com', password: 'password123' }));
    expect(res.status).toBe(200);
  });

  it('returns 403 EMAIL_NOT_VERIFIED for unverified users when flag is on', async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    mocks.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      hashedPassword: 'hashed',
      emailVerified: null,
      preferences: null,
    });
    const res = await POST(makeRequest({ email: 'user@example.com', password: 'password123' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('still allows verified users when flag is on', async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    mocks.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      hashedPassword: 'hashed',
      emailVerified: new Date(),
      preferences: null,
    });
    const res = await POST(makeRequest({ email: 'user@example.com', password: 'password123' }));
    expect(res.status).toBe(200);
  });
});
