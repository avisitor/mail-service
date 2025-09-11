import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrisma } from '../../db/prisma.js';
import { hasRole } from '../../auth/roles.js';
import { customAlphabet } from 'nanoid';

const nano = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

const appCreateSchema = z.object({ tenantId: z.string().min(1), name: z.string().min(1), clientId: z.string().min(1) });

export async function registerAppRoutes(app: FastifyInstance) {
  app.post('/apps', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    // @ts-ignore
    if (!hasRole(req.userContext, 'tenant_admin') && !hasRole(req.userContext, 'superadmin')) return reply.forbidden();
    const parsed = appCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const prisma = getPrisma();
    try {
      const rec = await prisma.app.create({ data: parsed.data });
      return reply.code(201).send(rec);
    } catch (e: any) {
      return reply.badRequest(e.message);
    }
  });

  app.get('/apps', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const tenantId = (req.query as any)?.tenantId as string | undefined;
    // @ts-ignore
    if (!hasRole(req.userContext, 'tenant_admin') && !hasRole(req.userContext, 'superadmin')) return reply.forbidden();
    const prisma = getPrisma();
    return prisma.app.findMany({ where: tenantId ? { tenantId } : undefined, orderBy: { createdAt: 'desc' } });
  });
}
