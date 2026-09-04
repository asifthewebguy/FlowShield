/**
 * Dashboard E2E tests.
 * These tests use a shared auth fixture (storageState) set up in global-setup.
 * When running locally without a live server, they verify page structure.
 */
import { test, expect } from '@playwright/test';

// Helper: authenticate and navigate to dashboard
async function loginAndGoToDashboard(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByLabel(/email/i).fill(process.env.E2E_TEST_EMAIL || 'test@flowshield.app');
  await page.getByLabel(/password/i).fill(process.env.E2E_TEST_PASSWORD || 'Test1234');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Wait for redirect away from login
  await page.waitForURL(/dashboard|home/, { timeout: 10_000 });
}

test.describe('Dashboard (unauthenticated)', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Dashboard (authenticated)', () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL,
    'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests'
  );

  test('dashboard shows stats section', async ({ page }) => {
    await loginAndGoToDashboard(page);
    // Expect some productivity stat element
    await expect(
      page.getByText(/session|focus|completed|productivity/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('dashboard has navigation links', async ({ page }) => {
    await loginAndGoToDashboard(page);
    // Expect nav links for major sections
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible();
  });
});
