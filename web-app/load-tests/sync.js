/**
 * k6 load test for POST /api/activity/sync
 *
 * Usage:
 *   k6 run --env BASE_URL=https://flowshield.app --env TOKEN=<jwt> load-tests/sync.js
 *
 * Required env vars:
 *   BASE_URL  — the deployment to test (default: http://localhost:3000)
 *   TOKEN     — a valid JWT for an existing user
 *
 * Thresholds (fail CI if exceeded):
 *   http_req_duration p(95) < 800ms
 *   http_req_failed   rate  < 1%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ───────────────────────────────────────────────────────────

const errorRate = new Rate('sync_errors');
const syncDuration = new Trend('sync_duration_ms', true);

// ── Test configuration ───────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Ramp up: simulate clients sending activity bursts
    activity_sync: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '15s', target: 10 },  // ramp to 10 concurrent clients
        { duration: '30s', target: 10 },  // hold for 30s
        { duration: '15s', target: 0 },   // ramp down
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],   // 95th percentile under 800ms
    http_req_failed:   ['rate<0.01'],   // less than 1% request errors
    sync_errors:       ['rate<0.01'],   // less than 1% business-logic errors
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN    = __ENV.TOKEN    || '';

/** Build a realistic activity batch (5–15 entries). */
function makeBatch(size = 10) {
  const categories = ['Development', 'Work', 'Communication', 'Browsing', 'Entertainment'];
  const apps = ['VS Code', 'Chrome', 'Slack', 'Terminal', 'Figma'];
  const now = Date.now();

  return Array.from({ length: size }, (_, i) => ({
    timestamp:       new Date(now - i * 60_000).toISOString(),
    windowTitle:     `Window ${i}`,
    processName:     apps[i % apps.length],
    applicationName: apps[i % apps.length],
    durationSeconds: 30 + Math.floor(Math.random() * 90),
    activityLevel:   Math.floor(Math.random() * 100),
    category:        categories[i % categories.length],
  }));
}

// ── Main VU function ─────────────────────────────────────────────────────────

export default function () {
  if (!TOKEN) {
    console.error('TOKEN env var is required — skipping iteration');
    sleep(1);
    return;
  }

  const payload = JSON.stringify({
    activities: makeBatch(10),
    source: 'load-test',
  });

  const params = {
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    tags: { endpoint: 'activity_sync' },
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/activity/sync`, payload, params);
  syncDuration.add(Date.now() - start);

  const ok = check(res, {
    'status is 200':          (r) => r.status === 200,
    'returns count field':    (r) => {
      try { return JSON.parse(r.body).count !== undefined; }
      catch { return false; }
    },
  });

  errorRate.add(!ok);

  // Simulate a realistic client: sync every ~60s, jitter ±5s
  sleep(1 + Math.random() * 0.5);
}
