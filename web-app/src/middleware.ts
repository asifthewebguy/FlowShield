import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT secret not configured');
  return new TextEncoder().encode(secret);
}

// Protects /api/admin/* routes at the edge.
// Page-level /admin/* protection is handled client-side in the admin layout.
export async function middleware(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const rawToken = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  if (!rawToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(rawToken, getSecret());
    if ((payload as { role?: string }).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*'],
};
