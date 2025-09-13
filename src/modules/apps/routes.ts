import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrisma } from '../../db/prisma.js';
import { AuthService } from '../../auth/service.js';
import { customAlphabet } from 'nanoid';

const nano = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

const appCreateSchema = z.object({ tenantId: z.string().min(1), name: z.string().min(1), clientId: z.string().min(1) });

export async function registerAppRoutes(app: FastifyInstance) {
  app.post('/apps', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, ['tenant_admin', 'superadmin']);
    if (!userContext) return; // Response already sent

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

  app.get('/apps', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, ['tenant_admin', 'superadmin']);
    if (!userContext) return; // Response already sent

    const tenantId = (req.query as any)?.tenantId as string | undefined;
    const prisma = getPrisma();
    return prisma.app.findMany({ where: tenantId ? { tenantId } : undefined, orderBy: { createdAt: 'desc' } });
  });
}
