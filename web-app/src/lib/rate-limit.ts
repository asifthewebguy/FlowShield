/**
 * In-memory sliding window rate limiter.
 * Note: resets per serverless invocation — effective for burst protection within one instance.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

/**
 * @param key      Unique key (e.g. "login:127.0.0.1")
 * @param limit    Max requests allowed in the window
 * @param windowMs Window size in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const entry = store.get(key) ?? { timestamps: [] };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const resetInMs = oldest + windowMs - now;
    store.set(key, entry);
    return { allowed: false, remaining: 0, resetInMs };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    resetInMs: windowMs,
  };
}

/** Extract client IP from Next.js request headers */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
