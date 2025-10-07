#!/usr/bin/env node

// Debug script to check worker guard conditions

// First import config to ensure dotenv loads
import('./src/config.js').then(({ config }) => {
  console.log('🔍 After config import:');
  const url = process.env.DATABASE_URL || '';
  console.log('  DATABASE_URL:', url ? `${url.substring(0, 30)}...` : '(not set)');
  console.log('  URL starts with mysql://:', url.startsWith('mysql://'));
  
  // Check if we can import and check the actual guard conditions
  return import('./src/db/prisma.js');
}).then(({ isPrismaDisabled }) => {
  console.log('  isPrismaDisabled():', isPrismaDisabled());
}).catch(e => {
  console.log('  Error:', e.message);
});