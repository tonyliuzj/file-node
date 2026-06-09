// src/app/api/files/explorer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { normalizeVirtualPath, safeDecodeURIComponent } from '@/lib/security';
import { requestHasTurnstileClearance } from '@/lib/turnstile';

export async function GET(request: NextRequest) {
  if (!requestHasTurnstileClearance(request, 'browse')) {
    return NextResponse.json(
      { error: 'Turnstile verification required' },
      { status: 403 }
    );
  }

  const url = request.nextUrl;

  const backendIdParam = url.searchParams.get('backendId');
  const backendId = Number(backendIdParam);
  if (!backendIdParam || Number.isNaN(backendId)) {
    return NextResponse.json(
      { error: 'Invalid or missing backendId' },
      { status: 400 }
    );
  }

  let parent = normalizeVirtualPath(url.searchParams.get('path') || '/');
  if (!parent.endsWith('/')) parent = parent + '/';

  const stmt = db.prepare(`
    SELECT id, path, name, isDirectory, size, modifiedAt
      FROM files
     WHERE backendId = ?
       AND path LIKE ?
       ESCAPE '\\'
    ORDER BY isDirectory DESC, name
  `);
  const allRows = stmt.all(backendId, `${parent}%`) as {
    id: number;
    path: string;
    name: string;
    isDirectory: number;
    size: number | null;
    modifiedAt: string | null;
  }[];

  const direct = allRows.filter((row) => {
    const remainder = row.path.slice(parent.length).replace(/^\/+/, '');
    if (!remainder) return false;
    const parts = remainder.split('/');
    return parts.length === 1 || (parts.length === 2 && parts[1] === '');
  });

  const entries = direct.map((row) => {
    const isDir = row.isDirectory === 1;
    const name = row.name || safeDecodeURIComponent(
      row.path.slice(parent.length).replace(/\/$/, '')
    );

    return {
      id: row.id,
      path: row.path,
      name,
      isDirectory: isDir,
      size: row.size,
      modifiedAt: row.modifiedAt,
    };
  });

  return NextResponse.json(entries);
}
