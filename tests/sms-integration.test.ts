import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { getPrisma } from '../src/db/prisma.js';
import { config } from '../src/config.js';
import { encrypt } from '../src/modules/sms/service.js';
import jwt from 'jsonwebtoken';

// Helper function to create SMS config with encrypted token
async function createTestSmsConfig(prisma: any, data: any) {
  const createData: any = {
    scope: data.scope,
    sid: data.sid,
    token: encrypt(data.sid + data.authToken),
    fromNumber: data.fromNumber,
    isActive: data.isActive ?? true,
    serviceSid: data.serviceSid || null,
    fallbackTo: data.fallbackTo || null
  };

  // Handle tenant relationship
  if (data.tenantId) {
    createData.tenant = { connect: { id: data.tenantId } };
  }

  // Handle app relationship  
  if (data.appId) {
    createData.app = { connect: { id: data.appId } };
  }

  return await prisma.smsConfig.create({
    data: createData
  });
}

describe('SMS API Integration Tests', () => {
  // Test data will be created dynamically
  let TEST_TENANT_ID: string;
  let TEST_APP_ID: string;
  let TEST_ADMIN_TOKEN: string;
  let TEST_USER_TOKEN: string;
  let prisma: any;
  let fastify: any;
  
  if (!config.databaseUrl?.includes('mysql://')) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  beforeAll(async () => {
    prisma = getPrisma();
    fastify = buildApp();
    await fastify.ready();

    // Clean up any existing test data first
    await prisma.app.deleteMany({
      where: { clientId: { startsWith: 'test-app-sms' } }
    });
    await prisma.tenant.deleteMany({
      where: { name: { startsWith: 'Test Tenant for SMS' } }
    });

    // Create test tenant first
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant for SMS'
      }
    });
    TEST_TENANT_ID = tenant.id;

    // Then create app with the tenant ID
    const app = await prisma.app.create({
      data: {
        name: 'Test App for SMS',
        clientId: `test-app-sms-${Date.now()}`,
        tenantId: TEST_TENANT_ID
      }
    });
    TEST_APP_ID = app.id;

    // Generate internal JWT tokens for testing with proper kid header
    TEST_ADMIN_TOKEN = jwt.sign(
      {
        sub: 'admin@example.com',
        roles: ['super_admin'],
        tenantId: TEST_TENANT_ID,
        appId: TEST_APP_ID,
        exp: Math.floor(Date.now() / 1000) + (60 * 60),
        iat: Math.floor(Date.now() / 1000),
        iss: 'https://idp.worldspot.org',
        aud: 'mail-service'
      },
      'dev_internal_secret_change',
      { 
        algorithm: 'HS256',
        header: { 
          alg: 'HS256',
          kid: 'internal-secret' 
        }
      }
    );
    
    TEST_USER_TOKEN = jwt.sign(
      {
        sub: 'user@example.com', 
        roles: ['tenant_admin'],
        tenantId: TEST_TENANT_ID,
        appId: TEST_APP_ID,
        exp: Math.floor(Date.now() / 1000) + (60 * 60),
        iat: Math.floor(Date.now() / 1000),
        iss: 'https://idp.worldspot.org',
        aud: 'mail-service'
      },
      'dev_internal_secret_change',
      {
        algorithm: 'HS256',
        header: { 
          alg: 'HS256',
          kid: 'internal-secret' 
        }
      }
    );
  });

  afterEach(async () => {
    // Clean up test SMS configs after each test
    await prisma.smsConfig.deleteMany({
      where: {
        OR: [
          { sid: { contains: 'test123456789' } },
          { sid: { contains: 'ACtest' } },
          { sid: { contains: 'ACinvalid' } },
          { sid: { contains: 'ACglobal' } },
          { sid: { contains: 'ACother' } }
        ]
      }
    });
  });

  describe('SMS Configuration API Endpoints', () => {
    it('should create a global SMS config (superadmin only)', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/sms-configs',
        headers: {
          'authorization': `Bearer ${TEST_ADMIN_TOKEN}`
        },
        payload: {
          scope: 'GLOBAL',
          serviceSid: 'twilio',
          sid: 'ACtest123456789global',
          authToken: 'test_token_global',
          fromNumber: '+15555554444',
          isActive: true
        }
      });

      expect(response.statusCode).toBe(201);
      const created = JSON.parse(response.body);
      expect(created.scope).toBe('GLOBAL');
      expect(created.sid).toBe('ACtest123456789global');
      expect(created.fromNumber).toBe('+15555554444');
      expect(created.token).toBe('***'); // Token should be masked in output
    });

    it('should reject global SMS config creation for non-superadmin', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/sms-configs',
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        },
        payload: {
          scope: 'GLOBAL',
          serviceSid: 'twilio',
          sid: 'ACtest123456789reject',
          authToken: 'test_token_reject',
          fromNumber: '+15555554445',
          isActive: true
        }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should create a tenant SMS config', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/sms-configs',
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        },
        payload: {
          scope: 'TENANT',
          tenantId: TEST_TENANT_ID,
          serviceSid: 'twilio',
          sid: 'ACtest123456789tenant',
          authToken: 'test_token_tenant',
          fromNumber: '+15555555555',
          isActive: true
        }
      });

      expect(response.statusCode).toBe(201);
      const created = JSON.parse(response.body);
      expect(created.scope).toBe('TENANT');
      expect(created.tenantId).toBe(TEST_TENANT_ID);
      expect(created.sid).toBe('ACtest123456789tenant');
      expect(created.fromNumber).toBe('+15555555555');
      expect(created.token).toBe('***'); // Token should be masked in output
    });

    it('should create an app SMS config', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/sms-configs',
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        },
        payload: {
          scope: 'APP',
          appId: TEST_APP_ID,
          serviceSid: 'twilio',
          sid: 'ACtest123456789app',
          authToken: 'test_token_app',
          fromNumber: '+15555556666',
          isActive: true
        }
      });

      expect(response.statusCode).toBe(201);
      const created = JSON.parse(response.body);
      expect(created.scope).toBe('APP');
      expect(created.appId).toBe(TEST_APP_ID);
      expect(created.sid).toBe('ACtest123456789app');
      expect(created.fromNumber).toBe('+15555556666');
      expect(created.token).toBe('***'); // Token should be masked in output
    });

    it('should get SMS configs for superadmin', async () => {
      // Create a test config first
      await createTestSmsConfig(prisma, {
        scope: 'GLOBAL',
        serviceSid: 'twilio',
        sid: 'ACtest123456789list',
        authToken: 'test_token_list',
        fromNumber: '+15555554444',
        isActive: true
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/sms-configs',
        headers: {
          'authorization': `Bearer ${TEST_ADMIN_TOKEN}`
        }
      });

      expect(response.statusCode).toBe(200);
      const configs = JSON.parse(response.body);
      expect(Array.isArray(configs)).toBe(true);
      expect(configs.length).toBeGreaterThan(0);
      
      const testConfig = configs.find((c: any) => c.sid === 'ACtest123456789list');
      expect(testConfig).toBeDefined();
      expect(testConfig.token).toBe('***'); // Token should be masked
    });

    it('should get SMS config by ID', async () => {
      // Create a test config first
      const created = await createTestSmsConfig(prisma, {
        scope: 'TENANT',
        tenantId: TEST_TENANT_ID,
        serviceSid: 'twilio',
        sid: 'ACtest123456789get',
        authToken: 'test_token_get',
        fromNumber: '+15555555555',
        isActive: true
      });

      const response = await fastify.inject({
        method: 'GET',
        url: `/sms-configs/${created.id}`,
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      });

      expect(response.statusCode).toBe(200);
      const config = JSON.parse(response.body);
      expect(config.id).toBe(created.id);
      expect(config.sid).toBe('ACtest123456789get');
      expect(config.token).toBe('***'); // Token should be masked
    });

    it('should update SMS config', async () => {
      // Create a test config first
      const created = await createTestSmsConfig(prisma, {
        scope: 'TENANT',
        tenantId: TEST_TENANT_ID,
        serviceSid: 'twilio',
        sid: 'ACtest123456789update',
        authToken: 'test_token_update',
        fromNumber: '+15555556666',
        isActive: false
      });

      const response = await fastify.inject({
        method: 'PUT',
        url: `/sms-configs/${created.id}`,
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        },
        payload: {
          fromNumber: '+15555557777',
          isActive: true
        }
      });

      expect(response.statusCode).toBe(200);
      const updated = JSON.parse(response.body);
      expect(updated.fromNumber).toBe('+15555557777');
      expect(updated.isActive).toBe(true);
      expect(updated.sid).toBe('ACtest123456789update'); // Unchanged
    });

    it('should delete SMS config', async () => {
      // Create a test config first
      const created = await createTestSmsConfig(prisma, {
        scope: 'TENANT',
        tenantId: TEST_TENANT_ID,
        serviceSid: 'twilio',
        sid: 'ACtest123456789delete',
        authToken: 'test_token_delete',
        fromNumber: '+15555558888',
        isActive: true
      });

      const response = await fastify.inject({
        method: 'DELETE',
        url: `/sms-configs/${created.id}`,
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      });

      expect(response.statusCode).toBe(204);
      
      // Verify it's deleted
      const getResponse = await fastify.inject({
        method: 'GET',
        url: `/sms-configs/${created.id}`,
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      });
      expect(getResponse.statusCode).toBe(404);
    });
  });

  describe('SMS Config Test and Activation Endpoints', () => {
    it('should test SMS config with valid Twilio credentials', async () => {
      // Create a test config first
      const created = await createTestSmsConfig(prisma, {
        scope: 'TENANT',
        tenantId: TEST_TENANT_ID,
        serviceSid: 'twilio',
        sid: 'ACtest123456789testvalid',
        authToken: 'test_token_testvalid',
        fromNumber: '+15005550006', // Twilio test number
        isActive: false
      });

      const response = await fastify.inject({
        method: 'POST',
        url: `/sms-configs/${created.id}/test`,
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        },
        payload: {
          to: '+15005550006',
          message: 'Test message from automated test'
        }
      });

      // Test endpoint should respond with success or failure status
      expect([200, 400, 422].includes(response.statusCode)).toBe(true);
      
      if (response.statusCode === 200) {
        const result = JSON.parse(response.body);
        expect(result).toHaveProperty('success');
      } else {
        // Expected failure due to test credentials
        const error = JSON.parse(response.body);
        expect(error).toHaveProperty('error');
      }
    });

    it('should handle test SMS config with invalid credentials', async () => {
      // Create a test config with invalid credentials
      const created = await createTestSmsConfig(prisma, {
        scope: 'TENANT',
        tenantId: TEST_TENANT_ID,
        serviceSid: 'twilio',
        sid: 'ACinvalidcredentials123',
        authToken: 'invalid_token',
        fromNumber: '+15555559999',
        isActive: false
      });

      const response = await fastify.inject({
        method: 'POST',
        url: `/sms-configs/${created.id}/test`,
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        },
        payload: {
          to: '+15005550006',
          message: 'Test message with invalid credentials'
        }
      });

      // Should return error for invalid credentials
      expect([400, 422, 500].includes(response.statusCode)).toBe(true);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error');
    });

    it('should activate SMS config', async () => {
      // Create a test config first
      const created = await createTestSmsConfig(prisma, {
        scope: 'TENANT',
        tenantId: TEST_TENANT_ID,
        serviceSid: 'twilio',
        sid: 'ACtest123456789activate',
        authToken: 'test_token_activate',
        fromNumber: '+15555550000',
        isActive: false
      });

      const response = await fastify.inject({
        method: 'POST',
        url: `/sms-configs/${created.id}/activate`,
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.isActive).toBe(true);
    });

    it('should deactivate other configs when activating one (single active config rule)', async () => {
      // Create multiple configs in same scope
      const config1 = await createTestSmsConfig(prisma, {
        scope: 'TENANT',
        tenantId: TEST_TENANT_ID,
        serviceSid: 'twilio',
        sid: 'ACtest123456789first',
        authToken: 'test_token_first',
        fromNumber: '+15555550001',
        isActive: true
      });

      const config2 = await createTestSmsConfig(prisma, {
        scope: 'TENANT',
        tenantId: TEST_TENANT_ID,
        serviceSid: 'twilio',
        sid: 'ACtest123456789second',
        authToken: 'test_token_second',
        fromNumber: '+15555550002',
        isActive: false
      });

      // Activate the second config
      const response = await fastify.inject({
        method: 'POST',
        url: `/sms-configs/${config2.id}/activate`,
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      });

      expect(response.statusCode).toBe(200);

      // Check that config1 is now deactivated and config2 is activated
      const config1Updated = await prisma.smsConfig.findUnique({ where: { id: config1.id } });
      const config2Updated = await prisma.smsConfig.findUnique({ where: { id: config2.id } });
      
      expect(config1Updated.isActive).toBe(false);
      expect(config2Updated.isActive).toBe(true);
    });
  });

  describe('Error Handling and Validation', () => {
    it('should return 404 for non-existent SMS config', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/sms-configs/non-existent-id',
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      });

      expect(response.statusCode).toBe(404);
    });

    it('should validate required fields when creating SMS config', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/sms-configs',
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        },
        payload: {
          scope: 'TENANT',
          // Missing required fields: sid, token, fromNumber
        }
      });

      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error');
    });

    it('should prevent unauthorized access to configs from other tenants', async () => {
      // Create config for a different tenant (simulate)
      const otherTenantConfig = await createTestSmsConfig(prisma, {
        scope: 'TENANT',
        tenantId: TEST_TENANT_ID, // We'll use same ID but test access control
        serviceSid: 'twilio',
        sid: 'ACother123456789',
        authToken: 'test_token_other',
        fromNumber: '+15555550999',
        isActive: true
      });

      // Try to access with a token from a different tenant context
      const differentTenantToken = jwt.sign(
        {
          sub: 'other@example.com',
          roles: ['tenant_admin'],
          tenantId: 'different-tenant-id',
          appId: 'different-app-id',
          exp: Math.floor(Date.now() / 1000) + (60 * 60),
          iat: Math.floor(Date.now() / 1000),
          iss: 'https://idp.worldspot.org',
          aud: 'mail-service'
        },
        'dev_internal_secret_change',
        {
          algorithm: 'HS256',
          header: { 
            alg: 'HS256',
            kid: 'internal-secret' 
          }
        }
      );

      const response = await fastify.inject({
        method: 'GET',
        url: `/sms-configs/${otherTenantConfig.id}`,
        headers: {
          'authorization': `Bearer ${differentTenantToken}`
        }
      });

      // Should return 404 or 403 for unauthorized access
      expect([403, 404].includes(response.statusCode)).toBe(true);
    });
  });

  describe('SMS Config Resolution for Apps', () => {
    it('should resolve SMS config for app with proper hierarchy', async () => {
      // Create configs at different levels
      const globalConfig = await createTestSmsConfig(prisma, {
        scope: 'GLOBAL',
        serviceSid: 'twilio',
        sid: 'ACglobal123456789',
        authToken: 'test_token_global',
        fromNumber: '+15555550100',
        isActive: true
      });

      const tenantConfig = await createTestSmsConfig(prisma, {
        scope: 'TENANT', 
        tenantId: TEST_TENANT_ID,
        serviceSid: 'twilio',
        sid: 'ACtenant123456789',
        authToken: 'test_token_tenant',
        fromNumber: '+15555550200',
        isActive: true
      });

      const appConfig = await createTestSmsConfig(prisma, {
        scope: 'APP',
        appId: TEST_APP_ID,
        tenantId: TEST_TENANT_ID,
        serviceSid: 'twilio',
        sid: 'ACapp123456789',
        authToken: 'test_token_app',
        fromNumber: '+15555550300',
        isActive: true
      });

      // Test resolution - app config should take precedence
      const response = await fastify.inject({
        method: 'GET',
        url: `/sms-configs/resolve?appId=${TEST_APP_ID}`,
        headers: {
          'authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      });

      expect(response.statusCode).toBe(200);
      const resolved = JSON.parse(response.body);
      expect(resolved.scope).toBe('APP');
      expect(resolved.accountSid).toBe('ACapp123456789');

      // Clean up for next tests
      await prisma.smsConfig.deleteMany({
        where: {
          id: { in: [globalConfig.id, tenantConfig.id, appConfig.id] }
        }
      });
    });
  });
});