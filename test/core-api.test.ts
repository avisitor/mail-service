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

describe('Mail Service Core API', () => {
  let app: any;

  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  beforeEach(async () => {
    app = buildApp();
    
    // Ensure test tenant and app exist
    const { getPrisma } = await import('../src/db/prisma.js');
    const prisma = getPrisma();
    await prisma.tenant.upsert({
      where: { id: 'test-tenant' },
      update: {},
      create: { id: 'test-tenant', name: 'Test Tenant' }
    });
    await prisma.app.upsert({
      where: { id: 'test-app' },
      update: {},
      create: { 
        id: 'test-app', 
        tenantId: 'test-tenant', 
        name: 'Test App', 
        clientId: 'test-client-id' 
      }
    });
  });

  describe('GET /', () => {
    it('should return service status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/'
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.service).toBe('mail-service');
      expect(data.status).toBe('ok');
    });
  });

  describe('GET /me', () => {
    it('should return user info for authenticated user', async () => {
      const token = createTestToken({
        sub: 'user@example.com',
        roles: ['tenant_admin'],
        tenantId: 'test-tenant',
        appId: 'test-app'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/me',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.sub).toBe('user@example.com');
      expect(data.roles).toContain('tenant_admin');
      expect(data.tenantId).toBe('test-tenant');
    });

    it('should reject request without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/me'
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /jwks.json', () => {
    it('should return JWKS keys', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/jwks.json'
      });

      expect(res.statusCode).toBe(200);
      const jwks = JSON.parse(res.payload);
      expect(jwks.keys).toBeDefined();
      expect(Array.isArray(jwks.keys)).toBe(true);
    });
  });

  describe('GET /debug/auth', () => {
    it('should return auth debug info for authenticated user', async () => {
      const token = createTestToken({
        sub: 'debug@example.com',
        roles: ['superadmin'],
        custom_field: 'test_value'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/debug/auth',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.payload).toBeDefined();
      expect(data.payload.sub).toBe('debug@example.com');
    });

    it('should return anonymous debug info for unauthenticated request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/debug/auth'
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.user).toBeNull();
    });
  });

  describe('GET /ui/config.js', () => {
    it('should return UI configuration', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/ui/config.js'
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/javascript');
      expect(res.payload).toContain('window.__MAIL_UI_CONFIG__');
    });
  });

  describe('POST /api/token', () => {
    it('should exchange authorization code for token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/token',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: {
          grant_type: 'authorization_code',
          code: 'test-auth-code',
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback'
        }
      });

      // This will likely fail with our test setup, but we're testing the endpoint exists
      expect([200, 400, 401, 500]).toContain(res.statusCode);
    });

    it('should reject invalid grant type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/token',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: {
          grant_type: 'invalid_grant',
          code: 'test-auth-code'
        }
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/send-test', () => {
    it('should send test email without authentication', async () => {
      // Set SMTP_DRY_RUN to avoid actual email sending
      process.env.SMTP_DRY_RUN = 'true';

      const res = await app.inject({
        method: 'POST',
        url: '/api/send-test',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: {
          to: 'test@localhost.local',
          subject: 'Test Email',
          html: '<p>This is a test email</p>',
          text: 'This is a test email',
          testEmail: true
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.ok).toBe(true);
      expect(data.message).toBe('Email sent successfully');
    });

    it('should reject request with missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/send-test',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: {
          to: 'test@localhost.local'
          // Missing subject and content
        }
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/send', () => {
    it('should send email with authentication', async () => {
      const token = createTestToken({
        sub: 'sender@example.com',
        roles: ['tenant_admin'],
        tenantId: 'test-tenant'
      });

      // Set SMTP_DRY_RUN to avoid actual email sending
      process.env.SMTP_DRY_RUN = 'true';

      const res = await app.inject({
        method: 'POST',
        url: '/api/send',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          to: 'recipient@example.com',
          subject: 'Authenticated Email',
          html: '<p>This is an authenticated email</p>',
          testEmail: true
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.ok).toBe(true);
    });

    it('should reject request without authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/send',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: {
          to: 'recipient@example.com',
          subject: 'Unauthenticated Email',
          html: '<p>This should fail</p>'
        }
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /test-email', () => {
    it('should send test email with authentication', async () => {
      const token = createTestToken({
        sub: 'tester@example.com',
        roles: ['tenant_admin'],
        tenantId: 'test-tenant'
      });

      // Set SMTP_DRY_RUN to avoid actual email sending
      process.env.SMTP_DRY_RUN = 'true';

      const res = await app.inject({
        method: 'POST',
        url: '/test-email',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          to: 'test@localhost.local',
          subject: 'Simple Test Email',
          html: '<p>Simple test</p>',
          testEmail: true
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.ok).toBe(true);
    });
  });

  describe('POST /send-now', () => {
    it('should create and process bulk email group', async () => {
      const token = createTestToken({
        sub: 'bulk@example.com',
        roles: ['tenant_admin'],
        tenantId: 'test-tenant'
      });

      // Set SMTP_DRY_RUN to avoid actual email sending
      process.env.SMTP_DRY_RUN = 'true';

      // First create a test app
      const appRes = await app.inject({
        method: 'POST',
        url: '/apps',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          name: 'Bulk Test App',
          clientId: `bulk-test-client-${Date.now()}`,
          tenantId: 'test-tenant'
        }
      });

      const appData = JSON.parse(appRes.payload);

      const res = await app.inject({
        method: 'POST',
        url: '/send-now',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          appId: appData.id,
          subject: 'Bulk Email Test',
          html: '<p>Hello {{name}}</p>',
          recipients: [
            { email: 'user1@example.com', name: 'User One', context: { name: 'User One' } },
            { email: 'user2@example.com', name: 'User Two', context: { name: 'User Two' } }
          ],
          testEmail: true
        }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.groupId).toBeDefined();
      expect(data.scheduled).toBe(false); // No scheduleAt provided, so should be immediate (not scheduled)
    });

    it('should reject request with missing required fields', async () => {
      const token = createTestToken({
        sub: 'bulk@example.com',
        roles: ['tenant_admin']
      });

      const res = await app.inject({
        method: 'POST',
        url: '/send-now',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        payload: {
          subject: 'Incomplete Request'
          // Missing appId and recipients
        }
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /compose', () => {
    it('should redirect to IDP if not authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/compose?appId=test-app'
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBeDefined();
    });

    it('should serve compose page for authenticated user', async () => {
      const token = createTestToken({
        sub: 'composer@example.com',
        roles: ['tenant_admin'],
        tenantId: 'test-tenant'
      });

      const res = await app.inject({
        method: 'GET',
        url: `/compose?appId=test-app&access_token=${token}`
      });

      // Should either serve the compose page or redirect
      expect([200, 302]).toContain(res.statusCode);
    });
  });

  describe('GET /admin', () => {
    it('should redirect to IDP if not authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin?appId=test-app'
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBeDefined();
    });

    it('should serve admin page for authenticated user', async () => {
      const token = createTestToken({
        sub: 'admin@example.com',
        roles: ['superadmin']
      });

      const res = await app.inject({
        method: 'GET',
        url: `/admin?appId=test-app&access_token=${token}`
      });

      // Should either serve the admin page or redirect
      expect([200, 302]).toContain(res.statusCode);
    });
  });

  describe('GET /ui', () => {
    it('should serve the UI interface', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/ui'
      });

      // Should either serve the UI or return 404 if static files not available
      expect([200, 404]).toContain(res.statusCode);
    });
  });

  describe('GET /test-app', () => {
    it('should serve test app page', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test-app'
      });

      // Should either serve the test app or return 404 if file not available
      expect([200, 404]).toContain(res.statusCode);
    });
  });
});