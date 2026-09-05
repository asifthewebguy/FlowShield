import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn<(args: any) => Promise<any>>(async () => []),
  create: vi.fn<(args: any) => Promise<any>>(async (args: any) => ({ id: 'task-1', ...args.data })),
  projectFindFirst: vi.fn<(args: any) => Promise<any>>(async () => null),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: { findMany: mocks.findMany, create: mocks.create },
    project: { findFirst: mocks.projectFindFirst },
  },
}));
vi.mock('@/lib/jwt', () => ({ getAuthUserId: vi.fn(async () => 'user-1') }));

import { GET, POST } from './route';

function makeGetRequest(query: string): NextRequest {
  return new Request(`http://localhost/api/tasks${query}`) as unknown as NextRequest;
}

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('GET /api/tasks', () => {
  beforeEach(() => { mocks.findMany.mockClear(); });

  it('lists the caller\'s tasks scoped by userId', async () => {
    const res = await GET(makeGetRequest(''));
    expect(res.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });

  it('filters by tag', async () => {
    await GET(makeGetRequest('?tag=deep-work'));
    const call = mocks.findMany.mock.calls[0][0];
    expect(call.where.tags).toEqual({ has: 'deep-work' });
  });

  it('filters by status', async () => {
    await GET(makeGetRequest('?status=DONE'));
    const call = mocks.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('DONE');
  });

  it('rejects an invalid status value', async () => {
    const res = await GET(makeGetRequest('?status=ARCHIVED'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tasks', () => {
  beforeEach(() => { mocks.create.mockClear(); });

  it('creates a task with just a title', async () => {
    const res = await POST(makePostRequest({ title: 'Write the report' }));
    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', title: 'Write the report' }) })
    );
  });

  it('rejects an empty title', async () => {
    const res = await POST(makePostRequest({ title: '' }));
    expect(res.status).toBe(400);
  });

  it('defaults tags to an empty array when omitted', async () => {
    await POST(makePostRequest({ title: 'x' }));
    const call = mocks.create.mock.calls[0][0];
    expect(call.data.tags).toEqual([]);
  });

  it('404s when projectId is not one of the caller\'s projects', async () => {
    mocks.projectFindFirst.mockResolvedValueOnce(null);
    const res = await POST(makePostRequest({ title: 'x', projectId: '123e4567-e89b-12d3-a456-426614174000' }));
    expect(res.status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
