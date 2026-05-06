import { FastifyInstance } from 'fastify';
import {
  resolveAppId,
  listLists,
  getListWithMembers,
  createList,
  renameList,
  deleteList,
  addMember,
  updateMember,
  removeMember,
  updateSubscribeSettings,
  getSubscribeTemplate,
  upsertSubscribeTemplate,
  deleteSubscribeTemplate,
  MailingListError
} from './service.js';
import { hasRole } from '../../auth/roles.js';

function parseIntParam(value: any): number | null {
  if (value === undefined || value === null) return null;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function userCanAccessApp(req: any, appId: string): Promise<boolean> {
  const user = req.userContext;
  if (!user) return false;
  if (hasRole(user, 'superadmin')) return true;
  if (user.appId && user.appId === appId) return true;
  if (user.tenantId) {
    const { getPrisma } = await import('../../db/prisma.js');
    const prisma = getPrisma();
    const app = await prisma.app.findUnique({ where: { id: appId } });
    return !!app && app.tenantId === user.tenantId;
  }
  return false;
}

function handleError(reply: any, e: unknown) {
  if (e instanceof MailingListError) {
    return reply.code(e.status).send({ error: e.message });
  }
  const msg = e instanceof Error ? e.message : 'Internal error';
  return reply.internalServerError(msg);
}

export async function registerMailingListRoutes(app: FastifyInstance) {
  app.get(
    '/api/mailinglists',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const { appId } = req.query as any;
      if (!appId) return reply.badRequest('appId query parameter is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        return await listLists(resolved);
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.get(
    '/api/mailinglists/:id',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const id = parseIntParam((req.params as any).id);
      const { appId } = req.query as any;
      if (!id) return reply.badRequest('Invalid list id');
      if (!appId) return reply.badRequest('appId query parameter is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        const list = await getListWithMembers(resolved, id);
        if (!list) return reply.notFound('List not found');
        return list;
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.post(
    '/api/mailinglists',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const { appId, name } = (req.body as any) || {};
      if (!appId) return reply.badRequest('appId is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        const user = req.userContext as any;
        const sub = user?.sub || null;
        const email = user?.email || user?.claims?.email || null;
        const list = await createList(resolved, name || '', sub, email);
        return reply.code(201).send(list);
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.patch(
    '/api/mailinglists/:id',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const id = parseIntParam((req.params as any).id);
      const { appId, name } = (req.body as any) || {};
      if (!id) return reply.badRequest('Invalid list id');
      if (!appId) return reply.badRequest('appId is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        return await renameList(resolved, id, name || '');
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.delete(
    '/api/mailinglists/:id',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const id = parseIntParam((req.params as any).id);
      const { appId } = (req.body as any) || (req.query as any) || {};
      if (!id) return reply.badRequest('Invalid list id');
      if (!appId) return reply.badRequest('appId is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        await deleteList(resolved, id);
        return { ok: true };
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.post(
    '/api/mailinglists/:id/members',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const id = parseIntParam((req.params as any).id);
      const { appId, name, email } = (req.body as any) || {};
      if (!id) return reply.badRequest('Invalid list id');
      if (!appId) return reply.badRequest('appId is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        const member = await addMember(resolved, id, name || '', email || '');
        return reply.code(201).send(member);
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.put(
    '/api/mailinglists/:id/members/:memberId',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const id = parseIntParam((req.params as any).id);
      const memberId = parseIntParam((req.params as any).memberId);
      const { appId, name, email } = (req.body as any) || {};
      if (!id || !memberId) return reply.badRequest('Invalid id');
      if (!appId) return reply.badRequest('appId is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        return await updateMember(resolved, id, memberId, name || '', email || '');
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.delete(
    '/api/mailinglists/:id/members/:memberId',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const id = parseIntParam((req.params as any).id);
      const memberId = parseIntParam((req.params as any).memberId);
      const { appId } = (req.body as any) || (req.query as any) || {};
      if (!id || !memberId) return reply.badRequest('Invalid id');
      if (!appId) return reply.badRequest('appId is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        await removeMember(resolved, id, memberId);
        return { ok: true };
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.put(
    '/api/mailinglists/:id/subscribe-settings',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const id = parseIntParam((req.params as any).id);
      const body = (req.body as any) || {};
      const { appId, enabled, slug, notifyCreatorOnJoin, creatorEmail } = body;
      if (!id) return reply.badRequest('Invalid list id');
      if (!appId) return reply.badRequest('appId is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        return await updateSubscribeSettings(resolved, id, {
          enabled,
          slug,
          notifyCreatorOnJoin,
          creatorEmail
        });
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.get(
    '/api/mailinglists/:id/templates/:kind',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const id = parseIntParam((req.params as any).id);
      const kind = String((req.params as any).kind || '');
      const { appId } = (req.query as any) || {};
      if (!id) return reply.badRequest('Invalid list id');
      if (!appId) return reply.badRequest('appId is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        return await getSubscribeTemplate(resolved, id, kind);
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.put(
    '/api/mailinglists/:id/templates/:kind',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const id = parseIntParam((req.params as any).id);
      const kind = String((req.params as any).kind || '');
      const body = (req.body as any) || {};
      const { appId, subject, content } = body;
      if (!id) return reply.badRequest('Invalid list id');
      if (!appId) return reply.badRequest('appId is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        return await upsertSubscribeTemplate(resolved, id, kind, { subject, content });
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );

  app.delete(
    '/api/mailinglists/:id/templates/:kind',
    { preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const id = parseIntParam((req.params as any).id);
      const kind = String((req.params as any).kind || '');
      const { appId } = (req.body as any) || (req.query as any) || {};
      if (!id) return reply.badRequest('Invalid list id');
      if (!appId) return reply.badRequest('appId is required');
      const resolved = await resolveAppId(appId);
      if (!resolved) return reply.badRequest('App not found');
      if (!(await userCanAccessApp(req, resolved))) return reply.forbidden();
      try {
        await deleteSubscribeTemplate(resolved, id, kind);
        return { ok: true };
      } catch (e) {
        return handleError(reply, e);
      }
    }
  );
}
