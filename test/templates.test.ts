import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { getPrisma } from '../src/db/prisma.js';
import { flags } from '../src/config.js';

// Disable auth during tests for simplicity
flags.disableAuth = true as any;

describe('templates', () => {
  it('creates and renders a template', async () => {
    const app = buildApp();
    const prisma = getPrisma();
    // Seed tenant
    const tenant = await prisma.tenant.create({ data: { name: 'TestTenant' } });

    const createRes = await app.inject({
      method: 'POST',
      url: '/templates',
      payload: {
        tenantId: tenant.id,
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
