import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { getPrisma } from '../src/db/prisma.js';
import { generateClientSecret, hashClientSecret } from '../src/security/secrets.js';
import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';

describe('Secure App Authentication', () => {
  let fastifyApp: any;
  let prisma: any;
  let testTenantId: string;
  let testAppId: string;
  let testClientSecret: string;
  let testClientSecretHash: string;

  beforeEach(async () => {
    fastifyApp = buildApp();
    await fastifyApp.ready();
    prisma = getPrisma();

    // Generate test client secret
    testClientSecret = generateClientSecret();
    testClientSecretHash = await hashClientSecret(testClientSecret);

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Auth Tenant',
        status: 'active'
      }
    });
    testTenantId = tenant.id;

    // Create test app with client secret
    const app = await prisma.app.create({
      data: {
        tenantId: testTenantId,
        name: 'Test Auth App',
        clientId: 'test-auth-client',
        clientSecret: testClientSecretHash
      }
    });
    testAppId = app.id;
  });

  afterEach(async () => {
    if (prisma) {
      // Clean up test data
      await prisma.app.deleteMany({ where: { tenantId: testTenantId } });
      await prisma.tenant.delete({ where: { id: testTenantId } });
    }
    if (fastifyApp) {
      await fastifyApp.close();
    }
  });

  describe('POST /api/token - Secure Mode', () => {
    beforeEach(() => {
      // Ensure we're in secure mode
      process.env.ALLOW_INSECURE_APP_TOKENS = 'false';
      process.env.NODE_ENV = 'production';
    });

    it('should generate token with valid client secret', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: testClientSecret,
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.token).toBeDefined();
      expect(data.expiresIn).toBe(900); // 15 minutes
      
      // Verify JWT token structure
      const decoded = jwt.decode(data.token) as any;
      expect(decoded.sub).toBe(`app:${testAppId}`);
      expect(decoded.appId).toBe(testAppId);
      expect(decoded.tenantId).toBe(testTenantId);
      expect(decoded.roles).toContain('app');
    });

    it('should generate token using clientId instead of appId', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: 'test-auth-client', // Using clientId instead of ID
          clientSecret: testClientSecret,
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.token).toBeDefined();
      
      const decoded = jwt.decode(data.token) as any;
      expect(decoded.appId).toBe(testAppId); // Should resolve to actual app ID
      expect(decoded.clientId).toBe('test-auth-client');
    });

    it('should reject request with missing client secret', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          type: 'application'
          // clientSecret missing
        }
      });

      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.payload);
      expect(data.message).toContain('Client secret required');
    });

    it('should reject request with invalid client secret', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: 'invalid-secret',
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.payload);
      expect(data.message).toContain('Invalid client credentials');
    });

    it('should reject request for non-existent app', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: 'non-existent-app',
          clientSecret: testClientSecret,
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(404);
      const data = JSON.parse(res.payload);
      expect(data.message).toContain('Application not found');
    });

    it('should reject app without configured client secret', async () => {
      // Create app without client secret
      const appWithoutSecret = await prisma.app.create({
        data: {
          tenantId: testTenantId,
          name: 'App Without Secret',
          clientId: 'no-secret-client'
          // clientSecret: null
        }
      });

      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: appWithoutSecret.id,
          clientSecret: 'any-secret',
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.payload);
      expect(data.message).toContain('not configured for secure authentication');

      // Cleanup
      await prisma.app.delete({ where: { id: appWithoutSecret.id } });
    });

    it('should reject request with wrong type', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: testClientSecret,
          type: 'user' // Wrong type
        }
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.payload);
      expect(data.message).toContain('type=application required');
    });

    it('should reject request missing required fields', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          clientSecret: testClientSecret,
          type: 'application'
          // appId missing
        }
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.payload);
      expect(data.message).toContain('appId and type=application required');
    });
  });

  describe('POST /api/token - Development Mode', () => {
    beforeEach(() => {
      // Enable insecure mode for development
      process.env.ALLOW_INSECURE_APP_TOKENS = 'true';
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      // Reset to secure mode
      process.env.ALLOW_INSECURE_APP_TOKENS = 'false';
      process.env.NODE_ENV = 'production';
    });

    it('should generate token without client secret in development mode', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          type: 'application'
          // clientSecret omitted
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.token).toBeDefined();
      expect(data.developmentMode).toBe(true);
    });

    it('should still validate client secret if provided in development mode', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: testClientSecret,
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.token).toBeDefined();
    });

    it('should reject invalid client secret even in development mode', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: 'invalid-secret',
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.payload);
      expect(data.message).toContain('Invalid client credentials');
    });
  });

  describe('JWT Token Validation', () => {
    it('should generate valid JWT with correct claims', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: testClientSecret,
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      
      // Verify JWT can be decoded and has correct structure
      const decoded = jwt.decode(data.token, { complete: true }) as any;
      
      expect(decoded.header.alg).toBeDefined();
      expect(decoded.payload.sub).toBe(`app:${testAppId}`);
      expect(decoded.payload.appId).toBe(testAppId);
      expect(decoded.payload.clientId).toBe('test-auth-client');
      expect(decoded.payload.tenantId).toBe(testTenantId);
      expect(decoded.payload.roles).toEqual(['app']);
      expect(decoded.payload.iss).toBe(config.auth.issuer);
      expect(decoded.payload.aud).toBe(config.auth.audience);
      expect(decoded.payload.iat).toBeDefined();
      expect(decoded.payload.exp).toBeDefined();
      expect(decoded.payload.exp - decoded.payload.iat).toBe(900); // 15 minutes
    });

    it('should generate token that can be verified with internal secret', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: testClientSecret,
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      
      // Verify JWT can be verified with the internal secret
      expect(() => {
        jwt.verify(data.token, config.internalJwtSecret);
      }).not.toThrow();
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle concurrent requests safely', async () => {
      // Test for potential race conditions
      const promises = Array.from({ length: 10 }, () =>
        fastifyApp.inject({
          method: 'POST',
          url: '/api/token',
          headers: { 'Content-Type': 'application/json' },
          payload: {
            appId: testAppId,
            clientSecret: testClientSecret,
            type: 'application'
          }
        })
      );

      const results = await Promise.all(promises);
      
      // All requests should succeed
      results.forEach(res => {
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.payload);
        expect(data.token).toBeDefined();
      });
    });

    it('should not leak sensitive information in error messages', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: 'wrong-secret',
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.payload);
      expect(data.message).not.toContain(testClientSecret);
      expect(data.message).not.toContain(testClientSecretHash);
      expect(data.message).not.toContain('bcrypt');
    });

    it('should handle malformed client secrets', async () => {
      const malformedSecrets = [
        '', // Empty string
        ' ', // Whitespace
        '{}', // JSON object
        'null', // String null
        '[]', // Array
        'a'.repeat(1000), // Very long string
        '\x00\x01\x02', // Binary data
      ];

      for (const secret of malformedSecrets) {
        const res = await fastifyApp.inject({
          method: 'POST',
          url: '/api/token',
          headers: { 'Content-Type': 'application/json' },
          payload: {
            appId: testAppId,
            clientSecret: secret,
            type: 'application'
          }
        });

        expect([400, 401]).toContain(res.statusCode);
      }
    });

    it('should handle malformed request bodies', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: 'invalid-json'
      });

      expect([400, 422]).toContain(res.statusCode);
    });
  });

  describe('Performance and Rate Limiting', () => {
    it('should handle bcrypt operations efficiently', async () => {
      const startTime = Date.now();
      
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: testClientSecret,
          type: 'application'
        }
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(res.statusCode).toBe(200);
      // bcrypt should complete within reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
    });

    it('should maintain performance under load', async () => {
      const requests = 5; // Keep reasonable for unit tests
      const startTime = Date.now();
      
      const promises = Array.from({ length: requests }, () =>
        fastifyApp.inject({
          method: 'POST',
          url: '/api/token',
          headers: { 'Content-Type': 'application/json' },
          payload: {
            appId: testAppId,
            clientSecret: testClientSecret,
            type: 'application'
          }
        })
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All should succeed
      results.forEach(res => expect(res.statusCode).toBe(200));
      
      // Average time per request should be reasonable
      const avgTime = duration / requests;
      expect(avgTime).toBeLessThan(500); // < 500ms per request
    });
  });

  describe('Environment Configuration', () => {
    it('should respect ALLOW_INSECURE_APP_TOKENS environment variable', async () => {
      // Test with various environment combinations
      const testCases = [
        { NODE_ENV: 'production', ALLOW_INSECURE_APP_TOKENS: 'false', expectSecure: true },
        { NODE_ENV: 'production', ALLOW_INSECURE_APP_TOKENS: 'true', expectSecure: true }, // Production always secure
        { NODE_ENV: 'development', ALLOW_INSECURE_APP_TOKENS: 'false', expectSecure: true },
        { NODE_ENV: 'development', ALLOW_INSECURE_APP_TOKENS: 'true', expectSecure: false },
      ];

      for (const testCase of testCases) {
        process.env.NODE_ENV = testCase.NODE_ENV;
        process.env.ALLOW_INSECURE_APP_TOKENS = testCase.ALLOW_INSECURE_APP_TOKENS;

        const res = await fastifyApp.inject({
          method: 'POST',
          url: '/api/token',
          headers: { 'Content-Type': 'application/json' },
          payload: {
            appId: testAppId,
            type: 'application'
            // No client secret
          }
        });

        if (testCase.expectSecure) {
          expect(res.statusCode).toBe(401); // Should require client secret
        } else {
          expect(res.statusCode).toBe(200); // Should allow without client secret
        }
      }

      // Reset
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_INSECURE_APP_TOKENS = 'false';
    });
  });
});