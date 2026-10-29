import crypto from 'crypto';
import { cookies, headers as requestHeaders } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { getPersistentSecret, protectSecret, revealSecret } from '@/lib/credentials';
import { TURNSTILE_CLEARANCE_HEADER } from '@/lib/turnstile-shared';
import { clientIdFromHeaders, trustsProxy } from '@/lib/rate-limit';

export type TurnstileArea = 'browse' | 'search' | 'adminLogin';

export type TurnstileSettings = {
  siteKey: string;
  hasSecretKey: boolean;
  /** True when FILE_NODE_DISABLE_TURNSTILE forces every check off, whatever is saved. */
  disabledByEnv: boolean;
  requireBrowse: boolean;
  requireSearch: boolean;
  requireAdminLogin: boolean;
  clearanceMinutes: number;
  configured: boolean;
};

type StoredSetting = {
  key: string;
  value: string | null;
};

const SETTING_KEYS = {
  siteKey: 'turnstile.siteKey',
  secretKey: 'turnstile.secretKey',
  requireBrowse: 'turnstile.requireBrowse',
  requireSearch: 'turnstile.requireSearch',
  requireAdminLogin: 'turnstile.requireAdminLogin',
  clearanceMinutes: 'turnstile.clearanceMinutes',
} as const;

const CLEARANCE_COOKIE_PREFIX = 'file_node_turnstile_';
const DEFAULT_CLEARANCE_MINUTES = 0;
const MIN_CLEARANCE_MINUTES = 0;
const MAX_CLEARANCE_MINUTES = 60 * 24;
const CLEARANCE_CLOCK_SKEW_MS = 10 * 1000;
const TRANSIENT_CLEARANCE_SECONDS = 60 * 60;
const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_REQUEST_TIMEOUT_MS = 10_000;

// Escape hatch for a lockout: a wrong site key makes the sign-in widget unusable, and sign-in is
// what you would need to fix it. Set FILE_NODE_DISABLE_TURNSTILE=1, restart, fix the settings.
function isDisabledByEnv() {
  return process.env.FILE_NODE_DISABLE_TURNSTILE === '1';
}

function getSettingsMap() {
  const rows = db
    .prepare('SELECT key, value FROM settings WHERE key LIKE ?')
    .all('turnstile.%') as StoredSetting[];

  return new Map(rows.map((row) => [row.key, row.value || '']));
}

function setSetting(key: string, value: string | null) {
  if (value === null || value === '') {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    return;
  }

  db.prepare(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function boolFromSetting(value: string | null | undefined) {
  return value === '1';
}

function boolToSetting(value: boolean) {
  return value ? '1' : '0';
}

function normalizeClearanceMinutes(value: unknown) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return DEFAULT_CLEARANCE_MINUTES;
  return Math.min(
    MAX_CLEARANCE_MINUTES,
    Math.max(MIN_CLEARANCE_MINUTES, Math.floor(minutes))
  );
}

export function getTurnstileSecretKey() {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(SETTING_KEYS.secretKey) as { value: string | null } | undefined;

  return revealSecret(row?.value);
}

export function getTurnstileSettings(): TurnstileSettings {
  const settings = getSettingsMap();
  const siteKey = settings.get(SETTING_KEYS.siteKey)?.trim() || '';
  const hasSecretKey = Boolean(getTurnstileSecretKey());

  return {
    siteKey,
    hasSecretKey,
    disabledByEnv: isDisabledByEnv(),
    requireBrowse: boolFromSetting(settings.get(SETTING_KEYS.requireBrowse)),
    requireSearch: boolFromSetting(settings.get(SETTING_KEYS.requireSearch)),
    requireAdminLogin: boolFromSetting(settings.get(SETTING_KEYS.requireAdminLogin)),
    clearanceMinutes: normalizeClearanceMinutes(
      settings.get(SETTING_KEYS.clearanceMinutes)
    ),
    configured: Boolean(siteKey && hasSecretKey),
  };
}

export function updateTurnstileSettings(input: {
  siteKey?: string;
  secretKey?: string;
  clearSecretKey?: boolean;
  requireBrowse?: boolean;
  requireSearch?: boolean;
  requireAdminLogin?: boolean;
  clearanceMinutes?: number;
}) {
  const siteKey =
    typeof input.siteKey === 'string' ? input.siteKey.trim() : undefined;
  const secretKey =
    typeof input.secretKey === 'string' ? input.secretKey.trim() : undefined;

  if (siteKey !== undefined) {
    setSetting(SETTING_KEYS.siteKey, siteKey || null);
  }

  // Clearing and replacing in one save means "replace", so apply the clear first.
  if (input.clearSecretKey) {
    setSetting(SETTING_KEYS.secretKey, null);
  }
  if (secretKey) {
    setSetting(SETTING_KEYS.secretKey, protectSecret(secretKey));
  }

  if (typeof input.requireBrowse === 'boolean') {
    setSetting(SETTING_KEYS.requireBrowse, boolToSetting(input.requireBrowse));
  }
  if (typeof input.requireSearch === 'boolean') {
    setSetting(SETTING_KEYS.requireSearch, boolToSetting(input.requireSearch));
  }
  if (typeof input.requireAdminLogin === 'boolean') {
    setSetting(
      SETTING_KEYS.requireAdminLogin,
      boolToSetting(input.requireAdminLogin)
    );
  }
  if (typeof input.clearanceMinutes === 'number') {
    setSetting(
      SETTING_KEYS.clearanceMinutes,
      String(normalizeClearanceMinutes(input.clearanceMinutes))
    );
  }
}

export function isTurnstileRequired(area: TurnstileArea) {
  if (isDisabledByEnv()) return false;

  const settings = getTurnstileSettings();
  if (!settings.configured) return false;

  if (area === 'browse') return settings.requireBrowse;
  if (area === 'search') return settings.requireSearch;
  return settings.requireAdminLogin;
}

function getClearanceCookieName(area: TurnstileArea) {
  return `${CLEARANCE_COOKIE_PREFIX}${area}`;
}

// Ties a clearance to the client that earned it, so a copy handed to someone else (or to a fleet of
// bots) is refused. Only possible when a trusted proxy reveals the real client address; otherwise
// there is nothing reliable to bind to and the clearance is valid for any holder until it expires.
function clientBinding(headers: Headers) {
  if (!trustsProxy()) return '';
  return crypto
    .createHash('sha256')
    .update(clientIdFromHeaders(headers))
    .digest('hex')
    .slice(0, 16);
}

function signClearance(area: TurnstileArea, expiresAt: number, binding: string) {
  return crypto
    .createHmac('sha256', getPersistentSecret())
    .update(`${area}.${expiresAt}.${binding}`)
    .digest('base64url');
}

function getRememberedClearanceSeconds(settings = getTurnstileSettings()) {
  return settings.clearanceMinutes * 60;
}

function getValidationClearanceSeconds(settings = getTurnstileSettings()) {
  const rememberedSeconds = getRememberedClearanceSeconds(settings);
  return rememberedSeconds > 0 ? rememberedSeconds : TRANSIENT_CLEARANCE_SECONDS;
}

function createClearanceValue(
  area: TurnstileArea,
  maxAgeSeconds: number,
  binding: string
) {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  return `${expiresAt}.${signClearance(area, expiresAt, binding)}`;
}

function isClearanceValueValid(
  area: TurnstileArea,
  value: string | undefined,
  maxAgeSeconds: number,
  binding: string
) {
  if (!value) return false;
  const [expiresAtRaw, signature] = value.split('.');
  const expiresAt = Number(expiresAtRaw);
  const now = Date.now();
  const maxAgeMs = maxAgeSeconds * 1000;
  if (
    maxAgeSeconds <= 0 ||
    !Number.isFinite(expiresAt) ||
    !signature ||
    expiresAt < now ||
    expiresAt > now + maxAgeMs + CLEARANCE_CLOCK_SKEW_MS
  ) {
    return false;
  }

  const expected = signClearance(area, expiresAt, binding);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * For server-rendered pages. `passedClearance` is a clearance carried in the URL (the viewer page
 * is reached by a link, and a transient clearance lives only in the browser tab that earned it).
 */
export async function hasTurnstileClearance(
  area: TurnstileArea,
  passedClearance?: string
) {
  if (!isTurnstileRequired(area)) return true;
  const binding = clientBinding(await requestHeaders());

  if (
    passedClearance &&
    isClearanceValueValid(
      area,
      passedClearance,
      getValidationClearanceSeconds(),
      binding
    )
  ) {
    return true;
  }

  const rememberedSeconds = getRememberedClearanceSeconds();
  if (rememberedSeconds <= 0) return false;
  const cookieStore = await cookies();
  return isClearanceValueValid(
    area,
    cookieStore.get(getClearanceCookieName(area))?.value,
    rememberedSeconds,
    binding
  );
}

export function requestHasTurnstileClearance(
  request: NextRequest,
  area: TurnstileArea,
  passedClearance?: string
) {
  if (!isTurnstileRequired(area)) return true;
  const settings = getTurnstileSettings();
  const rememberedSeconds = getRememberedClearanceSeconds(settings);
  const headerClearance = request.headers.get(TURNSTILE_CLEARANCE_HEADER);
  const binding = clientBinding(request.headers);

  if (
    isClearanceValueValid(
      area,
      headerClearance || passedClearance || undefined,
      getValidationClearanceSeconds(settings),
      binding
    )
  ) {
    return true;
  }

  if (rememberedSeconds <= 0) return false;

  return isClearanceValueValid(
    area,
    request.cookies.get(getClearanceCookieName(area))?.value,
    rememberedSeconds,
    binding
  );
}

/** Areas whose protection is switched on, i.e. the ones a file stream has to answer to. */
export function protectedContentAreas() {
  return (['browse', 'search'] as const).filter((area) => isTurnstileRequired(area));
}

/**
 * Files are reached from both browse and search, so a valid clearance for any protected area opens
 * the stream. Media elements cannot send the clearance header, so it may also arrive as a
 * `clearance` query parameter or in the remembered-clearance cookie.
 */
export function requestHasStreamClearance(request: NextRequest) {
  const areas = protectedContentAreas();
  if (areas.length === 0) return true;

  const passed = request.nextUrl.searchParams.get('clearance') || undefined;
  return areas.some((area) => requestHasTurnstileClearance(request, area, passed));
}

export function createTurnstileClearance(area: TurnstileArea, headers: Headers) {
  return createClearanceValue(
    area,
    getValidationClearanceSeconds(),
    clientBinding(headers)
  );
}

export function setTurnstileClearance(
  response: NextResponse,
  area: TurnstileArea,
  value: string
) {
  const maxAge = getRememberedClearanceSeconds();
  if (maxAge <= 0) {
    response.cookies.set(getClearanceCookieName(area), '', {
      path: '/',
      maxAge: 0,
    });
    return;
  }

  response.cookies.set(getClearanceCookieName(area), value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string | null
) {
  const secretKey = getTurnstileSecretKey();
  if (!secretKey) {
    return { success: false, error: 'Turnstile secret key is not configured' };
  }
  if (!token) {
    return { success: false, error: 'Turnstile verification is required' };
  }

  const body = new URLSearchParams();
  body.set('secret', secretKey);
  body.set('response', token);
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TURNSTILE_REQUEST_TIMEOUT_MS),
    });

    const result = (await response.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: 'Turnstile verification failed',
        codes: result['error-codes'] || [],
      };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Unable to verify Turnstile token' };
  }
}

/**
 * Asks Cloudflare whether a secret key is real. A made-up token is submitted on purpose: a valid
 * secret answers "invalid response", a wrong one answers "invalid secret".
 */
export async function checkTurnstileSecret(
  secretKey: string
): Promise<'valid' | 'invalid' | 'unreachable'> {
  const body = new URLSearchParams();
  body.set('secret', secretKey);
  body.set('response', 'file-node-key-check');

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TURNSTILE_REQUEST_TIMEOUT_MS),
    });
    const result = (await response.json()) as { 'error-codes'?: string[] };
    const codes = result['error-codes'] || [];
    return codes.includes('invalid-input-secret') ||
      codes.includes('missing-input-secret')
      ? 'invalid'
      : 'valid';
  } catch {
    return 'unreachable';
  }
}

/** The caller's address for Cloudflare's check, only when a trusted proxy makes it believable. */
export function getRequestIp(request: NextRequest) {
  return trustsProxy() ? clientIdFromHeaders(request.headers) : null;
}
