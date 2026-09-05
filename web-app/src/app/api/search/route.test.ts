import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  taskFindMany: vi.fn<(args: any) => Promise<any>>(async () => []),
  projectFindMany: vi.fn<(args: any) => Promise<any>>(async () => []),
  sessionFindMany: vi.fn<(args: any) => Promise<any>>(async () => []),
  rateLimit: vi.fn<(args: any) => Promise<any>>(async () => ({ allowed: true })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: { findMany: mocks.taskFindMany },
    project: { findMany: mocks.projectFindMany },
    session: { findMany: mocks.sessionFindMany },
  },
}));
vi.mock('@/lib/jwt', () => ({ getAuthUserId: vi.fn(async () => 'user-1') }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }));

import { GET } from './route';

function makeRequest(q: string): NextRequest {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`) as unknown as NextRequest;
}

describe('GET /api/search', () => {
  beforeEach(() => {
    mocks.taskFindMany.mockClear();
    mocks.projectFindMany.mockClear();
    mocks.sessionFindMany.mockClear();
  });

  it('rejects an empty query', async () => {
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(400);
  });

  it('scopes every query to the caller', async () => {
    await GET(makeRequest('report'));
    expect(mocks.taskFindMany.mock.calls[0][0].where.userId).toBe('user-1');
    expect(mocks.projectFindMany.mock.calls[0][0].where.userId).toBe('user-1');
    expect(mocks.sessionFindMany.mock.calls[0][0].where.userId).toBe('user-1');
  });

  it('caps each entity at 10 results', async () => {
    await GET(makeRequest('report'));
    expect(mocks.taskFindMany.mock.calls[0][0].take).toBe(10);
    expect(mocks.projectFindMany.mock.calls[0][0].take).toBe(10);
    expect(mocks.sessionFindMany.mock.calls[0][0].take).toBe(10);
  });

  it('uses a case-insensitive contains filter on task title', async () => {
    await GET(makeRequest('report'));
    expect(mocks.taskFindMany.mock.calls[0][0].where.title).toEqual({ contains: 'report', mode: 'insensitive' });
  });

  it('matches sessions on their linked project name or task title, not on raw SQL', async () => {
    await GET(makeRequest('report'));
    const sessionWhere = mocks.sessionFindMany.mock.calls[0][0].where;
    expect(sessionWhere.OR).toEqual([
      { project: { name: { contains: 'report', mode: 'insensitive' } } },
      { task: { title: { contains: 'report', mode: 'insensitive' } } },
    ]);
  });

  it('returns 429 when rate limited', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });
    const res = await GET(makeRequest('report'));
    expect(res.status).toBe(429);
  });
});
