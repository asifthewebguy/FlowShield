import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { sign } from 'jsonwebtoken';
import { getJwtSecret } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { LoginSchema } from '@/lib/schemas';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 attempts per 15 minutes per IP
    const ip = getClientIp(request);
    const rl = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
      );
    }

    const body = await request.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { email, password, rememberMe } = parsed.data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        preferences: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.hashedPassword);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Email-verified gate (off by default until mobile + desktop clients
    // ship error-code handling). Set REQUIRE_EMAIL_VERIFICATION=true to enable.
    if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.emailVerified) {
      return NextResponse.json(
        {
          error: 'Please verify your email before signing in.',
          code: 'EMAIL_NOT_VERIFIED',
        },
        { status: 403 }
      );
    }

    // Create JWT token
    const token = sign(
      { userId: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: rememberMe ? '30d' : '7d' } // 30 days if rememberMe is true, else 7 days
    );

    // Return user data (excluding password) and token
    const { hashedPassword, ...userWithoutPassword } = user;

    return NextResponse.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    logger.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
