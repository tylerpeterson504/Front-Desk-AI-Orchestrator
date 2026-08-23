const path = require('path');
const fs = require('fs');
const { db } = require('../src/config/database');

async function seed() {
  if (process.env.RUN_SEEDS !== 'true') {
    console.log('Skipping seeds (RUN_SEEDS not set to true)');
    process.exit(0);
  }

  const seedFile = path.join(__dirname, 'seed.sql');
  const sql = fs.readFileSync(seedFile, 'utf8');

  try {
    // Only seed if no users exist
    const count = await db.one('SELECT COUNT(*) FROM users');
    if (parseInt(count.count) > 0) {
      console.log('Database already seeded, skipping');
      process.exit(0);
    }
    await db.none(sql);
    console.log('Seed data inserted successfully');
    console.log('Demo credentials: demo@example.com / password123');
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
}

seed().then(() => process.exit(0)).catch(() => process.exit(1));
