import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import { getPrisma } from '../src/db/prisma.js';
import { existsSync, readFileSync } from 'fs';
import jwt from 'jsonwebtoken';

// Use real test data 
const REAL_TENANT_ID = 'cmfgkxlyt000010msi8qxmraa';

// Mock database URL validation
const dbValid = (config.databaseUrl || '').startsWith('mysql://');

function getPrivateKey() {
  const keyPath = 'keys/private-6ca1a309a735fb83.pem';
  if (!existsSync(keyPath)) {
    throw new Error(`Real IDP key not found at ${keyPath}. Run setup scripts first.`);
  }
  
  const key = readFileSync(keyPath, 'utf8');
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

describe('Apps API', () => {
  let app: any;
  let prisma: any;

  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  beforeEach(async () => {
    app = buildApp();
    prisma = getPrisma();
    
    // Clean up any existing apps for test tenants
    await prisma.app.deleteMany({
      where: {
        OR: [
          { tenantId: REAL_TENANT_ID },
          { tenantId: 'test-tenant-2' }
        ]
      }
    });
    
    // Ensure test tenant exists
    await prisma.tenant.upsert({
      where: { id: REAL_TENANT_ID },
      create: { id: REAL_TENANT_ID, name: 'Test Tenant' },
      update: {}
    });
  });

  afterEach(async () => {
    if (prisma) {
      // Clean up any apps created during testing
      await prisma.app.deleteMany({
        where: {
          OR: [
            { tenantId: REAL_TENANT_ID },
            { tenantId: 'test-tenant-2' }
          ]
        }
      });
      // Clean up test tenant
      await prisma.tenant.delete({ where: { id: REAL_TENANT_ID } }).catch(() => {});
    }
  });

  describe('POST /apps', () => {
    it('should create app with auto-generated clientId for tenant admin', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: REAL_TENANT_ID
      });

      const appData = {
        tenantId: REAL_TENANT_ID,
        name: 'Test App'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: appData
      });

      expect(res.statusCode).toBe(201);
      const created = JSON.parse(res.payload);
      expect(created.name).toBe('Test App');
      expect(created.tenantId).toBe(REAL_TENANT_ID);
      expect(created.clientId).toMatch(/^app-[a-z0-9]{12}$/);
    });

    it('should create app with custom clientId for tenant admin', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: REAL_TENANT_ID
      });

      const appData = {
        tenantId: REAL_TENANT_ID,
        name: 'Custom App',
        clientId: 'custom-client-id'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: appData
      });

      expect(res.statusCode).toBe(201);
      const created = JSON.parse(res.payload);
      expect(created.name).toBe('Custom App');
      expect(created.clientId).toBe('custom-client-id');
    });

    it('should allow superadmin to create app for any tenant', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const appData = {
        tenantId: REAL_TENANT_ID,
        name: 'Superadmin App'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: appData
      });

      expect(res.statusCode).toBe(201);
      const created = JSON.parse(res.payload);
      expect(created.name).toBe('Superadmin App');
      expect(created.tenantId).toBe(REAL_TENANT_ID);
    });

    it('should reject request without authentication', async () => {
      const appData = {
        tenantId: REAL_TENANT_ID,
        name: 'Unauthorized App'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/apps',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: appData
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject request with insufficient permissions', async () => {
      const token = createTestToken({
        sub: 'editor@example.com',
        roles: ['editor'],
        tenantId: REAL_TENANT_ID
      });

      const appData = {
        tenantId: REAL_TENANT_ID,
        name: 'Editor App'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: appData
      });

      expect(res.statusCode).toBe(403);
    });

    it('should reject invalid app data', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: REAL_TENANT_ID
      });

      const appData = {
        tenantId: '',  // Invalid: empty tenantId
        name: ''       // Invalid: empty name
      };

      const res = await app.inject({
        method: 'POST',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: appData
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /apps', () => {
    it('should list apps for tenant admin (filtered to their tenant)', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: REAL_TENANT_ID
      });

      const res = await app.inject({
        method: 'GET',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const apps = JSON.parse(res.payload);
      expect(Array.isArray(apps)).toBe(true);
      
      // All apps should belong to the tenant admin's tenant
      apps.forEach((app: any) => {
        expect(app.tenantId).toBe(REAL_TENANT_ID);
      });
    });

    it('should list all apps for superadmin', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'GET',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const apps = JSON.parse(res.payload);
      expect(Array.isArray(apps)).toBe(true);
    });

    it('should filter apps by tenantId for superadmin', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'GET',
        url: `/apps?tenantId=${REAL_TENANT_ID}`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const apps = JSON.parse(res.payload);
      expect(Array.isArray(apps)).toBe(true);
      
      // All returned apps should belong to the specified tenant
      apps.forEach((app: any) => {
        expect(app.tenantId).toBe(REAL_TENANT_ID);
      });
    });

    it('should reject request without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/apps'
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject request with insufficient permissions', async () => {
      const token = createTestToken({
        sub: 'editor@example.com',
        roles: ['editor'],
        tenantId: REAL_TENANT_ID
      });

      const res = await app.inject({
        method: 'GET',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /apps/:id', () => {
    it('should update app name for tenant admin', async () => {
      // First create an app
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: REAL_TENANT_ID
      });

      const createRes = await app.inject({
        method: 'POST',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          tenantId: REAL_TENANT_ID,
          name: 'Original App Name'
        }
      });

      const created = JSON.parse(createRes.payload);

      // Then update it
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/apps/${created.id}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          name: 'Updated App Name'
        }
      });

      expect(updateRes.statusCode).toBe(200);
      const updated = JSON.parse(updateRes.payload);
      expect(updated.name).toBe('Updated App Name');
      expect(updated.id).toBe(created.id);
    });

    it('should reject update with invalid data', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: REAL_TENANT_ID
      });

      const res = await app.inject({
        method: 'PUT',
        url: '/apps/some-app-id',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          name: ''  // Invalid: empty name
        }
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /apps/:id', () => {
    it('should delete app for tenant admin', async () => {
      // First create an app
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: REAL_TENANT_ID
      });

      const createRes = await app.inject({
        method: 'POST',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          tenantId: REAL_TENANT_ID,
          name: 'App to Delete'
        }
      });

      const created = JSON.parse(createRes.payload);

      // Then delete it
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/apps/${created.id}`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(deleteRes.statusCode).toBe(200);
      const result = JSON.parse(deleteRes.payload);
      expect(result.ok).toBe(true);
    });

    it('should reject deletion without authentication', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/apps/some-app-id'
      });

      expect(res.statusCode).toBe(401);
    });
  });
});