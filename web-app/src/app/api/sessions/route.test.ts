import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  triggerUserEvent: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { session: { findFirst: mocks.findFirst, create: mocks.create } },
}));

vi.mock('@/lib/jwt', () => ({
  getAuthUserId: vi.fn(async () => 'user-1'),
}));

vi.mock('@/lib/pusher', () => ({
  triggerUserEvent: mocks.triggerUserEvent,
}));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/sessions — race check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new session when no active session exists', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({ id: 'new-1', plannedDuration: 25 });
    const res = await POST(makeRequest({ plannedDuration: 25 }));
    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalled();
    expect(mocks.triggerUserEvent).toHaveBeenCalledWith('user-1', 'session-update');
  });

  it('returns 409 with activeSessionId when an active session already exists', async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: 'active-1', startTime: new Date() });
    const res = await POST(makeRequest({ plannedDuration: 25 }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe('SESSION_ALREADY_ACTIVE');
    expect(data.activeSessionId).toBe('active-1');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects requests missing plannedDuration', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
