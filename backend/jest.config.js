module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@entities/(.*)$': '<rootDir>/src/entities/$1'
  },
  transform: {
    '^.+\.(ts|js)$': [
      'ts-jest',
      {
        diagnostics: { ignoreCodes: [6133, 151002] },
        tsconfig: 'tsconfig.test.json'
      }
    ]
  },
  rootDir: process.cwd()
};