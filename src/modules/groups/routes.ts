import { FastifyInstance } from 'fastify';
import { groupCreateSchema, recipientIngestSchema } from './types.js';
import { createGroup, getGroup, ingestRecipients, listGroupRecipients } from './service.js';

export async function registerGroupRoutes(app: FastifyInstance) {
  app.post('/groups', { preValidation: app.authenticate }, async (req, reply) => {
    const parsed = groupCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const grp = await createGroup(parsed.data);
    return reply.code(201).send(grp);
  });

  app.get('/groups/:id', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const grp = await getGroup(id);
    if (!grp) return reply.notFound();
    return grp;
  });

  app.post('/groups/:id/recipients', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const parsed = recipientIngestSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const result = await ingestRecipients(id, parsed.data);
    return result;
  });

  app.get('/groups/:id/recipients', { preValidation: app.authenticate }, async (req, reply) => {
    const { id } = req.params as any;
    const rows = await listGroupRecipients(id);
    return rows;
  });
}
