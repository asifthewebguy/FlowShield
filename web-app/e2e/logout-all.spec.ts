// web-app/e2e/logout-all.spec.ts
import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe('logout-all revocation', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E credentials not configured');

  test('revokes a second token within one request', async ({ request }) => {
    const loginA = await request.post('/api/auth/login', {
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(loginA.ok()).toBeTruthy();
    const { token: tokenA } = await loginA.json();

    const loginB = await request.post('/api/auth/login', {
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(loginB.ok()).toBeTruthy();
    const { token: tokenB } = await loginB.json();

    // Both tokens work
    const probeB = await request.get('/api/sessions?limit=1', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(probeB.status()).toBe(200);

    // Logout-all with token A
    const revoke = await request.post('/api/auth/logout-all', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(revoke.status()).toBe(204);

    // Token B is now dead
    const probeBAfter = await request.get('/api/sessions?limit=1', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(probeBAfter.status()).toBe(401);

    // Token A is dead too (it was minted before the bump)
    const probeAAfter = await request.get('/api/sessions?limit=1', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(probeAAfter.status()).toBe(401);
  });
});
