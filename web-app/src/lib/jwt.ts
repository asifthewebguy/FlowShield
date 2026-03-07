/**
 * JWT Configuration
 * Ensures JWT_SECRET is properly configured and fails fast if not set
 */

import { verify } from 'jsonwebtoken';
import { NextRequest } from 'next/server';

export function getJwtSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'JWT_SECRET is not configured. Please set NEXTAUTH_SECRET or JWT_SECRET environment variable.'
    );
  }

  // In production, enforce minimum secret length
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long in production'
    );
  }

  return secret;
}

/**
 * Extract and verify JWT token from Authorization header
 * @param request NextRequest object
 * @returns userId from token or null if invalid
 */
export function getUserIdFromToken(request: NextRequest): string | null {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = verify(token, getJwtSecret()) as { userId: string };
    return decoded.userId;
  } catch (error) {
    return null;
  }
}

/**
 * Extract and verify JWT token, returning userId only if the user is an ADMIN.
 * @param request NextRequest object
 * @returns userId if role === 'ADMIN', otherwise null
 */
export function getAdminFromToken(request: NextRequest): string | null {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = verify(token, getJwtSecret()) as { userId: string; role?: string };
    if (decoded.role !== 'ADMIN') {
      return null;
    }
    return decoded.userId;
  } catch (error) {
    return null;
  }
}
