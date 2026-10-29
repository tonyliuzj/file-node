// src/app/api/files/view/route.ts
import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { revealSecret } from '@/lib/credentials';
import {
  contentDisposition,
  isActiveContentType,
  isUrlInsideBackend,
  normalizeHttpUrl,
  normalizeVirtualPath,
  safeContentType,
  safeDecodeURIComponent,
} from '@/lib/security';

export const runtime = 'nodejs';

// Time allowed for the backend to start answering. The body is not capped: videos stream for as
// long as the viewer keeps watching.
const UPSTREAM_HEADERS_TIMEOUT_MS = 30_000;

// Script inside an SVG or XML document must never run with this site's cookies.
const ACTIVE_CONTENT_CSP =
  "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";

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
  if (!Number.isInteger(backendId)) {
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

  // Ranges refer to the bytes as stored, so ask for them unencoded. Otherwise a compressing
  // backend sends a body whose length no longer matches the headers we would forward.
  const forwardHeaders: Record<string, string> = { 'accept-encoding': 'identity' };
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
  request.signal.addEventListener('abort', () => controller.abort(), {
    once: true,
  });
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_HEADERS_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(file.url, {
      headers: forwardHeaders,
      signal: controller.signal,
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return new NextResponse(
      timedOut ? 'Backend timed out' : 'Backend unreachable',
      { status: timedOut ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

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
    if (!value) continue;

    // A body that was decoded on the way in no longer matches the length the backend announced.
    if (header === 'content-length' && upstream.headers.has('content-encoding')) {
      continue;
    }
    responseHeaders.set(
      header,
      header === 'content-type' ? safeContentType(value) : value
    );
  }
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'application/octet-stream');
  }
  const contentType = responseHeaders.get('content-type') || '';
  const isActive = isActiveContentType(contentType);

  responseHeaders.set('x-content-type-options', 'nosniff');
  responseHeaders.set('referrer-policy', 'no-referrer');
  // Other sites may not embed or hotlink files through this proxy.
  responseHeaders.set('cross-origin-resource-policy', 'same-origin');
  if (isActive) {
    responseHeaders.set('content-security-policy', ACTIVE_CONTENT_CSP);
  }

  const filename = safeDecodeURIComponent(filePath.split('/').pop() || 'file');
  // SVG still renders inline (sandboxed) so images work; other markup is only ever downloaded.
  const forceDownload =
    url.searchParams.get('download') === '1' ||
    (isActive && contentType.split(';')[0]?.trim().toLowerCase() !== 'image/svg+xml');
  responseHeaders.set(
    'content-disposition',
    contentDisposition(forceDownload ? 'attachment' : 'inline', filename)
  );

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
