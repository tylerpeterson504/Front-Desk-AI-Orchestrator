// Test environment setup for backend tests
// This file sets up required environment variables for testing

import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
const envPath = path.join(__dirname, '../../.env.test');
dotenv.config({ path: envPath });

// Set required environment variables for tests if not already set
process.env.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'test-mistral-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-testing-only-with-minimum-32-characters';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.NODE_ENV = 'test';

// Disable logging in tests
process.env.LOG_LEVEL = 'error';

// Set a fixed JWT expiration for consistent tests
process.env.JWT_EXPIRES_IN = '15m';

// Set a fixed port for testing
process.env.PORT = '3001';

// Set test mode for any services that need it
process.env.TEST_MODE = 'true';

// Export for use in tests
const testEnv = {
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  PORT: process.env.PORT,
  TEST_MODE: process.env.TEST_MODE
};

export default testEnv;