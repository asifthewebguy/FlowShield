import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, getClientIp } from './rate-limit';

// The rate limiter uses a module-level Map. We need to ensure tests don't
// bleed into each other via shared state, so we use unique keys per test.
let testId = 0;
function uniqueKey(prefix = 'test') {
  return `${prefix}:${++testId}:${Date.now()}`;
}

describe('rateLimit', () => {
  it('allows the first request under the limit', () => {
    const result = rateLimit(uniqueKey(), 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('tracks remaining count correctly', () => {
    const key = uniqueKey();
    rateLimit(key, 5, 60_000);
    rateLimit(key, 5, 60_000);
    const result = rateLimit(key, 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('blocks requests at the limit', () => {
    const key = uniqueKey();
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60_000);
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('returns resetInMs close to windowMs when blocked', () => {
    const key = uniqueKey();
    const windowMs = 60_000;
    for (let i = 0; i < 2; i++) rateLimit(key, 2, windowMs);
    const blocked = rateLimit(key, 2, windowMs);
    expect(blocked.allowed).toBe(false);
    // resetInMs should be approximately windowMs (within 100ms tolerance)
    expect(blocked.resetInMs).toBeGreaterThan(windowMs - 200);
    expect(blocked.resetInMs).toBeLessThanOrEqual(windowMs);
  });

  it('allows new requests after the window expires', async () => {
    const key = uniqueKey();
    const windowMs = 50; // 50ms window
    rateLimit(key, 1, windowMs);
    // First request fills the limit
    expect(rateLimit(key, 1, windowMs).allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));
    expect(rateLimit(key, 1, windowMs).allowed).toBe(true);
  });

  it('treats different keys independently', () => {
    const key1 = uniqueKey('a');
    const key2 = uniqueKey('b');
    for (let i = 0; i < 3; i++) rateLimit(key1, 3, 60_000);
    // key1 is at limit; key2 should still be fresh
    expect(rateLimit(key1, 3, 60_000).allowed).toBe(false);
    expect(rateLimit(key2, 3, 60_000).allowed).toBe(true);
  });

  it('allows a limit of 1 (single-request window)', () => {
    const key = uniqueKey();
    expect(rateLimit(key, 1, 60_000).allowed).toBe(true);
    expect(rateLimit(key, 1, 60_000).allowed).toBe(false);
  });

  it('remaining is 0 when exactly at limit', () => {
    const key = uniqueKey();
    rateLimit(key, 2, 60_000);
    const last = rateLimit(key, 2, 60_000);
    expect(last.allowed).toBe(true);
    expect(last.remaining).toBe(0);
  });
});

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for header', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
    });
    expect(getClientIp(req)).toBe('192.168.1.1');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-real-ip': '10.0.0.5' },
    });
    expect(getClientIp(req)).toBe('10.0.0.5');
  });

  it('returns "unknown" when no IP headers are present', () => {
    const req = new Request('https://example.com');
    expect(getClientIp(req)).toBe('unknown');
  });

  it('trims whitespace from x-forwarded-for', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '  203.0.113.5  , 10.0.0.1' },
    });
    expect(getClientIp(req)).toBe('203.0.113.5');
  });
});
