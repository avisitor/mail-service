import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { config, flags } from '../src/config.js';
import { getPrisma } from '../src/db/prisma.js';

// Disable auth during tests for simplicity
flags.disableAuth = true as any;

const dbValid = (config.databaseUrl || '').startsWith('mysql://');

// Helper function to generate descriptive test IDs
function generateTestId(testCase: string, entityType: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
  return `test-templates-${testCase}-${entityType}-${timestamp}`;
}

describe('templates (db)', () => {
  let createdTemplateId: string | null = null;

  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  afterEach(async () => {
    if (createdTemplateId) {
      const prisma = getPrisma();
      await prisma.template.delete({ where: { id: createdTemplateId } }).catch(() => {});
      createdTemplateId = null;
    }
  });

  it('creates and renders a template', async () => {
    const app = buildApp();
    const createRes = await app.inject({
      method: 'POST',
      url: '/templates',
      payload: {
        appId: 'cmfka688r0001b77ofpgm57ix',
        title: 'test-templates-create-render-basic',
        subject: 'Hello ${name}',
        content: '<p>Hi ${name}</p>',
        version: 1
      }
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload);
    createdTemplateId = created.id; // Track for cleanup
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
