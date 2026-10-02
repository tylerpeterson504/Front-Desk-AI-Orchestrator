// Keep the npm/CI entry point while running the TypeScript migration runner.
require('ts-node').register({
  project: require('path').join(__dirname, '../tsconfig.json'),
});
require('./migrate.ts');
