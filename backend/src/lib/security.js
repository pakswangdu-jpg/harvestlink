import crypto from 'crypto';

// Secure helper for encrypting pending registration secrets.
// Behavior:
// - In production, `PENDING_REGISTRATION_SECRET` must be provided and be exactly 32 bytes.
// - In development (non-production), if the env var is missing or not 32 bytes, a
//   non-persistent fallback key is derived so the server can run locally without secrets.

const { PENDING_REGISTRATION_SECRET } = process.env;
const isProd = process.env.NODE_ENV === 'production';
let keyBuffer = null;

if (!PENDING_REGISTRATION_SECRET) {
  if (isProd) {
    throw new Error('PENDING_REGISTRATION_SECRET must be set in the backend environment.');
  }
  // Development fallback: generate a random key per-process so developers can run locally
  // without setting env vars. This key is ephemeral and not suitable for production.
  console.warn('PENDING_REGISTRATION_SECRET not set — generating temporary in-memory key for development.');
  keyBuffer = crypto.randomBytes(32);
} else {
  const asBuffer = Buffer.from(PENDING_REGISTRATION_SECRET, 'utf8');
  if (asBuffer.length === 32) {
    keyBuffer = asBuffer;
  } else if (isProd) {
    throw new Error('PENDING_REGISTRATION_SECRET must be exactly 32 bytes long.');
  } else {
    // In dev, derive a stable 32-byte key from the provided string via SHA-256.
    console.warn('PENDING_REGISTRATION_SECRET is not 32 bytes — deriving 32-byte key with SHA-256 (development only).');
    keyBuffer = crypto.createHash('sha256').update(PENDING_REGISTRATION_SECRET).digest();
  }
}

const ALGORITHM = 'aes-256-gcm';
const KEY = keyBuffer;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encryptText(value) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptText(payload) {
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.slice(0, IV_LENGTH);
  const tag = buffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.slice(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
