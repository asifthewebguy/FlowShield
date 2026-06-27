import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/jwt';
import { sendEmail } from '@/lib/email';

const AnnounceSchema = z.object({
  subject: z.string().min(1).max(200),
  html: z.string().max(50000),
  tier: z.enum(['FREE', 'PRO', 'TEAM']).optional(),
});

const EMAIL_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'p', 'a', 'b', 'i', 'strong', 'em',
    'ul', 'ol', 'li', 'br', 'span', 'div', 'img', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    'a': ['href'],
    'img': ['src', 'alt', 'width', 'height'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https'],
  },
};

export async function POST(request: NextRequest) {
  const adminId = getAdminFromToken(request);
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = AnnounceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { subject, tier } = parsed.data;
  const html = sanitizeHtml(parsed.data.html, EMAIL_SANITIZE_OPTIONS);

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
