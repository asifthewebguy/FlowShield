import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  getUserIdFromToken: vi.fn(),
  projectFindFirst: vi.fn(),
  projectDelete: vi.fn(),
  projectUpdate: vi.fn(),
}));

vi.mock('@/lib/jwt', () => ({
  getUserIdFromToken: mocks.getUserIdFromToken,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findFirst: mocks.projectFindFirst,
      delete: mocks.projectDelete,
      update: mocks.projectUpdate,
    },
  },
}));

vi.mock('@/lib/schemas', () => ({
  UpdateProjectCostSchema: {
    safeParse: (v: unknown) => ({ success: true, data: v }),
  },
}));

import { DELETE } from './route';

function makeRequest(path = '/api/projects/p1') {
  return new Request(`http://localhost${path}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer fake' },
  }) as unknown as import('next/server').NextRequest;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.getUserIdFromToken.mockReturnValue(null);
    const res = await DELETE(makeRequest(), makeParams('p1'));
    expect(res.status).toBe(401);
    expect(mocks.projectDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    mocks.getUserIdFromToken.mockReturnValue('user-1');
    mocks.projectFindFirst.mockResolvedValueOnce(null);
    const res = await DELETE(makeRequest(), makeParams('does-not-exist'));
    expect(res.status).toBe(404);
    expect(mocks.projectDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when the project belongs to another user', async () => {
    mocks.getUserIdFromToken.mockReturnValue('user-1');
    // findFirst is scoped by { id, userId } — another user's project returns null
    mocks.projectFindFirst.mockResolvedValueOnce(null);
    const res = await DELETE(makeRequest(), makeParams('someone-elses-project'));
    expect(res.status).toBe(404);
    expect(mocks.projectFindFirst).toHaveBeenCalledWith({
      where: { id: 'someone-elses-project', userId: 'user-1' },
    });
    expect(mocks.projectDelete).not.toHaveBeenCalled();
  });

  it('deletes the project and returns ok on success', async () => {
    mocks.getUserIdFromToken.mockReturnValue('user-1');
    mocks.projectFindFirst.mockResolvedValueOnce({
      id: 'p1',
      userId: 'user-1',
      name: 'Test Project',
    });
    mocks.projectDelete.mockResolvedValueOnce({ id: 'p1' });

    const res = await DELETE(makeRequest(), makeParams('p1'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(mocks.projectDelete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});
