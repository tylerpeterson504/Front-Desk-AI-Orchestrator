const pgp = require('pg-promise')();

const db = pgp(process.env.DATABASE_URL || {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'frontdesk_ai',
  user: process.env.DB_USER || 'frontdesk_user',
  password: process.env.DB_PASSWORD || 'frontdesk_pass'
});

module.exports = { db };
