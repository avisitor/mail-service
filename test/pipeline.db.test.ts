import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://laana:0$o7Z&93@localhost:3306/mailservice';
process.env.SMTP_DRY_RUN = 'true';
process.env.AUTH_ISSUER = 'itest-issuer';
process.env.AUTH_AUDIENCE = 'itest-aud';
process.env.AUTH_JWKS_URI = 'https://example.com/jwks.json';

import { flags } from '../src/config.js';
flags.disableAuth = true as any;

import { getPrisma } from '../src/db/prisma.js';
import { buildApp } from '../src/app.js';
import { createTemplate } from '../src/modules/templates/service.js';
import { createGroup, ingestRecipients, scheduleGroup, workerTick } from '../src/modules/groups/service.js';

const prisma = getPrisma();

async function truncateAll() {
  await prisma.event.deleteMany();
  await prisma.message.deleteMany();
  await prisma.recipient.deleteMany();
  await prisma.messageGroup.deleteMany();
  await prisma.template.deleteMany();
  await prisma.app.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.suppression.deleteMany();
}

const RUN_DB = process.env.DB_TEST === '1';

// Skip entire suite if flag not enabled
const d = RUN_DB ? describe.sequential : describe.skip;

d('pipeline db integration', () => {
  beforeAll(() => { buildApp(); });
  beforeEach(async () => { if (RUN_DB) { try { await truncateAll(); } catch { /* skip silently */ } } });
  afterAll(async () => { await prisma.$disconnect(); });

  it('records sent and open events and group_complete', async () => {
    if (!RUN_DB) return;
    const tenant = await prisma.tenant.create({ data: { name: 'DB Tenant' } });
    const appRow = await prisma.app.create({ data: { name: 'DB App', tenantId: tenant.id, clientId: 'db-client' } });
    const tpl = await createTemplate({ tenantId: tenant.id, name: 'greet', version: 1, subject: 'Hi {{n}}', bodyHtml: '<p>Hi {{n}}</p>', variables: {} });
    const group: any = await createGroup({ tenantId: tenant.id, appId: appRow.id, templateId: tpl.id, subject: 'Fallback' });
    await ingestRecipients(group.id, { recipients: [ { email: 'a@db.test', context: { n: 'A'} }, { email: 'b@db.test', context: { n: 'B'} } ], dedupe: true, renderNow: false });
    await scheduleGroup(group.id);
    await workerTick();
    // After first tick, all should be rendered & sent (dry run)
    const sentEvents = await prisma.event.findMany({ where: { groupId: group.id, type: 'sent' } });
    expect(sentEvents.length).toBe(2);
    // simulate open for one
    const app = buildApp();
    const firstRec = await prisma.recipient.findFirst({ where: { groupId: group.id } });
    const px = await app.inject({ method: 'GET', url: `/t/p/${firstRec!.id}.png` });
    expect(px.statusCode).toBe(200);
    const openEvents = await prisma.event.count({ where: { recipientId: firstRec!.id, type: 'open' } });
    expect(openEvents).toBe(1);
    // Group complete event present
    const completeEvents = await prisma.event.count({ where: { groupId: group.id, type: 'group_complete' } });
    expect(completeEvents).toBe(1);
  });

  it('suppressed recipient skipped, failed permanent error recorded', async () => {
    if (!RUN_DB) return;
    // suppression skip
    const tenant = await prisma.tenant.create({ data: { name: 'Suppr Tenant' } });
    const appRow = await prisma.app.create({ data: { name: 'Suppr App', tenantId: tenant.id, clientId: 'suppr-client' } });
    await prisma.suppression.create({ data: { tenantId: tenant.id, email: 'skip@db.test' } });
    const tpl = await createTemplate({ tenantId: tenant.id, name: 'notice', version: 1, subject: 'Hi', bodyHtml: '<p>Hi</p>', variables: {} });
    const group: any = await createGroup({ tenantId: tenant.id, appId: appRow.id, templateId: tpl.id, subject: 'Fallback' });
    await ingestRecipients(group.id, { recipients: [ { email: 'skip@db.test', context: {} }, { email: 'send@db.test', context: {} } ], dedupe: true, renderNow: false });
    await scheduleGroup(group.id);
    await workerTick();
    const skipped = await prisma.recipient.findFirst({ where: { groupId: group.id, email: 'skip@db.test' } });
    const sent = await prisma.recipient.findFirst({ where: { groupId: group.id, email: 'send@db.test' } });
    expect(skipped?.status).toBe('skipped');
    expect(sent?.status).toBe('sent');
    const sentEvents = await prisma.event.count({ where: { groupId: group.id, type: 'sent' } });
    expect(sentEvents).toBe(1);
  });

  it('retries then fails after max attempts when permanent failures occur', async () => {
    if (!RUN_DB) return;
    process.env.TEST_FAIL_ALWAYS = 'true';
  process.env.SMTP_DRY_RUN = 'false';
    const tenant = await prisma.tenant.create({ data: { name: 'Retry Tenant' } });
    const appRow = await prisma.app.create({ data: { name: 'Retry App', tenantId: tenant.id, clientId: 'retry-client' } });
    const tpl = await createTemplate({ tenantId: tenant.id, name: 'fail', version: 1, subject: 'Hi', bodyHtml: '<p>Hi</p>', variables: {} });
    const group: any = await createGroup({ tenantId: tenant.id, appId: appRow.id, templateId: tpl.id, subject: 'Fallback' });
    await ingestRecipients(group.id, { recipients: [ { email: 'perm@db.test', context: {} } ], dedupe: true, renderNow: false });
    await scheduleGroup(group.id);
    await workerTick();
    delete process.env.TEST_FAIL_ALWAYS;
  // Restore dry run mode for subsequent tests
  process.env.SMTP_DRY_RUN = 'true';
    const rec = await prisma.recipient.findFirst({ where: { groupId: group.id } });
    expect(rec?.status).toBe('failed');
    expect((rec as any).failedAttempts || 0).toBeGreaterThanOrEqual(1);
  const failEvents = await prisma.event.count({ where: { groupId: group.id, type: 'failed' } });
  expect(failEvents).toBeGreaterThanOrEqual(1);
  });

  it('template routes: create and render (db)', async () => {
    if (!RUN_DB) return;
    const tenant = await prisma.tenant.create({ data: { name: 'Template Routes Tenant' } });
    const app = buildApp();
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

  it('tenant + app route integration full send', async () => {
    if (!RUN_DB) return;
    const app = buildApp();
    // create tenant via route
    const tRes = await app.inject({ method: 'POST', url: '/tenants', payload: { name: 'Route Tenant' } });
    expect(tRes.statusCode).toBe(201);
    const tenant = JSON.parse(tRes.payload);
    // create app via route
    const aRes = await app.inject({ method: 'POST', url: '/apps', payload: { tenantId: tenant.id, name: 'Route App', clientId: 'route-client' } });
    expect(aRes.statusCode).toBe(201);
    const appRec = JSON.parse(aRes.payload);
    // create template via route
    const tplRes = await app.inject({ method: 'POST', url: '/templates', payload: { tenantId: tenant.id, name: 'routeTpl', version: 1, subject: 'Hi {{n}}', bodyHtml: '<p>Hi {{n}}</p>', variables: {} } });
    expect(tplRes.statusCode).toBe(201);
    const tpl = JSON.parse(tplRes.payload);
    // create group via direct service (simpler) then ingest and send
    const group: any = await createGroup({ tenantId: tenant.id, appId: appRec.id, templateId: tpl.id, subject: 'Fallback' });
    await ingestRecipients(group.id, { recipients: [ { email: 'one@route.test', context: { n: 'One'} } ], dedupe: true, renderNow: false });
    await scheduleGroup(group.id);
    await workerTick();
    const sent = await prisma.event.count({ where: { groupId: group.id, type: 'sent' } });
    expect(sent).toBe(1);
  });
});
