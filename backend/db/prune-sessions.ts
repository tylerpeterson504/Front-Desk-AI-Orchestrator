// Deletes expired refresh-token rows.//
// Revoked and rotated rows are kept until they expire (they are the audit
// trail for reuse detection); past expiry they are dead weight. Safe to run
// on a schedule — it never touches a live session.
//
// Usage:
//   npm run prune-sessionsimport 'dotenv';
import { DataSource } from 'typeorm';
import { LessThan } from 'typeorm';
import { getDatabaseConfig } from '../src/config/index';
import { RefreshToken } from '../src/entities';

const dbConfig = getDatabaseConfig();
const connectionString = dbConfig.connectionString;
const manualConfig = connectionString ? {} : {
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database
};

// Create a separate data source so this script never touches the live app
const pruneDataSource = new DataSource({
  type: 'postgres',
  ...(connectionString ? { url: connectionString } : manualConfig),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  entities: [RefreshToken],
  migrations: [],
  synchronize: false,
  logging: process.env.LOG_LEVEL === 'debug'
});

async function run() {
  try {
    await pruneDataSource.initialize();
    const repo = pruneDataSource.getRepository(RefreshToken);
    const result = await repo.delete({ expires_at: LessThan(new Date()) });
    console.log(`removed ${result.affected || 0} expired refresh token${result.affected === 1 ? '' : 's'}`);
    await pruneDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error("prune failed:", error);
    await pruneDataSource.destroy().catch(() => undefined);
    process.exit(1);
  }
}

run();
