import { NextRequest } from 'next/server';
import { verify } from 'jsonwebtoken';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken, getJwtSecret } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';

const ADVICE_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h

function coachCacheKey(userId: string): string {
  const dateKey = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  return `coach:${userId}:${dateKey}`;
}

// EventSource cannot set Authorization headers, so the client can pass the JWT
// as ?token=... on this SSE endpoint. Fall back to that when the header is absent.
function getUserIdFromRequestOrQuery(request: NextRequest): string | null {
  const fromHeader = getUserIdFromToken(request);
  if (fromHeader) return fromHeader;
  const queryToken = new URL(request.url).searchParams.get('token');
  if (!queryToken) return null;
  try {
    const decoded = verify(queryToken, getJwtSecret()) as { userId: string };
    return decoded.userId;
  } catch {
    return null;
  }
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

async function readCache(userId: string): Promise<string | null> {
  try {
    const cached = await redis.get<string>(coachCacheKey(userId));
    return typeof cached === 'string' && cached.length > 0 ? cached : null;
  } catch (err) {
    logger.warn('Coach cache read failed', err);
    return null;
  }
}

async function writeCache(userId: string, text: string): Promise<void> {
  try {
    await redis.setex(coachCacheKey(userId), ADVICE_CACHE_TTL_SECONDS, text);
  } catch (err) {
    logger.warn('Coach cache write failed', err);
  }
}

/**
 * GET /api/coach/advice
 *   - `?cacheOnly=1` → fast JSON probe. Returns cached advice (200) or 204 on miss.
 *   - Zero activity in last 7 days → JSON empty-state message, no Claude call.
 *   - Cache hit → JSON cached advice.
 *   - Otherwise → SSE stream from Claude, cached to Redis (24h TTL) on completion.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequestOrQuery(request);

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const cacheOnly = url.searchParams.get('cacheOnly') === '1';

    // Serve from cache on every request when available
    const cached = await readCache(userId);
    if (cached) {
      return new Response(JSON.stringify({ advice: cached, cached: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (cacheOnly) {
      return new Response(null, { status: 204 });
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

    const totalFocusMinutes = sessions
      .filter(s => s.completed)
      .reduce((sum, s) => sum + (s.actualDuration || 0), 0);
    const completedSessions = sessions.filter(s => s.completed).length;

    // Zero-activity short-circuit — no Claude call, no cache write
    if (totalFocusMinutes === 0 && completedSessions === 0) {
      const advice = 'Start a focus session to unlock personalized advice. Flow gets smarter with every session you complete.';
      return new Response(JSON.stringify({ advice, cached: false, empty: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Summarize activity by category
    const categoryMinutes: Record<string, number> = {};
    for (const log of activityLogs) {
      categoryMinutes[log.category] = (categoryMinutes[log.category] || 0) + log.durationSeconds / 60;
    }

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

    // Stream Gemini's response as SSE + accumulate for cache write
    const encoder = new TextEncoder();
    let fullText = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash-lite',
            systemInstruction: systemPrompt,
            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.7,
            },
          });

          const result = await model.generateContentStream(userPrompt);

          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              fullText += text;
              const data = JSON.stringify({ text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          if (fullText.length > 0) {
            await writeCache(userId, fullText);
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
