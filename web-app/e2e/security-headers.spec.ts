/**
 * Security header checks.
 * Verifies that Next.js sends recommended security headers on page loads.
 */
import { test, expect } from '@playwright/test';

test.describe('Security Headers', () => {
  test('login page has X-Content-Type-Options header', async ({ page }) => {
    const response = await page.goto('/auth/login');
    const header = response?.headers()['x-content-type-options'];
    expect(header).toBe('nosniff');
  });

  test('login page has X-Frame-Options header', async ({ page }) => {
    const response = await page.goto('/auth/login');
    const header = response?.headers()['x-frame-options'];
    expect(header).toMatch(/DENY|SAMEORIGIN/i);
  });

  test('login page has X-XSS-Protection header', async ({ page }) => {
    const response = await page.goto('/auth/login');
    const header = response?.headers()['x-xss-protection'];
    // Should be set (value varies)
    expect(header).toBeDefined();
  });

  test('API endpoints have correct Content-Type', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'TestPass1' },
    });
    const contentType = res.headers()['content-type'] || '';
    expect(contentType).toContain('application/json');
  });
});
