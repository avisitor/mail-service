import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrisma } from '../../db/prisma.js';
import { AuthService } from '../../auth/service.js';
import { customAlphabet } from 'nanoid';

const nano = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);


const tenantCreateSchema = z.object({ name: z.string().min(1) });
const tenantUpdateSchema = z.object({ name: z.string().min(1).optional(), status: z.enum(['active','disabled','deleted']).optional() });

export async function registerTenantRoutes(app: FastifyInstance) {
  app.post('/tenants', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, 'superadmin');
    if (!userContext) return; // Response already sent

    const parsed = tenantCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const prisma = getPrisma();
    const tenant = await prisma.tenant.create({ data: { name: parsed.data.name } });
    try { await prisma.app.create({ data: { tenantId: tenant.id, name: 'Default App', clientId: `default-${tenant.id.slice(0,8)}` } }); } catch {}
    return reply.code(201).send(tenant);
  });

  app.get('/tenants', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, 'superadmin');
    if (!userContext) return; // Response already sent

    if ((process.env.DEBUG_AUTH || '').toLowerCase() === 'true') {
      try { (req as any).log?.info({ userContext: userContext }, 'tenants.access'); } catch {}
    }

    const includeDeleted = ((req.query as any)?.includeDeleted || 'false').toString().toLowerCase() === 'true';
    const prisma = getPrisma();
    return prisma.tenant.findMany({ where: includeDeleted ? undefined : { status: { not: 'deleted' } }, orderBy: { createdAt: 'desc' } });
  });

  app.get('/tenants/:id', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, 'superadmin');
    if (!userContext) return; // Response already sent

    const { id } = req.params as any;
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { id } });
    if (!t || t.status === 'deleted') return reply.notFound();
    return t;
  });

  app.patch('/tenants/:id', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    // @ts-ignore
    if (!hasRole(req.userContext, 'superadmin')) return reply.forbidden();
    const { id } = req.params as any;
    const parsed = tenantUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const prisma = getPrisma();
    try {
      const rec = await prisma.tenant.update({ where: { id }, data: parsed.data });
      return rec;
    } catch (e:any) { return reply.badRequest(e.message); }
  });

  app.delete('/tenants/:id', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    // @ts-ignore
    if (!hasRole(req.userContext, 'superadmin')) return reply.forbidden();
    const { id } = req.params as any;
    const prisma = getPrisma();
    try {
      await prisma.tenant.update({ where: { id }, data: { status: 'deleted' } });
      return { ok: true };
    } catch (e:any) { return reply.badRequest(e.message); }
  });

}
