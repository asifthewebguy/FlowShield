/**
 * Basic accessibility checks for public pages.
 * Verifies that key landmarks and ARIA roles are present.
 */
import { test, expect } from '@playwright/test';

test.describe('Accessibility — public pages', () => {
  test('login page has main landmark', async ({ page }) => {
    await page.goto('/login');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('login page has a form', async ({ page }) => {
    await page.goto('/login');
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });

  test('login page labels are associated with inputs', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('login submit button is keyboard focusable', async ({ page }) => {
    await page.goto('/login');
    const button = page.getByRole('button', { name: /sign in|log in/i });
    await button.focus();
    const focused = await button.evaluate((el) => el === document.activeElement);
    expect(focused).toBe(true);
  });

  test('signup page has a form', async ({ page }) => {
    await page.goto('/signup');
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });

  test('privacy page has headings for structure', async ({ page }) => {
    await page.goto('/privacy');
    const headings = page.getByRole('heading');
    const count = await headings.count();
    expect(count).toBeGreaterThan(0);
  });

  test('pages do not have broken images', async ({ page }) => {
    await page.goto('/login');
    const brokenImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.filter((img) => !img.complete || img.naturalWidth === 0).length;
    });
    expect(brokenImages).toBe(0);
  });
});
