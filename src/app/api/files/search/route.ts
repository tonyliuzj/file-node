import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { escapeLike } from '@/lib/security';
import { requestHasTurnstileClearance } from '@/lib/turnstile';

const SEARCH_LIMIT = 200;

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
         ORDER BY name COLLATE NOCASE
         LIMIT ${SEARCH_LIMIT + 1}`
      )
      .all(`%${escapeLike(q)}%`);

    // One extra row is fetched so the client can be told the list was cut short.
    const truncated = rows.length > SEARCH_LIMIT;
    return NextResponse.json(truncated ? rows.slice(0, SEARCH_LIMIT) : rows, {
      headers: truncated ? { 'x-result-truncated': '1' } : undefined,
    });
  } catch (error) {
    console.error('Error searching files:', error);
    return NextResponse.json(
      { error: 'Failed to search files' },
      { status: 500 }
    );
  }
}
