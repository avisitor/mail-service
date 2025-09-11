import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrisma } from '../../db/prisma.js';
import { hasRole } from '../../auth/roles.js';
import { customAlphabet } from 'nanoid';

const nano = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);


const tenantCreateSchema = z.object({ name: z.string().min(1) });
const tenantUpdateSchema = z.object({ name: z.string().min(1).optional(), status: z.enum(['active','disabled','deleted']).optional() });

export async function registerTenantRoutes(app: FastifyInstance) {
  app.post('/tenants', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    // @ts-ignore
    if (!hasRole(req.userContext, 'superadmin')) return reply.forbidden();
    const parsed = tenantCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const prisma = getPrisma();
    const tenant = await prisma.tenant.create({ data: { name: parsed.data.name } });
    try { await prisma.app.create({ data: { tenantId: tenant.id, name: 'Default App', clientId: `default-${tenant.id.slice(0,8)}` } }); } catch {}
    return reply.code(201).send(tenant);
  });

  app.get('/tenants', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    if ((process.env.DEBUG_AUTH || '').toLowerCase() === 'true') {
      try { (req as any).log?.info({ userContext: (req as any).userContext }, 'tenants.access'); } catch {}
    }
    // @ts-ignore
    if (!hasRole(req.userContext, 'superadmin')) {
      if ((process.env.DEBUG_AUTH || '').toLowerCase() === 'true') {
        // Provide a minimal diagnostic body to help debug role mismatches
        return reply.code(403).send({ error: 'forbidden', roles: (req as any).userContext?.roles || [], user: (req as any).userContext?.sub || null });
      }
      return reply.forbidden();
    }
    const includeDeleted = ((req.query as any)?.includeDeleted || 'false').toString().toLowerCase() === 'true';
    const prisma = getPrisma();
    return prisma.tenant.findMany({ where: includeDeleted ? undefined : { status: { not: 'deleted' } }, orderBy: { createdAt: 'desc' } });
  });

  app.get('/tenants/:id', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    // @ts-ignore
    if (!hasRole(req.userContext, 'superadmin')) return reply.forbidden();
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
