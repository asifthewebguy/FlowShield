import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison. Use for secrets (cron tokens, signatures)
 * so an attacker can't enumerate the value via response-timing differences.
 * Returns false on length mismatch without leaking the comparison early.
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
