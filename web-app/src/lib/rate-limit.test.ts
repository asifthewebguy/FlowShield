import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Redis client so no real connection is attempted.
vi.mock('@/lib/redis', () => ({ redis: {}, CACHE_TTL: 300 }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

// Shared mock for Ratelimit#limit; every instance delegates to it.
const limitMock = vi.fn();
vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow() {
      return {};
    }
    limit = limitMock;
  }
  return { Ratelimit };
});

import { rateLimit, getClientIp } from './rate-limit';

describe('rateLimit (Redis-backed)', () => {
  beforeEach(() => {
    limitMock.mockReset();
  });

  it('passes through an allowed result', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    const result = await rateLimit('login:1.2.3.4', 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetInMs).toBeGreaterThan(0);
  });

  it('passes through a blocked result', async () => {
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 30_000 });
    const result = await rateLimit('login:1.2.3.4', 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('clamps resetInMs to >= 0 when reset is in the past', async () => {
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() - 5_000 });
    const result = await rateLimit('login:1.2.3.4', 5, 60_000);
    expect(result.resetInMs).toBe(0);
  });

  it('fails open (allowed) when Redis throws', async () => {
    limitMock.mockRejectedValue(new Error('redis down'));
    const result = await rateLimit('login:1.2.3.4', 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });
});

describe('getClientIp', () => {
  it('prefers Netlify x-nf-client-connection-ip (unspoofable edge IP)', () => {
    const req = new Request('https://example.com', {
      headers: {
        'x-nf-client-connection-ip': '203.0.113.9',
        'x-forwarded-for': '1.2.3.4, 203.0.113.9',
      },
    });
    expect(getClientIp(req)).toBe('203.0.113.9');
  });

  it('uses the LAST x-forwarded-for element (closest to trusted edge)', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' },
    });
    expect(getClientIp(req)).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip when no forwarded headers exist', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-real-ip': '10.0.0.5' },
    });
    expect(getClientIp(req)).toBe('10.0.0.5');
  });

  it('returns "unknown" when no IP headers are present', () => {
    const req = new Request('https://example.com');
    expect(getClientIp(req)).toBe('unknown');
  });

  it('trims whitespace from forwarded values', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '  1.2.3.4 ,  203.0.113.5  ' },
    });
    expect(getClientIp(req)).toBe('203.0.113.5');
  });
});
