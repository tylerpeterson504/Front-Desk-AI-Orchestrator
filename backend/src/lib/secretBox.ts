import crypto from 'crypto';
import { config } from '../config';

// Encryption for sensitive data at rest (Wi-Fi passwords, etc.)
// Uses AES-256-GCM for authenticated encryption

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const KEY_LENGTH = 32; // 256 bits for AES-256
const PBKDF2_ITERATIONS = 100000;

// Derive encryption key from the WIFI_ENCRYPTION_KEY
function getEncryptionKey(): Buffer {
  const password = config.WIFI_ENCRYPTION_KEY || config.JWT_SECRET;
  const salt = Buffer.from(config.WIFI_ENCRYPTION_KEY?.substring(0, 32) || config.JWT_SECRET.substring(0, 32), 'utf8');
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Return IV + authTag + encrypted data as base64
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]);
  return combined.toString('base64');
}

export function decryptSecret(encrypted: string): string {
  const key = getEncryptionKey();

  const combined = Buffer.from(encrypted, 'base64');

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
