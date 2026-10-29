import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PREFIX = 'enc:v1:';

// Values that shipped in example.env.local and the README. Anyone can read them, so a server
// configured with one would let anybody forge admin sessions and decrypt stored credentials.
const PUBLIC_EXAMPLE_SECRETS = [
  'optional-separate-secret-for-backend-credential-encryption',
];

let cachedSecret: string | undefined;

function readConfiguredSecret() {
  const configured = (
    process.env.FILE_NODE_SECRET_KEY ||
    process.env.LIBRIX_SECRET_KEY ||
    process.env.NEXTAUTH_SECRET ||
    ''
  ).trim();
  if (!configured) return null;

  if (PUBLIC_EXAMPLE_SECRETS.includes(configured)) {
    console.warn(
      '[file-node] The configured secret is the public example value from example.env.local. ' +
        'Ignoring it and using a generated secret in data/secret.key instead. ' +
        'Remove FILE_NODE_SECRET_KEY from your environment file, or set it to a random value ' +
        '(openssl rand -base64 32).'
    );
    return null;
  }

  return configured;
}

function readOrCreateKeyFile() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const keyPath = path.join(dataDir, 'secret.key');
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    // `wx` fails when the file exists, so two processes starting together never overwrite each
    // other's freshly generated key.
    fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('hex'), {
      mode: 0o600,
      flag: 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }

  return fs.readFileSync(keyPath, 'utf8').trim();
}

export function getPersistentSecret() {
  // `next build` only imports modules; it must not leave a key file in the build tree (or the
  // Docker image), and nothing it encrypts survives the build.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    cachedSecret ??= crypto.randomBytes(32).toString('hex');
    return cachedSecret;
  }

  cachedSecret ??= readConfiguredSecret() ?? readOrCreateKeyFile();
  return cachedSecret;
}

function deriveKey(secret: string) {
  return crypto.createHash('sha256').update(secret).digest();
}

function getKey() {
  return deriveKey(getPersistentSecret());
}

// Data written while the public example secret was in use stays readable, and gets re-encrypted
// under the real secret by `rekeySecret`.
function getLegacyKeys() {
  return PUBLIC_EXAMPLE_SECRETS.map(deriveKey);
}

export function protectSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith(PREFIX)) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX.slice(0, -1),
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

function decryptWith(key: Buffer, value: string) {
  const [, , ivRaw, tagRaw, encryptedRaw] = value.split(':');
  if (!ivRaw || !tagRaw || !encryptedRaw) return null;

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivRaw, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function revealSecret(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;

  const current = decryptWith(getKey(), value);
  if (current !== null) return current;

  for (const legacyKey of getLegacyKeys()) {
    const legacy = decryptWith(legacyKey, value);
    if (legacy !== null) return legacy;
  }
  return null;
}

// Returns the value re-encrypted under the current secret when it was only readable with a
// legacy key, otherwise null (nothing to do).
export function rekeySecret(value: string | null | undefined) {
  if (!value || !value.startsWith(PREFIX)) return null;
  if (decryptWith(getKey(), value) !== null) return null;

  for (const legacyKey of getLegacyKeys()) {
    const legacy = decryptWith(legacyKey, value);
    if (legacy !== null) return protectSecret(legacy);
  }
  return null;
}

export function isProtectedSecret(value: string | null | undefined) {
  return Boolean(value?.startsWith(PREFIX));
}
