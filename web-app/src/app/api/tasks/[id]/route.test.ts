import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
  delete: vi.fn(async () => ({})),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { task: { findUnique: mocks.findUnique, update: mocks.update, delete: mocks.delete } },
}));
vi.mock('@/lib/jwt', () => ({ getAuthUserId: vi.fn(async () => 'user-1') }));

import { PATCH, DELETE } from './route';

function makeRequest(method: string, body?: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/tasks/task-1', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ id: 'task-1' }) };

describe('PATCH /api/tasks/[id]', () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.update.mockClear();
  });

  it('404s when the task does not exist', async () => {
    mocks.findUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest('PATCH', { status: 'DONE' }), ctx);
    expect(res.status).toBe(404);
  });

  it('404s when the task belongs to another user', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'task-1', userId: 'someone-else' });
    const res = await PATCH(makeRequest('PATCH', { status: 'DONE' }), ctx);
    expect(res.status).toBe(404);
  });

  it('updates status and sets completedAt when moving to DONE', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'task-1', userId: 'user-1', status: 'DOING' });
    const res = await PATCH(makeRequest('PATCH', { status: 'DONE' }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
  });

  it('rejects an invalid status', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'task-1', userId: 'user-1' });
    const res = await PATCH(makeRequest('PATCH', { status: 'ARCHIVED' }), ctx);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/tasks/[id]', () => {
  beforeEach(() => { mocks.findUnique.mockReset(); });

  it('404s when the task belongs to another user', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'task-1', userId: 'someone-else' });
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(404);
  });

  it('deletes when owned', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'task-1', userId: 'user-1' });
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(200);
  });
});
