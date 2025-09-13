import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../../auth/service.js';
import {
  listSmtpConfigs,
  getSmtpConfig,
  createSmtpConfig,
  updateSmtpConfig,
  deleteSmtpConfig,
  getEffectiveSmtpConfig
} from './service.js';
import { SmtpConfigInput } from './types.js';

export async function registerSmtpRoutes(app: FastifyInstance) {
  
    
  // List SMTP configurations (with access control)
  app.get('/smtp-configs', async (req, reply) => {
    try {
      const userContext = await AuthService.requireAuth(req, reply);
      if (userContext === null && !reply.sent) return; // Auth failed, response sent
      
      // Convert to service layer context (null when auth disabled)
      const serviceContext = AuthService.getServiceContext(userContext);
      const configs = await listSmtpConfigs(serviceContext);
      return reply.send(configs);
    } catch (error: any) {
      app.log.error({ error }, 'Failed to list SMTP configs');
      return reply.internalServerError(error.message);
    }
  });

  // Get specific SMTP configuration
  app.get('/smtp-configs/:id', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      // If authentication is disabled, userContext may be null - that's ok

      const { id } = req.params as { id: string };
      const config = await getSmtpConfig(id, userContext);
      
      if (!config) {
        return reply.notFound('SMTP configuration not found');
      }

      return config;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get SMTP config');
      return reply.internalServerError(error.message);
    }
  });

  // Create SMTP configuration
  app.post('/smtp-configs', {
    preHandler: (req, reply) => app.authenticate(req, reply),
    schema: {
      body: {
        type: 'object',
        required: ['scope'],
        properties: {
          scope: { type: 'string', enum: ['GLOBAL', 'TENANT', 'APP'] },
          tenantId: { type: 'string' },
          appId: { type: 'string' },
          host: { type: 'string' },
          port: { type: 'number', minimum: 1, maximum: 65535 },
          secure: { type: 'boolean' },
          user: { type: 'string' },
          pass: { type: 'string' },
          fromAddress: { type: 'string', format: 'email' },
          fromName: { type: 'string' },
          service: { type: 'string', enum: ['smtp', 'ses'] },
          awsRegion: { type: 'string' },
          awsAccessKey: { type: 'string' },
          awsSecretKey: { type: 'string' },
          isActive: { type: 'boolean' },
        },
        // Conditional validation for different scopes
        allOf: [
          {
            if: { properties: { scope: { const: 'TENANT' } } },
            then: { required: ['tenantId'] }
          },
          {
            if: { properties: { scope: { const: 'APP' } } },
            then: { required: ['appId'] }
          },
          {
            if: { properties: { service: { const: 'ses' } } },
            then: { required: ['awsRegion', 'awsAccessKey', 'awsSecretKey'] }
          },
          {
            if: { properties: { service: { const: 'smtp' } } },
            then: { required: ['host'] }
          }
        ]
      },
    },
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      // If authentication is disabled, userContext may be null - that's ok

      const input = req.body as any;
      const config = await createSmtpConfig(input, userContext);
      
      return reply.status(201).send(config);
    } catch (error: any) {
      app.log.error({ error }, 'Failed to create SMTP config');
      if (error.message.includes('access') || error.message.includes('permission')) {
        return reply.forbidden(error.message);
      }
      if (error.message.includes('already exists')) {
        return reply.conflict(error.message);
      }
      return reply.badRequest(error.message);
    }
  });

  // Update SMTP configuration
  app.put('/smtp-configs/:id', {
    preHandler: (req, reply) => app.authenticate(req, reply),
    schema: {
      body: {
        type: 'object',
        properties: {
          host: { type: 'string' },
          port: { type: 'number', minimum: 1, maximum: 65535 },
          secure: { type: 'boolean' },
          user: { type: 'string' },
          pass: { type: 'string' },
          fromAddress: { type: 'string', format: 'email' },
          fromName: { type: 'string' },
          service: { type: 'string', enum: ['smtp', 'ses'] },
          awsRegion: { type: 'string' },
          awsAccessKey: { type: 'string' },
          awsSecretKey: { type: 'string' },
          isActive: { type: 'boolean' },
        },
        // Conditional validation for SES updates
        if: { properties: { service: { const: 'ses' } } },
        then: { 
          required: ['awsRegion', 'awsAccessKey', 'awsSecretKey'],
        },
      },
    },
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      // If authentication is disabled, userContext may be null - that's ok

      const { id } = req.params as { id: string };
      const input = req.body as any;
      
      const config = await updateSmtpConfig(id, input, userContext);
      return config;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to update SMTP config');
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return reply.notFound(error.message);
      }
      return reply.badRequest(error.message);
    }
  });

  // Delete SMTP configuration
  app.delete('/smtp-configs/:id', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      // If authentication is disabled, userContext may be null - that's ok

      const { id } = req.params as { id: string };
      await deleteSmtpConfig(id, userContext);
      
      return reply.status(204).send();
    } catch (error: any) {
      app.log.error({ error }, 'Failed to delete SMTP config');
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return reply.notFound(error.message);
      }
      return reply.internalServerError(error.message);
    }
  });

  // Get effective SMTP configuration for a tenant/app
  app.get('/smtp-configs/effective/:tenantId', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      // If authentication is disabled, userContext may be null - skip access control

      const { tenantId } = req.params as { tenantId: string };
      const { appId } = req.query as { appId?: string };

      // Access control: only superadmins or tenant members can view effective config (when auth enabled)
      if (userContext) {
        const isSuperAdmin = userContext.roles.includes('superadmin');
        if (!isSuperAdmin && userContext.tenantId !== tenantId) {
          return reply.forbidden('Cannot view SMTP configuration for different tenant');
        }
      }

      const config = await getEffectiveSmtpConfig(tenantId, appId);
      return config;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get effective SMTP config');
      return reply.internalServerError(error.message);
    }
  });

  // Get effective SMTP configuration by scope (for UI)
  app.get('/smtp-configs/effective', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      // If authentication is disabled, userContext may be null - skip access control

      const { scope, tenantId, appId } = req.query as { 
        scope: 'GLOBAL' | 'TENANT' | 'APP'; 
        tenantId?: string; 
        appId?: string; 
      };

      if (!scope) {
        return reply.badRequest('scope query parameter is required');
      }

      // For GLOBAL scope, we don't need tenant/app context
      if (scope === 'GLOBAL') {
        const config = await getEffectiveSmtpConfig(undefined, undefined);
        return config;
      }

      // For TENANT/APP scope, we need tenantId
      if (!tenantId) {
        return reply.badRequest('tenantId query parameter is required for TENANT/APP scope');
      }

      // Access control: only superadmins or tenant members can view effective config (when auth enabled)
      if (userContext) {
        const isSuperAdmin = userContext.roles.includes('superadmin');
        if (!isSuperAdmin && userContext.tenantId !== tenantId) {
          return reply.forbidden('Cannot view SMTP configuration for different tenant');
        }
      }

      const config = await getEffectiveSmtpConfig(tenantId, scope === 'APP' ? appId : undefined);
      return config;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get effective SMTP config by scope');
      return reply.internalServerError(error.message);
    }
  });

  // Test SMTP configuration (dry run)
  app.post('/smtp-configs/:id/test', {
    preHandler: (req, reply) => app.authenticate(req, reply),
    schema: {
      body: {
        type: 'object',
        required: ['to', 'subject'],
        properties: {
          to: { type: 'string', format: 'email' },
          subject: { type: 'string' },
          text: { type: 'string' },
          html: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      // If authentication is disabled, userContext may be null - that's ok

      const { id } = req.params as { id: string };
      const { to, subject, text, html } = req.body as any;

      const config = await getSmtpConfig(id, userContext);
      if (!config) {
        return reply.notFound('SMTP configuration not found');
      }

      // TODO: Implement actual test sending using the specific config
      // For now, just validate the configuration exists
      return {
        success: true,
        message: 'SMTP configuration test would be sent',
        config: {
          id: config.id,
          scope: config.scope,
          host: config.host,
          port: config.port,
        },
        testEmail: {
          to,
          subject,
          hasText: !!text,
          hasHtml: !!html,
        },
      };
    } catch (error: any) {
      app.log.error({ error }, 'Failed to test SMTP config');
      return reply.internalServerError(error.message);
    }
  });
};