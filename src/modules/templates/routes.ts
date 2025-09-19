import { FastifyInstance } from 'fastify';
import { templateCreateSchema } from './types.js';
import { createTemplate, getTemplate, listTemplates, updateTemplate, renderTemplate } from './service.js';
import { hasRole, hasEffectiveTenantAdminRole } from '../../auth/roles.js';

export async function registerTemplateRoutes(app: FastifyInstance) {
  app.post('/templates', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    // @ts-ignore
    if (!hasEffectiveTenantAdminRole(req.userContext)) return reply.forbidden();
    const parsed = templateCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const tpl = await createTemplate(parsed.data);
    return reply.code(201).send(tpl);
  });

  app.get('/templates', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { appId } = req.query as any;
    if (!appId) {
      return reply.badRequest('appId query parameter is required');
    }
    
    // Get templates for the specified app
    try {
      const prisma = (await import('../../db/prisma.js')).getPrisma();
      const allTemplates = await prisma.template.findMany({
        where: { 
          appId: appId,
          isActive: true 
        },
        orderBy: { createdAt: 'desc' }
      });
      
      // Filter out templates with null or empty content in JavaScript
      const validTemplates = allTemplates.filter(template => 
        template.content !== null && template.content !== undefined && template.content.trim() !== ''
      );
      
      return validTemplates;
    } catch (e: any) {
      return reply.badRequest(e.message);
    }
  });

  app.get('/templates/:id', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { id } = req.params as any;
    const tpl = await getTemplate(id);
    if (!tpl) return reply.notFound();
    return tpl;
  });

  app.patch('/templates/:id/deactivate', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    // @ts-ignore
    if (!hasEffectiveTenantAdminRole(req.userContext)) return reply.forbidden();
    const { id } = req.params as any;
    // minimal update; ignores in-memory path (not tracked) except set isActive flag
    try {
      const prisma = (await import('../../db/prisma.js')).getPrisma();
      const updated = await prisma.template.update({ where: { id }, data: { isActive: false } });
      return updated;
    } catch (e: any) {
      return reply.badRequest(e.message);
    }
  });

  app.put('/templates/:id', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    // @ts-ignore
    if (!hasEffectiveTenantAdminRole(req.userContext)) return reply.forbidden();
    const { id } = req.params as any;
    const { title, subject, content } = req.body as any;
    
    if (!title || !content) {
      return reply.badRequest('Title and content are required');
    }
    
    try {
      const updated = await updateTemplate(id, { id, title, subject, content });
      if (!updated) return reply.notFound();
      return updated;
    } catch (e: any) {
      return reply.badRequest(e.message);
    }
  });

  app.get('/tenants/:tenantId/templates', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { tenantId } = req.params as any;
    // @ts-ignore
    const user = req.userContext;
    if (!user) return reply.forbidden();
    if (hasRole(user, 'superadmin')) return listTemplates(tenantId);
    // Non superadmin can only view within their own tenant
    if (user.tenantId !== tenantId) return reply.forbidden();
    return listTemplates(tenantId);
  });

  app.post('/templates/:id/render', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { id } = req.params as any;
    const ctx = (req.body as any)?.context || {};
    const rendered = await renderTemplate(id, ctx);
    if (!rendered) return reply.notFound();
    return rendered;
  });
}
