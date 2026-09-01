import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/email';
import { getSettings } from '@/lib/settings';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const RequestVerificationSchema = z.object({
  email: z.string().email('Invalid email address'),
});

/**
 * POST /api/auth/request-verification
 *
 * Unauthenticated companion to /api/auth/resend-verification (which needs a
 * token). A user locked out at login because their email isn't verified has no
 * token, so this lets them request a fresh link by email address alone.
 *
 * Always returns 200 with a generic message — never reveal whether the email
 * is registered or already verified (account enumeration). A link is only
 * actually sent for accounts that exist and are not yet verified.
 *
 * Rate limited by BOTH IP and email: the IP limit stops one host from probing
 * many addresses; the per-email limit stops an attacker from bombing one
 * victim's inbox from rotating IPs.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const ipRl = await rateLimit(`request-verify-ip:${ip}`, 5, 60 * 60 * 1000);
    if (!ipRl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(ipRl.resetInMs / 1000)) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = RequestVerificationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { email } = parsed.data;

    // Per-email limit (anti inbox-bombing). Keyed by the normalized address.
    const emailRl = await rateLimit(`request-verify-email:${email.toLowerCase()}`, 3, 60 * 60 * 1000);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerified: true },
    });

    // Only send for a real, still-unverified account that hasn't hit the
    // per-email cap. All branches return the same generic response below.
    if (user && !user.emailVerified && emailRl.allowed) {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

      await prisma.user.update({
        where: { id: user.id },
        data: { verificationToken, verificationTokenExpires },
      });

      const emailSettings = await getSettings();
      if (emailSettings.email.verification.enabled) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const verificationUrl = `${appUrl}/api/auth/verify?token=${verificationToken}`;
        await sendEmail({
          to: user.email,
          subject: emailSettings.email.verification.subject,
          html: `<p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
        <p>This link will expire in 24 hours.</p>`,
        });
      }
    }

    // Identical response regardless of existence / verified state / email cap.
    return NextResponse.json({
      message: 'If that email is registered and not yet verified, a new verification link has been sent.',
    });
  } catch (error) {
    logger.error('Request-verification error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
