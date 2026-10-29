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

/** True when the operator says a reverse proxy sets the client-address headers. */
export function trustsProxy() {
  return process.env.FILE_NODE_TRUST_PROXY === '1';
}

/**
 * Identifies the caller for limits and clearances. Address headers are plain text any client can
 * send, so they are believed only when FILE_NODE_TRUST_PROXY=1 says a proxy in front overwrites
 * them. Without that, everyone is one shared "direct" client and per-client limits become global
 * caps, which still protect the server, just less finely.
 *
 * With a proxy: Cloudflare's header, then X-Real-IP, then the LAST X-Forwarded-For entry. Proxies
 * append the address they saw, so the first entry is whatever the client chose to claim.
 */
export function clientIdFromHeaders(headers: HeaderBag) {
  if (!trustsProxy()) return 'direct';

  const forwarded = readHeader(headers, 'x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    readHeader(headers, 'cf-connecting-ip')?.trim() ||
    readHeader(headers, 'x-real-ip')?.trim() ||
    forwarded?.[forwarded.length - 1] ||
    'unknown'
  );
}

/** Counts a request against a fixed window; returns seconds to wait when over the limit, else 0. */
export function takeToken(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  bucket.count += 1;
  return bucket.count > limit ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
}

type PublicLimitName = 'search' | 'explorer' | 'view' | 'backends' | 'verify';

// Requests per client per minute. Without a trusted proxy everyone shares one bucket, so the same
// numbers are multiplied to keep ordinary use of a small instance comfortable.
const PUBLIC_LIMITS: Record<PublicLimitName, number> = {
  search: 60,
  explorer: 120,
  view: 600,
  backends: 120,
  verify: 20,
};
const SHARED_BUCKET_MULTIPLIER = 10;

/** Returns a 429 response when the caller is over the limit for this endpoint, else null. */
export function publicRateLimit(request: Request, name: PublicLimitName) {
  const client = clientIdFromHeaders(request.headers);
  const limit = PUBLIC_LIMITS[name] * (client === 'direct' ? SHARED_BUCKET_MULTIPLIER : 1);
  const wait = takeToken(`public:${name}:${client}`, limit, 60_000);
  if (wait === 0) return null;

  return new Response(JSON.stringify({ error: 'Too many requests. Slow down and try again shortly.' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(wait) },
  });
}
