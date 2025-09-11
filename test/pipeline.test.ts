import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ensure required env vars for config before imports
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://laana:0%24o7Z%2693@localhost:3306/mailservice';
process.env.AUTH_ISSUER = process.env.AUTH_ISSUER || 'test-issuer';
process.env.AUTH_AUDIENCE = process.env.AUTH_AUDIENCE || 'test-audience';
process.env.AUTH_JWKS_URI = process.env.AUTH_JWKS_URI || 'https://example.com/jwks.json';
process.env.SMTP_DRY_RUN = 'true';

import { config, flags } from '../src/config.js';
flags.disableAuth = true as any;
const dbValid = (config.databaseUrl || '').startsWith('mysql://');

import { buildApp } from '../src/app.js';
import { createTemplate } from '../src/modules/templates/service.js';
import { createGroup, ingestRecipients, scheduleGroup, workerTick } from '../src/modules/groups/service.js';

// Utility to clean DB between tests

describe('pipeline (db mode)', () => {
  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  beforeEach(async () => { /* DB state left as-is; tests rely on isolation via IDs */ });

  it('renders and sends recipients (dry-run SMTP)', async () => {
    buildApp();
    const tpl = await createTemplate({ tenantId: 't1', name: 'welcome', version: 1, subject: 'Hi {{name}}', bodyHtml: '<p>Hi {{name}}</p>', variables: {} });
    const group: any = await createGroup({ tenantId: 't1', appId: 'app1', templateId: tpl.id, subject: 'Fallback' });
    await ingestRecipients(group.id, { recipients: [ { email: 'a@test.com', context: { name: 'A'} }, { email: 'b@test.com', context: { name: 'B'} } ], dedupe: true, renderNow: false });
    await scheduleGroup(group.id);
    const res = await workerTick();
    expect(res.groupsProcessed).toBe(1);
  });
});
