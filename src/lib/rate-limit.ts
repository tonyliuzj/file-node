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

/** Set by the server on every request from the socket itself; see lib/peer-address.ts. */
export const PEER_HEADER = 'x-file-node-peer';

type AddressInfo = { id: string; isPublic: boolean };

function parseIPv4(address: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function isPublicIPv4([a, b, c]: number[]) {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this-net, private, loopback, multicast/reserved
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

/** Eight 16-bit groups of an IPv6 address, or null when it does not parse. */
function parseIPv6(input: string) {
  let address = input.split('%')[0].toLowerCase();

  const embedded = /(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (embedded) {
    const v4 = parseIPv4(embedded[1]);
    if (!v4) return null;
    address =
      address.slice(0, -embedded[1].length) +
      ((v4[0] << 8) | v4[1]).toString(16) +
      ':' +
      ((v4[2] << 8) | v4[3]).toString(16);
  }

  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

  const groups = [...head, ...Array<string>(Math.max(missing, 0)).fill('0'), ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

/**
 * Canonical id for an address, and whether it names an individual internet client. IPv6 clients
 * hold a whole /64 and rotate addresses inside it, so they are identified by that prefix.
 */
export function describeAddress(raw: string): AddressInfo {
  const text = raw.trim().replace(/^\[|\]$/g, '');

  const v4 = parseIPv4(text);
  if (v4) return { id: text, isPublic: isPublicIPv4(v4) };

  const groups = parseIPv6(text);
  if (!groups) return { id: text || 'unknown', isPublic: false };

  // ::ffff:a.b.c.d is an IPv4 client seen through a dual-stack socket.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const mapped = [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255];
    return { id: mapped.join('.'), isPublic: isPublicIPv4(mapped) };
  }

  const first = groups[0];
  const unspecifiedOrLoopback = groups.slice(0, 7).every((g) => g === 0) && groups[7] <= 1;
  const isPublic =
    !unspecifiedOrLoopback &&
    (first & 0xfe00) !== 0xfc00 && // unique local
    (first & 0xffc0) !== 0xfe80 && // link-local
    (first & 0xff00) !== 0xff00 && // multicast
    !(first === 0x2001 && groups[1] === 0x0db8); // documentation
  return { id: `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`, isPublic };
}

/**
 * The caller's real address as far as it can be believed, or null.
 *
 * Behind a proxy you declare with FILE_NODE_TRUST_PROXY=1: Cloudflare's header, then X-Real-IP,
 * then the LAST X-Forwarded-For entry. Proxies append the address they saw, so the first entry is
 * whatever the client chose to claim.
 *
 * Otherwise address headers are plain text any client can send and are ignored. The server stamps
 * the real socket address on each request (PEER_HEADER) and a public one is believed. A private,
 * loopback or link-local one usually means a proxy, Docker's gateway or a NAT sits in between and
 * hides who is calling, so it says nothing about the individual.
 */
export function trustedClientAddress(headers: HeaderBag): string | null {
  if (trustsProxy()) {
    const forwarded = readHeader(headers, 'x-forwarded-for')
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    return (
      readHeader(headers, 'cf-connecting-ip')?.trim() ||
      readHeader(headers, 'x-real-ip')?.trim() ||
      forwarded?.[forwarded.length - 1] ||
      null
    );
  }

  // Only believe the stamp if this process installed the hook that overwrites it on every request;
  // otherwise a client could simply send the header itself.
  if (!(globalThis as { __fileNodePeerHook?: boolean }).__fileNodePeerHook) return null;
  const peer = readHeader(headers, PEER_HEADER);
  return peer && describeAddress(peer).isPublic ? peer : null;
}

/**
 * Identifies the caller for limits, throttles and clearances. Callers whose address cannot be
 * believed share one "direct" bucket, with proportionally higher limits, rather than being lumped
 * together as if they were a single abusive client.
 */
export function clientIdFromHeaders(headers: HeaderBag) {
  const address = trustedClientAddress(headers);
  if (address) return describeAddress(address).id;
  return trustsProxy() ? 'unknown' : 'direct';
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
