/**
 * Distributed sliding-window rate limiter backed by Upstash Redis.
 *
 * Replaces the previous in-memory Map, which reset on every serverless cold
 * start (so limits silently failed open). State now lives in Redis and is
 * shared across all serverless instances.
 *
 * Fail-open: if Redis is unreachable we allow the request (and log) rather than
 * lock every user out of auth on a Redis outage. Availability > strictness here.
 */

import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

// One Ratelimit instance per (limit, windowMs) config; cached so we don't
// rebuild on every call. Keyed by `${limit}:${windowMs}`.
const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms` as Duration),
      analytics: false,
      prefix: 'rl',
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * @param key      Unique key (e.g. "login:127.0.0.1" or "coach:<userId>")
 * @param limit    Max requests allowed in the window
 * @param windowMs Window size in milliseconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    const { success, remaining, reset } = await getLimiter(limit, windowMs).limit(key);
    return {
      allowed: success,
      remaining,
      resetInMs: Math.max(0, reset - Date.now()),
    };
  } catch (error) {
    // Redis unreachable — fail open so auth isn't bricked, but record it.
    logger.error('Rate limiter unavailable (failing open)', error);
    return { allowed: true, remaining: limit, resetInMs: windowMs };
  }
}

/**
 * Extract the client IP from request headers.
 *
 * On Netlify, `x-nf-client-connection-ip` is injected by the platform and is
 * NOT attacker-controllable — prefer it. The `x-forwarded-for` first element is
 * client-supplied (a request can arrive with a forged XFF that Netlify then
 * prepends its real value to), so it is only a last-resort fallback and we read
 * the LAST element, which is closest to the trusted edge.
 */
export function getClientIp(request: Request): string {
  const nf = request.headers.get('x-nf-client-connection-ip');
  if (nf) return nf.trim();

  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return request.headers.get('x-real-ip')?.trim() ?? 'unknown';
}
