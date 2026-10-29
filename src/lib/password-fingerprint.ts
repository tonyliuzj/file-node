import crypto from 'crypto';

/**
 * Identifies the current password without exposing the hash. Stored in session tokens and device
 * cookies so that changing the password invalidates everything issued before it.
 */
export function passwordFingerprint(passwordHash: string) {
  return crypto
    .createHash('sha256')
    .update(passwordHash)
    .digest('hex')
    .slice(0, 16);
}
