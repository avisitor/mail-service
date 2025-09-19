import { FastifyInstance } from 'fastify';
import { sendSms, sendSingleSms, getMessageStatus } from '../../providers/sms.js';
import { validateAppAccess } from '../../utils/app-validation.js';
import { checkAuthentication, createIdpRedirectUrl } from '../../auth/idp-redirect.js';

// Helper function to validate appId exists in database
async function validateAppId(appId: string): Promise<{ isValid: boolean; app: any | null; error?: string }> {
  if (!appId) {
    return { isValid: false, app: null, error: 'appId is required' };
  }

  try {
    const prismaModule = await import('../../db/prisma.js');
    const prisma = prismaModule.getPrisma();
    
    // Find app by ID or clientId (following existing pattern)
    let appRecord = await prisma.app.findUnique({ where: { id: appId } });
    if (!appRecord) {
      appRecord = await prisma.app.findUnique({ where: { clientId: appId } });
    }
    
    if (!appRecord) {
      return { isValid: false, app: null, error: `Application '${appId}' not found in mail-service database` };
    }
    
    return { isValid: true, app: appRecord };
  } catch (error) {
    console.error('[validateAppId] Database error:', error);
    return { isValid: false, app: null, error: 'Database validation failed' };
  }
}

export async function registerSmsRoutes(app: FastifyInstance) {
  
  // SMS compose route - redirects to IDP for authentication then shows SMS compose interface
  app.get('/sms-compose', async (req, reply) => {
    const { appId, phoneNumbers, message, returnUrl } = req.query as any;
    
    if (!appId) {
      console.error('[/sms-compose] AppId is required');
      return reply.code(400).send({ 
        error: 'Bad Request', 
        message: 'appId parameter is required for SMS compose endpoint' 
      });
    }
    
    // Validate appId exists
    const validation = await validateAppAccess(req, appId);
    if (!validation.success) {
      console.error('[/sms-compose] AppId validation failed:', validation.error);
      return reply.code(400).send({ 
        error: 'Bad Request', 
        message: validation.error 
      });
    }
    
    console.log('[/sms-compose] AppId validated successfully:', validation.app.name);
    
    // Check authentication using the centralized helper (same as email compose)
    const { isAuthenticated } = await checkAuthentication(req);
    
    if (isAuthenticated) {
      // User is authenticated, show SMS compose interface
      const smsParams = new URLSearchParams({
        view: 'sms-compose',
        appId
      });
      
      if (phoneNumbers) smsParams.set('phoneNumbers', phoneNumbers);
      if (message) smsParams.set('message', message);
      if (returnUrl) smsParams.set('returnUrl', returnUrl);
      
      return reply.redirect(`/ui?${smsParams}`);
    } else {
      // Redirect to IDP for authentication (same pattern as email compose)
      // Store SMS data in a temporary storage key that can be retrieved after redirect
      const smsSessionKey = `sms_${appId}_${Date.now()}`;
      
      const destinationParams = new URLSearchParams({
        view: 'sms-compose',
        appId
      });
      
      if (returnUrl) destinationParams.set('returnUrl', returnUrl);
      
      // Add session key to URL so frontend can retrieve the stored data
      if (phoneNumbers || message) {
        destinationParams.set('smsSession', smsSessionKey);
        
        // Store the SMS data in a way that can be retrieved by the frontend
        // We'll use a simple in-memory store for now (could be Redis in production)
        if (!(global as any).smsSessionStore) {
          (global as any).smsSessionStore = new Map();
        }
        
        (global as any).smsSessionStore.set(smsSessionKey, {
          phoneNumbers,
          message,
          timestamp: Date.now()
        });
        
        // Clean up old sessions (older than 10 minutes)
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        for (const [key, value] of (global as any).smsSessionStore.entries()) {
          if (value.timestamp < tenMinutesAgo) {
            (global as any).smsSessionStore.delete(key);
          }
        }
      }
      
      const finalDestination = `/ui?${destinationParams}`;
      
      const idpUrl = createIdpRedirectUrl({
        returnUrl: `${req.protocol}://${req.headers.host}${finalDestination}`,
        appId
      });
      
      console.log('[/sms-compose] Redirecting to IDP for authentication:', idpUrl);
      return reply.redirect(idpUrl);
    }
  });
  
  // Retrieve SMS session data for authenticated users
  app.get('/api/sms/session/:sessionKey', async (req, reply) => {
    const { sessionKey } = req.params as any;
    
    if (!(global as any).smsSessionStore) {
      return reply.code(404).send({ error: 'Session not found' });
    }
    
    const sessionData = (global as any).smsSessionStore.get(sessionKey);
    if (!sessionData) {
      return reply.code(404).send({ error: 'Session not found' });
    }
    
    // Remove the session data after retrieval (one-time use)
    (global as any).smsSessionStore.delete(sessionKey);
    
    return reply.send({
      phoneNumbers: sessionData.phoneNumbers,
      message: sessionData.message
    });
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
    const validation = await validateAppAccess(req, appId);
    if (!validation.success) {
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
    const validation = await validateAppAccess(req, appId);
    if (!validation.success) {
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
        const validation = await validateAppAccess(req, appId);
        if (!validation.success) {
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
}