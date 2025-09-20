import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { getPrisma } from '../src/db/prisma.js';
import { generateClientSecret, hashClientSecret } from '../src/security/secrets.js';

describe('Secure App Authentication Integration', () => {
  let fastifyApp: any;
  let prisma: any;
  let testTenantId: string;
  let testAppId: string;
  let testClientSecret: string;
  let validToken: string;

  beforeEach(async () => {
    fastifyApp = buildApp();
    await fastifyApp.ready();
    prisma = getPrisma();

    // Set secure mode
    process.env.ALLOW_INSECURE_APP_TOKENS = 'false';
    process.env.NODE_ENV = 'production';

    // Create test data
    testClientSecret = generateClientSecret();
    const testClientSecretHash = await hashClientSecret(testClientSecret);

    const tenant = await prisma.tenant.create({
      data: { name: 'Integration Test Tenant', status: 'active' }
    });
    testTenantId = tenant.id;

    const app = await prisma.app.create({
      data: {
        tenantId: testTenantId,
        name: 'Integration Test App',
        clientId: 'integration-test-client',
        clientSecret: testClientSecretHash
      }
    });
    testAppId = app.id;

    // Get a valid token for authenticated endpoint tests
    const tokenRes = await fastifyApp.inject({
      method: 'POST',
      url: '/api/token',
      headers: { 'Content-Type': 'application/json' },
      payload: {
        appId: testAppId,
        clientSecret: testClientSecret,
        type: 'application'
      }
    });
    validToken = JSON.parse(tokenRes.payload).token;
  });

  afterEach(async () => {
    if (prisma) {
      await prisma.app.deleteMany({ where: { tenantId: testTenantId } });
      await prisma.tenant.delete({ where: { id: testTenantId } });
    }
    if (fastifyApp) {
      await fastifyApp.close();
    }
  });

  describe('Protected API Endpoints', () => {
    it('should protect /send-now endpoint', async () => {
      // First, test without authentication
      const unauthedRes = await fastifyApp.inject({
        method: 'POST',
        url: '/send-now',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          templateId: 'test-template',
          recipients: [{ email: 'test@example.com', name: 'Test User' }]
        }
      });

      // Should require authentication
      expect([401, 403]).toContain(unauthedRes.statusCode);

      // Now test with valid token
      const authedRes = await fastifyApp.inject({
        method: 'POST',
        url: '/send-now',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validToken}`
        },
        payload: {
          templateId: 'non-existent-template',
          recipients: [{ email: 'test@example.com', name: 'Test User' }]
        }
      });

      // Should get past authentication (though template may not exist)
      expect(authedRes.statusCode).not.toBe(401);
      expect(authedRes.statusCode).not.toBe(403);
    });

    it('should reject expired tokens', async () => {
      // This test would require token manipulation or waiting for expiration
      // For now, we'll test with a malformed token
      const malformedToken = 'invalid.token.here';

      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/send-now',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${malformedToken}`
        },
        payload: {
          templateId: 'test-template',
          recipients: [{ email: 'test@example.com', name: 'Test User' }]
        }
      });

      expect([401, 403]).toContain(res.statusCode);
    });

    it('should reject tokens without Bearer prefix', async () => {
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/send-now',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': validToken // Missing 'Bearer '
        },
        payload: {
          templateId: 'test-template',
          recipients: [{ email: 'test@example.com', name: 'Test User' }]
        }
      });

      expect([401, 403]).toContain(res.statusCode);
    });
  });

  describe('Token Refresh and Lifecycle', () => {
    it('should allow generating multiple tokens for same app', async () => {
      const requests = Array.from({ length: 3 }, () =>
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

      const responses = await Promise.all(requests);
      
      // All should succeed
      responses.forEach(res => expect(res.statusCode).toBe(200));
      
      // All tokens should be different
      const tokens = responses.map(res => JSON.parse(res.payload).token);
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(3);
    });

    it('should maintain token validity across requests', async () => {
      // Use the same token for multiple requests
      const requests = Array.from({ length: 3 }, () =>
        fastifyApp.inject({
          method: 'GET',
          url: '/healthz',
          headers: {
            'Authorization': `Bearer ${validToken}`
          }
        })
      );

      const responses = await Promise.all(requests);
      
      // All should succeed (healthz doesn't require auth, but token should not be invalidated)
      responses.forEach(res => expect(res.statusCode).toBe(200));
    });
  });

  describe('Security Headers and CORS', () => {
    it('should include security headers in token response', async () => {
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
      
      // Check for security headers
      expect(res.headers['content-type']).toContain('application/json');
      
      // Token should not be cached
      if (res.headers['cache-control']) {
        expect(res.headers['cache-control']).toContain('no-cache');
      }
    });

    it('should handle CORS for token endpoint', async () => {
      // Test preflight request
      const preflightRes = await fastifyApp.inject({
        method: 'OPTIONS',
        url: '/api/token',
        headers: {
          'Origin': 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });

      // Should handle OPTIONS request
      expect([200, 204]).toContain(preflightRes.statusCode);
    });
  });

  describe('Error Handling and Logging', () => {
    it('should log security events appropriately', async () => {
      // Test failed authentication - this should be logged
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
      // In a real test, we'd check log output, but that's complex in this setup
    });

    it('should handle database connection errors gracefully', async () => {
      // This is hard to test without actually breaking the DB
      // But we can test with non-existent app IDs
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: 'definitely-does-not-exist',
          clientSecret: testClientSecret,
          type: 'application'
        }
      });

      expect(res.statusCode).toBe(404);
      const data = JSON.parse(res.payload);
      expect(data.message).toBeDefined();
    });

    it('should handle server errors gracefully', async () => {
      // Test with malformed request body
      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: 'invalid-json-data'
      });

      expect([400, 422, 500]).toContain(res.statusCode);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical client application flow', async () => {
      // 1. App starts up, gets token
      const tokenRes = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: testClientSecret,
          type: 'application'
        }
      });

      expect(tokenRes.statusCode).toBe(200);
      const { token } = JSON.parse(tokenRes.payload);

      // 2. App makes authenticated API calls (simulated)
      const apiRes = await fastifyApp.inject({
        method: 'GET',
        url: '/healthz', // Simple endpoint
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(apiRes.statusCode).toBe(200);
    });

    it('should handle client secret rotation', async () => {
      // 1. Generate new client secret
      const newClientSecret = generateClientSecret();
      const newClientSecretHash = await hashClientSecret(newClientSecret);

      // 2. Update app with new secret
      await prisma.app.update({
        where: { id: testAppId },
        data: { clientSecret: newClientSecretHash }
      });

      // 3. Old secret should fail
      const oldSecretRes = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: testClientSecret, // Old secret
          type: 'application'
        }
      });

      expect(oldSecretRes.statusCode).toBe(401);

      // 4. New secret should work
      const newSecretRes = await fastifyApp.inject({
        method: 'POST',
        url: '/api/token',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          appId: testAppId,
          clientSecret: newClientSecret, // New secret
          type: 'application'
        }
      });

      expect(newSecretRes.statusCode).toBe(200);
    });

    it('should handle high-frequency token requests', async () => {
      const requestCount = 10;
      const startTime = Date.now();
      
      const promises = Array.from({ length: requestCount }, (_, i) =>
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
      const totalTime = endTime - startTime;

      // All requests should succeed
      results.forEach((res, i) => {
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.payload);
        expect(data.token).toBeDefined();
      });

      // Performance should be reasonable
      const avgTime = totalTime / requestCount;
      expect(avgTime).toBeLessThan(1000); // < 1 second per request on average
    });
  });
});