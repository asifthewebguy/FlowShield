import { test, expect } from '@playwright/test';
import { prisma } from '../src/lib/prisma';

test.describe('Email Verification Flow', () => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'Password123!';

    test.afterAll(async () => {
        // Cleanup
        await prisma.user.deleteMany({
            where: {
                email: testEmail,
            },
        });
    });

    test('should register user and generate verification token', async ({ request, page }) => {
        // 1. Register via API
        const response = await request.post('/api/auth/signup', {
            data: {
                email: testEmail,
                password: testPassword,
                name: 'Test User',
            },
        });

        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.user).toHaveProperty('id');
        expect(data.user.email).toBe(testEmail);

        // 2. Verify DB state
        const user = await prisma.user.findUnique({
            where: { email: testEmail },
        });
        expect(user).not.toBeNull();
        expect(user?.verificationToken).toBeTruthy();
        expect(user?.emailVerified).toBeNull();

        // 3. Verify via API
        const verifyResponse = await request.get(`/api/auth/verify?token=${user?.verificationToken}`, {
            maxRedirects: 0
        });
        // Should be a redirect to login
        expect(verifyResponse.status()).toBe(307);

        // 4. Verify DB updated
        const verifiedUser = await prisma.user.findUnique({
            where: { email: testEmail },
        });
        expect(verifiedUser?.emailVerified).not.toBeNull();
        expect(verifiedUser?.verificationToken).toBeNull();
    });
});
