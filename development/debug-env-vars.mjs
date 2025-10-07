#!/usr/bin/env node

// Quick test to verify environment variable loading
import dotenv from 'dotenv';
dotenv.config();

console.log('🔍 Environment Variable Debug:');
console.log('   DISABLE_AUTH (raw):', process.env.DISABLE_AUTH);
console.log('   DISABLE_AUTH === "false":', process.env.DISABLE_AUTH === 'false');
console.log('   DISABLE_AUTH.toLowerCase():', (process.env.DISABLE_AUTH || 'false').toLowerCase());
console.log('   Final disableAuth flag:', (process.env.DISABLE_AUTH || 'false').toLowerCase() === 'true');

console.log('\n🔍 Other Auth Variables:');
console.log('   AUTH_ISSUER:', process.env.AUTH_ISSUER);
console.log('   AUTH_AUDIENCE:', process.env.AUTH_AUDIENCE);
console.log('   DEBUG_AUTH:', process.env.DEBUG_AUTH);