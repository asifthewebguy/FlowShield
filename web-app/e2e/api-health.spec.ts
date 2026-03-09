/**
 * API health checks — verify endpoints return expected status codes without auth.
 * These are lightweight integration tests that don't require a real DB connection.
 */
import { test, expect } from '@playwright/test';

test.describe('API — unauthenticated responses', () => {
  test('GET /api/sessions returns 401', async ({ request }) => {
    const res = await request.get('/api/sessions');
    expect(res.status()).toBe(401);
  });

  test('GET /api/analytics returns 401', async ({ request }) => {
    const res = await request.get('/api/analytics');
    expect(res.status()).toBe(401);
  });

  test('GET /api/activity returns 401', async ({ request }) => {
    const res = await request.get('/api/activity');
    expect(res.status()).toBe(401);
  });

  test('GET /api/leaderboard returns 401', async ({ request }) => {
    const res = await request.get('/api/leaderboard');
    expect(res.status()).toBe(401);
  });

  test('GET /api/categories returns 401', async ({ request }) => {
    const res = await request.get('/api/categories');
    expect(res.status()).toBe(401);
  });

  test('GET /api/analytics/distractions returns 401', async ({ request }) => {
    const res = await request.get('/api/analytics/distractions');
    expect(res.status()).toBe(401);
  });

  test('POST /api/auth/login with invalid body returns 400 or 401', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: 'not-valid', password: '' },
    });
    expect([400, 401, 422]).toContain(res.status());
  });

  test('POST /api/activity/sync without auth returns 401', async ({ request }) => {
    const res = await request.post('/api/activity/sync', {
      data: { activities: [] },
    });
    expect(res.status()).toBe(401);
  });

  test('admin routes return 401 or 403 without auth', async ({ request }) => {
    const res = await request.get('/api/admin/stats');
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('API — login endpoint', () => {
  test('POST /api/auth/login with valid structure returns JSON', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'SomePass123' },
    });
    // Either 401 (wrong credentials) or 200 (if test user exists)
    expect([200, 401]).toContain(res.status());
    const json = await res.json();
    expect(json).toBeDefined();
  });
});
