export const USERNAME_PATTERN = /^[a-zA-Z0-9._@-]{3,64}$/;
export const USERNAME_RULE =
  'Username must be 3-64 characters using letters, numbers, dots, dashes, underscores, or @';

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt only hashes the first 72 bytes, so longer passwords would silently be weaker than typed.
export const MAX_PASSWORD_BYTES = 72;

export function validateNewPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  if (!password.trim()) {
    return 'Password cannot be only whitespace';
  }
  return null;
}
