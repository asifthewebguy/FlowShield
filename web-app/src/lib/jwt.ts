/**
 * JWT configuration + authentication helpers.
 *
 * Tokens carry a `tv` (token version) claim. A user's authoritative version
 * lives in `User.tokenVersion`; bumping it (on password change/reset) revokes
 * every token minted before the bump. `getAuthUserId` / `getAuthAdminId` verify
 * the signature AND check `tv` against the current version, so they are async.
 *
 * These intentionally replace the old synchronous `getUserIdFromToken` /
 * `getAdminFromToken` — the rename forces every call site to `await`, turning a
 * missed conversion into a compile error rather than a silent auth bypass (an
 * un-awaited Promise is always truthy).
 */

import { verify } from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

const TV_CACHE_TTL_SECONDS = 3600; // self-heals a missed cache bust within 1h

export function getJwtSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'JWT_SECRET is not configured. Please set NEXTAUTH_SECRET or JWT_SECRET environment variable.'
    );
  }

  // In production, enforce minimum secret length
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long in production');
  }

  return secret;
}

interface AuthClaims {
  userId: string;
  role?: string;
  tv?: number;
}

/**
 * Verify the Bearer token's signature (algorithm pinned) and return its claims,
 * or null if missing/invalid. Synchronous — no revocation check here.
 */
function verifyAuthHeader(request: NextRequest): AuthClaims | null {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.substring(7);
    return verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as AuthClaims;
  } catch {
    return null;
  }
}

/**
 * Current authoritative token version for a user. Cached in Redis (short TTL so
 * a missed cache-bust self-heals); seeded from the DB on a miss.
 */
async function currentTokenVersion(userId: string): Promise<number> {
  const key = `tv:${userId}`;
  const cached = await redis.get<number>(key);
  if (typeof cached === 'number') return cached;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  const version = user?.tokenVersion ?? 0;
  await redis.set(key, version, { ex: TV_CACHE_TTL_SECONDS });
  return version;
}

/**
 * True if the token's version is older than the user's current version.
 * Fails OPEN (not revoked) on infra errors so a Redis/DB blip doesn't log every
 * user out — the signature was already verified by the caller.
 */
async function isRevoked(userId: string, tokenVersion: number): Promise<boolean> {
  try {
    const current = await currentTokenVersion(userId);
    return tokenVersion < current;
  } catch (error) {
    logger.error('Token-version check failed (failing open)', error);
    return false;
  }
}

/**
 * Verify the Bearer token and return its userId, or null if invalid/revoked.
 * Tokens minted before the `tv` claim existed are treated as version 0.
 */
export async function getAuthUserId(request: NextRequest): Promise<string | null> {
  const claims = verifyAuthHeader(request);
  if (!claims?.userId) return null;
  if (await isRevoked(claims.userId, claims.tv ?? 0)) return null;
  return claims.userId;
}

/**
 * Like `getAuthUserId` but only resolves for ADMIN-role tokens.
 */
export async function getAuthAdminId(request: NextRequest): Promise<string | null> {
  const claims = verifyAuthHeader(request);
  if (!claims?.userId || claims.role !== 'ADMIN') return null;
  if (await isRevoked(claims.userId, claims.tv ?? 0)) return null;
  return claims.userId;
}

/**
 * Revoke all of a user's existing tokens. The caller must have already bumped
 * `User.tokenVersion` (typically inside the same Prisma update). This busts the
 * Redis cache so the new version takes effect immediately. Best-effort — the
 * cache TTL is the backstop.
 */
export async function revokeUserTokens(userId: string): Promise<void> {
  try {
    await redis.del(`tv:${userId}`);
  } catch (error) {
    logger.error('Failed to bust token-version cache', error);
  }
}
