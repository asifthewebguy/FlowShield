import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { ResetPasswordSchema } from '@/lib/schemas';

/**
 * POST /api/auth/reset-password
 *
 * Validates the password-reset token, hashes the new password, clears the
 * token + expiry. The token is single-use.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await rateLimit(`reset-password:${ip}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = ResetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { token, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { passwordResetToken: token },
      select: { id: true, passwordResetExpires: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or already-used reset token' },
        { status: 400 }
      );
    }

    if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      // Token expired — clear it so a fresh request can be made.
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: null, passwordResetExpires: null },
      });
      return NextResponse.json(
        { error: 'Reset token has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    const hashed = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        hashedPassword: hashed,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    return NextResponse.json({
      message: 'Password reset successfully. You can now sign in with your new password.',
    });
  } catch (error) {
    logger.error('Reset-password error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
