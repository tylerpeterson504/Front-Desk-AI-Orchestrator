#!/usr/bin/env node
/**
 * Connection Test Script for Front Desk AI Orchestrator
 * 
 * Run from backend directory:
 *   node test-connection.js
 */

console.log('🧪 Testing Neon Database & Mistral AI Connection\n');
console.log('='.repeat(60) + '\n');

require('dotenv').config();
const pgp = require('pg-promise')();

async function testDatabase() {
  console.log('🔍 TEST 1: Neon Database Connection\n');
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not found in .env');
    return null;
  }
  
  console.log('✅ DATABASE_URL found\n');
  
  try {
    const db = pgp(dbUrl);
    await db.one('SELECT 1');
    console.log('✅ Neon database connection SUCCESSFUL!\n');
    return db;
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('   Error:', error.message);
    return null;
  }
}

async function testMistral() {
  console.log('🔍 TEST 2: Mistral AI Connection\n');
  
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey || apiKey === 'your_mistral_api_key_here') {
    console.error('❌ MISTRAL_API_KEY not found in .env');
    return false;
  }
  
  console.log('✅ API Key found\n');
  
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_tokens: 50
      })
    });
    
    if (!response.ok) {
      console.error(`❌ Mistral AI error: ${response.status}`);
      return false;
    }
    
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    
    if (!text || !text.trim()) {
      console.error('❌ Empty response from Mistral AI');
      return false;
    }
    
    console.log('✅ Mistral AI connection SUCCESSFUL!');
    console.log('   Sample:', text.trim().substring(0, 50) + '...\n');
    return true;
  } catch (error) {
    console.error('❌ Mistral AI connection failed:');
    console.error('   Error:', error.message);
    return false;
  }
}

async function testUsers(db) {
  console.log('🔍 TEST 3: Check Admin User\n');
  
  try {
    const users = await db.any('SELECT id, email, name, role FROM users LIMIT 5');
    
    if (users.length === 0) {
      console.log('⚠️  No users found');
      console.log('   Run: node db/create-admin.js\n');
      return false;
    }
    
    console.log('✅ Found users:');
    users.forEach(u => console.log(`   - ${u.email} (${u.role})`));
    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function main() {
  const db = await testDatabase();
  const mistral = await testMistral();
  const users = db ? await testUsers(db) : false;
  
  console.log('='.repeat(60));
  console.log('\n📊 SUMMARY:\n');
  console.log('   Database:', db ? '✅ PASS' : '❌ FAIL');
  console.log('   Mistral AI:', mistral ? '✅ PASS' : '❌ FAIL');
  console.log('   Users:', users ? '✅ PASS' : '⚠️  RUN create-admin.js');
  console.log('\n' + '='.repeat(60));
  
  if (db && mistral) {
    console.log('\n🎉 DATABASE & AI READY!\n');
    console.log('Run: npm start\n');
    console.log('Then: npm run start:dashboard\n');
    console.log('Login: admin@hotel.com / Admin@123456!\n');
  } else {
    console.log('\n❌ Please fix the issues above\n');
  }
}

main().catch(console.error);
