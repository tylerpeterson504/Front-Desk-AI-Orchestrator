// Load backend/.env first, then the workspace-root .env.local (where Freebuff
// Cloud writes Keys-tab values). Later calls do not override already-set vars.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });

const path = require('path');
const fs = require('fs');
const { db } = require('../src/config/database');

// Applies every file in db/migrations in filename order, inside one
// transaction, and records what has run in schema_migrations so re-runs are
// no-ops. Previously only 001_init_schema.sql was applied, so any later
// migration was silently skipped.
async function migrate() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();

  await db.none(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Set(
    (await db.any('SELECT filename FROM schema_migrations')).map((row) => row.filename)
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.tx(async (t) => {
      await t.none(sql);
      await t.none('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    });
    console.log(`applied ${file}`);
  }

  console.log('Migrations completed successfully');
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration error:', error.message);
    process.exit(1);
  });
