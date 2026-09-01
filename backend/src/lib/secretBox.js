// Application-level encryption for column values that must not sit in the
// database in the clear (today: properties.wifi_password).
//
// Format: `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>` — AES-256-GCM, random 12-byte
// IV per write, authentication tag verified on read.
//
// Key: WIFI_ENCRYPTION_KEY, 32 bytes supplied as base64 or hex. Generate with
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// Backward compatibility: `decryptSecret` passes through any value that lacks
// the `v1:` prefix, so rows written before this change keep working until
// `npm run encrypt-wifi` rewrites them.

const crypto = require('crypto');
const logger = require('./logger');

const PREFIX = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

let warnedMissingKey = false;

function parseKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  // Accept hex (64 chars) or base64.
  const buffer = /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');

  if (buffer.length !== 32) {
    throw new Error('WIFI_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or hex)');
  }
  return buffer;
}

function getKey() {
  return parseKey(process.env.WIFI_ENCRYPTION_KEY);
}

function isEncryptionConfigured() {
  return Boolean(getKey());
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

// Returns the storable representation of `plaintext`.
// - No key configured + production → throws, so we never silently persist a
//   plaintext credential in a deployed environment.
// - No key configured + dev/test → stores plaintext and warns once.
function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext ?? null;
  if (isEncrypted(plaintext)) return plaintext;

  const key = getKey();
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('WIFI_ENCRYPTION_KEY is required to store a Wi-Fi password in production');
    }
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      logger.warn('WIFI_ENCRYPTION_KEY is not set; Wi-Fi passwords are being stored in plaintext', {
        env: process.env.NODE_ENV || 'development'
      });
    }
    return String(plaintext);
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64')
  ].join(':');
}

// Returns the plaintext for a stored value. Legacy plaintext passes through.
function decryptSecret(stored) {
  if (stored == null || stored === '') return stored ?? null;
  if (!isEncrypted(stored)) return String(stored);

  const key = getKey();
  if (!key) {
    throw new Error('WIFI_ENCRYPTION_KEY is required to read an encrypted Wi-Fi password');
  }

  const [, ivB64, tagB64, dataB64] = String(stored).split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted value');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

module.exports = {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  isEncryptionConfigured
};
