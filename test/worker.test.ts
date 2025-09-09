import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { flags } from '../src/config.js';
import { scheduleGroup, workerTick, createGroup, ingestRecipients } from '../src/modules/groups/service.js';
import { createTemplate } from '../src/modules/templates/service.js';

flags.disableAuth = true as any;
flags.useInMemory = true as any;

describe('worker', () => {
  it('renders pending recipients for scheduled group', async () => {
    buildApp(); // initialize plugins
    const tpl = await createTemplate({ tenantId: 'tenant1', name: 'welcome', version: 1, subject: 'Hi {{name}}', bodyHtml: '<p>Hi {{name}}</p>', variables: {} });
    const grp: any = await createGroup({ tenantId: 'tenant1', appId: 'app1', templateId: tpl.id, subject: 'Fallback' });
    await ingestRecipients(grp.id, { recipients: [
      { email: 'a@example.com', context: { name: 'A'} },
      { email: 'b@example.com', context: { name: 'B'} }
    ], dedupe: true, renderNow: false });
    await scheduleGroup(grp.id);
    const res = await workerTick();
    expect(res.groupsProcessed).toBe(1);
  });
});