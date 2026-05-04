import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { config, flags } from '../src/config.js';
import { getPrisma } from '../src/db/prisma.js';

flags.disableAuth = true as any;

const dbValid = (config.databaseUrl || '').startsWith('mysql://');
const TEST_APP_ID = 'cmfka688r0001b77ofpgm57ix';

describe('mailing lists (db)', () => {
  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  const createdListIds: number[] = [];

  afterAll(async () => {
    if (createdListIds.length) {
      const prisma = getPrisma();
      await prisma.mailingList
        .deleteMany({ where: { id: { in: createdListIds } } })
        .catch(() => {});
    }
  });

  it('rejects requests without appId', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/mailinglists' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects requests with unknown appId', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/mailinglists?appId=does-not-exist'
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates, lists, fetches, renames, and deletes a list', async () => {
    const app = buildApp();
    const uniqueName = `test-mailinglist-${Date.now()}`;

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/mailinglists',
      payload: { appId: TEST_APP_ID, name: uniqueName }
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload);
    expect(created.name).toBe(uniqueName);
    expect(created.appId).toBe(TEST_APP_ID);
    createdListIds.push(created.id);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/mailinglists?appId=${TEST_APP_ID}`
    });
    expect(listRes.statusCode).toBe(200);
    const lists = JSON.parse(listRes.payload);
    expect(Array.isArray(lists)).toBe(true);
    const found = lists.find((l: any) => l.id === created.id);
    expect(found).toBeTruthy();
    expect(found.memberCount).toBe(0);

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/mailinglists/${created.id}?appId=${TEST_APP_ID}`
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.payload);
    expect(detail.id).toBe(created.id);
    expect(detail.members).toEqual([]);

    const renamedName = `${uniqueName}-renamed`;
    const renameRes = await app.inject({
      method: 'PATCH',
      url: `/api/mailinglists/${created.id}`,
      payload: { appId: TEST_APP_ID, name: renamedName }
    });
    expect(renameRes.statusCode).toBe(200);
    expect(JSON.parse(renameRes.payload).name).toBe(renamedName);

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/mailinglists/${created.id}?appId=${TEST_APP_ID}`
    });
    expect(delRes.statusCode).toBe(200);
    createdListIds.splice(createdListIds.indexOf(created.id), 1);

    const missingRes = await app.inject({
      method: 'GET',
      url: `/api/mailinglists/${created.id}?appId=${TEST_APP_ID}`
    });
    expect(missingRes.statusCode).toBe(404);
  });

  it('rejects empty list name and duplicates', async () => {
    const app = buildApp();
    const emptyRes = await app.inject({
      method: 'POST',
      url: '/api/mailinglists',
      payload: { appId: TEST_APP_ID, name: '   ' }
    });
    expect(emptyRes.statusCode).toBe(400);

    const name = `test-dup-${Date.now()}`;
    const firstRes = await app.inject({
      method: 'POST',
      url: '/api/mailinglists',
      payload: { appId: TEST_APP_ID, name }
    });
    expect(firstRes.statusCode).toBe(201);
    const firstList = JSON.parse(firstRes.payload);
    createdListIds.push(firstList.id);

    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/mailinglists',
      payload: { appId: TEST_APP_ID, name }
    });
    expect(dupRes.statusCode).toBe(409);
  });

  it('manages members: add, list, update, remove', async () => {
    const app = buildApp();
    const listName = `test-members-${Date.now()}`;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/mailinglists',
      payload: { appId: TEST_APP_ID, name: listName }
    });
    const list = JSON.parse(createRes.payload);
    createdListIds.push(list.id);

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/mailinglists/${list.id}/members`,
      payload: { appId: TEST_APP_ID, name: 'Alice', email: 'alice@example.com' }
    });
    expect(addRes.statusCode).toBe(201);
    const member = JSON.parse(addRes.payload);
    expect(member.email).toBe('alice@example.com');

    const badEmailRes = await app.inject({
      method: 'POST',
      url: `/api/mailinglists/${list.id}/members`,
      payload: { appId: TEST_APP_ID, name: 'Bad', email: 'not-an-email' }
    });
    expect(badEmailRes.statusCode).toBe(400);

    const upsertRes = await app.inject({
      method: 'POST',
      url: `/api/mailinglists/${list.id}/members`,
      payload: { appId: TEST_APP_ID, name: 'Alice Renamed', email: 'alice@example.com' }
    });
    expect(upsertRes.statusCode).toBe(201);
    expect(JSON.parse(upsertRes.payload).name).toBe('Alice Renamed');

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/mailinglists/${list.id}?appId=${TEST_APP_ID}`
    });
    const detail = JSON.parse(detailRes.payload);
    expect(detail.members.length).toBe(1);

    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/mailinglists/${list.id}/members/${member.id}`,
      payload: { appId: TEST_APP_ID, name: 'Alice B', email: 'alice.b@example.com' }
    });
    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.payload).email).toBe('alice.b@example.com');

    const removeRes = await app.inject({
      method: 'DELETE',
      url: `/api/mailinglists/${list.id}/members/${member.id}?appId=${TEST_APP_ID}`
    });
    expect(removeRes.statusCode).toBe(200);

    const afterRes = await app.inject({
      method: 'GET',
      url: `/api/mailinglists/${list.id}?appId=${TEST_APP_ID}`
    });
    expect(JSON.parse(afterRes.payload).members.length).toBe(0);
  });

  it('scopes lists by appId', async () => {
    const app = buildApp();
    const name = `test-scope-${Date.now()}`;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/mailinglists',
      payload: { appId: TEST_APP_ID, name }
    });
    const list = JSON.parse(createRes.payload);
    createdListIds.push(list.id);

    const prisma = getPrisma();
    const others = await prisma.app.findMany({
      where: { NOT: { id: TEST_APP_ID } },
      take: 1
    });
    if (others.length === 0) return;
    const otherAppId = others[0].id;

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/mailinglists/${list.id}?appId=${otherAppId}`
    });
    expect(detailRes.statusCode).toBe(404);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/mailinglists?appId=${otherAppId}`
    });
    const lists = JSON.parse(listRes.payload);
    expect(lists.find((l: any) => l.id === list.id)).toBeUndefined();
  });
});
