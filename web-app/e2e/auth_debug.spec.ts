import { test, expect } from '@playwright/test';

test('debug login flow', async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.text()}`));
    page.on('response', response => {
        if (response.status() > 399) {
            console.log(`NETWORK ERROR: ${response.url()} returned ${response.status()} ${response.statusText()}`);
        }
    });

    console.log('Navigating to login...');
    await page.goto('/auth/login');

    await page.fill('input[name="email"]', 'audit_curl_file@example.com');
    await page.fill('input[name="password"]', 'Password123');

    console.log('Clicking sign in...');
    await page.click('button[type="submit"]');

    console.log('In submit handler?');

    try {
        await page.waitForURL(/dashboard|onboarding/, { timeout: 10000 });
        console.log(`SUCCESS: Redirected to ${page.url()}`);
    } catch (e) {
        console.log('TIMEOUT: Did not redirect to dashboard or onboarding');
    }
});
