// One-shot backfill: encrypt any properties.wifi_password rows still stored in
// plaintext. Idempotent — rows already carrying the `v1:` prefix are skipped.
//
// Usage:
//   WIFI_ENCRYPTION_KEY=... npm run encrypt-wifi
//
// Generate a key with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });

const { db } = require('../src/config/database');
const { encryptSecret, isEncrypted, isEncryptionConfigured } = require('../src/lib/secretBox');

async function run() {
  if (!isEncryptionConfigured()) {
    console.error('WIFI_ENCRYPTION_KEY is not set — nothing to do.');
    process.exit(1);
  }

  const rows = await db.any(
    'SELECT id, wifi_password FROM properties WHERE wifi_password IS NOT NULL AND wifi_password <> $1',
    ['']
  );

  let encrypted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (isEncrypted(row.wifi_password)) {
      skipped += 1;
      continue;
    }
    await db.none('UPDATE properties SET wifi_password = $1, updated_at = NOW() WHERE id = $2', [
      encryptSecret(row.wifi_password),
      row.id
    ]);
    encrypted += 1;
  }

  console.log(`Encrypted ${encrypted} row(s); ${skipped} already encrypted.`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error.message);
    process.exit(1);
  });
