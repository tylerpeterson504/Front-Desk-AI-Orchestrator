// Keep the npm/CI entry point while running the TypeScript migration runner.
require('tsx/cjs');
require('./migrate.ts');
