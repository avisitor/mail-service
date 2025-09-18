import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import fs from 'fs';
import jwt from 'jsonwebtoken';

const REAL_TENANT_ID = 'cmfgkxlyt000010msi8qxmraa';
const REAL_APP_ID = 'cmfgkybbi000410mssq4gnw8a';

function getPrivateKey() {
  const keyPath = 'keys/private-6ca1a309a735fb83.pem';
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Real IDP key not found at ${keyPath}`);
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

describe('JWT Field Extraction Debug', () => {
  let app: any;

  beforeEach(async () => {
    app = buildApp();
    
    // Create test tenant and app records for the hardcoded IDs
    const { getPrisma } = await import('../src/db/prisma.js');
    const prisma = getPrisma();
    
    try {
      await prisma.tenant.upsert({
        where: { id: REAL_TENANT_ID },
        update: {},
        create: { id: REAL_TENANT_ID, name: 'Test Tenant for JWT' }
      });
      
      await prisma.app.upsert({
        where: { id: REAL_APP_ID },
        update: {},
        create: { 
          id: REAL_APP_ID, 
          tenantId: REAL_TENANT_ID, 
          name: 'Test App for JWT', 
          clientId: 'test-app-jwt' 
        }
      });
    } catch (error) {
      console.log('Error setting up test data:', error);
    }
  });

  it('should extract JWT fields correctly', async () => {
    console.log('\n=== JWT Field Extraction Debug ===');
    console.log('Config issuer:', config.auth.issuer);
    console.log('Config audience:', config.auth.audience);
    console.log('Config JWKS URI:', config.auth.jwksUri);
    console.log('Config claims:', {
      roleClaim: config.auth.roleClaim,
      tenantClaim: config.auth.tenantClaim,
      appClaim: config.auth.appClaim
    });

    // Test token with all expected fields
    const tokenPayload = {
      sub: 'test@example.com',
      roles: ['tenant_admin'],
      tenantId: REAL_TENANT_ID,
      appId: REAL_APP_ID
    };
    
    console.log('Token payload:', tokenPayload);
    
    const token = createTestToken(tokenPayload);
    
    // Decode and check what's actually in the token
    const decoded = jwt.decode(token, { complete: true });
    console.log('Decoded token payload:', (decoded as any)?.payload);
    
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Response status:', res.statusCode);
    console.log('Response body:', res.payload);
    
    expect(res.statusCode).toBe(200);
    const user = JSON.parse(res.payload);
    console.log('Parsed user response:', user);
    
    expect(user).toBeDefined();
    expect(user.sub).toBe('test@example.com');
    expect(user.roles).toContain('tenant_admin');
    expect(user.tenantId).toBe(REAL_TENANT_ID);
    expect(user.appId).toBe(REAL_APP_ID);
  });

  it('should test token without tenantId (requires resolution)', async () => {
    console.log('\n=== TenantId Resolution Debug ===');
    
    const tokenPayload = {
      sub: 'test@example.com',
      roles: ['tenant_admin'],
      appId: REAL_APP_ID
      // Note: no tenantId - should be resolved from appId
    };
    
    console.log('Token payload (no tenantId):', tokenPayload);
    
    const token = createTestToken(tokenPayload);
    const decoded = jwt.decode(token, { complete: true });
    console.log('Decoded token payload:', (decoded as any)?.payload);
    
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Response status:', res.statusCode);
    console.log('Response body:', res.payload);
    
    expect(res.statusCode).toBe(200);
    const user = JSON.parse(res.payload);
    console.log('Parsed user response:', user);
    
    // Should have resolved tenantId from appId
    expect(user.tenantId).toBe(REAL_TENANT_ID);
    expect(user.appId).toBe(REAL_APP_ID);
  });
});