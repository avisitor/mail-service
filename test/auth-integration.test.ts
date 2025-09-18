import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import { getPrisma } from '../src/db/prisma.js';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';

// Test data will be created dynamically
let TEST_TENANT_ID: string;
let TEST_APP_ID: string;

// Use the real IDP key (same as generate-test-token.mjs)
function getPrivateKey() {
  const keyPath = 'keys/private-6ca1a309a735fb83.pem';
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Real IDP key not found at ${keyPath}. Run setup scripts first.`);
  }
  
  const key = fs.readFileSync(keyPath, 'utf8');
  return { kid: '6ca1a309a735fb83', key };
}

function createTestToken(payload: any): string {
  const { kid, key } = getPrivateKey();
  
  const defaultPayload = {
    iss: config.auth.issuer, // Use production issuer
    aud: config.auth.audience, // Use production audience
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
    iat: Math.floor(Date.now() / 1000),
    ...payload
  };

  // Use RS256 with real RSA key for production-like testing
  return jwt.sign(defaultPayload, key, {
    algorithm: 'RS256',
    header: {
      alg: 'RS256',
      kid: kid
    }
  });
}

const dbValid = (config.databaseUrl || '').startsWith('mysql://');

describe('Authentication & Authorization', () => {
  let fastifyApp: any;
  let prisma: any;

  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  beforeEach(async () => {
    fastifyApp = buildApp();
    prisma = getPrisma();
    
    // Clean up any existing test data
    await prisma.app.deleteMany({
      where: {
        name: 'Auth Test App'
      }
    });
    
    await prisma.tenant.deleteMany({
      where: {
        name: 'Auth Test Tenant'
      }
    });
    
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Auth Test Tenant'
      }
    });
    TEST_TENANT_ID = tenant.id;
    
    // Create test app
    const testApp = await prisma.app.create({
      data: {
        name: 'Auth Test App',
        tenantId: TEST_TENANT_ID,
        clientId: `auth-test-${Date.now()}`
      }
    });
    TEST_APP_ID = testApp.id;
  });

  describe('AppId to TenantId Resolution', () => {
    it('should resolve tenantId from appId in JWT token', async () => {
      // Create a token with appId but no tenantId (simulating IDP behavior)
      const token = createTestToken({
        sub: 'test@example.com',
        roles: ['tenant_admin'],
        tenantId: null,
        appId: TEST_APP_ID, // Use dynamically created app ID
        iss: 'http://localhost:3100',
        aud: 'mail-service'
      });

      const res = await fastifyApp.inject({
        method: 'GET',
        url: '/me',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const user = JSON.parse(res.payload);
      
      // Should have resolved tenantId from appId
      expect(user.tenantId).toBe(TEST_TENANT_ID);
      expect(user.appId).toBe(TEST_APP_ID);
      expect(user.roles).toContain('tenant_admin');
    });

    it('should handle invalid appId gracefully', async () => {
      const token = createTestToken({
        sub: 'test@example.com',
        roles: ['tenant_admin'],
        tenantId: null,
        appId: 'invalid-app-id',
        iss: 'http://localhost:3100',
        aud: 'mail-service'
      });

      const res = await fastifyApp.inject({
        method: 'GET',
        url: '/me',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const user = JSON.parse(res.payload);
      
      // Should not have resolved tenantId from invalid appId
      expect(user.tenantId).toBeNull();
      expect(user.appId).toBe('invalid-app-id');
    });
  });

  describe('AppId Validation Security', () => {
    it('should reject requests with invalid appId in URL params', async () => {
      const res = await fastifyApp.inject({
        method: 'GET',
        url: '/admin?appId=invalid-app-id&returnUrl=http://localhost:3100/test'
      });

      // Should reject invalid appId (security fix)
      expect(res.statusCode).toBe(400);
    });

    it('should accept requests with valid appId in URL params', async () => {
      const res = await fastifyApp.inject({
        method: 'GET',
        url: `/admin?appId=${TEST_APP_ID}&returnUrl=http://localhost:3100/test`
      });

      // Should redirect to IDP for authentication (not reject due to invalid appId)
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('idp.worldspot.org');
    });
  });
});