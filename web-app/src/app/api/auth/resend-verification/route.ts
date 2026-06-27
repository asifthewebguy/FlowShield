import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { sendEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit(`resend-verify:${userId}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) },
        }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: 'Email already verified' }, { status: 400 });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: { verificationToken, verificationTokenExpires },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const verificationUrl = `${appUrl}/api/auth/verify?token=${verificationToken}`;
    const emailSettings = await getSettings();

    if (emailSettings.email.verification.enabled) {
      await sendEmail({
        to: user.email,
        subject: emailSettings.email.verification.subject,
        html: `<p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
        <p>This link will expire in 24 hours.</p>`,
      });
    }

    return NextResponse.json({ message: 'Verification email sent' });
  } catch (error) {
    logger.error('Resend verification error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
