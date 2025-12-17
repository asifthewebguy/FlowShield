import { test, expect } from '@playwright/test';

test('verify dashboard access', async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'audit_curl_file@example.com'); // Use the one we created via curl/file
    await page.fill('input[name="password"]', 'Password123');
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForURL('**/dashboard');

    // Check for crash
    await expect(page.locator('text=Application error')).not.toBeVisible();

    // Check for components
    await expect(page.locator('text=Focus Timer')).toBeVisible(); // Check for "Focus Timer" text inside component

    // Take screenshot
    await page.screenshot({ path: 'test-results/dashboard-verified.png' });
});
