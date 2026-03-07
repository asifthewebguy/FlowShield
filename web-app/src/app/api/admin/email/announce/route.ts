import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/jwt';
import { sendEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const adminId = getAdminFromToken(request);
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { subject, html, tier } = await request.json() as {
    subject: string;
    html: string;
    tier?: 'FREE' | 'PRO' | 'TEAM';
  };

  if (!subject || !html) {
    return NextResponse.json({ error: 'subject and html are required' }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    where: {
      emailVerified: { not: null },
      ...(tier && { subscriptionTier: tier }),
    },
    select: { email: true },
  });

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    const ok = await sendEmail({ to: user.email, subject, html });
    if (ok) sent++;
    else failed++;
  }

  return NextResponse.json({ sent, failed, total: users.length });
}
