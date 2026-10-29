// In-memory failure counters for credential endpoints. State lives on globalThis so route handlers
// and the auth callbacks share it even when the bundler gives each its own module copy. A restart
// resets the counters, which is acceptable for a single-process self-hosted app.

type Bucket = { count: number; resetAt: number };

const globalStore = globalThis as typeof globalThis & {
  __fileNodeRateLimits?: Map<string, Bucket>;
};
const buckets = (globalStore.__fileNodeRateLimits ??= new Map<string, Bucket>());

const MAX_TRACKED_KEYS = 10_000;

function prune(now: number) {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Still full of live entries (someone is spraying keys): drop the oldest rather than grow.
  while (buckets.size >= MAX_TRACKED_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

/** Seconds until a blocked key may try again, or 0 when it is not blocked. */
export function retryAfterSeconds(key: string, limit: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return 0;
  return bucket.count >= limit ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
}

/** Records one failed attempt; the window starts at the first failure. */
export function recordFailure(key: string, windowMs: number) {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    bucket.count += 1;
  }
}

export function clearFailures(key: string) {
  buckets.delete(key);
}

type HeaderBag =
  | Headers
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

function readHeader(headers: HeaderBag, name: string) {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Best-effort client address. These headers are only trustworthy behind a reverse proxy that sets
 * them, so callers pair this with a per-account limit that does not depend on it.
 */
export function clientIpFromHeaders(headers: HeaderBag) {
  return (
    readHeader(headers, 'cf-connecting-ip') ||
    readHeader(headers, 'x-real-ip') ||
    readHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
