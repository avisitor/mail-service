#!/usr/bin/env node

import jwt from 'jsonwebtoken';
import fs from 'fs';

// Use real test data from database (same as generate-test-token.mjs)
const REAL_TENANT_ID = 'cmfgkxlyt000010msi8qxmraa';
const REAL_APP_ID = 'cmfgkybbi000410mssq4gnw8a';

// Use the real IDP key
const privateKey = fs.readFileSync('keys/private-6ca1a309a735fb83.pem', 'utf8');

const payload = {
  sub: 'test@example.com',
  roles: ['tenant_admin'],
  tenantId: null,
  appId: REAL_APP_ID,
  iss: 'https://idp.worldspot.org',
  aud: 'mail-service',
  exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
  iat: Math.floor(Date.now() / 1000)
};

const token = jwt.sign(payload, privateKey, {
  algorithm: 'RS256',
  header: {
    alg: 'RS256',
    kid: '6ca1a309a735fb83'
  }
});

console.log('Generated JWT:');
console.log(token);
console.log('');

// Try to decode header without verification
const parts = token.split('.');
const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
console.log('Header:', JSON.stringify(header, null, 2));

const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
console.log('Payload:', JSON.stringify(decodedPayload, null, 2));

// Try to get public key from jwks.json and verify
try {
  const jwks = JSON.parse(fs.readFileSync('jwks.json', 'utf8'));
  const key = jwks.keys.find(k => k.kid === '6ca1a309a735fb83');
  if (key) {
    console.log('Found matching key in jwks.json:', !!key);
    console.log('Key algorithm:', key.alg);
    console.log('Key use:', key.use);
  } else {
    console.log('No matching key found in jwks.json');
  }
} catch (e) {
  console.log('Error reading jwks.json:', e.message);
}