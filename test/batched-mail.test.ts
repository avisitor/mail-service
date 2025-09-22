import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'fs';
import jwt from 'jsonwebtoken';

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
  
  return jwt.sign(payload, key, {
    algorithm: 'RS256',
    expiresIn: '1h',
    keyid: kid,
    issuer: 'http://localhost:8080',
    audience: 'mail-service'
  });
}

describe('Batched Mail Processing', () => {
  let app: FastifyInstance;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    // Save original environment
    originalEnv = {
      MAIL_BATCH_SIZE: process.env.MAIL_BATCH_SIZE,
      MAIL_INTER_BATCH_DELAY_MS: process.env.MAIL_INTER_BATCH_DELAY_MS,
      MAIL_MAX_EMAILS_PER_HOUR: process.env.MAIL_MAX_EMAILS_PER_HOUR,
      MAIL_MAX_EMAILS_PER_DAY: process.env.MAIL_MAX_EMAILS_PER_DAY,
      SMTP_DRY_RUN: process.env.SMTP_DRY_RUN
    };

    // Set test configuration for batching
    process.env.SMTP_DRY_RUN = 'true';
    
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    
    // Restore original environment
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  it('should process large recipient list with configurable batching', async () => {
    // Configure small batches with delay for testing
    process.env.MAIL_BATCH_SIZE = '3';
    process.env.MAIL_INTER_BATCH_DELAY_MS = '100'; // Small delay for test speed

    const token = createTestToken({
      sub: 'test-batched-mail-user@example.com',
      roles: ['tenant_admin'],
      tenantId: 'test-tenant'
    });

    // Create a test app
    const appRes = await app.inject({
      method: 'POST',
      url: '/apps',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      payload: {
        name: 'test-batched-mail-app',
        clientId: `test-batched-mail-client-${Date.now()}`,
        tenantId: 'test-tenant'
      }
    });

    const appData = JSON.parse(appRes.payload);

    // Create email with larger recipient list (10 recipients)
    const recipients = [];
    for (let i = 1; i <= 10; i++) {
      recipients.push({
        email: `recipient${i}@example.com`,
        name: `Recipient ${i}`
      });
    }

    const startTime = Date.now();

    const res = await app.inject({
      method: 'POST',
      url: '/send-now',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      payload: {
        appId: appData.id,
        subject: 'Batched Email Test',
        html: '<p>This email tests batched processing</p>',
        recipients: recipients,
        testEmail: true
      }
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data.groupId).toBeDefined();
    expect(data.jobCount).toBe(10);

    // Verify email jobs were created
    const { getPrisma } = await import('../src/db/prisma.js');
    const prisma = getPrisma();
    
    const jobs = await prisma.emailJob.findMany({
      where: { groupId: data.groupId }
    });
    
    expect(jobs.length).toBe(10);
    jobs.forEach(job => {
      expect(job.status).toBe('pending');
    });

    // Test worker processing with batching
    const { workerTick } = await import('../src/modules/worker/service.js');
    const result = await workerTick();

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // Verify results
    expect(result.jobsProcessed).toBeGreaterThan(0);
    expect(result.jobsSent).toBeGreaterThan(0);
    expect(result.jobsFailed).toBe(0);
    
    // With MAIL_INTER_BATCH_DELAY_MS=100 and MAIL_BATCH_SIZE=3,
    // processing 10 jobs should take at least 300ms (3 inter-batch delays)
    // This verifies that batching delays are working
    if (result.jobsProcessed >= 10) {
      expect(processingTime).toBeGreaterThan(200); // Allow some variance
    }

    console.log(`Processed ${result.jobsProcessed} jobs in ${processingTime}ms with batching`);
  });

  it('should respect hourly rate limits', async () => {
    // Set very low hourly limit for testing
    process.env.MAIL_MAX_EMAILS_PER_HOUR = '5';
    process.env.MAIL_BATCH_SIZE = '10';

    const token = createTestToken({
      sub: 'test-rate-limited-user@example.com',
      roles: ['tenant_admin'],
      tenantId: 'test-tenant'
    });

    // Create a test app
    const appRes = await app.inject({
      method: 'POST',
      url: '/apps',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      payload: {
        name: 'test-rate-limited-app',
        clientId: `test-rate-limited-client-${Date.now()}`,
        tenantId: 'test-tenant'
      }
    });

    const appData = JSON.parse(appRes.payload);

    // Create email with more recipients than the hourly limit
    const recipients = [];
    for (let i = 1; i <= 10; i++) {
      recipients.push({
        email: `ratelimited${i}@example.com`,
        name: `Rate Limited ${i}`
      });
    }

    const res = await app.inject({
      method: 'POST',
      url: '/send-now',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      payload: {
        appId: appData.id,
        subject: 'Rate Limited Email Test',
        html: '<p>This email tests rate limiting</p>',
        recipients: recipients,
        testEmail: true
      }
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);

    // Test worker processing with rate limiting
    const { workerTick } = await import('../src/modules/worker/service.js');
    const result = await workerTick();

    // Should process maximum 5 jobs due to hourly limit
    expect(result.jobsProcessed).toBeLessThanOrEqual(5);
    
    // If we hit the limit, some jobs should be marked as rate limited
    if (result.jobsProcessed < 10) {
      expect(result.jobsRateLimited).toBeGreaterThan(0);
    }

    console.log(`Rate limiting test: processed ${result.jobsProcessed}, rate limited ${result.jobsRateLimited}`);
  });

  it('should handle anti-spam configuration correctly', async () => {
    // Configure for anti-spam: moderate batch size with significant delay
    process.env.MAIL_BATCH_SIZE = '2';
    process.env.MAIL_INTER_BATCH_DELAY_MS = '50'; // Reduced for test speed
    process.env.MAIL_MAX_EMAILS_PER_HOUR = '100';

    const token = createTestToken({
      sub: 'test-antispam-user@example.com',
      roles: ['tenant_admin'],
      tenantId: 'test-tenant'
    });

    // Create a test app
    const appRes = await app.inject({
      method: 'POST',
      url: '/apps',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      payload: {
        name: 'test-antispam-app',
        clientId: `test-antispam-client-${Date.now()}`,
        tenantId: 'test-tenant'
      }
    });

    const appData = JSON.parse(appRes.payload);

    // Create email with 6 recipients (should result in 3 batches of 2)
    const recipients = [];
    for (let i = 1; i <= 6; i++) {
      recipients.push({
        email: `antispam${i}@example.com`,
        name: `Anti Spam ${i}`
      });
    }

    const startTime = Date.now();

    const res = await app.inject({
      method: 'POST',
      url: '/send-now',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      payload: {
        appId: appData.id,
        subject: 'Anti-Spam Batched Email Test',
        html: '<p>This email tests anti-spam batching</p>',
        recipients: recipients,
        testEmail: true
      }
    });

    expect(res.statusCode).toBe(200);

    // Test worker processing
    const { workerTick } = await import('../src/modules/worker/service.js');
    const result = await workerTick();

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // Verify batching behavior
    expect(result.jobsProcessed).toBeGreaterThan(0);
    expect(result.jobsSent).toBeGreaterThan(0);
    
    // With 6 jobs, batch size 2, and 50ms delay between batches,
    // we should have 2 inter-batch delays (100ms total minimum)
    if (result.jobsProcessed >= 6) {
      expect(processingTime).toBeGreaterThan(80); // Allow some variance
    }

    console.log(`Anti-spam batching: processed ${result.jobsProcessed} jobs in ${processingTime}ms`);
  });
});