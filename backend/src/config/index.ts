import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load environment variables
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../../.env.local') });

// Define schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGIN: z.string().optional(),
  WIFI_ENCRYPTION_KEY: z
    .string()
    .min(32, 'WIFI_ENCRYPTION_KEY must be at least 32 characters')
    .optional(),
  REGISTRATION_MODE: z.enum(['open', 'invite', 'closed']).default('invite'),
  REGISTRATION_INVITE_TOKEN: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
  PERPLEXITY_API_KEY: z.string().optional(),
  PERPLEXITY_MODEL: z.string().default('sonar'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'silly']).default('info'),
  NEON_PROJECT_ID: z.string().optional(),
  DATABRICKS_HOST: z.string().optional(),
  DATABRICKS_TOKEN: z.string().optional(),
  DATABRICKS_WAREHOUSE_ID: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  BCRYPT_ROUNDS: z.string().optional(),
});

// Parse and validate
export const config = envSchema.parse(process.env);

// Helper functions
export const isProduction = () => config.NODE_ENV === 'production';
export const isTest = () => config.NODE_ENV === 'test';
export const isDevelopment = () => config.NODE_ENV === 'development';

// Database configuration
export const getDatabaseConfig = () => {
  if (config.DATABASE_URL) {
    return { connectionString: config.DATABASE_URL };
  }

  return {
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
  };
};

// CORS configuration
export const getCorsOrigins = () => {
  if (!config.CORS_ORIGIN) {
    if (isProduction()) {
      throw new Error('CORS_ORIGIN must be set in production');
    }
    return [
      /^http://localhost(:\d+)?$/,
      /^http://127\.0\.0\.1(:\d+)?$/,
      /^chrome-extension:///,
    ];
  }

  return config.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
};