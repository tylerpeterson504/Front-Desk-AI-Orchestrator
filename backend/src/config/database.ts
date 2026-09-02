import { DataSource } from 'typeorm';
import { config, isProduction, getDatabaseConfig } from './index';
import logger from '../lib/logger';
import { User, Property, Template, ShiftNote, AuditLog, RefreshToken } from '../entities';

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
  ssl: isProduction() ? { rejectUnauthorized: false } : false,
  entities: [User, Property, Template, ShiftNote, AuditLog, RefreshToken],
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

export const getRepository = <T>(entity: any) => {
  return AppDataSource.getRepository<T>(entity);
};

// Legacy pg-promise export for backward compatibility
// This will be removed in future versions
export const db = {
  one: async (query: string, params?: unknown[]) => {
    const connection = await AppDataSource.createQueryRunner('master');
    try {
      const result = await connection.manager.query(query, params);
      return result[0] || null;
    } finally {
      await connection.release();
    }
  },
  any: async (query: string, params?: unknown[]) => {
    const connection = await AppDataSource.createQueryRunner('master');
    try {
      return await connection.manager.query(query, params);
    } finally {
      await connection.release();
    }
  }
};
