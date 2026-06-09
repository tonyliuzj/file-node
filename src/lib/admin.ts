import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { hasAdminUser } from '@/lib/setup';

export async function requireAdmin() {
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
