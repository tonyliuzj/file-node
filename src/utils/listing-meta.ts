// Parsing for the size and modified-time columns of HTML directory listings. Kept free of
// dependencies so it can be exercised on its own.
//
// Listings carry local server time without a zone, so times are taken as UTC. They are right to
// the minute only when the backend runs in UTC.

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function buildUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
) {
  if (hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  // Reject overflow such as February 31st, which Date would quietly roll into March.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

function time(parts: (string | undefined)[]) {
  const [hour, minute, second] = parts.map((part) =>
    part === undefined ? undefined : Number(part)
  );
  return [hour ?? 0, minute ?? 0, second ?? 0] as const;
}

function monthIndex(name: string) {
  return MONTHS[name.slice(0, 3).toLowerCase()];
}

export function parseListingDate(input: string): string | null {
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  // Full ISO timestamps (Caddy, h5ai) may carry their own zone.
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  let match: RegExpExecArray | null;

  // 2024-03-12 10:22[:33]  (Apache, Lighttpd variants, Python)
  match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (match) {
    return buildUtc(Number(match[1]), Number(match[2]) - 1, Number(match[3]), ...time(match.slice(4)));
  }

  // 12-Mar-2024 10:22[:33]  (nginx)
  match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (match && monthIndex(match[2]) !== undefined) {
    return buildUtc(Number(match[3]), monthIndex(match[2]), Number(match[1]), ...time(match.slice(4)));
  }

  // 2024-Mar-12 10:22:33  (Lighttpd)
  match = /^(\d{4})-([A-Za-z]{3})-(\d{1,2})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (match && monthIndex(match[2]) !== undefined) {
    return buildUtc(Number(match[1]), monthIndex(match[2]), Number(match[3]), ...time(match.slice(4)));
  }

  // Mar 12 2024 10:22  /  Mar 12, 2024
  match = /^([A-Za-z]{3,9}) (\d{1,2}),? (\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (match && monthIndex(match[1]) !== undefined) {
    return buildUtc(Number(match[3]), monthIndex(match[1]), Number(match[2]), ...time(match.slice(4)));
  }

  // 12 Mar 2024 10:22
  match = /^(\d{1,2}) ([A-Za-z]{3,9}) (\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (match && monthIndex(match[2]) !== undefined) {
    return buildUtc(Number(match[3]), monthIndex(match[2]), Number(match[1]), ...time(match.slice(4)));
  }

  return null;
}

const UNIT_POWERS: Record<string, number> = { '': 0, K: 1, M: 2, G: 3, T: 4, P: 5 };

/** Bytes from "1234", "1.2K", "512.0B", "3 MiB", "1,234"; null for "-", blanks and anything else. */
export function parseListingSize(input: string): number | null {
  const text = input.replace(/ /g, ' ').trim();
  if (!text || text === '-') return null;

  const plain = /^\d{1,3}(?:,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text;
  const match = /^(\d+(?:\.\d+)?)\s*([KMGTP]?)(?:i?B)?$/i.exec(plain);
  if (!match) return null;

  const value = Number(match[1]);
  const power = UNIT_POWERS[match[2].toUpperCase()];
  const bytes = Math.round(value * 1024 ** power);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

/**
 * Splits the text that follows a link in a `<pre>` listing ("  12-Mar-2024 10:22   1234") into its
 * modified time and size.
 */
export function parseTrailingMeta(input: string) {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  let modifiedAt: string | null = null;
  let rest = tokens;

  if (tokens.length >= 2) {
    const withTime = parseListingDate(`${tokens[0]} ${tokens[1]}`);
    if (withTime) {
      modifiedAt = withTime;
      rest = tokens.slice(2);
    }
  }
  if (!modifiedAt && tokens.length >= 1) {
    const dateOnly = parseListingDate(tokens[0]);
    if (dateOnly) {
      modifiedAt = dateOnly;
      rest = tokens.slice(1);
    }
  }

  const size = rest.length ? parseListingSize(rest[rest.length - 1]) : null;
  return { modifiedAt, size };
}
