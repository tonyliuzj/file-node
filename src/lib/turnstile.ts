import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { getPersistentSecret, protectSecret, revealSecret } from '@/lib/credentials';

export type TurnstileArea = 'browse' | 'search' | 'adminLogin';

export type TurnstileSettings = {
  siteKey: string;
  hasSecretKey: boolean;
  requireBrowse: boolean;
  requireSearch: boolean;
  requireAdminLogin: boolean;
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
} as const;

const CLEARANCE_COOKIE_PREFIX = 'file_node_turnstile_';
const CLEARANCE_MAX_AGE_SECONDS = 60 * 60 * 12;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

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
    requireBrowse: boolFromSetting(settings.get(SETTING_KEYS.requireBrowse)),
    requireSearch: boolFromSetting(settings.get(SETTING_KEYS.requireSearch)),
    requireAdminLogin: boolFromSetting(settings.get(SETTING_KEYS.requireAdminLogin)),
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
}) {
  const siteKey = typeof input.siteKey === 'string' ? input.siteKey.trim() : undefined;
  const secretKey = typeof input.secretKey === 'string' ? input.secretKey.trim() : undefined;

  if (siteKey !== undefined) {
    setSetting(SETTING_KEYS.siteKey, siteKey || null);
  }

  if (input.clearSecretKey) {
    setSetting(SETTING_KEYS.secretKey, null);
  } else if (secretKey) {
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
}

export function isTurnstileRequired(area: TurnstileArea) {
  const settings = getTurnstileSettings();
  if (!settings.configured) return false;

  if (area === 'browse') return settings.requireBrowse;
  if (area === 'search') return settings.requireSearch;
  return settings.requireAdminLogin;
}

function getClearanceCookieName(area: TurnstileArea) {
  return `${CLEARANCE_COOKIE_PREFIX}${area}`;
}

function signClearance(area: TurnstileArea, expiresAt: number) {
  return crypto
    .createHmac('sha256', getPersistentSecret())
    .update(`${area}.${expiresAt}`)
    .digest('base64url');
}

function createClearanceValue(area: TurnstileArea) {
  const expiresAt = Date.now() + CLEARANCE_MAX_AGE_SECONDS * 1000;
  return `${expiresAt}.${signClearance(area, expiresAt)}`;
}

function isClearanceValueValid(area: TurnstileArea, value: string | undefined) {
  if (!value) return false;
  const [expiresAtRaw, signature] = value.split('.');
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || !signature || expiresAt < Date.now()) {
    return false;
  }

  const expected = signClearance(area, expiresAt);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function hasTurnstileClearance(area: TurnstileArea) {
  if (!isTurnstileRequired(area)) return true;
  const cookieStore = await cookies();
  return isClearanceValueValid(
    area,
    cookieStore.get(getClearanceCookieName(area))?.value
  );
}

export function requestHasTurnstileClearance(request: NextRequest, area: TurnstileArea) {
  if (!isTurnstileRequired(area)) return true;
  return isClearanceValueValid(
    area,
    request.cookies.get(getClearanceCookieName(area))?.value
  );
}

export function setTurnstileClearance(response: NextResponse, area: TurnstileArea) {
  response.cookies.set(getClearanceCookieName(area), createClearanceValue(area), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CLEARANCE_MAX_AGE_SECONDS,
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

export function getRequestIp(request: NextRequest) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}
