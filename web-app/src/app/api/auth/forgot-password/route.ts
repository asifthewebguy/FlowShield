import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { ForgotPasswordSchema } from '@/lib/schemas';
import { sendEmail } from '@/lib/email';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/auth/forgot-password
 *
 * Always returns 200 with a generic message — do not reveal whether the email
 * exists. The reset email is only actually sent for accounts that exist and
 * have a password (i.e. were not Google-only).
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(`forgot-password:${ip}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many password-reset requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = ForgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, hashedPassword: true, name: true },
    });

    // Only generate + send a reset link for accounts that have a password.
    // Empty hashedPassword => Google-only user; reset would not unlock anything.
    if (user && user.hashedPassword) {
      const passwordResetToken = crypto.randomBytes(32).toString('hex');
      const passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken, passwordResetExpires },
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const resetUrl = `${appUrl}/auth/reset-password?token=${passwordResetToken}`;
      const greeting = user.name ? user.name.split(' ')[0] : 'there';

      await sendEmail({
        to: user.email,
        subject: 'Reset your FlowShield password',
        html: `
          <p>Hi ${greeting},</p>
          <p>Someone (hopefully you) requested a password reset for your FlowShield account. Click the link below to set a new password:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link will expire in 1 hour. If you didn't request this, you can safely ignore the email — your password won't change.</p>
        `,
      });
    }

    // Same response for both branches — don't leak whether the email is registered.
    return NextResponse.json({
      message: 'If an account exists for that email, a reset link has been sent.',
    });
  } catch (error) {
    logger.error('Forgot-password error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
