import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/callback-exchange
 *
 * Single-use exchange for the OAuth callback page. The Google callback
 * stores the issued JWT + user payload in Redis under a UUID, then
 * redirects the browser to `/auth/callback?session=<uuid>`. The page
 * POSTs that UUID here and gets back the token without ever putting
 * it in URL/history/referrer/proxy logs.
 *
 * Body: { session: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = typeof body?.session === 'string' ? body.session : '';
    if (!session || session.length < 16 || session.length > 128) {
      return NextResponse.json(
        { error: 'Invalid session id' },
        { status: 400 }
      );
    }

    const key = `auth-callback:${session}`;
    let payload: unknown = null;
    try {
      payload = await redis.get(key);
    } catch (err) {
      logger.error('Auth callback Redis read failed', err);
      return NextResponse.json(
        { error: 'Auth service unavailable' },
        { status: 503 }
      );
    }

    if (!payload) {
      return NextResponse.json(
        { error: 'Session expired or already used' },
        { status: 410 }
      );
    }

    // Single-use: delete on success so a leaked URL ID can't be replayed.
    try {
      await redis.del(key);
    } catch (err) {
      logger.warn('Auth callback Redis delete failed', err);
    }

    // Upstash already deserializes JSON values, so payload may be an object.
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Auth callback exchange error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
