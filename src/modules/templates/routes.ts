import { FastifyInstance } from 'fastify';
import { templateCreateSchema } from './types.js';
import { createTemplate, getTemplate, listTemplates, updateTemplate, renderTemplate } from './service.js';

export async function registerTemplateRoutes(app: FastifyInstance) {
  app.post('/templates', { preValidation: app.authenticate }, async (req, reply) => {
    const parsed = templateCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const tpl = await createTemplate(parsed.data);
    return reply.code(201).send(tpl);
  });

  app.get('/templates/:id', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const tpl = await getTemplate(id);
    if (!tpl) return reply.notFound();
    return tpl;
  });

  app.get('/tenants/:tenantId/templates', { preValidation: app.authenticate }, async (req) => {
    const { tenantId } = req.params as any;
    return listTemplates(tenantId);
  });

  app.post('/templates/:id/render', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const ctx = (req.body as any)?.context || {};
    const rendered = await renderTemplate(id, ctx);
    if (!rendered) return reply.notFound();
    return rendered;
  });
}
