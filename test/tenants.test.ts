import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
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

describe('Tenants API', () => {
  let app: any;

  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  beforeEach(async () => {
    app = buildApp();
  });

  describe('POST /tenants', () => {
    it('should create tenant for superadmin', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const tenantData = {
        name: 'Test Tenant'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/tenants',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: tenantData
      });

      expect(res.statusCode).toBe(201);
      const created = JSON.parse(res.payload);
      expect(created.name).toBe('Test Tenant');
      expect(created.id).toBeDefined();
      expect(created.status).toBe('active'); // Default status
    });

    it('should reject tenant creation for tenant admin', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: 'some-tenant-id'
      });

      const tenantData = {
        name: 'Unauthorized Tenant'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/tenants',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: tenantData
      });

      expect(res.statusCode).toBe(403);
    });

    it('should reject tenant creation without authentication', async () => {
      const tenantData = {
        name: 'Unauthenticated Tenant'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/tenants',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: tenantData
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject invalid tenant data', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const tenantData = {
        name: ''  // Invalid: empty name
      };

      const res = await app.inject({
        method: 'POST',
        url: '/tenants',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: tenantData
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /tenants', () => {
    it('should list tenants for superadmin', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'GET',
        url: '/tenants',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const tenants = JSON.parse(res.payload);
      expect(Array.isArray(tenants)).toBe(true);
    });

    it('should exclude deleted tenants by default', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'GET',
        url: '/tenants',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const tenants = JSON.parse(res.payload);
      
      // Should not include any deleted tenants
      tenants.forEach((tenant: any) => {
        expect(tenant.status).not.toBe('deleted');
      });
    });

    it('should include deleted tenants when requested', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'GET',
        url: '/tenants?includeDeleted=true',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const tenants = JSON.parse(res.payload);
      expect(Array.isArray(tenants)).toBe(true);
      // May include deleted tenants
    });

    it('should reject request for tenant admin', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: 'some-tenant-id'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/tenants',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(403);
    });

    it('should reject request without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tenants'
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /tenants/:id', () => {
    it('should get specific tenant for superadmin', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      // First create a tenant
      const createRes = await app.inject({
        method: 'POST',
        url: '/tenants',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: { name: 'Get Test Tenant' }
      });

      const created = JSON.parse(createRes.payload);

      // Then get it
      const getRes = await app.inject({
        method: 'GET',
        url: `/tenants/${created.id}`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(getRes.statusCode).toBe(200);
      const tenant = JSON.parse(getRes.payload);
      expect(tenant.id).toBe(created.id);
      expect(tenant.name).toBe('Get Test Tenant');
    });

    it('should return 404 for non-existent tenant', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'GET',
        url: '/tenants/non-existent-id',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(404);
    });

    it('should reject request for tenant admin', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: 'some-tenant-id'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/tenants/some-tenant-id',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(403);
    });

    it('should reject request without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tenants/some-tenant-id'
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('PUT /tenants/:id', () => {
    it('should update tenant for superadmin', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      // First create a tenant
      const createRes = await app.inject({
        method: 'POST',
        url: '/tenants',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: { name: 'Original Tenant Name' }
      });

      const created = JSON.parse(createRes.payload);

      // Then update it
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/tenants/${created.id}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          name: 'Updated Tenant Name',
          status: 'disabled'
        }
      });

      expect(updateRes.statusCode).toBe(200);
      const updated = JSON.parse(updateRes.payload);
      expect(updated.name).toBe('Updated Tenant Name');
      expect(updated.status).toBe('disabled');
    });

    it('should reject update with invalid data', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'PUT',
        url: '/tenants/some-tenant-id',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          status: 'invalid-status'  // Invalid status
        }
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /tenants/:id', () => {
    it('should soft delete tenant for superadmin', async () => {
      const token = createTestToken({
        sub: 'superadmin@example.com',
        roles: ['superadmin']
      });

      // First create a tenant
      const createRes = await app.inject({
        method: 'POST',
        url: '/tenants',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: { name: 'Tenant to Delete' }
      });

      const created = JSON.parse(createRes.payload);

      // Then delete it
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/tenants/${created.id}`,
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
        url: '/tenants/some-tenant-id'
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject deletion for tenant admin', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: 'some-tenant-id'
      });

      const res = await app.inject({
        method: 'DELETE',
        url: '/tenants/some-tenant-id',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(403);
    });
  });
});