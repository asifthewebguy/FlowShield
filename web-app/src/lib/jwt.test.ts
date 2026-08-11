import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sign } from 'jsonwebtoken';

const SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.JWT_SECRET = SECRET;

const mocks = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(async () => 'OK'),
  redisDel: vi.fn(async () => 1),
  findUnique: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  redis: { get: mocks.redisGet, set: mocks.redisSet, del: mocks.redisDel },
  CACHE_TTL: 300,
}));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { getAuthUserId, getAuthAdminId, revokeUserTokens } from './jwt';

function reqWith(token: string) {
  return new Request('http://localhost/api', {
    headers: { Authorization: `Bearer ${token}` },
  }) as unknown as import('next/server').NextRequest;
}
const mint = (payload: object) => sign(payload, SECRET, { algorithm: 'HS256' });

describe('getAuthUserId — signature + revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisGet.mockResolvedValue(null); // cache miss → seed from DB
    mocks.findUnique.mockResolvedValue({ tokenVersion: 0 });
  });

  it('returns null without a Bearer token', async () => {
    const req = new Request('http://localhost/api') as unknown as import('next/server').NextRequest;
    expect(await getAuthUserId(req)).toBeNull();
  });

  it('returns null for a token signed with the wrong secret', async () => {
    const bad = sign({ userId: 'u-1', tv: 0 }, 'some-other-secret-32-characters-long!!', { algorithm: 'HS256' });
    expect(await getAuthUserId(reqWith(bad))).toBeNull();
  });

  it('accepts a token whose tv matches the current version', async () => {
    mocks.findUnique.mockResolvedValueOnce({ tokenVersion: 3 });
    const token = mint({ userId: 'u-1', tv: 3 });
    expect(await getAuthUserId(reqWith(token))).toBe('u-1');
  });

  it('rejects a token whose tv is older than the current version (revoked)', async () => {
    mocks.findUnique.mockResolvedValueOnce({ tokenVersion: 2 });
    const token = mint({ userId: 'u-1', tv: 1 });
    expect(await getAuthUserId(reqWith(token))).toBeNull();
  });

  it('treats a legacy token with no tv claim as version 0 (still valid at v0)', async () => {
    mocks.findUnique.mockResolvedValueOnce({ tokenVersion: 0 });
    const token = mint({ userId: 'u-1' }); // no tv
    expect(await getAuthUserId(reqWith(token))).toBe('u-1');
  });

  it('uses the cached version on a cache hit (no DB read)', async () => {
    mocks.redisGet.mockResolvedValueOnce(5);
    const token = mint({ userId: 'u-1', tv: 5 });
    expect(await getAuthUserId(reqWith(token))).toBe('u-1');
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('fails OPEN (token accepted) when the version lookup throws', async () => {
    mocks.redisGet.mockRejectedValueOnce(new Error('redis down'));
    mocks.findUnique.mockRejectedValueOnce(new Error('db down'));
    const token = mint({ userId: 'u-1', tv: 0 });
    expect(await getAuthUserId(reqWith(token))).toBe('u-1');
  });
});

describe('getAuthAdminId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisGet.mockResolvedValue(0);
  });

  it('resolves for an ADMIN token', async () => {
    expect(await getAuthAdminId(reqWith(mint({ userId: 'a-1', role: 'ADMIN', tv: 0 })))).toBe('a-1');
  });

  it('returns null for a non-admin token', async () => {
    expect(await getAuthAdminId(reqWith(mint({ userId: 'u-1', role: 'USER', tv: 0 })))).toBeNull();
  });
});

describe('revokeUserTokens', () => {
  it('busts the token-version cache key', async () => {
    mocks.redisDel.mockClear();
    await revokeUserTokens('u-1');
    expect(mocks.redisDel).toHaveBeenCalledWith('tv:u-1');
  });
});
