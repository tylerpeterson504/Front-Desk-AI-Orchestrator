import crypto from 'crypto';
import { config } from '../config';

// Encryption for sensitive data at rest (Wi-Fi passwords, etc.)
// Uses AES-256-GCM for authenticated encryption

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits for AES-256
const PBKDF2_ITERATIONS = 100000;
const CIPHERTEXT_PREFIX = 'v1:';

// Derive encryption key from the WIFI_ENCRYPTION_KEY
function getEncryptionKey(): Buffer {
  const password = config.WIFI_ENCRYPTION_KEY || config.JWT_SECRET;
  const salt = Buffer.from(config.WIFI_ENCRYPTION_KEY?.substring(0, 32) || config.JWT_SECRET.substring(0, 32), 'utf8');
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/** Encrypts text as a `v1:`-prefixed, Base64-encoded authenticated payload. */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Return a versioned IV + authTag + encrypted data payload.
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]);
  return CIPHERTEXT_PREFIX + combined.toString('base64');
}

/**
 * Decrypts a versioned payload or an unprefixed legacy payload.
 * @throws If the payload is malformed, authentication fails, or the key differs.
 */
export function decryptSecret(encrypted: string): string {
  const key = getEncryptionKey();

  const combined = Buffer.from(isEncrypted(encrypted) ? encrypted.slice(CIPHERTEXT_PREFIX.length) : encrypted, 'base64');

  // Extract IV (first 16 bytes), authTag (next 16 bytes), and encrypted data
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encryptedData = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/** Checks for the `v1:` prefix without validating the ciphertext. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(CIPHERTEXT_PREFIX);
}

/**
 * Tries to decrypt an unprefixed legacy payload. Returns null for versioned
 * values or on any decryption failure, including ordinary plaintext.
 */
export function tryDecryptLegacySecret(value: string): string | null {
  if (isEncrypted(value)) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

/**
 * Leaves versioned values unchanged, prefixes valid legacy ciphertext, and
 * encrypts other values. Encryption failures propagate to the caller.
 */
export function migrateSecret(value: string): string {
  if (isEncrypted(value)) return value;
  return tryDecryptLegacySecret(value) !== null
    ? CIPHERTEXT_PREFIX + value
    : encryptSecret(value);
}

/** Checks whether WIFI_ENCRYPTION_KEY is present and at least 32 characters long. */
export function isEncryptionConfigured(): boolean {
  return Boolean(config.WIFI_ENCRYPTION_KEY && config.WIFI_ENCRYPTION_KEY.length >= 32);
}
