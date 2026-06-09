import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { escapeLike } from '@/lib/security';
import { requestHasTurnstileClearance } from '@/lib/turnstile';

export function GET(req: NextRequest) {
  try {
    if (!requestHasTurnstileClearance(req, 'search')) {
      return NextResponse.json(
        { error: 'Turnstile verification required' },
        { status: 403 }
      );
    }

    const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 200);
    if (!q) {
      return NextResponse.json([]);
    }

    const rows = db
      .prepare(
        `SELECT id, backendId, path, name, isDirectory, size, modifiedAt, scannedAt
         FROM files
         WHERE name LIKE ? ESCAPE '\\'
         ORDER BY name
         LIMIT 200`
      )
      .all(`%${escapeLike(q)}%`);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error searching files:', error);
    return NextResponse.json(
      { error: 'Failed to search files' },
      { status: 500 }
    );
  }
}
