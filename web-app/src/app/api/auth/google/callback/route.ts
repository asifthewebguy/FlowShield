import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sign } from 'jsonwebtoken';
import { getJwtSecret } from '@/lib/jwt';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_cancelled`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      logger.error('Google OAuth env vars missing');
      return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_config`);
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      logger.error('Google token exchange failed', await tokenRes.text());
      return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_failed`);
    }

    const tokens = await tokenRes.json();

    // Get user info from Google
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      logger.error('Google userinfo fetch failed');
      return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_failed`);
    }

    const googleUser = await userInfoRes.json();
    const { email, name } = googleUser as { email: string; name?: string };

    if (!email) {
      return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_no_email`);
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
      include: { preferences: true },
    });

    if (!user) {
      // New user via Google — no password required
      user = await prisma.user.create({
        data: {
          email,
          hashedPassword: '', // Google users authenticate via OAuth only
          name: name || null,
          emailVerified: new Date(), // Google already verified it
          preferences: {
            create: {
              preferredDuration: 25,
              primaryDistractions: [],
            },
          },
        },
        include: { preferences: true },
      });
    } else if (!user.emailVerified) {
      // Existing email/password user adding Google — mark email verified
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
        include: { preferences: true },
      });
    }

    // Issue our standard JWT
    const jwtToken = sign(
      { userId: user.id, email: user.email },
      getJwtSecret(),
      { expiresIn: '1h' }
    );

    const isNewUser = !user.preferences?.workStyle;
    const dest = isNewUser ? '/onboarding' : '/dashboard';

    // Pass token to client via URL fragment (picked up by the login page)
    return NextResponse.redirect(
      `${appUrl}/auth/callback?token=${encodeURIComponent(jwtToken)}&user=${encodeURIComponent(JSON.stringify({ id: user.id, email: user.email, name: user.name, preferences: user.preferences }))}&redirect=${encodeURIComponent(dest)}`
    );
  } catch (err) {
    logger.error('Google OAuth callback error', err);
    return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_failed`);
  }
}
