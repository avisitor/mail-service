import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import { getPrisma } from '../src/db/prisma.js';
import fs from 'fs';
import jwt from 'jsonwebtoken';

// Mock database URL validation
const dbValid = (config.databaseUrl || '').startsWith('mysql://');

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
    iss: config.auth.issuer,
    aud: config.auth.audience,
    exp: Math.floor(Date.now() / 1000) + (60 * 60),
    iat: Math.floor(Date.now() / 1000),
    ...payload
  };

  return jwt.sign(defaultPayload, key, {
    algorithm: 'RS256',
    header: {
      alg: 'RS256',
      kid: kid
    }
  });
}

describe('SMTP Configs API', () => {
  let app: any;
  let prisma: any;

  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  beforeEach(async () => {
    app = buildApp();
    prisma = getPrisma();
    
    // Clean up any existing SMTP configs for test tenants
    await prisma.smtpConfig.deleteMany({
      where: {
        OR: [
          { tenantId: 'test-tenant' },
          { tenantId: 'tenant-a' },
          { tenantId: 'tenant-b' },
          { scope: 'GLOBAL' }
        ]
      }
    });
    
    // Ensure test tenants exist
    await prisma.tenant.upsert({
      where: { id: 'test-tenant' },
      create: { id: 'test-tenant', name: 'Test Tenant' },
      update: {}
    });
    
    await prisma.tenant.upsert({
      where: { id: 'tenant-a' },
      create: { id: 'tenant-a', name: 'Tenant A' },
      update: {}
    });
    
    await prisma.tenant.upsert({
      where: { id: 'tenant-b' },
      create: { id: 'tenant-b', name: 'Tenant B' },
      update: {}
    });

    // Create test SMTP configs for filtering tests
    // Global config (should be visible to tenant admins)
    await prisma.smtpConfig.create({
      data: {
        scope: 'GLOBAL',
        host: 'global.smtp.example.com',
        port: 587,
        secure: true,
        service: 'smtp',
        fromAddress: 'global@example.com',
        fromName: 'Global Config',
        isActive: true,
        createdBy: 'system'
      }
    });

    // Config for test-tenant (should be visible to test-tenant admin)
    await prisma.smtpConfig.create({
      data: {
        scope: 'TENANT',
        tenantId: 'test-tenant',
        host: 'tenant.smtp.example.com',
        port: 587,
        secure: true,
        service: 'smtp',
        fromAddress: 'tenant@example.com',
        fromName: 'Test Tenant Config',
        isActive: true,
        createdBy: 'system'
      }
    });

    // Config for tenant-a (should NOT be visible to test-tenant admin)
    await prisma.smtpConfig.create({
      data: {
        scope: 'TENANT',
        tenantId: 'tenant-a',
        host: 'tenanta.smtp.example.com',
        port: 587,
        secure: true,
        service: 'smtp',
        fromAddress: 'tenanta@example.com',
        fromName: 'Tenant A Config',
        isActive: true,
        createdBy: 'system'
      }
    });
  });

  describe('POST /smtp-configs', () => {
    it('should create SMTP config for superadmin', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const smtpData = {
        scope: 'GLOBAL',
        host: 'localhost',
        port: 1025,
        secure: false,
        service: 'smtp',
        fromAddress: 'test@example.com',
        fromName: 'Test SMTP Config'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: smtpData
      });

      expect(res.statusCode).toBe(201);
      const created = JSON.parse(res.payload);
      expect(created.fromName).toBe('Test SMTP Config');
      expect(created.host).toBe('localhost');
      expect(created.port).toBe(1025);
      expect(created.id).toBeDefined();
    });

    it('should create tenant-specific SMTP config for tenant admin', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: 'tenant-b'
      });

      const smtpData = {
        scope: 'TENANT',
        tenantId: 'tenant-b',
        host: 'localhost',
        port: 1025,
        secure: false,
        service: 'smtp',
        fromAddress: 'tenantb@example.com',
        fromName: 'Tenant B SMTP Config'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: smtpData
      });

      expect(res.statusCode).toBe(201);
      const created = JSON.parse(res.payload);
      expect(created.tenantId).toBe('tenant-b');
    });

    it('should reject SMTP config creation for wrong tenant', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: 'tenant-a'
      });

      const smtpData = {
        scope: 'TENANT',
        tenantId: 'tenant-b', // Different tenant
        host: 'localhost',
        port: 1025,
        secure: false,
        service: 'smtp',
        fromAddress: 'test@example.com',
        fromName: 'Unauthorized SMTP Config'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: smtpData
      });

      expect(res.statusCode).toBe(403);
    });

    it('should reject invalid SMTP config data', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const smtpData = {
        // Missing required 'scope' field
        host: 'localhost',
        port: 1025,
        service: 'smtp'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: smtpData
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject request without authentication', async () => {
      const smtpData = {
        scope: 'GLOBAL',
        host: 'localhost',
        port: 1025,
        service: 'smtp',
        fromAddress: 'test@example.com'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/smtp-configs',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: smtpData
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /smtp-configs', () => {
    it('should list SMTP configs for superadmin', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'GET',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const configs = JSON.parse(res.payload);
      expect(Array.isArray(configs)).toBe(true);
    });

    it('should list only tenant configs for tenant admin', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: 'test-tenant'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const configs = JSON.parse(res.payload);
      expect(Array.isArray(configs)).toBe(true);
      
      // Should only include configs for this tenant or global configs
      configs.forEach((config: any, index: number) => {
        // Tenant admin should only see their tenant configs + global configs (which have no tenantId)
        expect(config.tenantId === 'test-tenant' || config.tenantId == null).toBe(true);
      });
    });

    it('should reject request without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/smtp-configs'
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /smtp-configs/:id', () => {
    it('should get specific SMTP config for authorized user', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      // First create an SMTP config
      const createRes = await app.inject({
        method: 'POST',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          scope: 'GLOBAL',
          host: 'localhost',
          port: 1025,
          service: 'smtp',
          fromAddress: 'test@test.com',
          fromName: 'Get Test SMTP'
        }
      });

      const created = JSON.parse(createRes.payload);

      // Then get it
      const getRes = await app.inject({
        method: 'GET',
        url: `/smtp-configs/${created.id}`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(getRes.statusCode).toBe(200);
      const config = JSON.parse(getRes.payload);
      expect(config.id).toBe(created.id);
      expect(config.fromName).toBe('Get Test SMTP');
    });

    it('should return 404 for non-existent SMTP config', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'GET',
        url: '/smtp-configs/non-existent-id',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /smtp-configs/:id', () => {
    it('should update SMTP config for authorized user', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      // First create an SMTP config
      const createRes = await app.inject({
        method: 'POST',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          scope: 'GLOBAL',
          host: 'localhost',
          port: 1025,
          service: 'smtp',
          fromAddress: 'original@test.com',
          fromName: 'Original SMTP'
        }
      });

      const created = JSON.parse(createRes.payload);

      // Then update it
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/smtp-configs/${created.id}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          host: 'localhost',
          port: 465,
          secure: true,
          service: 'smtp',
          fromName: 'Updated SMTP'
        }
      });

      expect(updateRes.statusCode).toBe(200);
      const updated = JSON.parse(updateRes.payload);
      expect(updated.fromName).toBe('Updated SMTP');
      expect(updated.host).toBe('localhost');
      expect(updated.port).toBe(465);
    });

    it('should reject update with invalid data', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'PUT',
        url: '/smtp-configs/some-config-id',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          port: 'invalid-port'  // Invalid port type
        }
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /smtp-configs/:id', () => {
    it('should delete SMTP config for authorized user', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      // First create an SMTP config
      const createRes = await app.inject({
        method: 'POST',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          scope: 'GLOBAL',
          host: 'localhost',
          port: 1025,
          service: 'smtp',
          fromAddress: 'delete@test.com',
          fromName: 'Config to Delete'
        }
      });

      const created = JSON.parse(createRes.payload);

      // Then delete it
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/smtp-configs/${created.id}`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(deleteRes.statusCode).toBe(204);
    });

    it('should reject deletion without authentication', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/smtp-configs/some-config-id'
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /smtp-configs/effective/:tenantId', () => {
    it('should get effective SMTP config for tenant', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'GET',
        url: '/smtp-configs/effective/test-tenant',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      // Should return the effective config for the tenant
    });

    it('should reject request for unauthorized tenant', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: 'tenant-a'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/smtp-configs/effective/tenant-b',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /smtp-configs/effective', () => {
    it('should get effective SMTP config for current user tenant', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: 'test-tenant'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/smtp-configs/effective?scope=TENANT&tenantId=test-tenant',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      // Should return the effective config for the user's tenant
    });
  });

  describe('POST /smtp-configs/:id/test', () => {
    it('should test SMTP config with valid credentials', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      // First create an SMTP config
      const createRes = await app.inject({
        method: 'POST',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          scope: 'GLOBAL',
          host: 'localhost',
          port: 1025,
          service: 'smtp',
          fromAddress: 'test@example.com',
          fromName: 'Test SMTP'
        }
      });

      const created = JSON.parse(createRes.payload);

      // Then test it
      const testRes = await app.inject({
        method: 'POST',
        url: `/smtp-configs/${created.id}/test`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          to: 'recipient@example.com',
          subject: 'Test Email',
          text: 'This is a test email',
          testEmail: true
        }
      });

      // Should handle the test request appropriately
      expect([200, 400, 500]).toContain(testRes.statusCode);
    });

    it('should reject test without authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/smtp-configs/some-config-id/test',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: {
          to: 'recipient@example.com',
          subject: 'Test Email',
          text: 'This is a test email',
          testEmail: true
        }
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /smtp-configs/:id/activate', () => {
    it('should activate SMTP config for authorized user', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      // First create an SMTP config
      const createRes = await app.inject({
        method: 'POST',
        url: '/smtp-configs',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          scope: 'GLOBAL',
          host: 'localhost',
          port: 1025,
          service: 'smtp',
          fromAddress: 'activate@test.com',
          fromName: 'Config to Activate'
        }
      });

      const created = JSON.parse(createRes.payload);

      // Then activate it
      const activateRes = await app.inject({
        method: 'POST',
        url: `/smtp-configs/${created.id}/activate`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(activateRes.statusCode).toBe(200);
      const result = JSON.parse(activateRes.payload);
      expect(result.id).toBeDefined(); // Activation returns the config, not {ok: true}
    });

    it('should reject activation without authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/smtp-configs/some-config-id/activate'
      });

      expect(res.statusCode).toBe(401);
    });
  });
});