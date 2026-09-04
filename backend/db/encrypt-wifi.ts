// One-shot backfill: encrypt any properties.wifi_password rows still stored in
// plaintext. Idempotent - rows already carrying the `v1:` prefix are skipped.
//
// Usage:
//   WIFI_ENCRYPTION_KEY=... npm run encrypt-wifi
//
// Generate a key with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

import 'dotenv';
import path from 'path';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../src/config/index';
import { Property } from '../src/entities';
import { encryptSecret, isEncrypted, isEncryptionConfigured } from '../src/lib/secretBox';

const dbConfig = getDatabaseConfig();

const connectionString = dbConfig.connectionString;
const manualConfig = connectionString ? {} : {
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database
};

// Create a data source for the backfill
const backfillDataSource = new DataSource({
  type: 'postgres',
  ...(connectionString ? { url: connectionString } : manualConfig),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  entities: [Property],
  migrations: [],
  synchronize: false,
  logging: process.env.LOG_LEVEL === 'debug'
});

async function run() {
  if (!isEncryptionConfigured()) {
    console.error('WIFI_ENCRYPTION_KEY is not set - nothing to do.');
    process.exit(1);
  }

  try {
    await backfillDataSource.initialize();
    console.log('Connected to database for wifi encryption backfill');
    
    const propertyRepo = backfillDataSource.getRepository(Property);
    
    // Find all properties with wifi_password
    const properties = await propertyRepo.find({
      where: { wifi_password: { not: '' } }
    });
    
    console.log(`Found ${properties.length} properties with wifi_password`);
    
    let encrypted = 0;
    let skipped = 0;

    for (const property of properties) {
      // Skip if already encrypted
      if (isEncrypted(property.wifi_password || '')) {
        skipped++;
        continue;
      }

      // Encrypt the password
      const encryptedPassword = encryptSecret(property.wifi_password || '');
      
      // Update the property
      await propertyRepo.update(property.id, {
        wifi_password: encryptedPassword,
        updated_at: new Date()
      });
      
      encrypted++;
    }

    console.log(`Encrypted ${encrypted} row(s); ${skipped} already encrypted.`);
    
    await backfillDataSource.destroy();
    
    return true;
  } catch (error) {
    console.error('Backfill failed:', (error as Error).message);
    await backfillDataSource.destroy();
    throw error;
  }
}

run()
  .then(() => {
    console.log('Wifi encryption backfill completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Wifi encryption backfill failed:', error);
    process.exit(1);
  });
