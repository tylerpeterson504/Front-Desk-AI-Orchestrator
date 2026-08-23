require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const fs = require('fs');
const { db } = require('../src/config/database');

async function migrate() {
  const migrationFile = path.join(__dirname, 'migrations', '001_init_schema.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');
  try {
    await db.none(sql);
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exit(1);
  }
}

migrate().then(() => process.exit(0)).catch(() => process.exit(1));
