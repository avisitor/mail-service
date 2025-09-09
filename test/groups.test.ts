import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { flags } from '../src/config.js';

flags.disableAuth = true as any;
flags.useInMemory = true as any;

describe('groups & recipients', () => {
  it('creates group and ingests recipients with dedupe', async () => {
    const app = buildApp();

    const grpRes = await app.inject({
      method: 'POST',
      url: '/groups',
      payload: {
        tenantId: 'tenant1',
        appId: 'app1',
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
