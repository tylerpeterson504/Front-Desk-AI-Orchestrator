import { DataSource, ObjectLiteral, EntityTarget } from 'typeorm';
import { config, isProduction, getDatabaseConfig } from './index';
import logger from '../lib/logger';
import {
  User,
  Property,
  Template,
  ShiftNote,
  AuditLog,
  RefreshToken,
  Escalation,
  ResponseEvent
} from '../entities';

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
  // Every entity must be registered here. TypeORM resolves repositories by
  // metadata, so an entity missing from this list fails at runtime with
  // "No metadata for X was found" even though its migration exists.
  entities: [User, Property, Template, ShiftNote, AuditLog, RefreshToken, Escalation, ResponseEvent],
  // Migrations compile to .js in dist/ but run from .ts via ts-node in dev, so
  // both extensions must match. A .ts-only glob silently matches nothing in a
  // built deploy, which means no migrations run at all.
  migrations: [__dirname + '/../migrations/*.{ts,js}'],
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