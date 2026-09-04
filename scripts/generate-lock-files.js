/**
 * Generate package-lock.json files for the monorepo
 * Run this from the root directory: node scripts/generate-lock-files.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Generating package-lock.json files...');

try {
  // Install from root
  console.log('\n1. Installing root dependencies...');
  execSync('npm install --legacy-peer-deps --no-audit --no-fund --ignore-scripts', {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });

  // Install in each workspace
  const workspaces = ['backend', 'dashboard', 'extension'];
  
  for (const workspace of workspaces) {
    console.log(`\n2. Installing ${workspace} dependencies...`);
    execSync('npm install --legacy-peer-deps --no-audit --no-fund --ignore-scripts', {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..', workspace)
    });
  }

  console.log('\n✅ All package-lock.json files generated successfully!');
  console.log('\nYou can now commit the changes:');
  console.log('  git add package-lock.json backend/package-lock.json dashboard/package-lock.json extension/package-lock.json');
  console.log('  git commit -m "chore: add package-lock.json files"');
  
} catch (error) {
  console.error('\n❌ Error generating lock files:', error);
  process.exit(1);
}