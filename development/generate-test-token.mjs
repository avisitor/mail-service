#!/usr/bin/env node

import jwt from 'jsonwebtoken';
import fs from 'fs';

// Real test data from database
const REAL_TENANT_ID = 'cmfgkxlyt000010msi8qxmraa';
const REAL_APP_ID = 'cmfgkybbi000410mssq4gnw8a';

const tenantAdminClaims = {
  sub: `tenant-admin-${REAL_TENANT_ID}`,
  iss: 'http://localhost:3100',
  aud: 'mail-service',
  exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
  iat: Math.floor(Date.now() / 1000),
  roles: ['tenant_admin'],
  tenantId: REAL_TENANT_ID,
  appId: REAL_APP_ID
};

// Use real IDP RSA key for realistic testing
const privateKey = fs.readFileSync('keys/private-6ca1a309a735fb83.pem', 'utf8');

const token = jwt.sign(tenantAdminClaims, privateKey, {
  algorithm: 'RS256',
  header: {
    kid: '6ca1a309a735fb83' // Real IDP key ID
  }
});

console.log('🔹 TenantAdmin Token (real test data):');
console.log(`Bearer ${token}`);