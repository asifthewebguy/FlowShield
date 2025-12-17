import { test, expect } from '@playwright/test';

test('verify signup validation logic', async ({ page }) => {
    await page.goto('/auth/signup');

    // Test 1: Realtime Email Validation (Double @)
    const emailInput = page.locator('input[name="email"]');
    await emailInput.fill('user@example.com@');
    await expect(page.locator('text=Email cannot contain multiple "@" symbols')).toBeVisible();

    // Clear and fix email
    await emailInput.fill('valid-email@example.com');
    await expect(page.locator('text=Email cannot contain multiple "@" symbols')).not.toBeVisible();

    // Test 2: On-Blur Password Validation (Weak Password)
    const passwordInput = page.locator('input[name="password"]');
    await passwordInput.fill('weak');
    // Trigger blur by clicking confirm password
    await page.locator('input[name="confirmPassword"]').click();

    await expect(page.locator('text=Password must be at least 8 characters long')).toBeVisible();

    // Fix password
    await passwordInput.fill('StrongPass1');
    // Trigger blur
    await page.locator('input[name="confirmPassword"]').click();

    await expect(page.locator('text=Password must be at least 8 characters long')).not.toBeVisible();

    // Test 3: Confirm Password Mismatch
    const confirmInput = page.locator('input[name="confirmPassword"]');
    await confirmInput.fill('Mismatch123');
    // Trigger blur by clicking outside (e.g. submit button or header)
    await page.click('h2'); // Click header to blur

    await expect(page.locator('text=Passwords do not match')).toBeVisible();

    // Fix match
    await confirmInput.fill('StrongPass1');
    await page.click('h2');

    await expect(page.locator('text=Passwords do not match')).not.toBeVisible();
});
