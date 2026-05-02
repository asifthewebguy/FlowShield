import { NextResponse } from 'next/server';

/**
 * Public endpoint exposing the client-safe Pusher Channels configuration
 * (key + cluster). These values are already inlined into the web's client
 * bundle as NEXT_PUBLIC_PUSHER_*; this endpoint exists so non-web clients
 * (the v3 desktop, future mobile native, etc.) can fetch them at runtime
 * without a recompile per environment.
 *
 * No auth — same surface as the JS bundle. The PUSHER_SECRET is never
 * returned and lives only on the server.
 *
 * Returns empty strings (not 404 / 500) when env isn't configured so
 * clients can degrade gracefully — the desktop falls back to its 30s
 * session-active poll if the key comes back empty.
 */
export async function GET() {
  return NextResponse.json({
    key: process.env.NEXT_PUBLIC_PUSHER_KEY ?? process.env.PUSHER_KEY ?? '',
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? process.env.PUSHER_CLUSTER ?? '',
  });
}
