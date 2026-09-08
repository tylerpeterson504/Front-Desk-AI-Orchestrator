/**
 * Create Admin User Script
 * 
 * This script creates an admin user with the credentials you specify.
 * Run with: node db/create-admin.js
 * 
 * Usage:
 *   Set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME environment variables,
 *   or edit the defaults below.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });

const bcrypt = require('bcrypt');
const { db } = require('../src/config/database');
const { httpError } = require('../src/lib/httpError');

const DEFAULT_ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@hotel.com',
  password: process.env.ADMIN_PASSWORD || 'Admin@123456!',
  name: process.env.ADMIN_NAME || 'Hotel Admin',
  role: 'admin'
};

async function createAdmin() {
  console.log('🔐 Creating admin user...');
  console.log(`Email: ${DEFAULT_ADMIN.email}`);
  console.log(`Name: ${DEFAULT_ADMIN.name}`);
  console.log(`Role: ${DEFAULT_ADMIN.role}`);
  
  try {
    // Check if user already exists
    const existing = await db.oneOrNone(
      'SELECT id, email FROM users WHERE email = $1',
      [DEFAULT_ADMIN.email.toLowerCase()]
    );
    
    if (existing) {
      console.log('⚠️  Admin user already exists with this email!');
      console.log(`   Existing user ID: ${existing.id}, Email: ${existing.email}`);
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, 12);
    
    // Create admin user
    const user = await db.one(
      `INSERT INTO users (email, password, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at`,
      [DEFAULT_ADMIN.email.toLowerCase(), hashedPassword, DEFAULT_ADMIN.name, DEFAULT_ADMIN.role]
    );

    console.log('✅ Admin user created successfully!');
    console.log(`   User ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Role: ${user.role}`);
    console.log('\n📝 Login with:');
    console.log(`   Email: ${DEFAULT_ADMIN.email}`);
    console.log(`   Password: ${DEFAULT_ADMIN.password}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to create admin user:', error.message);
    if (error.code === '23505') {
      console.log('   This email may already exist in the database.');
    }
    process.exit(1);
  }
}

// Check if we can connect to the database first
async function checkConnection() {
  try {
    await db.one('SELECT 1');
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  const connected = await checkConnection();
  if (!connected) {
    console.error('❌ Cannot connect to the database. Please check your .env configuration:');
    console.error('   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
    console.error('   or DATABASE_URL');
    process.exit(1);
  }
  
  await createAdmin();
}

main().catch(() => process.exit(1));
