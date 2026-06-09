// src/utils/scanner.ts
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import db from './db';
import { posix as pathPosix } from 'path';
import { revealSecret } from '@/lib/credentials';
import {
  isUrlInsideBackend,
  normalizeHttpUrl,
  normalizeVirtualPath,
  safeDecodeURIComponent,
} from '@/lib/security';

export interface BackendRecord {
  id: number;
  url: string;
  authEnabled: number;
  username?: string;
  password?: string;
  rescanInterval?: number;
  scannedAt?: string;
}

const MAX_SCAN_ENTRIES = Number(
  process.env.FILE_NODE_MAX_SCAN_ENTRIES ??
    process.env.LIBRIX_MAX_SCAN_ENTRIES ??
    100000
);
const MAX_SCAN_DEPTH = Number(
  process.env.FILE_NODE_MAX_SCAN_DEPTH ??
    process.env.LIBRIX_MAX_SCAN_DEPTH ??
    32
);
const FETCH_TIMEOUT_MS = Number(
  process.env.FILE_NODE_SCAN_TIMEOUT_MS ??
    process.env.LIBRIX_SCAN_TIMEOUT_MS ??
    15000
);

function withTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function getAuthHeader(backend: BackendRecord) {
  if (backend.authEnabled !== 1 || !backend.username || !backend.password) {
    return undefined;
  }

  const password = revealSecret(backend.password);
  if (!password) return undefined;

  return `Basic ${Buffer.from(`${backend.username}:${password}`).toString('base64')}`;
}

async function fetchHtml(url: string, authHeader?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: authHeader ? { Authorization: authHeader } : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Backend returned ${res.status} while scanning ${url}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().includes('text/html')) {
      throw new Error(`Backend did not return an HTML directory listing for ${url}`);
    }

    return res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function toDisplayName(virtualPath: string, isDirectory: boolean) {
  const trimmed = isDirectory
    ? virtualPath.replace(/\/$/, '')
    : virtualPath;
  return safeDecodeURIComponent(pathPosix.basename(trimmed));
}

function toVirtualPath(urlObj: URL, backendRoot: URL, isDirectory: boolean) {
  const basePath = withTrailingSlash(backendRoot.pathname);
  const pathname = urlObj.pathname;
  if (!pathname.startsWith(basePath)) return null;

  let relativePath = pathname.slice(basePath.length).replace(/^\/+/, '');
  if (!relativePath) return null;

  relativePath = pathPosix.normalize(`/${relativePath}`);
  if (!relativePath.startsWith('/')) relativePath = `/${relativePath}`;
  if (isDirectory && !relativePath.endsWith('/')) relativePath += '/';

  return relativePath;
}

export async function scanBackendById(id: number) {
  const row = db
    .prepare('SELECT id, url, authEnabled, username, password, rescanInterval, scannedAt FROM backends WHERE id = ?')
    .get(id) as BackendRecord | undefined;
  if (!row) throw new Error('Backend not found');
  const backend: BackendRecord = row;
  const normalizedUrl = normalizeHttpUrl(backend.url);
  if (!normalizedUrl) throw new Error('Backend URL must be http or https');

  const backendRoot = new URL(withTrailingSlash(normalizedUrl));
  const authHeader = getAuthHeader(backend);
  const scanStartedAt = new Date().toISOString();
  const seenDirs = new Set<string>();
  let scannedEntries = 0;

  async function recurse(dirPath: string, depth = 0) {
    if (scannedEntries >= MAX_SCAN_ENTRIES) return;
    if (depth > MAX_SCAN_DEPTH) return;

    let normalizedDirPath = normalizeVirtualPath(dirPath);
    if (!normalizedDirPath.endsWith('/')) normalizedDirPath += '/';
    if (seenDirs.has(normalizedDirPath)) return;
    seenDirs.add(normalizedDirPath);

    const listUrl = new URL(
      normalizedDirPath
        .slice(1)
        .split('/')
        .map((part) => part)
        .join('/'),
      backendRoot
    ).toString();
    const $ = cheerio.load(await fetchHtml(listUrl, authHeader));
    const childDirs: string[] = [];

    $('a').each((_, el) => {
      if (scannedEntries >= MAX_SCAN_ENTRIES) return false;
      const href = $(el).attr('href');
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('?') ||
        href.startsWith('..') ||
        href.startsWith('mailto:')
      ) {
        return;
      }

      const isDir = href.endsWith('/');
      const urlObj = new URL(href, listUrl);
      urlObj.hash = '';

      if (
        (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') ||
        !isUrlInsideBackend(urlObj.toString(), backendRoot.toString()) ||
        urlObj.toString() === listUrl
      ) {
        return;
      }

      const filePath = toVirtualPath(urlObj, backendRoot, isDir);
      if (!filePath || filePath === normalizedDirPath) return;

      const remainder = filePath
        .slice(normalizedDirPath.length)
        .replace(/\/$/, '');
      if (!remainder || remainder.includes('/')) return;

      db.prepare(`
        INSERT INTO files
          (backendId, path, name, url, isDirectory, scannedAt)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(backendId, path)
        DO UPDATE SET
          name = excluded.name,
          url = excluded.url,
          isDirectory = excluded.isDirectory,
          scannedAt = excluded.scannedAt
      `).run(
        backend.id,
        filePath,
        toDisplayName(filePath, isDir),
        urlObj.toString(),
        isDir ? 1 : 0,
        scanStartedAt
      );

      scannedEntries++;
      if (isDir) childDirs.push(filePath);
    });

    for (const sub of childDirs) {
      await recurse(sub, depth + 1);
    }
  }

  await recurse('/');
  db.prepare('DELETE FROM files WHERE backendId = ? AND scannedAt != ?').run(
    backend.id,
    scanStartedAt
  );
  db.prepare('UPDATE backends SET scannedAt = ? WHERE id = ?').run(
    scanStartedAt,
    id
  );
}

export async function scanAllDue(): Promise<void> {
  const rows = db
    .prepare(`
      SELECT id, rescanInterval, scannedAt
        FROM backends
       WHERE rescanInterval IS NOT NULL
         AND rescanInterval > 0
       ORDER BY id
    `)
    .all() as { id: number }[];
  const now = Date.now();

  for (const row of rows as {
    id: number;
    rescanInterval: number;
    scannedAt: string | null;
  }[]) {
    const scannedAt = row.scannedAt ? Date.parse(row.scannedAt) : 0;
    const dueAt = scannedAt + row.rescanInterval * 60_000;
    if (scannedAt && dueAt > now) continue;

    const { id } = row;
    await scanBackendById(id);
  }
}
