import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Load test environment configuration
dotenv.config({ path: '.env.test' });

// Test to isolate the JWT verification issue
describe('JWT Verification Debug', () => {
  let app: any;

  beforeEach(async () => {
    app = buildApp();
  });

  it('should verify internal HS256 token correctly', async () => {
    // Create internal token with minimal payload
    const payload = {
      sub: 'test@example.com',
      roles: ['tenant_admin'],
      tenantId: 'test-tenant',
      appId: 'test-app',
      iss: 'http://localhost:3100',
      aud: 'mail-service',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, 'dev_internal_secret_change', {
      algorithm: 'HS256'
    });

    console.log('🔹 Test token payload:', payload);
    console.log('🔹 Test token (first 100 chars):', token.substring(0, 100) + '...');

    // Test the /me endpoint which should trigger authentication
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('🔹 /me response status:', res.statusCode);
    console.log('🔹 /me response body:', res.payload);

    // Should not be 403 or 401 if token is valid
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).not.toBe(401);
  });
});