import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { generateInsights } from '@/lib/insights';
import { getSettings } from '@/lib/settings';
import { safeEqual } from '@/lib/timing-safe';

/**
 * GET /api/cron/weekly-digest
 * Triggered by Netlify Scheduled Functions or an external cron service (e.g. cron-job.org).
 * Sends a weekly summary email to all users who have had at least one session in the last 7 days.
 * Secured with CRON_SECRET header.
 */
export async function GET(request: NextRequest) {
  // Validate the cron secret. Header-only — query string would leak the
  // secret into server access logs and CDN logs.
  const secret = request.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || !safeEqual(secret, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if digest is enabled in admin settings
  const appSettings = await getSettings();
  if (!appSettings.email.digest.enabled) {
    logger.info('Weekly digest is disabled in admin settings — skipping');
    return NextResponse.json({ sent: 0, failed: 0, total: 0, skipped: true });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 14);

  // Find all users active in the last 7 days
  const activeUsers = await prisma.user.findMany({
    where: {
      sessions: {
        some: { startTime: { gte: sevenDaysAgo } },
      },
    },
    select: { id: true, email: true, name: true },
  });

  logger.info(`Weekly digest: sending to ${activeUsers.length} users`);

  let sent = 0;
  let failed = 0;

  for (const user of activeUsers) {
    try {
      // Fetch this week's stats
      const [thisWeekSessions, thisWeekStats, lastWeekStats] = await Promise.all([
        prisma.session.findMany({
          where: { userId: user.id, startTime: { gte: sevenDaysAgo }, completed: true },
          select: { plannedDuration: true, actualDuration: true, productivityScore: true, startTime: true, completed: true },
        }),
        prisma.dailyStats.findMany({
          where: { userId: user.id, date: { gte: sevenDaysAgo } },
        }),
        prisma.dailyStats.findMany({
          where: { userId: user.id, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
        }),
      ]);

      const totalFocusMin = thisWeekStats.reduce((s, d) => s + d.totalFocusMinutes, 0);
      const avgScore =
        thisWeekSessions.length > 0
          ? Math.round(
              thisWeekSessions.reduce((s, ses) => s + (ses.productivityScore ?? 0), 0) /
                thisWeekSessions.length
            )
          : 0;

      const lastWeekFocusMin = lastWeekStats.reduce((s, d) => s + d.totalFocusMinutes, 0);
      const trendPct =
        lastWeekFocusMin > 0
          ? Math.round(((totalFocusMin - lastWeekFocusMin) / lastWeekFocusMin) * 100)
          : null;

      // Generate text insights
      const insights = generateInsights({
        dailyStats: [...thisWeekStats, ...lastWeekStats],
        sessions: thisWeekSessions,
        streak: 0, // simplified for email
      });

      const insightsBullets =
        insights.length > 0
          ? insights
              .slice(0, 3)
              .map((i) => `<li style="margin-bottom:8px"><strong>${i.title}</strong> — ${i.description}</li>`)
              .join('')
          : '<li>Keep going — insights appear after more sessions.</li>';

      const trendLine =
        trendPct !== null
          ? `<p style="color:${trendPct >= 0 ? '#16a34a' : '#dc2626'}">
               ${trendPct >= 0 ? '📈' : '📉'} Focus time ${trendPct >= 0 ? 'up' : 'down'} ${Math.abs(trendPct)}% vs last week
             </p>`
          : '';

      const firstName = user.name?.split(' ')[0] ?? 'there';
      const focusHours = Math.floor(totalFocusMin / 60);
      const focusMins = totalFocusMin % 60;

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827; background: #f9fafb;">
  <div style="background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,.08);">
    <div style="text-align:center; margin-bottom: 24px;">
      <span style="font-size:32px">⚡</span>
      <h1 style="margin:8px 0 0; font-size:22px; color:#0ea5e9">FlowShield Weekly Summary</h1>
    </div>

    <p>Hey ${firstName},</p>
    <p>Here's how your focus went this week:</p>

    <div style="display:flex; gap:16px; margin: 24px 0; text-align:center;">
      <div style="flex:1; background:#f0f9ff; border-radius:8px; padding:16px;">
        <div style="font-size:28px; font-weight:700; color:#0ea5e9">${focusHours}h ${focusMins}m</div>
        <div style="font-size:13px; color:#6b7280; margin-top:4px">Total Focus Time</div>
      </div>
      <div style="flex:1; background:#f0fdf4; border-radius:8px; padding:16px;">
        <div style="font-size:28px; font-weight:700; color:#16a34a">${thisWeekSessions.length}</div>
        <div style="font-size:13px; color:#6b7280; margin-top:4px">Sessions Completed</div>
      </div>
      <div style="flex:1; background:#faf5ff; border-radius:8px; padding:16px;">
        <div style="font-size:28px; font-weight:700; color:#7c3aed">${avgScore > 0 ? avgScore : '—'}</div>
        <div style="font-size:13px; color:#6b7280; margin-top:4px">Avg Productivity</div>
      </div>
    </div>

    ${trendLine}

    <h2 style="font-size:16px; margin-top:24px; margin-bottom:12px">💡 Insights</h2>
    <ul style="padding-left:20px; color:#374151; font-size:14px; line-height:1.6">
      ${insightsBullets}
    </ul>

    <div style="margin-top:32px; text-align:center">
      <a href="https://flowshield.app/analytics" style="display:inline-block; background:#0ea5e9; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px">
        View Full Analytics
      </a>
    </div>

    <p style="font-size:12px; color:#9ca3af; margin-top:32px; text-align:center">
      FlowShield &middot; <a href="https://flowshield.app/settings" style="color:#9ca3af">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;

      const subject = appSettings.email.digest.subject
        || `Your FlowShield week: ${focusHours}h ${focusMins}m focused`;

      const ok = await sendEmail({ to: user.email, subject, html });

      if (ok) sent++;
      else failed++;
    } catch (err) {
      logger.error(`Weekly digest failed for user ${user.id}:`, err);
      failed++;
    }
  }

  logger.info(`Weekly digest complete: ${sent} sent, ${failed} failed`);

  // Surface a hard failure when the digest tried to send to >0 users and
  // every send failed. External cron schedulers can fail-alert on 5xx, so
  // this turns "silently sent zero emails" into a paged signal. A partial
  // failure (sent > 0) still returns 200 so we don't retry-storm the whole
  // batch on one bad address.
  if (activeUsers.length > 0 && sent === 0 && failed > 0) {
    logger.error(`Weekly digest sent ZERO emails to ${failed} users — check Resend/email config`);
    return NextResponse.json(
      { sent, failed, total: activeUsers.length, error: 'All digest sends failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({ sent, failed, total: activeUsers.length });
}
