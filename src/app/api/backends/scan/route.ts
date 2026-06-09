import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { scanBackendById } from '@/utils/scanner';

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const { id } = await req.json();
    const backendId = Number(id);
    if (!Number.isInteger(backendId) || backendId < 1) {
      return NextResponse.json({ error: 'Invalid backend id' }, { status: 400 });
    }

    await scanBackendById(backendId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error scanning backend:', error);
    return NextResponse.json(
      { error: 'Failed to scan backend' },
      { status: 500 }
    );
  }
}
