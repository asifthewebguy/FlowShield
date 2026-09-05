import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn<(args: any) => Promise<any>>(),
  create: vi.fn<(args: any) => Promise<any>>(),
  triggerUserEvent: vi.fn(),
  invalidateAnalyticsCache: vi.fn<(args: any) => Promise<any>>(async () => {}),
  taskFindFirst: vi.fn<(args: any) => Promise<any>>(async () => null),
  projectFindFirst: vi.fn<(args: any) => Promise<any>>(async () => null),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: { findFirst: mocks.findFirst, create: mocks.create },
    task: { findFirst: mocks.taskFindFirst },
    project: { findFirst: mocks.projectFindFirst },
  },
}));

vi.mock('@/lib/jwt', () => ({
  getAuthUserId: vi.fn(async () => 'user-1'),
}));

vi.mock('@/lib/pusher', () => ({
  triggerUserEvent: mocks.triggerUserEvent,
}));

vi.mock('@/lib/analytics-cache', () => ({
  invalidateAnalyticsCache: mocks.invalidateAnalyticsCache,
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

const TASK_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('POST /api/sessions — taskId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores taskId when the task belongs to the caller', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);                       // no active session
    mocks.taskFindFirst.mockResolvedValueOnce({ id: TASK_ID });         // owned
    mocks.create.mockResolvedValueOnce({ id: 'new-1', plannedDuration: 25, taskId: TASK_ID });
    const res = await POST(makeRequest({ plannedDuration: 25, taskId: TASK_ID }));
    expect(res.status).toBe(201);
    expect(mocks.taskFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TASK_ID, userId: 'user-1' } })
    );
    expect(mocks.create.mock.calls[0][0].data.taskId).toBe(TASK_ID);
  });

  it('404s when taskId is not one of the caller\'s tasks', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    mocks.taskFindFirst.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ plannedDuration: 25, taskId: TASK_ID }));
    expect(res.status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('still creates a session without a taskId (backward compatible)', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({ id: 'new-2', plannedDuration: 25 });
    const res = await POST(makeRequest({ plannedDuration: 25 }));
    expect(res.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data.taskId).toBeNull();
  });
});

const PROJECT_ID = '223e4567-e89b-12d3-a456-426614174000';

describe('POST /api/sessions — projectId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores projectId when the project belongs to the caller', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);                          // no active session
    mocks.projectFindFirst.mockResolvedValueOnce({ id: PROJECT_ID });     // owned
    mocks.create.mockResolvedValueOnce({ id: 'new-1', plannedDuration: 25, projectId: PROJECT_ID });
    const res = await POST(makeRequest({ plannedDuration: 25, projectId: PROJECT_ID }));
    expect(res.status).toBe(201);
    expect(mocks.projectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PROJECT_ID, userId: 'user-1' } })
    );
    expect(mocks.create.mock.calls[0][0].data.projectId).toBe(PROJECT_ID);
  });

  it('404s when projectId is not one of the caller\'s projects', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    mocks.projectFindFirst.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ plannedDuration: 25, projectId: PROJECT_ID }));
    expect(res.status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
