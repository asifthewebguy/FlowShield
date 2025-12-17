import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test('should allow user to sign up', async ({ page }) => {
        // Navigate to signup
        await page.goto('http://localhost:3000/auth/signup');

        // Fill signup form with unique email
        const email = `test-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
        await page.fill('input[name="name"]', 'E2E User');
        await page.fill('input[name="email"]', email);
        await page.fill('input[name="password"]', 'Password123!');
        await page.fill('input[name="confirmPassword"]', 'Password123!');

        // Submit
        await page.click('button[type="submit"]');

        // Should redirect to login or dashboard (depending on flow, assuming login)
        // Wait for URL change or error message
        try {
            await expect(page).toHaveURL(/.*\/auth\/login/, { timeout: 5000 });
        } catch (e) {
            // If URL check fails, check if there's an error message on screen
            const errorMessage = await page.locator('.text-red-600').textContent();
            console.log(`Signup failed with error: ${errorMessage}`);
            throw e;
        }

        // Fill login
        await page.fill('input[type="email"]', email);
        await page.fill('input[type="password"]', 'Password123!');
        await page.click('button[type="submit"]');

        // Should complete onboarding if new user
        await expect(page).toHaveURL(/.*\/onboarding/);
        await page.click('text=Morning Person');
        await page.click('text=Next');
        await page.click('text=25m');
        await page.click('text=Next');
        await page.click('text=Social Media');
        await page.click('text=Next');
        await page.click('text=Home');
        await page.click('text=Complete Setup');

        // Should land on dashboard
        await expect(page).toHaveURL(/.*\/dashboard/);
        await expect(page).toHaveURL(/.*\/dashboard/);
    });
});
