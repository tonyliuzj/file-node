// src/app/api/files/view/route.ts
import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { revealSecret } from '@/lib/credentials';
import {
  isUrlInsideBackend,
  normalizeHttpUrl,
  normalizeVirtualPath,
  safeContentType,
} from '@/lib/security';

export const runtime = 'nodejs';

interface BackendRecord {
  id: number;
  name: string;
  url: string;
  authEnabled: number;
  username: string | null;
  password: string | null;
  rescanInterval: number | null;
}

interface FileRecord {
  url: string;
  isDirectory: number;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;

  const backendIdParam = url.searchParams.get('backendId');
  if (!backendIdParam) {
    return new NextResponse('Missing backendId', { status: 400 });
  }
  const backendId = Number(backendIdParam);
  if (Number.isNaN(backendId)) {
    return new NextResponse('Invalid backendId', { status: 400 });
  }

  const filePathParam = url.searchParams.get('path');
  if (!filePathParam) {
    return new NextResponse('Missing file path', { status: 400 });
  }
  const filePath = normalizeVirtualPath(filePathParam);

  const backendStmt = db.prepare(`
    SELECT id, name, url, authEnabled, username, password, rescanInterval
      FROM backends
     WHERE id = ?
  `);
  const backend = backendStmt.get(backendId) as BackendRecord | undefined;
  if (!backend) {
    return new NextResponse('Unknown backend', { status: 404 });
  }
  const backendUrl = normalizeHttpUrl(backend.url);
  if (!backendUrl) {
    return new NextResponse('Invalid backend URL', { status: 500 });
  }

  const fileStmt = db.prepare(`
    SELECT url, isDirectory
      FROM files
     WHERE backendId = ?
       AND path = ?
  `);
  const file = fileStmt.get(backendId, filePath) as FileRecord | undefined;
  if (!file) {
    return new NextResponse('File not found', { status: 404 });
  }
  if (file.isDirectory === 1) {
    return new NextResponse('Cannot preview a directory', { status: 400 });
  }
  if (!isUrlInsideBackend(file.url, backendUrl)) {
    return new NextResponse('Indexed file URL is outside backend root', {
      status: 403,
    });
  }

  const forwardHeaders: Record<string, string> = {};
  const range = request.headers.get('range');
  if (range) forwardHeaders['range'] = range;

  if (backend.authEnabled === 1 && backend.username && backend.password) {
    const password = revealSecret(backend.password);
    if (!password) {
      return new NextResponse('Backend credentials are unavailable', {
        status: 500,
      });
    }
    const creds = Buffer.from(
      `${backend.username}:${password}`
    ).toString('base64');
    forwardHeaders['authorization'] = `Basic ${creds}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const upstream = await fetch(file.url, {
    headers: forwardHeaders,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse(`Upstream error: ${upstream.status}`, {
      status: upstream.status,
    });
  }

  const responseHeaders = new Headers();
  for (const header of [
    'content-type',
    'accept-ranges',
    'content-range',
    'content-length',
    'cache-control',
    'etag',
  ] as const) {
    const value = upstream.headers.get(header);
    if (value) {
      responseHeaders.set(
        header,
        header === 'content-type' ? safeContentType(value) : value
      );
    }
  }
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'application/octet-stream');
  }
  responseHeaders.set('x-content-type-options', 'nosniff');
  responseHeaders.set('referrer-policy', 'no-referrer');

  const filename = encodeURIComponent(
    filePath.split('/').pop()?.replace(/["\r\n]/g, '') || 'file'
  );
  const disposition =
    url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  responseHeaders.set(
    'content-disposition',
    `${disposition}; filename="${filename}"`
  );

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
