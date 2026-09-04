import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: /sign in|log in|welcome/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('shows validation error for empty email', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    const emailInput = page.getByLabel(/email/i);
    const validity = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(validity).toBe(false);
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel(/email/i).fill('nonexistent@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.getByText(/invalid|incorrect|not found|error/i)).toBeVisible({ timeout: 5000 });
  });

  test('sign up link is accessible from login page', async ({ page }) => {
    await page.goto('/auth/login');
    const signupLink = page.getByRole('link', { name: /sign up|register|create/i });
    await expect(signupLink).toBeVisible();
  });

  test('signup page renders correctly', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign up|create/i })).toBeVisible();
  });

  test('redirects unauthenticated users from dashboard to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });

  test('privacy policy page is accessible', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: /privacy/i })).toBeVisible();
  });
});
