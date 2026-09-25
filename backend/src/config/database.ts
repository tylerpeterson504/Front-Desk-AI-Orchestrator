import { DataSource, ObjectLiteral, EntityTarget } from 'typeorm';
import { config, isProduction, getDatabaseConfig } from './index';
import logger from '../lib/logger';
import { User, Property, Template, ShiftNote, AuditLog, RefreshToken, Escalation } from '../entities';

const dbConfig = getDatabaseConfig();

const connectionString = dbConfig.connectionString;
const manualConfig = connectionString ? {} : {
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database
};

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(connectionString ? { url: connectionString } : manualConfig),
  ssl: connectionString?.includes('neon.tech') || isProduction() ? { rejectUnauthorized: false } : false,
  entities: [User, Property, Template, ShiftNote, AuditLog, RefreshToken, Escalation],
  migrations: [__dirname + '/../migrations/**/*.ts'],
  synchronize: false,
  logging: config.LOG_LEVEL === 'debug',
  migrationsRun: true
});

export const initializeDatabase = async () => {
  try {
    await AppDataSource.initialize();
    logger.info('Database connected');
    await AppDataSource.runMigrations();
    logger.info('Migrations applied');
  } catch (err) {
    logger.error('Database connection failed', { error: err });
    throw err;
  }
};

export const getDatabase = () => AppDataSource;

export const getRepository = <T extends ObjectLiteral>(entity: EntityTarget<T>) => {
  return AppDataSource.getRepository<T>(entity);
};