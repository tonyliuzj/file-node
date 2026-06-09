import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PREFIX = 'enc:v1:';

export function getPersistentSecret() {
  const configuredSecret =
    process.env.FILE_NODE_SECRET_KEY ||
    process.env.LIBRIX_SECRET_KEY ||
    process.env.NEXTAUTH_SECRET;
  if (configuredSecret) {
    return configuredSecret;
  }

  const dataDir = path.resolve(process.cwd(), 'data');
  const keyPath = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('hex'), {
      mode: 0o600,
    });
  }

  return fs.readFileSync(keyPath, 'utf8').trim();
}

function getKey() {
  return crypto.createHash('sha256').update(getPersistentSecret()).digest();
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

export function revealSecret(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;

  const [, , ivRaw, tagRaw, encryptedRaw] = value.split(':');
  if (!ivRaw || !tagRaw || !encryptedRaw) return null;

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getKey(),
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

export function isProtectedSecret(value: string | null | undefined) {
  return Boolean(value?.startsWith(PREFIX));
}
