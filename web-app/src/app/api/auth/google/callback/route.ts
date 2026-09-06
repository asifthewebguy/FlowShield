import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { createAuthToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';

const CALLBACK_SESSION_TTL_SECONDS = 120; // 2-minute window for the page to exchange

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_cancelled`);
  }

  const state = searchParams.get('state');
  if (!state) {
    return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_invalid_state`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      logger.error('Google OAuth env vars missing');
      return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_config`);
    }

    // Validate and consume OAuth state (CSRF protection)
    const storedState = await redis.get('oauth-state:' + state);
    if (!storedState) {
      return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_invalid_state`);
    }
    await redis.del('oauth-state:' + state);

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

    // Issue our standard JWT via the shared helper (same TTL rules as
    // password login) — user.tokenVersion is present because every
    // find/create/update path above uses `include` (not `select`), which
    // returns all scalar fields. If any of those is changed to `select`,
    // you MUST add tokenVersion or tv becomes undefined and revocation
    // breaks for OAuth users.
    const jwtToken = createAuthToken(user);

    const isNewUser = !user.preferences?.workStyle;
    const dest = isNewUser ? '/onboarding' : '/dashboard';

    // Don't put the JWT or user payload in the URL — it ends up in browser
    // history, referrer headers, and proxy/CDN access logs. Instead, stash
    // it in Redis under a single-use UUID and redirect the browser with
    // only that ID. The /auth/callback page POSTs the ID to
    // /api/auth/callback-exchange to retrieve the token, then drops the
    // entry. TTL is short so a leaked URL is useless after 2 minutes.
    const sessionId = crypto.randomBytes(32).toString('hex');
    const payload = {
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferences: user.preferences,
      },
      redirect: dest,
    };

    try {
      await redis.setex(
        `auth-callback:${sessionId}`,
        CALLBACK_SESSION_TTL_SECONDS,
        JSON.stringify(payload)
      );
    } catch (err) {
      logger.error('Failed to write auth callback session to Redis', err);
      return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_failed`);
    }

    return NextResponse.redirect(`${appUrl}/auth/callback?session=${sessionId}`);
  } catch (err) {
    logger.error('Google OAuth callback error', err);
    return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_failed`);
  }
}
