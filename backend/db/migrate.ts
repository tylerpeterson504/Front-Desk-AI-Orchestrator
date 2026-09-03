// Database migration runner using TypeORM
// Replaces the legacy pg-promise based migrate.js

import 'dotenv';
import { DataSource } from 'typeorm';
import path from 'path';
import { getDatabaseConfig } from '../src/config/index';
import logger from '../src/config/database';

const dbConfig = getDatabaseConfig();

const connectionString = dbConfig.connectionString;
const manualConfig = connectionString ? {} : {
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database
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
    
    await migrationDataSource.destroy();
    logger.info('Migrations completed successfully');
    
    return true;
  } catch (error) {
    logger.error('Migration failed', { error: (error as Error).message });
    await migrationDataSource.destroy();
    throw error;
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
