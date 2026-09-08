#!/usr/bin/env node
// Set up the Neon database for the Front Desk Orchestrator backend.
//
// Requirements:
//   - DATABASE_URL must be set in the environment (Neon pooled connection
//     string) or in backend/.env.
//   - RUN_SEEDS=true seeds demo data (skipped automatically if users exist).
//
// Usage:
//   npm run db-setup --prefix backend
//
// This script runs migrations first, then seeds (seeding is skipped
// automatically when users already exist). It never prints the connection
// string or any secret values.
'use strict';

process.env.RUN_SEEDS = process.env.RUN_SEEDS || 'true';

const { spawn } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, '..');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: backendDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    console.error('Add the Neon pooled connection string to backend/.env as:');
    console.error('  DATABASE_URL=postgresql://user:password@host/db?sslmode=require');
    process.exit(1);
  }

  console.log('Running migrations...');
  await run('node', ['db/migrate.js']);

  console.log('Running seeds (skipped automatically if users exist)...');
  await run('node', ['db/seed-runner.js']);

  console.log('Neon database setup complete.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
