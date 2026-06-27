import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { ChangePasswordSchema } from '@/lib/schemas';

/**
 * POST /api/user/password
 *
 * Authenticated change-password. Verifies the user's current password before
 * accepting the new one. Rate-limited 10/h per user to slow brute-force on
 * the current-password check.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit(`change-password:${userId}`, 10, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many password-change attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, hashedPassword: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.hashedPassword) {
      // Google-only users have an empty hashedPassword and have no current
      // password to verify. They should use forgot-password to set one.
      return NextResponse.json(
        {
          error: 'This account was created via Google. Use the password-reset flow to set a password.',
          code: 'NO_PASSWORD_SET',
        },
        { status: 400 }
      );
    }

    const ok = await verifyPassword(currentPassword, user.hashedPassword);
    if (!ok) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { hashedPassword: hashed },
    });

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Change-password error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
