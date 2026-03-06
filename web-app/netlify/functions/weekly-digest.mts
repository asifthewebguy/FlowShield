import type { Config } from '@netlify/functions';

/**
 * Netlify Scheduled Function — runs every Monday at 8 AM UTC.
 * Calls the Next.js /api/cron/weekly-digest route with the shared CRON_SECRET.
 *
 * Required environment variables (set in Netlify UI → Site configuration → Environment variables):
 *   CRON_SECRET   — a long random string shared between this function and the API route
 *   URL           — injected automatically by Netlify (the deployed site URL)
 */
export default async function weeklyDigest() {
  const appUrl = process.env.URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!appUrl || !cronSecret) {
    console.error('[weekly-digest] Missing URL or CRON_SECRET environment variables');
    return;
  }

  console.log(`[weekly-digest] Triggering weekly digest at ${new Date().toISOString()}`);

  try {
    const response = await fetch(`${appUrl}/api/cron/weekly-digest`, {
      method: 'GET',
      headers: {
        'x-cron-secret': cronSecret,
      },
    });

    if (!response.ok) {
      console.error(`[weekly-digest] API returned ${response.status}: ${await response.text()}`);
      return;
    }

    const result = await response.json();
    console.log(`[weekly-digest] Done — sent: ${result.sent}, failed: ${result.failed}, total: ${result.total}`);
  } catch (err) {
    console.error('[weekly-digest] Request failed:', err);
  }
}

export const config: Config = {
  // Every Monday at 8:00 AM UTC
  schedule: '0 8 * * 1',
};
