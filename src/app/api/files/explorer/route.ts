// src/app/api/files/explorer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { normalizeVirtualPath, safeDecodeURIComponent } from '@/lib/security';
import { requestHasTurnstileClearance } from '@/lib/turnstile';
import { publicRateLimit } from '@/lib/rate-limit';

// Folders are returned a page at a time, so a folder with tens of thousands of entries never has
// to be serialised, sent and rendered in one go.
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 1000;

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function GET(request: NextRequest) {
  const limited = publicRateLimit(request, 'explorer');
  if (limited) return limited;

  if (!requestHasTurnstileClearance(request, 'browse')) {
    return NextResponse.json(
      { error: 'Turnstile verification required' },
      { status: 403 }
    );
  }

  const url = request.nextUrl;

  const backendIdParam = url.searchParams.get('backendId');
  const backendId = Number(backendIdParam);
  if (!backendIdParam || !Number.isInteger(backendId)) {
    return NextResponse.json(
      { error: 'Invalid or missing backendId' },
      { status: 400 }
    );
  }

  let parent = normalizeVirtualPath(url.searchParams.get('path') || '/');
  if (!parent.endsWith('/')) parent = parent + '/';

  const limit = boundedInteger(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = boundedInteger(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

  // Everything under `parent` is the half-open range [parent, parent with its final "/" bumped to
  // "0"). Unlike LIKE, a "_" or "%" in a folder name means nothing here, and the (backendId, path)
  // index serves the range. The instr() test then keeps direct children only: no slash left in the
  // remainder, or just the trailing one of a subfolder.
  const upperBound = `${parent.slice(0, -1)}0`;
  const where = `
    backendId = ?
    AND path >= ?
    AND path < ?
    AND path != ?
    AND (
      instr(substr(path, length(?) + 1), '/') = 0
      OR instr(substr(path, length(?) + 1), '/') = length(substr(path, length(?) + 1))
    )
  `;
  const filterArgs = [backendId, parent, upperBound, parent, parent, parent, parent];

  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM files WHERE ${where}`).get(...filterArgs) as {
      count: number;
    }
  ).count;

  const rows = db
    .prepare(`
      SELECT id, path, name, isDirectory, size, modifiedAt
        FROM files
       WHERE ${where}
       ORDER BY isDirectory DESC, name COLLATE NOCASE, path
       LIMIT ? OFFSET ?
    `)
    .all(...filterArgs, limit, offset) as {
    id: number;
    path: string;
    name: string;
    isDirectory: number;
    size: number | null;
    modifiedAt: string | null;
  }[];

  const entries = rows.map((row) => ({
    id: row.id,
    path: row.path,
    name:
      row.name ||
      safeDecodeURIComponent(row.path.slice(parent.length).replace(/\/$/, '')),
    isDirectory: row.isDirectory === 1,
    size: row.size,
    modifiedAt: row.modifiedAt,
  }));

  return NextResponse.json(entries, {
    headers: { 'x-total-count': String(total) },
  });
}
