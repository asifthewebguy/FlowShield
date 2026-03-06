import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { sendEmail } from '@/lib/email';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { SignupSchema } from '@/lib/schemas';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 signups per hour per IP
    const ip = getClientIp(request);
    const rl = rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
      );
    }

    const body = await request.json();
    const parsed = SignupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { email, password, name } = parsed.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Create verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Hash password and create user
    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        hashedPassword,
        name: name || null,
        verificationToken,
        verificationTokenExpires,
        preferences: {
          create: {
            preferredDuration: 25,
            primaryDistractions: [],
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    // Send verification email
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/verify?token=${verificationToken}`;

    await sendEmail({
      to: email,
      subject: 'Verify your email - FlowShield',
      html: `
        <h1>Welcome to FlowShield!</h1>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
        <p>This link will expire in 24 hours.</p>
      `,
    });

    if (process.env.ADMIN_EMAIL) {
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: 'New User Registration - FlowShield',
        html: `
          <h1>New User Registered</h1>
          <p>Email: ${email}</p>
          <p>Name: ${name || 'N/A'}</p>
          <p>Time: ${new Date().toLocaleString()}</p>
        `,
      });
    }

    return NextResponse.json(
      { message: 'User created successfully', user },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Signup error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
