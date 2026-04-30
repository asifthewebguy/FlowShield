import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn(async () => 1),
}));

vi.mock('@/lib/redis', () => ({ redis: mocks }));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/callback-exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

const VALID_SESSION = 'a'.repeat(64);

describe('POST /api/auth/callback-exchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects requests with no session id', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('rejects too-short session ids', async () => {
    const res = await POST(makeRequest({ session: 'short' }));
    expect(res.status).toBe(400);
  });

  it('returns 410 when the session is missing or already used', async () => {
    mocks.get.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ session: VALID_SESSION }));
    expect(res.status).toBe(410);
  });

  it('returns 503 when Redis read fails', async () => {
    mocks.get.mockRejectedValueOnce(new Error('upstash down'));
    const res = await POST(makeRequest({ session: VALID_SESSION }));
    expect(res.status).toBe(503);
  });

  it('returns the stored payload and deletes the key on success', async () => {
    const payload = {
      token: 'jwt-here',
      user: { id: 'u-1', email: 'u@example.com' },
      redirect: '/dashboard',
    };
    mocks.get.mockResolvedValueOnce(payload); // Upstash returns deserialized
    const res = await POST(makeRequest({ session: VALID_SESSION }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(payload);
    expect(mocks.del).toHaveBeenCalledWith(`auth-callback:${VALID_SESSION}`);
  });

  it('parses string-serialized payloads', async () => {
    const payload = { token: 'jwt', user: { id: 'u-1' }, redirect: '/x' };
    mocks.get.mockResolvedValueOnce(JSON.stringify(payload));
    const res = await POST(makeRequest({ session: VALID_SESSION }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(payload);
  });
});
