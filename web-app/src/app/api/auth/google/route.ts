import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { redis } from '@/lib/redis';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 501 });
  }

  const redirectUri = `${appUrl}/api/auth/google/callback`;
  const scope = 'openid email profile';

  const state = randomBytes(16).toString('hex');
  await redis.set('oauth-state:' + state, '1', { ex: 600 });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'select_account',
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
