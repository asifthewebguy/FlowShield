/**
 * One-time script to generate a long-lived JWT for load testing.
 *
 * Prerequisites:
 *   - A test user already exists in your production/staging database.
 *   - Your NEXTAUTH_SECRET is available locally (e.g. in web-app/.env).
 *
 * Usage (from web-app/ directory):
 *   node load-tests/generate-token.mjs
 *
 * Output: a JWT valid for 1 year — copy it into GitHub Secrets as LOAD_TEST_TOKEN.
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Load .env manually (no dotenv dependency needed) ─────────────────────────
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

const { sign } = require('jsonwebtoken');

// ── Configuration — fill these in ────────────────────────────────────────────
const USER_ID = process.env.LOAD_TEST_USER_ID || '';   // UUID of the test user
const EMAIL   = process.env.LOAD_TEST_USER_EMAIL || ''; // email of the test user
const SECRET  = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || '';

if (!SECRET) {
  console.error('❌  NEXTAUTH_SECRET is not set. Check your web-app/.env file.');
  process.exit(1);
}
if (!USER_ID || !EMAIL) {
  console.error(`
❌  USER_ID and EMAIL are required.

Add these to web-app/.env (or export them as environment variables):

  LOAD_TEST_USER_ID=<uuid of the test user in your DB>
  LOAD_TEST_USER_EMAIL=loadtest@example.com

Tip: find the UUID by running this in Prisma Studio or your DB console:
  SELECT id, email FROM "users" WHERE email = 'loadtest@example.com';
`);
  process.exit(1);
}

// ── Generate token ────────────────────────────────────────────────────────────
const token = sign(
  { userId: USER_ID, email: EMAIL, role: 'USER' },
  SECRET,
  { expiresIn: '365d' }
);

console.log('\n✅  Load test token generated (valid for 365 days):\n');
console.log(token);
console.log(`
Next steps:
  1. Copy the token above.
  2. Go to: https://github.com/asifthewebguy/FlowShield/settings/secrets/actions
  3. Click "New repository secret"
  4. Name:  LOAD_TEST_TOKEN
  5. Value: paste the token
  6. Save.

Then trigger the load test from the Actions tab, or wait for the Sunday schedule.
`);
