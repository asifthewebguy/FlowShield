import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/jwt';
import { sendEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const adminId = getAdminFromToken(request);
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await request.json() as { userId: string };
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://flowshield.app';
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const sessions = await prisma.session.findMany({
    where: { userId: user.id, completed: true, startTime: { gte: weekAgo } },
    select: { actualDuration: true, sessionType: true },
  });

  const totalMinutes = sessions.reduce((s, sess) => s + (sess.actualDuration ?? 0), 0);
  const sessionCount = sessions.length;

  const sent = await sendEmail({
    to: user.email,
    subject: 'Your FlowShield Weekly Summary',
    html: `
      <h1>Hi ${user.name || 'there'}! Here's your weekly summary.</h1>
      <p><strong>Sessions completed:</strong> ${sessionCount}</p>
      <p><strong>Total focus time:</strong> ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m</p>
      <p><a href="${appUrl}/analytics">View full analytics →</a></p>
      <hr/>
      <p style="color:#999;font-size:12px">Sent manually by a FlowShield admin.</p>
    `,
  });

  if (!sent) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  return NextResponse.json({ success: true, sentTo: user.email });
}
