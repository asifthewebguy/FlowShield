import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * GET /api/coach/advice — streams personalized AI coaching advice as SSE.
 * Uses user's last 7 days of analytics as context for Claude.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromToken(request);

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Gather last 7 days of context
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [user, sessions, dailyStats, activityLogs] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, preferences: true },
      }),
      prisma.session.findMany({
        where: { userId, startTime: { gte: weekAgo } },
        orderBy: { startTime: 'desc' },
        take: 30,
      }),
      prisma.dailyStats.findMany({
        where: { userId, date: { gte: weekAgo } },
        orderBy: { date: 'desc' },
      }),
      prisma.activityLog.findMany({
        where: { userId, timestamp: { gte: weekAgo } },
        orderBy: [{ category: 'asc' }],
        take: 200,
      }),
    ]);

    // Summarize activity by category
    const categoryMinutes: Record<string, number> = {};
    for (const log of activityLogs) {
      categoryMinutes[log.category] = (categoryMinutes[log.category] || 0) + log.durationSeconds / 60;
    }

    const totalFocusMinutes = sessions
      .filter(s => s.completed)
      .reduce((sum, s) => sum + (s.actualDuration || 0), 0);
    const completedSessions = sessions.filter(s => s.completed).length;
    const avgProductivityScore =
      dailyStats.length > 0
        ? Math.round(
            dailyStats.reduce((sum, d) => sum + (d.avgProductivityScore || 0), 0) / dailyStats.length
          )
        : 0;

    // Peak focus hours from sessions
    const hourCounts: Record<number, number> = {};
    for (const s of sessions) {
      const h = s.startTime.getHours();
      hourCounts[h] = (hourCounts[h] || 0) + (s.actualDuration || 0);
    }
    const peakHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0]?.[0];

    const userName = user?.name?.split(' ')[0] || 'there';
    const topCategories = Object.entries(categoryMinutes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, mins]) => `${cat}: ${Math.round(mins)}m`)
      .join(', ');

    const systemPrompt = `You are FlowShield's AI Productivity Coach. Your name is Flow.
You give concise, personalized, actionable advice based on the user's actual productivity data.
Be warm, encouraging, and specific. Use bullet points sparingly — prefer short paragraphs.
Keep your response to 150–250 words. Do not include a greeting like "Hi [name]!" — jump straight into the advice.`;

    const userPrompt = `Here is ${userName}'s productivity data for the past 7 days:

- Total focus time: ${Math.floor(totalFocusMinutes / 60)}h ${totalFocusMinutes % 60}m
- Completed sessions: ${completedSessions}
- Average productivity score: ${avgProductivityScore}/100
- Peak focus hour: ${peakHour !== undefined ? `${peakHour}:00` : 'unknown'}
- Time by category: ${topCategories || 'no activity recorded'}
- Preferred session duration: ${user?.preferences?.preferredDuration || 25} minutes

Based on this data, give ${userName} 2–3 specific, actionable coaching tips to improve their productivity this week. Reference their actual numbers.`;

    // Stream the response as SSE
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const claudeStream = anthropic.messages.stream({
            model: 'claude-opus-4-6',
            max_tokens: 512,
            thinking: { type: 'adaptive' },
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          });

          for await (const event of claudeStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const data = JSON.stringify({ text: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          logger.error('Coach stream error:', err);
          const errData = JSON.stringify({ error: 'Stream failed' });
          controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    logger.error('Coach advice error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
