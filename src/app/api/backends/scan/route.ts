import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { backendExists, startBackendScan } from '@/utils/scanner';

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const { id } = await req.json();
    const backendId = Number(id);
    if (!Number.isInteger(backendId) || backendId < 1) {
      return NextResponse.json({ error: 'Invalid backend id' }, { status: 400 });
    }
    if (!backendExists(backendId)) {
      return NextResponse.json({ error: 'Backend not found' }, { status: 404 });
    }

    // A scan can outlast any browser or proxy timeout, so it runs in the background. Progress and
    // the outcome show up on GET /api/backends (`scanning`, `scanError`).
    const result = startBackendScan(backendId);
    return NextResponse.json(
      { success: true, started: result === 'started', scanning: true },
      { status: 202 }
    );
  } catch (error) {
    console.error('Error starting backend scan:', error);
    return NextResponse.json(
      { error: 'Failed to start backend scan' },
      { status: 500 }
    );
  }
}
