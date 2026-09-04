import { test, expect } from '@playwright/test';

test.describe('Navigation & Public Pages', () => {
  test('root URL responds (redirect or landing)', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(500);
  });

  test('login page has correct title', async ({ page }) => {
    await page.goto('/auth/login');
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/flowshield|log in|sign in/);
  });

  test('signup page has correct title', async ({ page }) => {
    await page.goto('/auth/signup');
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/flowshield|sign up|register/);
  });

  test('privacy page is reachable and has content', async ({ page }) => {
    await page.goto('/privacy');
    expect(await page.title()).toBeTruthy();
    // Should have at least one paragraph of policy text
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(200);
  });

  test('unknown routes return 404 or redirect', async ({ page }) => {
    const response = await page.goto('/nonexistent-page-xyz-abc');
    // Should be 404 or redirect to login/home, not 500
    const status = response?.status() ?? 0;
    expect([404, 302, 200]).toContain(status);
  });

  test('analytics page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page).toHaveURL(/login|\/$/);
  });

  test('activity page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/activity');
    await expect(page).toHaveURL(/login|\/$/);
  });

  test('profile page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/login|\/$/);
  });

  test('community page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/community');
    await expect(page).toHaveURL(/login|\/$/);
  });
});
