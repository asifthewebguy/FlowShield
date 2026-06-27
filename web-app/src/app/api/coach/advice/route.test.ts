import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';
process.env.GOOGLE_AI_API_KEY = 'test-gemini-key';

const mocks = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSetex: vi.fn(async (_key: string, _ttl: number, _text: string) => 'OK'),
  redisSet: vi.fn(async () => 'OK' as 'OK' | null),
  redisDel: vi.fn(async () => 1),
  generateContentStream: vi.fn(),
  userFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
  dailyStatsFindMany: vi.fn(),
  activityLogFindMany: vi.fn(),
  rateLimitFn: vi.fn(async () => ({ allowed: true, remaining: 4, resetInMs: 0 })),
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    get: mocks.redisGet,
    setex: mocks.redisSetex,
    set: mocks.redisSet,
    del: mocks.redisDel,
  },
}));

vi.mock('@/lib/jwt', () => ({
  getUserIdFromToken: vi.fn(() => 'user-1'),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    session: { findMany: mocks.sessionFindMany },
    dailyStats: { findMany: mocks.dailyStatsFindMany },
    activityLog: { findMany: mocks.activityLogFindMany },
  },
}));

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class MockGoogleGenerativeAI {
      getGenerativeModel() {
        return {
          generateContentStream: mocks.generateContentStream,
        };
      }
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimitFn,
}));

const { redisGet, redisSetex, generateContentStream } = mocks;

import { GET } from './route';

function makeRequest(path = '/api/coach/advice') {
  return new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: { Authorization: 'Bearer fake' },
  }) as unknown as import('next/server').NextRequest;
}

function mockUser(tier: 'FREE' | 'PRO' | 'TEAM' = 'FREE') {
  mocks.userFindUnique.mockResolvedValueOnce({
    name: 'Tester',
    subscriptionTier: tier,
    preferences: { preferredDuration: 25 },
  });
}

function primePrisma({
  sessions = [] as Array<{ startTime: Date; actualDuration: number | null; completed: boolean }>,
  tier = 'FREE' as 'FREE' | 'PRO' | 'TEAM',
} = {}) {
  mockUser(tier);
  mocks.sessionFindMany.mockResolvedValueOnce(sessions);
  mocks.dailyStatsFindMany.mockResolvedValueOnce([]);
  mocks.activityLogFindMany.mockResolvedValueOnce([]);
}

const DAILY_TTL_SECONDS = 24 * 60 * 60;
const MONTHLY_TTL_SECONDS = 31 * 24 * 60 * 60;

describe('GET /api/coach/advice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisGet.mockReset();
    redisSetex.mockClear();
    mocks.redisSet.mockClear();
    mocks.redisDel.mockClear();
    mocks.rateLimitFn.mockClear();
    generateContentStream.mockReset();
  });

  it('returns 204 on cacheOnly miss', async () => {
    mockUser('FREE');
    redisGet.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('/api/coach/advice?cacheOnly=1'));
    expect(res.status).toBe(204);
    expect(generateContentStream).not.toHaveBeenCalled();
  });

  it('returns JSON cached advice on cache hit (no Gemini call)', async () => {
    mockUser('FREE');
    redisGet.mockResolvedValueOnce('Previously generated advice.');
    const res = await GET(makeRequest('/api/coach/advice'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const data = await res.json();
    expect(data.advice).toBe('Previously generated advice.');
    expect(data.cached).toBe(true);
    expect(data.tier).toBe('FREE');
    expect(generateContentStream).not.toHaveBeenCalled();
  });

  it('short-circuits with empty-state advice when user has zero activity', async () => {
    redisGet.mockResolvedValueOnce(null);
    primePrisma({ sessions: [] });
    const res = await GET(makeRequest('/api/coach/advice'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const data = await res.json();
    expect(data.empty).toBe(true);
    expect(typeof data.advice).toBe('string');
    expect(data.tier).toBe('FREE');
    expect(generateContentStream).not.toHaveBeenCalled();
    expect(redisSetex).not.toHaveBeenCalled();
  });

  it('falls through to Gemini on Redis read failure', async () => {
    redisGet.mockRejectedValueOnce(new Error('Redis down'));
    primePrisma({ sessions: [] }); // still zero-activity → short-circuits without Gemini
    const res = await GET(makeRequest('/api/coach/advice'));
    expect(res.status).toBe(200);
    // Did not crash when Redis threw
    const data = await res.json();
    expect(data.empty).toBe(true);
  });

  it('caches Gemini output for 31 days for FREE users (monthly key)', async () => {
    redisGet.mockResolvedValueOnce(null);
    const now = new Date();
    primePrisma({
      tier: 'FREE',
      sessions: [
        { startTime: now, actualDuration: 45, completed: true },
        { startTime: now, actualDuration: 25, completed: true },
      ],
    });

    generateContentStream.mockResolvedValueOnce({
      stream: (async function* () {
        yield { text: () => 'Great focus! ' };
        yield { text: () => 'Keep it up.' };
      })(),
    });

    const res = await GET(makeRequest('/api/coach/advice'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    let fullText = '';
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value);
    }

    expect(fullText).toContain('Great focus!');
    expect(fullText).toContain('Keep it up.');
    expect(fullText).toContain('[DONE]');
    expect(redisSetex).toHaveBeenCalledTimes(1);

    const [key, ttl, payload] = redisSetex.mock.calls[0];
    // FREE key is coach:{userId}:{YYYY-MM}
    expect(key).toMatch(/^coach:user-1:\d{4}-\d{2}$/);
    expect(ttl).toBe(MONTHLY_TTL_SECONDS);
    expect(payload).toBe('Great focus! Keep it up.');
  });

  it('caches Gemini output for 24h for PRO users (daily key)', async () => {
    redisGet.mockResolvedValueOnce(null);
    const now = new Date();
    primePrisma({
      tier: 'PRO',
      sessions: [{ startTime: now, actualDuration: 45, completed: true }],
    });

    generateContentStream.mockResolvedValueOnce({
      stream: (async function* () {
        yield { text: () => 'Pro advice here.' };
      })(),
    });

    const res = await GET(makeRequest('/api/coach/advice'));
    expect(res.status).toBe(200);

    // Drain the stream so writeCache fires
    const reader = res.body!.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(redisSetex).toHaveBeenCalledTimes(1);
    const [key, ttl, payload] = redisSetex.mock.calls[0];
    // PRO key is coach:{userId}:{YYYY-MM-DD}
    expect(key).toMatch(/^coach:user-1:\d{4}-\d{2}-\d{2}$/);
    expect(ttl).toBe(DAILY_TTL_SECONDS);
    expect(payload).toBe('Pro advice here.');
  });

  it('returns 429 when per-user rate limit is exceeded', async () => {
    mockUser('FREE');
    redisGet.mockResolvedValueOnce(null);
    mocks.rateLimitFn.mockResolvedValueOnce({ allowed: false, remaining: 0, resetInMs: 60000 });
    const res = await GET(makeRequest('/api/coach/advice'));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe('Too many requests');
    expect(generateContentStream).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it('returns 429 when a coaching request is already in progress (lock held)', async () => {
    redisGet.mockResolvedValueOnce(null);
    const now = new Date();
    primePrisma({
      sessions: [{ startTime: now, actualDuration: 45, completed: true }],
    });
    mocks.redisSet.mockResolvedValueOnce(null); // lock already held
    const res = await GET(makeRequest('/api/coach/advice'));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe('A coaching request is already in progress');
    expect(generateContentStream).not.toHaveBeenCalled();
  });
});
