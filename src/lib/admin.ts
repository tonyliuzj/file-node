import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { hasAdminUser } from '@/lib/setup';

/**
 * Browsers label every request with where it came from. Admin changes only ever come from this
 * site's own pages, so one marked cross-site, or same-site but another origin (a sibling subdomain,
 * or another app on a different port of this host), is refused. SameSite cookies already stop the
 * first kind; this also covers the second. Clients that send no label are left to the cookie rules.
 */
function isCrossOrigin(request: Request) {
  const site = request.headers.get('sec-fetch-site');
  return Boolean(site) && site !== 'same-origin' && site !== 'none';
}

/** Pass the request for anything that changes state, so cross-origin callers are turned away. */
export async function requireAdmin(request?: Request) {
  if (request && isCrossOrigin(request)) {
    return NextResponse.json(
      { error: 'Cross-origin request blocked' },
      { status: 403 }
    );
  }

  if (!hasAdminUser()) {
    return NextResponse.json({ error: 'Setup required' }, { status: 428 });
  }

  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;

  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
