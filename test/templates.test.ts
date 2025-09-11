import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { config, flags } from '../src/config.js';
import { getPrisma } from '../src/db/prisma.js';

// Disable auth during tests for simplicity
flags.disableAuth = true as any;

const dbValid = (config.databaseUrl || '').startsWith('mysql://');

describe('templates (db)', () => {
  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }
  it('creates and renders a template', async () => {
    const app = buildApp();
    const createRes = await app.inject({
      method: 'POST',
      url: '/templates',
      payload: {
        tenantId: 'tenant_mem',
        name: 'welcome',
        version: 1,
        subject: 'Hello {{name}}',
        bodyHtml: '<p>Hi {{name}}</p>',
        bodyText: 'Hi {{name}}',
        variables: {},
      }
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload);
    const renderRes = await app.inject({
      method: 'POST',
      url: `/templates/${created.id}/render`,
      payload: { context: { name: 'Alice' } }
    });
    expect(renderRes.statusCode).toBe(200);
    const rendered = JSON.parse(renderRes.payload);
    expect(rendered.subject).toBe('Hello Alice');
    expect(rendered.html).toContain('Hi Alice');
  });
});
