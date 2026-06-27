import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';
import { getUserIdFromToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { rateLimit } from '@/lib/rate-limit';
import {
  coachCacheKey,
  coachCacheTtl,
  freeTierCanCall,
  nextFreeTierResetAt,
} from '@/lib/coach-quota';

async function readCache(userId: string, tier: string): Promise<string | null> {
  try {
    const cached = await redis.get<string>(coachCacheKey(userId, tier));
    return typeof cached === 'string' && cached.length > 0 ? cached : null;
  } catch (err) {
    logger.warn('Coach cache read failed', err);
    return null;
  }
}

async function writeCache(userId: string, tier: string, text: string): Promise<void> {
  try {
    await redis.setex(coachCacheKey(userId, tier), coachCacheTtl(tier), text);
  } catch (err) {
    logger.warn('Coach cache write failed', err);
  }
}

/**
 * GET /api/coach/advice
 *   - `?cacheOnly=1` → fast JSON probe. Returns cached advice (200) or 204 on miss.
 *   - Zero activity in last 7 days → JSON empty-state message, no Gemini call.
 *   - Cache hit → JSON cached advice (does NOT consume FREE quota).
 *   - FREE tier already used this month + cache miss → 429 with `nextResetAt`.
 *   - Otherwise → SSE stream from Gemini, cached + lastCoachCallAt stamped on completion.
 *
 * Quota for FREE tier is durable: enforced via `User.lastCoachCallAt` in the
 * database, so a Redis outage cannot grant unlimited calls. Cache is purely a
 * perf layer.
 *
 * Auth: Authorization: Bearer <jwt> header only. Both web and desktop clients
 * use fetch/HttpClient with the Authorization header — no ?token= fallback.
 *
 * Concurrency: a per-user Redis lock (coach-lock:<userId>, 60s TTL) prevents N
 * concurrent requests from all passing freeTierCanCall and opening N Gemini streams.
 * Per-user rate limit: 5 requests/min.
 */
export async function GET(request: NextRequest) {
  try {
    // Fail fast and visibly when the API key isn't configured rather than
    // surfacing the failure as an error inside an opened SSE stream.
    if (!process.env.GOOGLE_AI_API_KEY) {
      logger.error('Coach disabled: GOOGLE_AI_API_KEY is not set');
      return new Response(
        JSON.stringify({ error: 'AI Coach is not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = getUserIdFromToken(request);

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const cacheOnly = url.searchParams.get('cacheOnly') === '1';

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        subscriptionTier: true,
        lastCoachCallAt: true,
        preferences: true,
      },
    });

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tier = user.subscriptionTier ?? 'FREE';
    const isFree = tier === 'FREE';
    const nextResetAt = nextFreeTierResetAt();

    // Cache hit — serve immediately. For FREE this does NOT consume their
    // monthly call (quota is already recorded by the original generation
    // that populated the cache).
    const cached = await readCache(userId, tier);
    if (cached) {
      return new Response(
        JSON.stringify({
          advice: cached,
          cached: true,
          tier,
          ...(isFree && { nextResetAt: nextResetAt.toISOString() }),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Durable FREE-tier quota check (DB column). If they've already called this
    // calendar month and the cache missed (e.g. Redis flush, cache eviction, or
    // outage), refuse the call cleanly with the next reset time.
    if (isFree && !freeTierCanCall(user.lastCoachCallAt)) {
      return new Response(
        JSON.stringify({
          error: 'Monthly limit reached',
          code: 'FREE_TIER_LIMIT',
          tier,
          nextResetAt: nextResetAt.toISOString(),
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (cacheOnly) {
      return new Response(null, { status: 204 });
    }

    // Per-user rate limit: 5 requests/min to prevent burst abuse before we
    // open a Gemini stream.
    const rl = await rateLimit('coach:' + userId, 5, 60 * 1000);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Gather last 7 days of activity context
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [sessions, dailyStats, activityLogs] = await Promise.all([
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

    // Zero-activity short-circuit — no Gemini call, no cache write, no quota consumed
    if (totalFocusMinutes === 0 && completedSessions === 0) {
      const advice = 'Start a focus session to unlock personalized advice. Flow gets smarter with every session you complete.';
      return new Response(
        JSON.stringify({
          advice,
          cached: false,
          empty: true,
          tier,
          ...(isFree && { nextResetAt: nextResetAt.toISOString() }),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
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

    // Distributed lock: prevents concurrent requests from opening N Gemini streams.
    // Lock auto-expires in 60s if the stream never completes (e.g. client disconnect).
    const lockKey = 'coach-lock:' + userId;
    const locked = await redis.set(lockKey, '1', { nx: true, ex: 60 });
    if (!locked) {
      return new Response(
        JSON.stringify({ error: 'A coaching request is already in progress' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Stream Gemini's response as SSE + accumulate for cache write.
    // We persist to cache + stamp lastCoachCallAt ONLY on a clean stream
    // completion, never on a mid-stream error — partial advice would burn
    // the FREE user's monthly call without giving them usable text.
    let stream: ReadableStream;
    try {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
      const encoder = new TextEncoder();
      let fullText = '';

      stream = new ReadableStream({
        async start(controller) {
        let streamErrored = false;
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
        } catch (err) {
          streamErrored = true;
          logger.error('Coach stream error:', err);
          await redis.del(lockKey);
          const errData = JSON.stringify({ error: 'Stream failed' });
          controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
          controller.close();
          return;
        }

        // Clean completion only: persist cache + stamp quota.
        if (!streamErrored && fullText.length > 0) {
          await writeCache(userId, tier, fullText);
          try {
            await prisma.user.update({
              where: { id: userId },
              data: { lastCoachCallAt: new Date() },
            });
          } catch (err) {
            logger.warn('Failed to record coach call timestamp', err);
          }
        }

        await redis.del(lockKey);
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    } catch (err) {
      await redis.del(lockKey);
      throw err;
    }

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
