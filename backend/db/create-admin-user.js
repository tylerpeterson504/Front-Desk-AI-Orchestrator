#!/usr/bin/env node
// Create admin user script for Front Desk AI Orchestrator
// Usage: node db/create-admin-user.js

const bcrypt = require('bcrypt');
const { db } = require('./database');

async function main() {
  try {
    // Admin user
    const adminEmail = 'admin@frontdesk.ai';
    const adminPassword = 'Admin@12345';
    const adminName = 'Administrator';
    const adminRole = 'admin';
    
    // Regular user
    const userEmail = 'user@frontdesk.ai';
    const userPassword = 'User@12345';
    const userName = 'Front Desk User';
    const userRole = 'agent';

    const saltRounds = 12;

    // Hash passwords
    const adminHash = await bcrypt.hash(adminPassword, saltRounds);
    const userHash = await bcrypt.hash(userPassword, saltRounds);

    console.log('🔑 Admin password hash:', adminHash);
    console.log('👤 User password hash:', userHash);

    // Create admin user
    const adminExists = await db.oneOrNone(
      'SELECT id FROM users WHERE email = $1', [adminEmail]
    );

    if (!adminExists) {
      await db.one(
        `INSERT INTO users (email, password, name, role, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
         RETURNING id, email, name, role`,
        [adminEmail, adminHash, adminName, adminRole]
      );
      console.log('✅ Admin user created successfully!');
      console.log('📧 Email:', adminEmail);
      console.log('🔐 Password:', adminPassword);
      console.log('👑 Role: admin');
    } else {
      console.log('ℹ️ Admin user already exists, skipping creation.');
    }

    // Create regular user
    const userExists = await db.oneOrNone(
      'SELECT id FROM users WHERE email = $1', [userEmail]
    );

    if (!userExists) {
      await db.one(
        `INSERT INTO users (email, password, name, role, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
         RETURNING id, email, name, role`,
        [userEmail, userHash, userName, userRole]
      );
      console.log('✅ Regular user created successfully!');
      console.log('📧 Email:', userEmail);
      console.log('🔐 Password:', userPassword);
      console.log('👤 Role: agent');
    } else {
      console.log('ℹ️ Regular user already exists, skipping creation.');
    }

    console.log('\n🚀 User creation completed!');
    console.log('💡 You can now log in with:');
    console.log('   Admin: admin@frontdesk.ai / Admin@12345');
    console.log('   User: user@frontdesk.ai / User@12345');

  } catch (error) {
    console.error('❌ Error creating users:', error);
    process.exit(1);
  }
}

main();