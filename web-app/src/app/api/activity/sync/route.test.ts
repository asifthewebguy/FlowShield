import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xyz';

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(async () => ({ count: 1 })),
  prefsFindUnique: vi.fn(),
  categoryRuleFindMany: vi.fn(async () => []),
  triggerUserEvent: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    activityLog: { createMany: mocks.createMany },
    userPreferences: { findUnique: mocks.prefsFindUnique },
    categoryRule: { findMany: mocks.categoryRuleFindMany },
  },
}));
vi.mock('@/lib/jwt', () => ({ getAuthUserId: vi.fn(async () => 'user-1') }));
vi.mock('@/lib/pusher', () => ({ triggerUserEvent: mocks.triggerUserEvent }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/activity-sync', () => ({ resolveCategory: vi.fn(() => 'Work') }));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/activity/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const sample = {
  timestamp: '2026-09-03T10:00:00.000Z',
  applicationName: 'Code',
  processName: 'code',
  windowTitle: 'secret.ts - Visual Studio Code',
  url: 'https://example.com/private',
  durationSeconds: 120,
  sessionId: null,
};

function storedRows(): Array<{ windowTitle: string; url: string | null }> {
  const call = mocks.createMany.mock.calls[0] as unknown as [{ data: Array<{ windowTitle: string; url: string | null }> }];
  return call[0].data;
}

describe('POST /api/activity/sync privacy redaction', () => {
  beforeEach(() => {
    mocks.createMany.mockClear();
    mocks.prefsFindUnique.mockReset();
  });

  it('stores titles and urls when shareWindowDetails is true', async () => {
    mocks.prefsFindUnique.mockResolvedValue({ shareWindowDetails: true });
    const res = await POST(makeRequest({ activities: [sample], source: 'desktop' }));
    expect(res.status).toBe(200);
    expect(storedRows()[0].windowTitle).toBe('secret.ts - Visual Studio Code');
    expect(storedRows()[0].url).toBe('https://example.com/private');
  });

  it('replaces title with Hidden and url with null when shareWindowDetails is false', async () => {
    mocks.prefsFindUnique.mockResolvedValue({ shareWindowDetails: false });
    const res = await POST(makeRequest({ activities: [sample], source: 'browser' }));
    expect(res.status).toBe(200);
    expect(storedRows()[0].windowTitle).toBe('Hidden');
    expect(storedRows()[0].url).toBeNull();
  });

  it('defaults to sharing when the user has no preferences row', async () => {
    mocks.prefsFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ activities: [sample], source: 'desktop' }));
    expect(res.status).toBe(200);
    expect(storedRows()[0].windowTitle).toBe('secret.ts - Visual Studio Code');
  });

  it('accepts an explicit null url (desktop window-focus samples with no url)', async () => {
    mocks.prefsFindUnique.mockResolvedValue({ shareWindowDetails: true });
    const { url: _url, ...withoutUrl } = sample;
    const res = await POST(makeRequest({ activities: [{ ...withoutUrl, url: null }], source: 'desktop' }));
    expect(res.status).toBe(200);
    expect(storedRows()[0].url).toBeNull();
  });
});
