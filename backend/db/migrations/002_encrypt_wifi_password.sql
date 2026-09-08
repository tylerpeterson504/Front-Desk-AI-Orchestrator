-- Phase 2: widen properties.wifi_password for AES-256-GCM ciphertext.
--
-- Stored format is `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>`, which exceeds
-- VARCHAR(255) for longer passphrases. TEXT removes the ceiling.
--
-- This migration does NOT encrypt existing rows — the read path passes legacy
-- plaintext through unchanged. Run `npm run encrypt-wifi` once
-- WIFI_ENCRYPTION_KEY is set to rewrite them in place.

ALTER TABLE properties
  ALTER COLUMN wifi_password TYPE TEXT;

COMMENT ON COLUMN properties.wifi_password IS
  'Encrypted at rest by backend/src/lib/secretBox.js (v1:iv:tag:ciphertext). Legacy rows may still be plaintext until npm run encrypt-wifi is executed.';
