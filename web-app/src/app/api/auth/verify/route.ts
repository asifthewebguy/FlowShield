import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.json(
            { error: 'Verification token is required' },
            { status: 400 }
        );
    }

    try {
        const user = await prisma.user.findUnique({
            where: {
                verificationToken: token,
            },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Invalid verification token' },
                { status: 400 }
            );
        }

        if (user.verificationTokenExpires && new Date() > user.verificationTokenExpires) {
            return NextResponse.json(
                { error: 'Verification token has expired' },
                { status: 400 }
            );
        }

        // Verify user
        await prisma.user.update({
            where: { id: user.id },
            data: {
                emailVerified: new Date(),
                verificationToken: null, // Clear the token
                verificationTokenExpires: null,
            },
        });

        // Redirect to login or success page
        const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/login?verified=true`;
        return NextResponse.redirect(loginUrl);

    } catch (error) {
        console.error('Verification error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
