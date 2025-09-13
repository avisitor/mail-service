#!/usr/bin/env node

// Simple test to check dbReady state and trigger worker
import dotenv from 'dotenv';
dotenv.config();

console.log('🔍 Testing Worker After Fixing Dry Run');
console.log('=====================================');

// Check dbReady state
const { dbReady } = await import('./src/db/state.ts');
console.log('🛡️  dbReady flag:', dbReady);

// Test the worker directly
const { workerTick } = await import('./src/modules/groups/service.ts');
console.log('🔄 Running worker directly...');
const result = await workerTick();
console.log('   Result:', result);

// Test via API
console.log('🔄 Running worker via API...');
const response = await fetch('http://localhost:3100/internal/worker/tick', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
});
const apiResult = await response.json();
console.log('   API Result:', apiResult);

// Check MailHog
console.log('📬 Checking MailHog...');
const mailHogResponse = await fetch('http://localhost:8025/api/v2/messages');
const mailHogData = await mailHogResponse.json();
console.log('   Messages in MailHog:', mailHogData.total);

console.log('✅ Test complete');