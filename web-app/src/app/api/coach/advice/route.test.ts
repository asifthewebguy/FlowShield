import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';
process.env.GOOGLE_AI_API_KEY = 'test-gemini-key';

const mocks = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSetex: vi.fn(async () => 'OK'),
  generateContentStream: vi.fn(),
  userFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
  dailyStatsFindMany: vi.fn(),
  activityLogFindMany: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    get: mocks.redisGet,
    setex: mocks.redisSetex,
  },
}));

vi.mock('@/lib/jwt', () => ({
  getUserIdFromToken: vi.fn(() => 'user-1'),
  getJwtSecret: vi.fn(() => 'test-secret'),
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

const { redisGet, redisSetex, generateContentStream } = mocks;

import { GET } from './route';

function makeRequest(path = '/api/coach/advice') {
  return new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: { Authorization: 'Bearer fake' },
  }) as unknown as import('next/server').NextRequest;
}

function primePrisma({ sessions = [] as Array<{ startTime: Date; actualDuration: number | null; completed: boolean }> } = {}) {
  mocks.userFindUnique.mockResolvedValueOnce({
    name: 'Tester',
    preferences: { preferredDuration: 25 },
  });
  mocks.sessionFindMany.mockResolvedValueOnce(sessions);
  mocks.dailyStatsFindMany.mockResolvedValueOnce([]);
  mocks.activityLogFindMany.mockResolvedValueOnce([]);
}

describe('GET /api/coach/advice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisGet.mockReset();
    redisSetex.mockClear();
    generateContentStream.mockReset();
  });

  it('returns 204 on cacheOnly miss', async () => {
    redisGet.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('/api/coach/advice?cacheOnly=1'));
    expect(res.status).toBe(204);
    expect(generateContentStream).not.toHaveBeenCalled();
  });

  it('returns JSON cached advice on cache hit (no Gemini call)', async () => {
    redisGet.mockResolvedValueOnce('Previously generated advice.');
    const res = await GET(makeRequest('/api/coach/advice'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const data = await res.json();
    expect(data.advice).toBe('Previously generated advice.');
    expect(data.cached).toBe(true);
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

  it('streams Gemini and writes to cache when user has activity', async () => {
    redisGet.mockResolvedValueOnce(null);
    const now = new Date();
    primePrisma({
      sessions: [
        { startTime: now, actualDuration: 45, completed: true },
        { startTime: now, actualDuration: 25, completed: true },
      ],
    });

    // Stub Gemini stream: two text chunks, then iteration ends
    generateContentStream.mockResolvedValueOnce({
      stream: (async function* () {
        yield { text: () => 'Great focus! ' };
        yield { text: () => 'Keep it up.' };
      })(),
    });

    const res = await GET(makeRequest('/api/coach/advice'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    // Drain the SSE stream so the `start` function completes and setex fires
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
    expect(redisSetex).toHaveBeenCalledWith(
      expect.any(String), // cache key
      86400, // 24h TTL
      'Great focus! Keep it up.'
    );
  });
});
