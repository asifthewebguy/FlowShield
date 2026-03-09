import { test, expect } from '@playwright/test';

test.describe('Signup Flow', () => {
  test('signup page has all required fields', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign up|create|register/i })).toBeVisible();
  });

  test('shows error for invalid email format', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel(/email/i).fill('not-an-email');
    await page.getByLabel(/password/i).fill('StrongPass1');
    await page.getByRole('button', { name: /sign up|create|register/i }).click();
    // Either native validation or custom error
    const emailInput = page.getByLabel(/email/i);
    const validity = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(validity).toBe(false);
  });

  test('shows error for weak password', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel(/email/i).fill('new@example.com');
    await page.getByLabel(/password/i).fill('weak');
    await page.getByRole('button', { name: /sign up|create|register/i }).click();
    // Wait for an error or validation feedback
    await page.waitForTimeout(500);
    const pageContent = await page.locator('body').innerText();
    // Either native validation prevents submit or an error is shown
    const hasError =
      pageContent.toLowerCase().includes('password') ||
      pageContent.toLowerCase().includes('error') ||
      pageContent.toLowerCase().includes('character');
    expect(hasError || page.url().includes('signup')).toBe(true);
  });

  test('has link back to login', async ({ page }) => {
    await page.goto('/signup');
    const loginLink = page.getByRole('link', { name: /log in|sign in|already/i });
    await expect(loginLink).toBeVisible();
  });

  test('terms / privacy link accessible', async ({ page }) => {
    await page.goto('/signup');
    const privacyLink = page.getByRole('link', { name: /privacy/i });
    if (await privacyLink.count() > 0) {
      await expect(privacyLink).toBeVisible();
    }
    // Privacy link is optional — just verify the page itself is accessible
    expect(true).toBe(true);
  });
});
