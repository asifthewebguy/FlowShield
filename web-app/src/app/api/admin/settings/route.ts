import { NextRequest, NextResponse } from 'next/server';
import { getAuthAdminId } from '@/lib/jwt';
import { getSettings, saveSettings } from '@/lib/settings';

export async function GET(request: NextRequest) {
  const adminId = await getAuthAdminId(request);
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const adminId = await getAuthAdminId(request);
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Accepts a flat map: { "email.digest.enabled": true, "email.digest.subject": "..." }
  const body = await request.json() as Record<string, unknown>;

  const allowed = new Set([
    'payment.lemonsqueezy.enabled',
    'payment.bkash.enabled',
    'email.welcome.enabled',
    'email.welcome.subject',
    'email.welcome.body',
    'email.verification.enabled',
    'email.verification.subject',
    'email.digest.enabled',
    'email.digest.subject',
    'email.digest.body',
  ]);

  const updates: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(body)) {
    if (allowed.has(key)) updates[key] = val;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid settings keys provided' }, { status: 400 });
  }

  await saveSettings(updates, adminId);
  const settings = await getSettings();
  return NextResponse.json(settings);
}
