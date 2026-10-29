// src/utils/scanner.ts
import fetch from 'node-fetch';
import type { Response } from 'node-fetch';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import db from './db';
import { posix as pathPosix } from 'path';
import { revealSecret } from '@/lib/credentials';
import {
  isUrlInsideBackend,
  normalizeHttpUrl,
  normalizeVirtualPath,
  safeDecodeURIComponent,
} from '@/lib/security';
import {
  parseListingDate,
  parseListingSize,
  parseTrailingMeta,
} from './listing-meta';

export interface BackendRecord {
  id: number;
  url: string;
  authEnabled: number;
  username?: string;
  password?: string;
  rescanInterval?: number;
  scannedAt?: string;
}

function numberFromEnv(names: string[], fallback: number) {
  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

const MAX_SCAN_ENTRIES = numberFromEnv(
  ['FILE_NODE_MAX_SCAN_ENTRIES', 'LIBRIX_MAX_SCAN_ENTRIES'],
  100000
);
const MAX_SCAN_DEPTH = numberFromEnv(
  ['FILE_NODE_MAX_SCAN_DEPTH', 'LIBRIX_MAX_SCAN_DEPTH'],
  32
);
const FETCH_TIMEOUT_MS = numberFromEnv(
  ['FILE_NODE_SCAN_TIMEOUT_MS', 'LIBRIX_SCAN_TIMEOUT_MS'],
  15000
);
// The scheduler wakes once a minute, and a scan is stamped a few milliseconds after the tick that
// started it. Without slack, an interval of N minutes would quietly run every N+1.
const SCHEDULER_SLACK_MS = 5_000;
// A single directory listing larger than this is not a listing worth holding in memory.
const MAX_LISTING_BYTES = 32 * 1024 * 1024;
const IGNORED_SCAN_PATH_PREFIXES = ['/cgi-bin/'];

// The cron job and the API routes can be bundled separately, so the bookkeeping lives on
// globalThis to make "is this backend already being scanned" a single shared answer.
type ScannerState = {
  running: Map<number, Promise<void>>;
  schedulerBusy: boolean;
};
const globalScanner = globalThis as typeof globalThis & {
  __fileNodeScanner?: ScannerState;
};
const state = (globalScanner.__fileNodeScanner ??= {
  running: new Map(),
  schedulerBusy: false,
});

type FileRow = {
  path: string;
  name: string;
  url: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: string | null;
};

const upsertFile = db.prepare(`
  INSERT INTO files
    (backendId, path, name, url, isDirectory, size, modifiedAt, scannedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(backendId, path)
  DO UPDATE SET
    name = excluded.name,
    url = excluded.url,
    isDirectory = excluded.isDirectory,
    size = excluded.size,
    modifiedAt = excluded.modifiedAt,
    scannedAt = excluded.scannedAt
`);

const saveDirectory = db.transaction(
  (backendId: number, scanStartedAt: string, rows: FileRow[]) => {
    for (const row of rows) {
      upsertFile.run(
        backendId,
        row.path,
        row.name,
        row.url,
        row.isDirectory ? 1 : 0,
        row.size,
        row.modifiedAt,
        scanStartedAt
      );
    }
  }
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

async function readTextWithLimit(res: Response, limit: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body as AsyncIterable<Buffer | string>) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += buffer.length;
    if (total > limit) {
      throw new Error('Directory listing is too large to index');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
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

    return await readTextWithLimit(res, MAX_LISTING_BYTES);
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

function isIgnoredScanPath(virtualPath: string) {
  const normalizedPath = virtualPath.endsWith('/')
    ? virtualPath
    : `${virtualPath}/`;
  return IGNORED_SCAN_PATH_PREFIXES.some((prefix) =>
    normalizedPath.startsWith(prefix)
  );
}

/**
 * Reads size and modified time out of the markup around a link. Table listings (Apache, Lighttpd)
 * keep them in the sibling cells of the row; `<pre>` listings (nginx, older Apache) keep them in
 * the text after the link. Anything else (for example Python's bare `<ul>`) has none.
 */
function extractListingMeta($: cheerio.CheerioAPI, el: Element) {
  const anchor = $(el);
  const row = anchor.closest('tr');

  if (row.length) {
    let size: number | null = null;
    let modifiedAt: string | null = null;

    for (const cell of row.children('td, th').toArray()) {
      if ($(cell).find(el).length) continue;
      const text = $(cell).text().replace(/ /g, ' ').trim();
      if (!text) continue;

      if (!modifiedAt) {
        const parsed = parseListingDate(text);
        if (parsed) {
          modifiedAt = parsed;
          continue;
        }
      }
      if (size === null) {
        size = parseListingSize(text);
      }
    }
    return { size, modifiedAt };
  }

  if (anchor.closest('pre').length) {
    let text = '';
    let node = el.next;
    while (node) {
      if (node.type === 'text') {
        const chunk = (node as unknown as { data: string }).data;
        const newline = chunk.indexOf('\n');
        if (newline >= 0) {
          text += chunk.slice(0, newline);
          break;
        }
        text += chunk;
      } else if (node.type === 'tag') {
        const name = (node as unknown as { name: string }).name;
        if (name === 'a' || name === 'br') break;
        text += $(node).text();
      }
      node = node.next;
    }
    return parseTrailingMeta(text);
  }

  return { size: null, modifiedAt: null };
}

async function crawlBackend(id: number, scanStartedAt: string) {
  const row = db
    .prepare('SELECT id, url, authEnabled, username, password, rescanInterval, scannedAt FROM backends WHERE id = ?')
    .get(id) as BackendRecord | undefined;
  if (!row) throw new Error('Backend not found');
  const backend: BackendRecord = row;
  const normalizedUrl = normalizeHttpUrl(backend.url);
  if (!normalizedUrl) {
    throw new Error('Backend URL must be http or https without embedded credentials');
  }

  const backendRoot = new URL(withTrailingSlash(normalizedUrl));
  const authHeader = getAuthHeader(backend);
  const seenDirs = new Set<string>();
  let scannedEntries = 0;
  let truncated = false;

  async function recurse(dirPath: string, depth = 0) {
    if (scannedEntries >= MAX_SCAN_ENTRIES || depth > MAX_SCAN_DEPTH) {
      truncated = true;
      return;
    }

    let normalizedDirPath = normalizeVirtualPath(dirPath);
    if (!normalizedDirPath.endsWith('/')) normalizedDirPath += '/';
    if (seenDirs.has(normalizedDirPath)) return;
    seenDirs.add(normalizedDirPath);

    const listUrl = new URL(normalizedDirPath.slice(1), backendRoot).toString();
    const $ = cheerio.load(await fetchHtml(listUrl, authHeader));
    const rows: FileRow[] = [];
    const childDirs: string[] = [];

    $('a').each((_, el) => {
      if (scannedEntries >= MAX_SCAN_ENTRIES) {
        truncated = true;
        return false;
      }
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
      let urlObj: URL;
      try {
        urlObj = new URL(href, listUrl);
      } catch {
        // One malformed link must not abort the whole scan.
        return;
      }
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
      if (isIgnoredScanPath(filePath)) return;

      const remainder = filePath
        .slice(normalizedDirPath.length)
        .replace(/\/$/, '');
      if (!remainder || remainder.includes('/')) return;

      const meta = extractListingMeta($, el);
      rows.push({
        path: filePath,
        name: toDisplayName(filePath, isDir),
        url: urlObj.toString(),
        isDirectory: isDir,
        // Directories report "-" for size in every listing format.
        size: isDir ? null : meta.size,
        modifiedAt: meta.modifiedAt,
      });

      scannedEntries++;
      if (isDir) childDirs.push(filePath);
    });

    saveDirectory(backend.id, scanStartedAt, rows);

    for (const sub of childDirs) {
      await recurse(sub, depth + 1);
    }
  }

  await recurse('/');
  if (truncated) {
    console.warn(
      `Scan of backend ${id} stopped at its limits (${MAX_SCAN_ENTRIES} entries, depth ${MAX_SCAN_DEPTH}); entries beyond them are not indexed.`
    );
  }

  // Only a scan that finished removes what it did not see, so a failed scan never empties the index.
  db.prepare('DELETE FROM files WHERE backendId = ? AND scannedAt != ?').run(
    backend.id,
    scanStartedAt
  );
}

async function performScan(id: number) {
  const startedAt = new Date().toISOString();

  try {
    await crawlBackend(id, startedAt);
    db.prepare(
      'UPDATE backends SET scannedAt = ?, scanAttemptedAt = ?, scanError = NULL WHERE id = ?'
    ).run(startedAt, startedAt, id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Scan failed for an unknown reason';
    db.prepare(
      'UPDATE backends SET scanAttemptedAt = ?, scanError = ? WHERE id = ?'
    ).run(new Date().toISOString(), message.slice(0, 500), id);
    throw error;
  }
}

/** Runs a scan, or joins the one already running, so two scans of a backend never overlap. */
function trackScan(id: number): Promise<void> {
  const existing = state.running.get(id);
  if (existing) return existing;

  const promise = performScan(id).finally(() => {
    state.running.delete(id);
  });
  state.running.set(id, promise);
  return promise;
}

export function isScanning(id: number) {
  return state.running.has(id);
}

export function scanningBackendIds() {
  return [...state.running.keys()];
}

export function backendExists(id: number) {
  return Boolean(db.prepare('SELECT 1 FROM backends WHERE id = ?').get(id));
}

/**
 * Starts a scan in the background and returns at once, because scanning a large backend takes
 * longer than a browser or reverse proxy will wait for a response.
 */
export function startBackendScan(id: number): 'started' | 'already-running' {
  if (!backendExists(id)) throw new Error('Backend not found');
  if (state.running.has(id)) return 'already-running';

  trackScan(id).catch((error: unknown) => {
    console.error(`Scan of backend ${id} failed:`, error);
  });
  return 'started';
}

export async function scanBackendById(id: number) {
  if (!backendExists(id)) throw new Error('Backend not found');
  await trackScan(id);
}

export async function scanAllDue(): Promise<void> {
  // The cron job fires every minute; a slow pass must not be joined by a second one.
  if (state.schedulerBusy) return;
  state.schedulerBusy = true;

  try {
    const rows = db
      .prepare(`
        SELECT id, rescanInterval, scannedAt, scanAttemptedAt
          FROM backends
         WHERE rescanInterval IS NOT NULL
           AND rescanInterval > 0
         ORDER BY id
      `)
      .all() as {
      id: number;
      rescanInterval: number;
      scannedAt: string | null;
      scanAttemptedAt: string | null;
    }[];
    const now = Date.now();

    for (const row of rows) {
      if (state.running.has(row.id)) continue;

      // A failed attempt counts too, so a broken backend is retried once per interval instead of
      // every minute.
      const lastAttempt = Math.max(
        row.scannedAt ? Date.parse(row.scannedAt) || 0 : 0,
        row.scanAttemptedAt ? Date.parse(row.scanAttemptedAt) || 0 : 0
      );
      const dueAt = lastAttempt + row.rescanInterval * 60_000;
      if (lastAttempt && dueAt - SCHEDULER_SLACK_MS > now) continue;

      // One failing backend must not stop the others from being scanned.
      try {
        await trackScan(row.id);
      } catch (error) {
        console.error(`Scheduled scan of backend ${row.id} failed:`, error);
      }
    }
  } finally {
    state.schedulerBusy = false;
  }
}
