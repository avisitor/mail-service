#!/usr/bin/env node
/**
 * Development JWT Token Generator
 * Creates valid JWT tokens for testing when authentication is enabled
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Read configuration
import dotenv from 'dotenv';
dotenv.config();

const config = {
  issuer: process.env.AUTH_ISSUER || 'https://idp.worldspot.org',
  audience: process.env.AUTH_AUDIENCE || 'mail-service',
  secret: process.env.INTERNAL_JWT_SECRET || 'dev_internal_secret_change'
};

// Generate a development RSA key pair (for demo purposes)
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

function generateDevToken(claims = {}) {
  const defaultClaims = {
    sub: 'dev-user-123',
    iss: config.issuer,
    aud: config.audience,
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
    iat: Math.floor(Date.now() / 1000),
    roles: ['superadmin'],
    tenantId: 'dev-tenant-123',
    appId: 'dev-app-123',
    ...claims
  };

  // For development, we'll use the symmetric secret instead of RSA
  // This is simpler and works for local development
  return jwt.sign(defaultClaims, config.secret, {
    algorithm: 'HS256',
    header: {
      kid: 'dev-key-1'
    }
  });
}

function generateSuperAdminToken() {
  return generateDevToken({
    sub: 'superadmin',
    roles: ['superadmin'],
    tenantId: undefined // superadmin has access to all tenants
  });
}

function generateTenantAdminToken(tenantId = 'dev-tenant-123') {
  return generateDevToken({
    sub: `tenant-admin-${tenantId}`,
    roles: ['tenant-admin'],
    tenantId
  });
}

function generateAppUserToken(tenantId = 'dev-tenant-123', appId = 'dev-app-123') {
  return generateDevToken({
    sub: `app-user-${appId}`,
    roles: ['app-user'],
    tenantId,
    appId
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔑 Development JWT Token Generator');
  console.log('==================================');
  console.log('Configuration:');
  console.log(`   Issuer: ${config.issuer}`);
  console.log(`   Audience: ${config.audience}`);
  console.log('');

  const superAdminToken = generateSuperAdminToken();
  const tenantAdminToken = generateTenantAdminToken();
  const appUserToken = generateAppUserToken();

  console.log('🔹 SuperAdmin Token (full access):');
  console.log(`Bearer ${superAdminToken}`);
  console.log('');

  console.log('🔹 TenantAdmin Token (tenant-scoped):');
  console.log(`Bearer ${tenantAdminToken}`);
  console.log('');

  console.log('🔹 AppUser Token (app-scoped):');  
  console.log(`Bearer ${appUserToken}`);
  console.log('');

  console.log('Usage Examples:');
  console.log('curl -H "Authorization: Bearer <token>" http://localhost:3100/me');
  console.log('curl -H "Authorization: Bearer <token>" -X POST http://localhost:3100/send-now -d \'{"appId":"test","subject":"test","recipients":[{"email":"test@test.com"}]}\'');
}

export { generateDevToken, generateSuperAdminToken, generateTenantAdminToken, generateAppUserToken };