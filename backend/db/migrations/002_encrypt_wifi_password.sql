-- Phase 2: widen properties.wifi_password for AES-256-GCM ciphertext.
--
-- Stored format is `v1:<base64(iv + tag + ciphertext)>`, which exceeds
-- VARCHAR(255) for longer passphrases. TEXT removes the ceiling.
--
-- This migration does NOT encrypt existing rows. Run `npm run encrypt-wifi`
-- with the original WIFI_ENCRYPTION_KEY to mark legacy ciphertext and encrypt
-- legacy plaintext in place.

ALTER TABLE properties
  ALTER COLUMN wifi_password TYPE TEXT;

COMMENT ON COLUMN properties.wifi_password IS
  'Encrypted at rest by backend/src/lib/secretBox.ts (v1:base64(iv + tag + ciphertext)). Legacy rows may still be plaintext until npm run encrypt-wifi is executed.';
