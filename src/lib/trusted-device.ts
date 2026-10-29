import crypto from 'crypto';
import { getPersistentSecret } from '@/lib/credentials';
import { passwordFingerprint } from '@/lib/password-fingerprint';

// Sign-in throttling stops password guessing, but on its own it lets anyone who knows the admin
// username lock the admin out. A browser that has already signed in successfully carries this signed
// cookie, which proves it is not a guesser, so it is let through the throttle. The cookie is tied to
// the current password, so changing the password retires every one of them.
export const TRUSTED_DEVICE_COOKIE = 'file_node_device';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type Account = { id: number; password: string };

function expectedValue(account: Account) {
  const mac = crypto
    .createHmac('sha256', getPersistentSecret())
    .update(`trusted-device:${account.id}:${passwordFingerprint(account.password)}`)
    .digest('base64url');
  return `${account.id}.${mac}`;
}

export function trustedDeviceSetCookie(account: Account, secure: boolean) {
  return [
    `${TRUSTED_DEVICE_COOKIE}=${expectedValue(account)}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function isTrustedDevice(cookieHeader: string | undefined, account: Account) {
  if (!cookieHeader) return false;

  const entry = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${TRUSTED_DEVICE_COOKIE}=`));
  if (!entry) return false;

  const provided = Buffer.from(entry.slice(TRUSTED_DEVICE_COOKIE.length + 1));
  const expected = Buffer.from(expectedValue(account));
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
