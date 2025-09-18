import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { config, flags } from '../src/config.js';
import { getPrisma } from '../src/db/prisma.js';

flags.disableAuth = true as any;
const dbValid = (config.databaseUrl || '').startsWith('mysql://');

describe('groups & recipients (db)', () => {
  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }
  
  beforeEach(async () => {
    // Ensure tenant and app exist for tests
    const prisma = getPrisma();
    await prisma.tenant.upsert({
      where: { id: 'tenant-groups' },
      update: {},
      create: { id: 'tenant-groups', name: 'Groups Test Tenant' }
    });
    await prisma.app.upsert({
      where: { id: 'app-groups' },
      update: {},
      create: { id: 'app-groups', tenantId: 'tenant-groups', name: 'Groups Test App', clientId: 'test-client-groups' }
    });
  });

  it('creates group and ingests recipients with dedupe', async () => {
    const app = buildApp();

    const grpRes = await app.inject({
      method: 'POST',
      url: '/groups',
      payload: {
        tenantId: 'tenant-groups',
        appId: 'app-groups',
        subject: 'Welcome',
      }
    });
    expect(grpRes.statusCode).toBe(201);
    const group = JSON.parse(grpRes.payload);

    const ingestRes = await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/recipients`,
      payload: {
        recipients: [
          { email: 'a@example.com', context: { name: 'A'} },
          { email: 'b@example.com', context: { name: 'B'} },
          { email: 'a@example.com', context: { name: 'Dup'} }
        ],
        dedupe: true
      }
    });
    expect(ingestRes.statusCode).toBe(200);
    const ingest = JSON.parse(ingestRes.payload);
    expect(ingest.added).toBe(2);

    const listRes = await app.inject({ method: 'GET', url: `/groups/${group.id}/recipients` });
    expect(listRes.statusCode).toBe(200);
    const rows = JSON.parse(listRes.payload);
    expect(rows.length).toBe(2);
  });
});
