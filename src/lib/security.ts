export function normalizeHttpUrl(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function normalizeVirtualPath(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '/';

  let normalized = value.trim().replace(/\\/g, '/');
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/{2,}/g, '/');

  const parts = normalized.split('/').filter((part) => part && part !== '.');
  const safeParts: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      safeParts.pop();
    } else {
      safeParts.push(part);
    }
  }

  return `/${safeParts.join('/')}${normalized.endsWith('/') && safeParts.length ? '/' : ''}`;
}

export function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function isUrlInsideBackend(fileUrl: string, backendUrl: string) {
  try {
    const file = new URL(fileUrl);
    const backend = new URL(backendUrl);
    if (file.origin !== backend.origin) return false;

    const basePath = backend.pathname.endsWith('/')
      ? backend.pathname
      : `${backend.pathname}/`;
    const filePath = file.pathname.endsWith('/')
      ? file.pathname
      : `${file.pathname}/`;

    return filePath.startsWith(basePath);
  } catch {
    return false;
  }
}

export function safeContentType(contentType: string | null) {
  if (!contentType) return 'application/octet-stream';

  const mime = contentType.split(';')[0]?.trim().toLowerCase() || '';
  if (
    mime === 'application/pdf' ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'text/plain' ||
    mime === 'text/csv' ||
    mime.startsWith('image/') ||
    mime.startsWith('audio/') ||
    mime.startsWith('video/')
  ) {
    return contentType;
  }

  if (mime.startsWith('text/')) {
    return 'text/plain; charset=utf-8';
  }

  return 'application/octet-stream';
}
