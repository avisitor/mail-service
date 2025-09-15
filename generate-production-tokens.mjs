#!/usr/bin/env node
/**
 * Production-style JWT Token Generator
 * Creates valid JWT tokens using RSA signatures that match JWKS endpoints
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import fs from 'fs';

// Read configuration
import dotenv from 'dotenv';
dotenv.config();

const config = {
  issuer: process.env.AUTH_ISSUER || 'https://idp.worldspot.org',
  audience: process.env.AUTH_AUDIENCE || 'mail-service'
};

// Use one of the known key IDs from JWKS
const KNOWN_KID = '6ca1a309a735fb83'; // This should match one in JWKS

// For testing, we'll use a test private key that corresponds to the JWKS public key
// In a real environment, this would be the actual private key held by the IDP
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCb9hLnvka6XEc4
8P0AqZm481vRWGn4Buxc4fIGETGfkj4h+71pYLzLm4+5l5SOqMgQo8mivEosgIFr
uN501QuvwqWaga6Fnm0CjaJX5fgwvXYzka/0dSp3zCkQZbj0DXCFlMUVF44qgdWZ
MOVvWNS7n51rKv1lhf4uXU3oBgx427UwvubKDDVOd+BfQQTy9+65Jvjb5T5PC3x4
Mj3p2Je0ID5Qjs9pHbtYrOYl75IW00iD7d89ZnXvZkeSveEFcb15HRZiZmzIFcMy
UG+CX32R4TAiW5xcRxvAmP2MLs3VqHuasFXnTLoH8pWkVouzY46uu3XfwRlQ+WGP
XT4wM/nDAgMBAAECggEBAIX+3bktf1V2TjW3x/1MIQq4m/FrINOzpL9Ztd0sVczk
... (truncated for brevity)
-----END PRIVATE KEY-----`;

function generateProductionToken(claims = {}) {
  const defaultClaims = {
    sub: 'dev-user-123',
    iss: config.issuer,
    aud: config.audience,
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
    iat: Math.floor(Date.now() / 1000),
    roles: ['superadmin'],
    tenantId: null,
    appId: 'cmfgkybbi000410mssq4gnw8a', // Use existing app ID
    ...claims
  };

  return jwt.sign(defaultClaims, TEST_PRIVATE_KEY, {
    algorithm: 'RS256',
    header: {
      kid: KNOWN_KID
    }
  });
}

export function generateTestTenantAdmin() {
  return generateProductionToken({
    sub: 'test-tenant-admin',
    roles: ['tenant_admin'],
    tenantId: null, // Will be looked up from appId
    appId: 'cmfgkybbi000410mssq4gnw8a'
  });
}

export function generateTestSuperAdmin() {
  return generateProductionToken({
    sub: 'test-superadmin',
    roles: ['superadmin'],
    tenantId: undefined,
    appId: 'cmfgkybbi000410mssq4gnw8a'
  });
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔑 Production-style JWT Token Generator');
  console.log('=======================================');
  console.log('Using RSA signatures with JWKS-compatible key IDs');
  console.log('');

  const tenantAdminToken = generateTestTenantAdmin();
  const superAdminToken = generateTestSuperAdmin();

  console.log('🔹 TenantAdmin Token (with appId but no tenantId):');
  console.log(`Bearer ${tenantAdminToken}`);
  console.log('');

  console.log('🔹 SuperAdmin Token:');
  console.log(`Bearer ${superAdminToken}`);
  console.log('');

  console.log('Usage Example:');
  console.log('curl -H "Authorization: Bearer <token>" http://localhost:3100/me');
}