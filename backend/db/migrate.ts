// Database migration runner using TypeORM
// Replaces the legacy pg-promise based migrate.js

import dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import path from 'path';
import logger from '../src/lib/logger';

// Migrations need database settings only; CI does not provide application secrets.
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const connectionString = process.env.DATABASE_URL;
const manualConfig = connectionString ? {} : {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

// Create a separate data source just for migrations
const migrationDataSource = new DataSource({
  type: 'postgres',
  ...(connectionString ? { url: connectionString } : manualConfig),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  entities: [],
  migrations: [path.join(__dirname, '../src/migrations/**/*.ts')],
  synchronize: false,
  logging: process.env.LOG_LEVEL === 'debug'
});

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');
    
    await migrationDataSource.initialize();
    logger.info('Connected to database for migrations');
    
    const migrations = await migrationDataSource.runMigrations();
    
    if (migrations.length > 0) {
      logger.info(`Successfully ran ${migrations.length} migration(s):`);
      for (const migration of migrations) {
        logger.info(`  - ${migration.name}`);
      }
    } else {
      logger.info('No new migrations to run');
    }
    
    logger.info('Migrations completed successfully');
    
    return true;
  } catch (error) {
    logger.error('Migration failed', { error: (error as Error).message });
    throw error;
  } finally {
    if (migrationDataSource.isInitialized) {
      await migrationDataSource.destroy();
    }
  }
}

// Run migrations
runMigrations()
  .then(() => {
    console.log('Database migrations completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Database migrations failed:', error);
    process.exit(1);
  });
