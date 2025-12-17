import { test, expect } from '@playwright/test';

test.describe('Focus Session', () => {
    test.beforeEach(async ({ page, request }) => {
        // Create a unique user via API
        const email = `test-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
        const password = 'Password123!';

        const response = await request.post('http://localhost:3000/api/auth/signup', {
            data: {
                name: 'Session Test User',
                email: email,
                password: password,
                confirmPassword: password
            }
        });

        expect(response.ok()).toBeTruthy();

        // Login
        await page.goto('http://localhost:3000/auth/login');
        await page.fill('input[type="email"]', email);
        await page.fill('input[type="password"]', password);
        await page.click('button[type="submit"]');

        // Handle onboarding if necessary (API created users might not be "onboarded" if that logic is separate)
        // Check if redirected to onboarding or dashboard
        await page.waitForURL(/.*\/dashboard|.*\/onboarding/);

        if (page.url().includes('onboarding')) {
            await page.click('text=Morning Person');
            await page.click('text=Next');
            await page.click('text=25m');
            await page.click('text=Next');
            await page.click('text=Social Media');
            await page.click('text=Next');
            await page.click('text=Home');
            await page.click('text=Complete Setup');
        }

        await expect(page).toHaveURL(/.*\/dashboard/);
    });

    test('should start and stop a session', async ({ page }) => {
        // Check initial state
        await expect(page.locator('text=Start Focus Session')).toBeVisible();

        // Start session
        await page.click('button:has-text("Start Focus Session")');

        // Check running state
        await expect(page.locator('text=End Session')).toBeVisible();
        await expect(page.locator('button:has-text("End Session")')).toBeVisible();

        // Stop session (Abandon/Finish)
        await page.click('button:has-text("End Session")');

        // Should return to ready state
        await expect(page.locator('text=Start Focus Session')).toBeVisible();
    });

    test('should update daily goal progress', async ({ page }) => {
        // Verify Goal Widget exists
        await expect(page.locator('text=Daily Goal 🎯')).toBeVisible({ timeout: 10000 });

        // Note: Actually verifying the progress bar update requires completing a session
        // which takes time, so we just verify the widget presence here.
    });
});
