import { FastifyInstance } from 'fastify';
import { groupCreateSchema, recipientIngestSchema } from './types.js';
import { hasRole } from '../../auth/roles.js';
import { createGroup, getGroup, ingestRecipients, listGroupRecipients, scheduleGroup, workerTick } from './service.js';
import { getPrisma } from '../../db/prisma.js';

export async function registerGroupRoutes(app: FastifyInstance) {
  app.post('/groups', { preValidation: app.authenticate }, async (req, reply) => {
    const parsed = groupCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    // @ts-ignore
    const user = req.userContext;
    if (!user) return reply.forbidden();
    if (!hasRole(user, 'superadmin')) {
      if (!user.tenantId || user.tenantId !== parsed.data.tenantId) return reply.forbidden();
    }
    const grp = await createGroup(parsed.data);
    return reply.code(201).send(grp);
  });

  app.get('/groups/:id', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const grp = await getGroup(id);
    if (!grp) return reply.notFound();
    // @ts-ignore
    const user = req.userContext;
    if (!hasRole(user, 'superadmin') && user?.tenantId !== grp.tenantId) return reply.forbidden();
    return grp;
  });

  app.post('/groups/:id/recipients', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const parsed = recipientIngestSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const grp = await getGroup(id);
    if (!grp) return reply.notFound();
    // @ts-ignore
    const user = req.userContext;
    if (!hasRole(user, 'superadmin') && user?.tenantId !== grp.tenantId) return reply.forbidden();
    const result = await ingestRecipients(id, parsed.data);
    return result;
  });

  app.get('/groups/:id/recipients', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const grp = await getGroup(id);
    if (!grp) return reply.notFound();
    // @ts-ignore
    const user = req.userContext;
    if (!hasRole(user, 'superadmin') && user?.tenantId !== grp.tenantId) return reply.forbidden();
    const rows = await listGroupRecipients(id);
    return rows;
  });

  app.post('/groups/:id/schedule', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const when = (req.body as any)?.when ? new Date((req.body as any).when) : undefined;
    try {
      const existing = await getGroup(id);
      if (!existing) return reply.notFound();
      // @ts-ignore
      const user = req.userContext;
      if (!hasRole(user, 'superadmin') && user?.tenantId !== existing.tenantId) return reply.forbidden();
      const updated = await scheduleGroup(id, when);
      return updated;
    } catch (e: any) {
      return reply.badRequest(e.message);
    }
  });

  app.post('/internal/worker/tick', { preValidation: app.authenticate }, async () => {
    return workerTick();
  });

  // Recent groups for a tenant
  app.get('/tenants/:tenantId/groups', { preValidation: app.authenticate }, async (req, reply) => {
    const { tenantId } = req.params as any;
    // @ts-ignore
    const user = req.userContext;
    if (!hasRole(user, 'superadmin') && user?.tenantId !== tenantId) return reply.forbidden();
    const prisma = getPrisma();
    return prisma.messageGroup.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 25 });
  });

  // Events for a group
  app.get('/groups/:id/events', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const grp = await getGroup(id);
    if (!grp) return reply.notFound();
    // @ts-ignore
    const user = req.userContext;
    if (!hasRole(user, 'superadmin') && user?.tenantId !== grp.tenantId) return reply.forbidden();
    const prisma = getPrisma();
    return prisma.event.findMany({ where: { groupId: id }, orderBy: { occurredAt: 'desc' }, take: 200 });
  });

  // Cancel a scheduled/processing group
  app.post('/groups/:id/cancel', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const grp = await getGroup(id);
    if (!grp) return reply.notFound();
    // @ts-ignore
    const user = req.userContext;
    if (!hasRole(user, 'superadmin') && user?.tenantId !== grp.tenantId) return reply.forbidden();
    const prisma = getPrisma();
    try {
      const grp = await prisma.messageGroup.update({ where: { id }, data: { status: 'canceled', canceledAt: new Date() } });
      await prisma.event.create({ data: { groupId: id, type: 'group_canceled' } });
      return grp;
    } catch (e: any) { return reply.badRequest(e.message); }
  });

  // Tracking pixel: /t/p/:messageId.png  (messageId == recipientId for now)
  app.get('/t/p/:recipientId.png', async (req, reply) => {
    const { recipientId } = req.params as any;
    const prisma = getPrisma();
    try {
      await prisma.message.updateMany({ where: { recipientId }, data: { openedAt: new Date() } });
      await prisma.event.create({ data: { recipientId, type: 'open' } });
    } catch { /* ignore */ }
    // 1x1 transparent PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64');
    reply.header('Content-Type', 'image/png');
    reply.send(png);
  });
}
