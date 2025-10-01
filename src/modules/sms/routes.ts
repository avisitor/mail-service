import { FastifyInstance } from 'fastify';
import { sendSms, sendSingleSms, getMessageStatus } from '../../providers/sms.js';
import { validateAppId } from '../../utils/app-validation.js';
import { AuthService } from '../../auth/service.js';
import {
  listSmsConfigs,
  getSmsConfigById,
  createSmsConfig,
  updateSmsConfig,
  deleteSmsConfig,
  resolveSmsConfig
} from './service.js';
import { SmsConfigInput } from './types.js';

export async function registerSmsRoutes(app: FastifyInstance) {
  
  // SMS compose route - always redirects to frontend UI which handles authentication (same as mail compose)
  app.get('/sms-compose', async (req, reply) => {
    const { appId, phoneNumbers, message, returnUrl } = req.query as any;
    
    // Validate appId is provided and exists in database
    if (!appId) {
      console.error('[/sms-compose] AppId is required');
      return reply.code(400).send({ 
        error: 'Missing Application ID', 
        message: 'appId parameter is required for SMS compose endpoint' 
      });
    }
    
    // Use same validation as mail compose
    const validation = await validateAppId(appId);
    if (!validation.isValid) {
      console.error('[/sms-compose] AppId validation failed:', validation.error);
      return reply.code(400).send({ 
        error: 'Invalid Application', 
        message: validation.error 
      });
    }
    console.log('[/sms-compose] AppId validated successfully:', validation.app.name);
    
    // Always redirect to frontend UI - let frontend JavaScript handle authentication (same as mail compose)
    const smsParams = new URLSearchParams({
      view: 'sms-compose',
      ...(appId && { appId }),
      ...(phoneNumbers && { phoneNumbers }),
      ...(message && { message }),
      ...(returnUrl && { returnUrl })
    });
    return reply.redirect(`/ui?${smsParams}`);
  });
  
  // Send SMS via API
  app.post('/api/sms/send', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { appId, phoneNumbers, message } = req.body as any;
    
    if (!appId) {
      return reply.code(400).send({ error: 'appId is required' });
    }
    
    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return reply.code(400).send({ error: 'phoneNumbers array is required and must not be empty' });
    }
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.code(400).send({ error: 'message is required and must not be empty' });
    }
    
    if (message.length > 1600) {
      return reply.code(400).send({ error: 'message is too long (max 1600 characters)' });
    }
    
    // Validate appId exists
    const validation = await validateAppId(appId);
    if (!validation.isValid) {
      return reply.code(400).send({ 
        error: 'Bad Request', 
        message: validation.error 
      });
    }
    
    try {
      // Extract tenant ID for context
      const tenantId = validation.app.tenantId;
      
      const results = await sendSms({
        to: phoneNumbers,
        message: message.trim(),
        tenantId,
        appId
      });
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;
      
      console.log('[SMS API] Send results:', { 
        total: results.length, 
        successful: successCount, 
        failed: failureCount,
        appId,
        tenantId
      });
      
      // Return detailed results
      return reply.send({
        success: true,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount
        },
        results: results.map((result, index) => ({
          phoneNumber: phoneNumbers[index],
          success: result.success,
          messageId: result.messageId,
          error: result.error
        }))
      });
      
    } catch (error) {
      console.error('[SMS API] Failed to send SMS:', error);
      return reply.code(500).send({ 
        error: 'Internal Server Error', 
        message: 'Failed to send SMS: ' + (error as Error).message 
      });
    }
  });
  
  // Direct SMS send endpoint (for API usage without UI)
  app.post('/api/sms/send-direct', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { appId, to, message } = req.body as any;
    
    if (!appId) {
      return reply.code(400).send({ error: 'appId is required' });
    }
    
    if (!to || typeof to !== 'string' || to.trim().length === 0) {
      return reply.code(400).send({ error: 'to (phone number) is required' });
    }
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.code(400).send({ error: 'message is required and must not be empty' });
    }
    
    if (message.length > 1600) {
      return reply.code(400).send({ error: 'message is too long (max 1600 characters)' });
    }
    
    // Validate appId exists
    const validation = await validateAppId(appId);
    if (!validation.isValid) {
      return reply.code(400).send({ 
        error: 'Bad Request', 
        message: validation.error 
      });
    }
    
    try {
      // Extract tenant ID for context
      const tenantId = validation.app.tenantId;
      
      const result = await sendSingleSms(to.trim(), message.trim(), {
        tenantId,
        appId
      });
      
      console.log('[SMS Direct API] Send result:', { 
        success: result.success, 
        messageId: result.messageId,
        to: to.trim(),
        appId,
        tenantId
      });
      
      if (result.success) {
        return reply.send({
          success: true,
          messageId: result.messageId,
          phoneNumber: to.trim(),
          status: 'sent'
        });
      } else {
        return reply.code(400).send({ 
          error: 'SMS Send Failed', 
          message: result.error || 'Unknown error occurred' 
        });
      }
      
    } catch (error) {
      console.error('[SMS Direct API] Failed to send SMS:', error);
      return reply.code(500).send({ 
        error: 'Internal Server Error', 
        message: 'Failed to send SMS: ' + (error as Error).message 
      });
    }
  });

  // SMS message status endpoint
  app.get('/api/sms/status/:messageId', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { messageId } = req.params as any;
    const { appId } = req.query as any;
    
    if (!messageId) {
      return reply.code(400).send({ error: 'messageId is required' });
    }
    
    try {
      // Validate appId if provided
      let tenantId = undefined;
      if (appId) {
        const validation = await validateAppId(appId);
        if (!validation.isValid) {
          return reply.code(400).send({ 
            error: 'Bad Request', 
            message: validation.error 
          });
        }
        tenantId = validation.app.tenantId;
      }
      
      const statusResult = await getMessageStatus(messageId, { tenantId, appId });
      
      if (!statusResult.success) {
        return reply.code(400).send({ 
          error: 'Failed to get message status', 
          message: statusResult.error 
        });
      }
      
      return reply.send({
        success: true,
        messageId,
        ...statusResult.details
      });
      
    } catch (error) {
      console.error('[SMS Status API] Failed to get message status:', error);
      return reply.code(500).send({ 
        error: 'Internal Server Error', 
        message: 'Failed to get message status: ' + (error as Error).message 
      });
    }
  });

  // SMS Configuration Management Routes

  // List SMS configurations (with access control)
  app.get('/sms-configs', async (req, reply) => {
    try {
      const userContext = await AuthService.requireAuth(req, reply);
      if (userContext === null) return; // Auth failed, response already sent
      
      const configs = await listSmsConfigs(userContext);
      return reply.send(configs);
    } catch (error: any) {
      app.log.error({ error }, 'Failed to list SMS configs');
      if (!reply.sent) {
        return reply.internalServerError(error.message);
      }
    }
  });

  // Get specific SMS configuration
  app.get('/sms-configs/:id', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      const { id } = req.params as { id: string };
      const config = await getSmsConfigById(id, userContext);
      
      if (!config) {
        return reply.notFound('SMS configuration not found');
      }

      return config;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get SMS config');
      if (error.message.includes('Access denied') || error.message.includes('access') || error.message.includes('permission') || error.message.includes('different tenant')) {
        return reply.forbidden(error.message);
      }
      if (error.message.includes('not found')) {
        return reply.notFound(error.message);
      }
      return reply.internalServerError(error.message);
    }
  });

  // Create SMS configuration
  app.post('/sms-configs', {
    preHandler: (req, reply) => app.authenticate(req, reply),
    schema: {
      body: {
        type: 'object',
        required: ['scope', 'sid', 'authToken', 'fromNumber'],
        properties: {
          scope: { type: 'string', enum: ['GLOBAL', 'TENANT', 'APP'] },
          tenantId: { type: 'string' },
          appId: { type: 'string' },
          sid: { type: 'string' },
          authToken: { type: 'string' },
          fromNumber: { type: 'string' },
          fallbackTo: { type: 'string' },
          serviceSid: { type: 'string' },
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
          }
        ]
      },
    },
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      const input = req.body as any;
      const config = await createSmsConfig(input, userContext);
      
      return reply.status(201).send(config);
    } catch (error: any) {
      app.log.error({ error }, 'Failed to create SMS config');
      if (error.message.includes('Access denied') || error.message.includes('access') || error.message.includes('permission') || error.message.includes('different tenant')) {
        return reply.forbidden(error.message);
      }
      if (error.message.includes('already exists')) {
        return reply.conflict(error.message);
      }
      return reply.badRequest(error.message);
    }
  });

  // Update SMS configuration
  app.put('/sms-configs/:id', {
    preHandler: (req, reply) => app.authenticate(req, reply),
    schema: {
      body: {
        type: 'object',
        properties: {
          sid: { type: 'string' },
          authToken: { type: 'string' },
          fromNumber: { type: 'string' },
          fallbackTo: { type: 'string' },
          serviceSid: { type: 'string' },
          isActive: { type: 'boolean' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      const { id } = req.params as { id: string };
      const input = req.body as any;
      
      const config = await updateSmsConfig(id, input, userContext);
      return config;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to update SMS config');
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return reply.notFound(error.message);
      }
      return reply.badRequest(error.message);
    }
  });

  // Delete SMS configuration
  app.delete('/sms-configs/:id', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      const { id } = req.params as { id: string };
      await deleteSmsConfig(id, userContext);
      
      return reply.status(204).send();
    } catch (error: any) {
      app.log.error({ error }, 'Failed to delete SMS config');
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return reply.notFound(error.message);
      }
      return reply.internalServerError(error.message);
    }
  });

  // Test SMS configuration
  app.post('/sms-configs/:id/test', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      const { id } = req.params as { id: string };
      const { phoneNumber } = req.body as { phoneNumber: string };

      if (!phoneNumber) {
        return reply.badRequest('phoneNumber is required');
      }

      // Get the SMS config from database directly to decrypt credentials
      const { getPrisma } = await import('../../db/prisma.js');
      const prisma = getPrisma();
      const rawConfig = await prisma.smsConfig.findUnique({
        where: { id },
      });
      
      if (!rawConfig) {
        return reply.notFound('SMS configuration not found');
      }

      // Check access control manually
      if (userContext && !userContext.roles.includes('superadmin')) {
        if (rawConfig.scope === 'TENANT' || rawConfig.scope === 'APP') {
          // For APP scope, get tenant ID from app
          let configTenantId = rawConfig.tenantId;
          if (rawConfig.scope === 'APP' && rawConfig.appId) {
            const app = await prisma.app.findUnique({
              where: { id: rawConfig.appId },
              select: { tenantId: true }
            });
            configTenantId = app?.tenantId || null;
          }
          
          if (configTenantId !== userContext.tenantId) {
            return reply.forbidden('Access denied: Cannot test configuration for other tenants');
          }
        }
      }

      // Decrypt the stored credentials
      const { decrypt } = await import('./service.js');
      const decryptedToken = rawConfig.token ? decrypt(rawConfig.token) : undefined;

      if (!decryptedToken) {
        return reply.badRequest('SMS configuration missing authentication token');
      }

      // Send test SMS using the provider
      const testMessage = 'Test SMS from Mail Service configuration';
      
      // For testing, we need to use Twilio client directly with the specific config
      // @ts-ignore
      const { Twilio } = await import('twilio');
      const client = new Twilio(rawConfig.sid, decryptedToken);
      
      const messageParams: any = {
        body: testMessage,
        to: phoneNumber,
        from: rawConfig.fromNumber
      };
      
      if (rawConfig.serviceSid) {
        messageParams.messagingServiceSid = rawConfig.serviceSid;
        delete messageParams.from; // Can't use both from and messagingServiceSid
      }
      
      const result = await client.messages.create(messageParams);

      return { 
        success: true, 
        message: 'Test SMS sent successfully',
        messageId: result.sid,
        to: phoneNumber
      };
    } catch (error: any) {
      app.log.error({ error }, 'Failed to test SMS config');
      return reply.internalServerError(`Test SMS failed: ${error.message}`);
    }
  });

  // Activate SMS configuration (set as active, deactivate others in same scope)
  app.post('/sms-configs/:id/activate', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      const { id } = req.params as { id: string };

      // Get the config to check its scope
      const config = await getSmsConfigById(id, userContext);
      if (!config) {
        return reply.notFound('SMS configuration not found');
      }

      // Use updateSmsConfig to activate this config and deactivate others
      const updatedConfig = await updateSmsConfig(id, { isActive: true }, userContext);

      return updatedConfig;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to activate SMS config');
      return reply.internalServerError(`Activation failed: ${error.message}`);
    }
  });

  // Get effective SMS configuration for a tenant/app
  app.get('/sms-configs/effective/:tenantId', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      const { tenantId } = req.params as { tenantId: string };
      const { appId } = req.query as { appId?: string };

      // Access control: only superadmins or tenant members can view effective config (when auth enabled)
      if (userContext) {
        const isSuperAdmin = userContext.roles.includes('superadmin');
        if (!isSuperAdmin && userContext.tenantId !== tenantId) {
          return reply.forbidden('Cannot view SMS configuration for different tenant');
        }
      }

      const config = await resolveSmsConfig(appId, userContext);
      return config;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get effective SMS config');
      return reply.internalServerError(error.message);
    }
  });

  // Get effective SMS configuration by scope (for UI)
  app.get('/sms-configs/effective', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
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
        const config = await resolveSmsConfig(undefined, userContext);
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
          return reply.forbidden('Cannot view SMS configuration for different tenant');
        }
      }

      const config = await resolveSmsConfig(scope === 'APP' ? appId : undefined, userContext);
      return config;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to get effective SMS config by scope');
      return reply.internalServerError(error.message);
    }
  });

  // Resolve SMS configuration for an app (hierarchical resolution)
  app.get('/sms-configs/resolve', {
    preHandler: (req, reply) => app.authenticate(req, reply),
  }, async (req, reply) => {
    try {
      const userContext = (req as any).userContext;
      const { appId, tenantId } = req.query as { appId?: string; tenantId?: string };

      // If appId is provided, get the tenant from the app
      let resolvedTenantId = tenantId;
      if (appId && !resolvedTenantId) {
        // Get tenant from userContext or from app lookup
        resolvedTenantId = userContext?.tenantId;
      }

      // Access control: only superadmins or tenant members can resolve config
      if (userContext && resolvedTenantId) {
        const isSuperAdmin = userContext.roles.includes('super_admin');
        if (!isSuperAdmin && userContext.tenantId !== resolvedTenantId) {
          return reply.forbidden('Cannot resolve SMS configuration for different tenant');
        }
      }

      const config = await resolveSmsConfig(appId, userContext);
      
      if (!config) {
        return reply.notFound('SMS configuration not found');
      }

      return config;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to resolve SMS config');
      if (error.message.includes('Access denied') || error.message.includes('access') || error.message.includes('permission') || error.message.includes('different tenant')) {
        return reply.forbidden(error.message);
      }
      if (error.message.includes('not found')) {
        return reply.notFound(error.message);
      }
      return reply.internalServerError(error.message);
    }
  });
}