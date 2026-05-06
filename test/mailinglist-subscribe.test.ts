import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { config, flags } from '../src/config.js';
import { getPrisma } from '../src/db/prisma.js';

flags.disableAuth = true as any;

const dbValid = (config.databaseUrl || '').startsWith('mysql://');
const TEST_APP_ID = 'cmfka688r0001b77ofpgm57ix';

describe('mailing list subscription pages (db)', () => {
  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  const createdListIds: number[] = [];
  let prevDryRun: string | undefined;

  beforeAll(() => {
    prevDryRun = process.env.SMTP_DRY_RUN;
    process.env.SMTP_DRY_RUN = 'true';
  });

  afterAll(async () => {
    if (prevDryRun === undefined) delete process.env.SMTP_DRY_RUN;
    else process.env.SMTP_DRY_RUN = prevDryRun;
    if (createdListIds.length) {
      const prisma = getPrisma();
      await prisma.template
        .deleteMany({ where: { mailingListId: { in: createdListIds } } })
        .catch(() => {});
      await prisma.mailingList
        .deleteMany({ where: { id: { in: createdListIds } } })
        .catch(() => {});
    }
  });

  async function makeList(suffix: string) {
    const app = buildApp();
    const uniqueName = `subtest-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/mailinglists',
      payload: { appId: TEST_APP_ID, name: uniqueName }
    });
    expect(res.statusCode).toBe(201);
    const created = JSON.parse(res.payload);
    createdListIds.push(created.id);
    return { app, list: created };
  }

  it('rejects invalid slug and accepts valid slug', async () => {
    const { app, list } = await makeList('slug');
    const bad = await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${list.id}/subscribe-settings`,
      payload: { appId: TEST_APP_ID, slug: 'BAD slug!' }
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${list.id}/subscribe-settings`,
      payload: { appId: TEST_APP_ID, slug: 'my-test-slug', enabled: true }
    });
    expect(ok.statusCode).toBe(200);
    const body = JSON.parse(ok.payload);
    expect(body.subscribeSlug).toBe('my-test-slug');
    expect(body.subscribePageEnabled).toBe(true);
  });

  it('refuses to enable subscribe page without a slug', async () => {
    const { app, list } = await makeList('noslug');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${list.id}/subscribe-settings`,
      payload: { appId: TEST_APP_ID, enabled: true }
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects duplicate slug within the same app', async () => {
    const { app, list: a } = await makeList('dup-a');
    const { list: b } = await makeList('dup-b');
    const slug = `dup-slug-${Date.now()}`;
    const r1 = await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${a.id}/subscribe-settings`,
      payload: { appId: TEST_APP_ID, slug }
    });
    expect(r1.statusCode).toBe(200);
    const r2 = await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${b.id}/subscribe-settings`,
      payload: { appId: TEST_APP_ID, slug }
    });
    expect(r2.statusCode).toBe(409);
  });

  it('upserts and deletes per-kind templates; defaults returned when absent', async () => {
    const { app, list } = await makeList('tpl');
    const getDefault = await app.inject({
      method: 'GET',
      url: `/api/mailinglists/${list.id}/templates/SUBSCRIBE_PAGE?appId=${TEST_APP_ID}`
    });
    expect(getDefault.statusCode).toBe(200);
    const def = JSON.parse(getDefault.payload);
    expect(def.isDefault).toBe(true);
    expect(typeof def.content).toBe('string');

    const upsert = await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${list.id}/templates/CONFIRM_EMAIL`,
      payload: {
        appId: TEST_APP_ID,
        subject: 'Custom confirm',
        content: '<p>Hi {{memberName}}, confirm at {{confirmUrl}}</p>'
      }
    });
    expect(upsert.statusCode).toBe(200);

    const getAfter = await app.inject({
      method: 'GET',
      url: `/api/mailinglists/${list.id}/templates/CONFIRM_EMAIL?appId=${TEST_APP_ID}`
    });
    const after = JSON.parse(getAfter.payload);
    expect(after.isDefault).toBe(false);
    expect(after.subject).toBe('Custom confirm');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/mailinglists/${list.id}/templates/CONFIRM_EMAIL?appId=${TEST_APP_ID}`
    });
    expect(del.statusCode).toBe(200);

    const reGet = await app.inject({
      method: 'GET',
      url: `/api/mailinglists/${list.id}/templates/CONFIRM_EMAIL?appId=${TEST_APP_ID}`
    });
    expect(JSON.parse(reGet.payload).isDefault).toBe(true);
  });

  it('rejects unknown template kinds', async () => {
    const { app, list } = await makeList('badkind');
    const r = await app.inject({
      method: 'GET',
      url: `/api/mailinglists/${list.id}/templates/NOT_A_KIND?appId=${TEST_APP_ID}`
    });
    expect(r.statusCode).toBe(400);
  });

  it('GET /api/templates excludes subscribe-page templates', async () => {
    const { app, list } = await makeList('excl');
    await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${list.id}/templates/WELCOME_EMAIL`,
      payload: {
        appId: TEST_APP_ID,
        subject: 'Excluded',
        content: '<p>Should not show in compose picker</p>'
      }
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/templates?appId=${TEST_APP_ID}`
    });
    expect(res.statusCode).toBe(200);
    const tpls = JSON.parse(res.payload);
    const found = tpls.find((t: any) => t.subject === 'Excluded');
    expect(found).toBeUndefined();
  });

  it('renders public subscribe page and runs full opt-in flow + unsubscribe', async () => {
    const { app, list } = await makeList('flow');
    const slug = `flow-${Date.now().toString(36)}`;
    await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${list.id}/subscribe-settings`,
      payload: { appId: TEST_APP_ID, slug, enabled: true }
    });

    const pageRes = await app.inject({
      method: 'GET',
      url: `/subscribe/${TEST_APP_ID}/${slug}`
    });
    expect(pageRes.statusCode).toBe(200);
    expect(pageRes.headers['content-type']).toMatch(/text\/html/);
    expect(pageRes.payload).toMatch(/<form/i);

    const email = `flow-${Date.now()}@example.test`;
    const submit = await app.inject({
      method: 'POST',
      url: `/subscribe/${TEST_APP_ID}/${slug}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `name=Flow+Tester&email=${encodeURIComponent(email)}`
    });
    expect(submit.statusCode).toBe(200);

    const prisma = getPrisma();
    const pending = await prisma.pendingSubscription.findFirst({
      where: { listId: list.id, email }
    });
    expect(pending).toBeTruthy();

    const confirmRes = await app.inject({
      method: 'GET',
      url: `/subscribe/confirm/${pending!.token}`
    });
    expect(confirmRes.statusCode).toBe(200);

    const member = await prisma.mailingListMember.findFirst({
      where: { listId: list.id, email }
    });
    expect(member).toBeTruthy();
    expect(member!.confirmedAt).toBeTruthy();
    expect(member!.unsubscribeToken).toBeTruthy();

    const stillPending = await prisma.pendingSubscription.findFirst({
      where: { listId: list.id, email }
    });
    expect(stillPending).toBeNull();

    const unsubGet = await app.inject({
      method: 'GET',
      url: `/subscribe/unsubscribe/${member!.unsubscribeToken}`
    });
    expect(unsubGet.statusCode).toBe(200);

    const unsubPost = await app.inject({
      method: 'POST',
      url: `/subscribe/unsubscribe/${member!.unsubscribeToken}`
    });
    expect(unsubPost.statusCode).toBe(200);
    const removed = await prisma.mailingListMember.findFirst({
      where: { listId: list.id, email }
    });
    expect(removed).toBeNull();
  });

  it('returns 404 for disabled subscribe page', async () => {
    const { app, list } = await makeList('disabled');
    const slug = `disabled-${Date.now().toString(36)}`;
    await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${list.id}/subscribe-settings`,
      payload: { appId: TEST_APP_ID, slug, enabled: true }
    });
    await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${list.id}/subscribe-settings`,
      payload: { appId: TEST_APP_ID, enabled: false }
    });
    const res = await app.inject({
      method: 'GET',
      url: `/subscribe/${TEST_APP_ID}/${slug}`
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for invalid confirm token', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/subscribe/confirm/not-a-real-token-xyz'
    });
    expect(res.statusCode).toBe(404);
  });
});
