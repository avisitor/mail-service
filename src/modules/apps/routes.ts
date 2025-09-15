import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrisma } from '../../db/prisma.js';
import { AuthService } from '../../auth/service.js';
import { customAlphabet } from 'nanoid';

const nano = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

const appCreateSchema = z.object({ tenantId: z.string().min(1), name: z.string().min(1), clientId: z.string().min(1).optional() });
const appUpdateSchema = z.object({ name: z.string().min(1).optional(), clientId: z.string().min(1).optional() });

export async function registerAppRoutes(app: FastifyInstance) {
  app.post('/apps', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, ['tenant_admin', 'superadmin']);
    if (!userContext) return; // Response already sent

    const parsed = appCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    
    // Auto-generate clientId if not provided
    const data = {
      ...parsed.data,
      clientId: parsed.data.clientId || `app-${nano()}`
    };
    
    const prisma = getPrisma();
    try {
      const rec = await prisma.app.create({ data });
      return reply.code(201).send(rec);
    } catch (e: any) {
      return reply.badRequest(e.message);
    }
  });

  app.get('/apps', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, ['tenant_admin', 'superadmin']);
    if (!userContext) return; // Response already sent

    const tenantId = (req.query as any)?.tenantId as string | undefined;
    
    // For tenant admins, automatically filter to their tenant
    let effectiveTenantId = tenantId;
    if (userContext.roles.includes('tenant_admin') && !userContext.roles.includes('superadmin')) {
      effectiveTenantId = userContext.tenantId;
    }
    
    const prisma = getPrisma();
    return prisma.app.findMany({ where: effectiveTenantId ? { tenantId: effectiveTenantId } : undefined, orderBy: { createdAt: 'desc' } });
  });

  app.put('/apps/:id', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, ['tenant_admin', 'superadmin']);
    if (!userContext) return; // Response already sent

    const { id } = req.params as any;
    const parsed = appUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    
    const prisma = getPrisma();
    try {
      const updated = await prisma.app.update({ 
        where: { id }, 
        data: parsed.data 
      });
      return updated;
    } catch (e: any) {
      return reply.badRequest(e.message);
    }
  });

  app.delete('/apps/:id', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, ['tenant_admin', 'superadmin']);
    if (!userContext) return; // Response already sent

    const { id } = req.params as any;
    const prisma = getPrisma();
    try {
      await prisma.app.delete({ where: { id } });
      return { ok: true };
    } catch (e: any) {
      return reply.badRequest(e.message);
    }
  });
}
