#!/usr/bin/env node
/**
 * Test Script for Neon AI Gateway
 * 
 * This script tests the Neon AI Gateway service with a sample guest message.
 */

// Neon AI Gateway credentials
const NEON_AI_GATEWAY_TOKEN = 'nt_live_43fa44115995_dlNzcrQ2FjvuBPNXPo9I6W9SUk3H0yMr';

async function testNeonAIGateway() {
  console.log('🤖 Testing Neon AI Gateway...\n');
  
  if (!NEON_AI_GATEWAY_TOKEN) {
    console.error('❌ Error: NEON_AI_GATEWAY_TOKEN not configured');
    process.exit(1);
  }
  
  console.log('✅ AI Gateway Token Found');
  console.log(`   Token: ${NEON_AI_GATEWAY_TOKEN.substring(0, 10)}...\n`);
  
  const testMessage = 'What time is checkout?';
  
  console.log('📝 Sending test message to Neon AI Gateway:');
  console.log(`   "${testMessage}"\n`);
  
  try {
    const response = await fetch('https://gateway.ai.neon.tech/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NEON_AI_GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-small-latest',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful hotel front-desk assistant. Keep responses short and professional.'
          },
          {
            role: 'user',
            content: testMessage
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    });
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} - ${response.statusText}`);
      const errorBody = await response.text();
      console.error('\nError details:');
      console.error(errorBody);
      process.exit(1);
    }
    
    const payload = await response.json();
    const aiResponse = payload?.choices?.[0]?.message?.content;
    
    if (!aiResponse || !aiResponse.trim()) {
      console.error('❌ Error: Empty response from Neon AI Gateway');
      process.exit(1);
    }
    
    console.log('✅ Connection Successful!\n');
    console.log('💬 AI Response:');
    console.log('   ' + aiResponse.trim() + '\n');
    console.log('🎉 Neon AI Gateway Test Complete!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check your internet connection');
    console.error('2. Verify the AI Gateway token');
    console.error('3. Check Neon AI Gateway status');
    process.exit(1);
  }
}

testNeonAIGateway();
