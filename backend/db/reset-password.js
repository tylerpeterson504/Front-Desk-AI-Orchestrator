/**
 * Reset User Password Script
 * 
 * This script resets a user's password.
 * Run with: node db/reset-password.js
 * 
 * Usage:
 *   Set USER_EMAIL and NEW_PASSWORD environment variables
 *   Example: USER_EMAIL=user@example.com NEW_PASSWORD=newpassword123 node db/reset-password.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });

const bcrypt = require('bcrypt');
const { db } = require('../src/config/database');

const USER_EMAIL = process.env.USER_EMAIL || process.argv[2];
const NEW_PASSWORD = process.env.NEW_PASSWORD || process.argv[3];

async function resetPassword() {
  if (!USER_EMAIL || !NEW_PASSWORD) {
    console.error('❌ Usage: USER_EMAIL=user@example.com NEW_PASSWORD=newpassword node db/reset-password.js');
    console.error('   or: node db/reset-password.js user@example.com newpassword');
    process.exit(1);
  }

  console.log('🔐 Resetting password...');
  console.log(`Email: ${USER_EMAIL}`);
  
  try {
    // Check if user exists
    const user = await db.oneOrNone(
      'SELECT id, email FROM users WHERE email = $1',
      [USER_EMAIL.toLowerCase()]
    );
    
    if (!user) {
      console.error('❌ User not found with this email!');
      process.exit(1);
    }

    console.log(`Found user ID: ${user.id}`);

    // Hash new password
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 12);
    
    // Update password
    await db.none(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, user.id]
    );

    console.log('✅ Password reset successfully!');
    console.log(`   User: ${user.email} (ID: ${user.id})`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to reset password:', error.message);
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
  
  await resetPassword();
}

main().catch(() => process.exit(1));
