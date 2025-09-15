import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../../auth/service.js';
import {
  listSmtpConfigs,
  getSmtpConfig,
  createSmtpConfig,
  updateSmtpConfig,
  deleteSmtpConfig,
  getEffectiveSmtpConfig,
  activateGlobalSmtpConfig,
  getNextActiveConfig
} from './service.js';
import { SmtpConfigInput } from './types.js';

export async function registerSmtpRoutes(app: FastifyInstance) {
  
    
  // List SMTP configurations (with access control)
  app.get('/smtp-configs', async (req, reply) => {
    try {
      const userContext = await AuthService.requireAuth(req, reply);
      if (userContext === null) return; // Auth failed, response already sent
      
      const configs = await listSmtpConfigs(userContext);
      return reply.send(configs);
    } catch (error: any) {
      app.log.error({ error }, 'Failed to list SMTP configs');
      if (!reply.sent) {
        return reply.internalServerError(error.message);
      }
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

  // Get next config that would be activated if current active config is deleted
  app.get('/smtp-configs/:id/next-active', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      const { id } = req.params as { id: string };

      const config = await getSmtpConfig(id, userContext);
      if (!config) {
        return reply.notFound('SMTP configuration not found');
      }

      // Only makes sense for active global configs
      if (!config.isActive || config.scope !== 'GLOBAL') {
        return { nextConfig: null, reason: 'Only active global configurations can have replacements' };
      }

      const nextConfig = await getNextActiveConfig(id, userContext);
      return { nextConfig };
      
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get next active config');
      return reply.internalServerError(error.message);
    }
  });

  // Test SMTP configuration (actual connection test)
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
      const { id } = req.params as { id: string };
      const { to, subject, text, html } = req.body as any;

      const config = await getSmtpConfig(id, userContext);
      if (!config) {
        return reply.notFound('SMTP configuration not found');
      }

      // Test the actual connection based on service type
      if (config.service === 'ses') {
        // Test SES configuration - need to get raw config with decrypted credentials
        try {
          // Get the raw config from database to decrypt credentials
          const { getPrisma } = await import('../../db/prisma.js');
          const prisma = getPrisma();
          const rawConfig = await prisma.smtpConfig.findUnique({
            where: { id: config.id },
          });
          
          if (!rawConfig) {
            return {
              success: false,
              message: 'Configuration not found',
              service: 'ses',
            };
          }

          // Decrypt the stored credentials
          const { decrypt } = await import('./service.js');
          const actualAccessKey = rawConfig.awsAccessKey ? decrypt(rawConfig.awsAccessKey) : '';
          const actualSecretKey = rawConfig.awsSecretKey ? decrypt(rawConfig.awsSecretKey) : '';

          app.log.info({ 
            configId: config.id, 
            region: rawConfig.awsRegion,
            hasAccessKey: !!actualAccessKey,
            hasSecretKey: !!actualSecretKey 
          }, 'Testing SES configuration');

          const sesClient = new (await import('@aws-sdk/client-ses')).SESClient({
            region: rawConfig.awsRegion || 'us-east-1',
            credentials: {
              accessKeyId: actualAccessKey,
              secretAccessKey: actualSecretKey,
            },
          });

          // Test SES by getting sending quota (lightweight test)
          const getSendQuotaCommand = new (await import('@aws-sdk/client-ses')).GetSendQuotaCommand({});
          await sesClient.send(getSendQuotaCommand);

          return {
            success: true,
            message: 'SES configuration is valid and accessible',
            service: 'ses',
            config: {
              id: config.id,
              scope: config.scope,
              region: rawConfig.awsRegion,
            },
          };
        } catch (sesError: any) {
          app.log.error({ error: sesError, configId: config.id }, 'SES configuration test failed');
          return {
            success: false,
            message: `SES test failed: ${sesError.message}`,
            service: 'ses',
            error: sesError.name,
          };
        }
      } else {
        // Test SMTP configuration - need to get raw config with decrypted credentials
        try {
          // Get the raw config from database to decrypt credentials
          const { getPrisma } = await import('../../db/prisma.js');
          const prisma = getPrisma();
          const rawConfig = await prisma.smtpConfig.findUnique({
            where: { id: config.id },
          });
          
          if (!rawConfig) {
            return {
              success: false,
              message: 'Configuration not found',
              service: 'smtp',
            };
          }

          // Decrypt the stored credentials
          const { decrypt } = await import('./service.js');
          const actualPassword = rawConfig.pass ? decrypt(rawConfig.pass) : undefined;

          app.log.info({ 
            configId: config.id, 
            host: rawConfig.host,
            port: rawConfig.port,
            hasUser: !!rawConfig.user,
            hasPassword: !!actualPassword 
          }, 'Testing SMTP configuration');

          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.createTransport({
            host: rawConfig.host,
            port: rawConfig.port,
            secure: rawConfig.secure,
            auth: rawConfig.user ? {
              user: rawConfig.user,
              pass: actualPassword,
            } : undefined,
            // Add connection timeout
            connectionTimeout: 10000, // 10 seconds
            greetingTimeout: 10000,   // 10 seconds
          });

          // Test the connection
          const isValid = await transporter.verify();
          
          if (isValid) {
            return {
              success: true,
              message: 'SMTP configuration is valid and server is accessible',
              service: 'smtp',
              config: {
                id: config.id,
                scope: config.scope,
                host: config.host,
                port: config.port,
                secure: config.secure,
                hasAuth: !!config.user,
              },
            };
          } else {
            return {
              success: false,
              message: 'SMTP server connection failed',
              service: 'smtp',
            };
          }
        } catch (smtpError: any) {
          app.log.error({ error: smtpError }, 'SMTP configuration test failed');
          return {
            success: false,
            message: `SMTP test failed: ${smtpError.message}`,
            service: 'smtp',
            error: smtpError.code || smtpError.name,
          };
        }
      }
    } catch (error: any) {
      app.log.error({ error }, 'Failed to test SMTP config');
      return reply.internalServerError(error.message);
    }
  });

  // Activate/deactivate global SMTP configuration
  app.post('/smtp-configs/:id/activate', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      const { id } = req.params as { id: string };
      
      const result = await activateGlobalSmtpConfig(id, userContext);
      return result;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to activate SMTP config');
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return reply.notFound(error.message);
      }
      if (error.message.includes('permission') || error.message.includes('superadmin')) {
        return reply.forbidden(error.message);
      }
      return reply.badRequest(error.message);
    }
  });
};