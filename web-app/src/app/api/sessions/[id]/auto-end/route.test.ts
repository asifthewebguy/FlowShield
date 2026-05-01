import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
  dailyStatsUpsert: vi.fn(async () => ({})),
  bustCoachCacheIfPaid: vi.fn(async () => undefined),
  triggerUserEvent: vi.fn(),
  sendSessionEndPush: vi.fn(async () => 1),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: mocks.sessionFindUnique,
      update: mocks.sessionUpdate,
    },
    dailyStats: {
      upsert: mocks.dailyStatsUpsert,
    },
  },
}));

vi.mock('@/lib/jwt', () => ({
  getUserIdFromToken: vi.fn(() => 'user-1'),
}));

vi.mock('@/lib/pusher', () => ({
  triggerUserEvent: mocks.triggerUserEvent,
}));

vi.mock('@/lib/coach-quota', () => ({
  bustCoachCacheIfPaid: mocks.bustCoachCacheIfPaid,
}));

vi.mock('@/lib/pushNotify', () => ({
  sendSessionEndPush: mocks.sendSessionEndPush,
}));

const { sessionFindUnique, sessionUpdate, triggerUserEvent, bustCoachCacheIfPaid, sendSessionEndPush } = mocks;

import { POST } from './route';

function makeRequest(id: string) {
  return new Request(`http://localhost/api/sessions/${id}/auto-end`, {
    method: 'POST',
    headers: { Authorization: 'Bearer fake' },
  }) as unknown as import('next/server').NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/sessions/[id]/auto-end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when called before planned end + grace', async () => {
    const now = Date.now();
    sessionFindUnique.mockResolvedValueOnce({
      id: 's-1',
      userId: 'user-1',
      startTime: new Date(now - 60 * 1000), // started 1 min ago
      plannedDuration: 60, // 60 min planned — grace end is ~64 min away
      completed: false,
    });

    const res = await POST(makeRequest('s-1'), ctx('s-1'));
    expect(res.status).toBe(400);
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 when session is already completed', async () => {
    sessionFindUnique.mockResolvedValueOnce({
      id: 's-2',
      userId: 'user-1',
      startTime: new Date(0),
      plannedDuration: 25,
      completed: true,
    });

    const res = await POST(makeRequest('s-2'), ctx('s-2'));
    expect(res.status).toBe(409);
  });

  it('auto-ends after grace, clamps duration to plannedDuration, and busts coach cache', async () => {
    const now = Date.now();
    const startTime = new Date(now - 2 * 60 * 60 * 1000); // started 2h ago
    sessionFindUnique.mockResolvedValueOnce({
      id: 's-3',
      userId: 'user-1',
      startTime,
      plannedDuration: 25, // 25 min planned — grace ended ~1h35m ago
      completed: false,
    });
    sessionUpdate.mockResolvedValueOnce({ id: 's-3', completed: true, actualDuration: 25 });

    const res = await POST(makeRequest('s-3'), ctx('s-3'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.autoEnded).toBe(true);
    expect(sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's-3' },
        data: expect.objectContaining({
          completed: true,
          actualDuration: 25,
        }),
      })
    );
    expect(triggerUserEvent).toHaveBeenCalledWith('user-1', 'session-update');
    expect(bustCoachCacheIfPaid).toHaveBeenCalledWith('user-1');
    expect(sendSessionEndPush).toHaveBeenCalledWith('user-1', 's-3', 25);
  });

  it('returns 404 when session belongs to a different user', async () => {
    sessionFindUnique.mockResolvedValueOnce({
      id: 's-4',
      userId: 'different-user',
      startTime: new Date(0),
      plannedDuration: 25,
      completed: false,
    });

    const res = await POST(makeRequest('s-4'), ctx('s-4'));
    expect(res.status).toBe(404);
  });
});
