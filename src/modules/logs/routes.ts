import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../../auth/service.js';
import { 
  getEmailLogs, 
  getEmailLogById, 
  getSmsLogs, 
  getSmsLogById 
} from './service.js';

// Validation schemas
const emailLogsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(1000).default(50),
  offset: z.coerce.number().min(0).default(0),
  appId: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

const smsLogsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(1000).default(50),
  offset: z.coerce.number().min(0).default(0),
  appId: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export async function registerLogRoutes(app: FastifyInstance) {
  
  // Get email logs
  app.get('/api/logs/email', async (req, reply) => {
    try {
      const userContext = await AuthService.requireAuth(req, reply);
      if (userContext === null) return; // Auth failed, response already sent
      
      // Validate query parameters
      const query = emailLogsQuerySchema.parse(req.query);
      
      const logs = await getEmailLogs(userContext, query);
      return reply.send(logs);
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get email logs');
      if (error instanceof z.ZodError) {
        return reply.badRequest('Invalid query parameters: ' + error.message);
      }
      if (!reply.sent) {
        return reply.internalServerError(error.message);
      }
    }
  });

  // Get specific email log by ID
  app.get('/api/logs/email/:id', async (req, reply) => {
    try {
      const userContext = await AuthService.requireAuth(req, reply);
      if (userContext === null) return; // Auth failed, response already sent
      
      const { id } = req.params as { id: string };
      
      const log = await getEmailLogById(userContext, id);
      if (!log) {
        return reply.notFound('Email log not found');
      }
      
      return reply.send(log);
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get email log');
      if (!reply.sent) {
        return reply.internalServerError(error.message);
      }
    }
  });

  // Get SMS logs
  app.get('/api/logs/sms', async (req, reply) => {
    try {
      const userContext = await AuthService.requireAuth(req, reply);
      if (userContext === null) return; // Auth failed, response already sent
      
      // Validate query parameters
      const query = smsLogsQuerySchema.parse(req.query);
      
      const logs = await getSmsLogs(userContext, query);
      return reply.send(logs);
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get SMS logs');
      if (error instanceof z.ZodError) {
        return reply.badRequest('Invalid query parameters: ' + error.message);
      }
      if (!reply.sent) {
        return reply.internalServerError(error.message);
      }
    }
  });

  // Get specific SMS log by ID
  app.get('/api/logs/sms/:id', async (req, reply) => {
    try {
      const userContext = await AuthService.requireAuth(req, reply);
      if (userContext === null) return; // Auth failed, response already sent
      
      const { id } = req.params as { id: string };
      
      const log = await getSmsLogById(userContext, id);
      if (!log) {
        return reply.notFound('SMS log not found');
      }
      
      return reply.send(log);
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get SMS log');
      if (!reply.sent) {
        return reply.internalServerError(error.message);
      }
    }
  });
}