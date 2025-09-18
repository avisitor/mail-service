import { FastifyInstance } from 'fastify';
import { getPrisma } from '../../db/prisma.js';

export async function registerComposeRoutes(app: FastifyInstance) {
  
  // Get templates for an app
  app.get('/api/templates', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { appId } = req.query as any;
    
    if (!appId) {
      return reply.code(400).send({ error: 'appId is required' });
    }
    
    const prisma = getPrisma();
    const templates = await prisma.template.findMany({
      where: { 
        appId,
        isActive: true
      },
      select: {
        id: true,
        title: true,
        description: true,
        name: true,
        subject: true,
        content: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    return templates;
  });
  
  // Get template by ID
  app.get('/api/template/:id', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { id } = req.params as any;
    
    const prisma = getPrisma();
    const template = await prisma.template.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        subject: true,
        content: true,
        bodyHtml: true,
        bodyText: true
      }
    });
    
    if (!template) {
      return reply.code(404).send({ error: 'Template not found' });
    }
    
    return template;
  });
  
  // Get previous messages (maillog) for an app
  app.get('/api/previous-messages', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { appId } = req.query as any;
    
    if (!appId) {
      return reply.code(400).send({ error: 'appId is required' });
    }
    
    const prisma = getPrisma();
    const messages = await prisma.maillog.findMany({
      where: { appId },
      select: {
        messageId: true,
        subject: true,
        sent: true,
        senderName: true,
        senderEmail: true
      },
      orderBy: { sent: 'desc' },
      take: 50 // Limit to recent 50 messages
    });
    
    return messages;
  });
  
  // Get previous message content by messageId
  app.get('/api/previous-message/:messageId', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { messageId } = req.params as any;
    
    const prisma = getPrisma();
    const message = await prisma.maillog.findUnique({
      where: { messageId },
      select: {
        subject: true,
        message: true,
        senderName: true,
        senderEmail: true
      }
    });
    
    if (!message) {
      return reply.code(404).send({ error: 'Message not found' });
    }
    
    return message;
  });
  
  // Get SMTP config for from address
  app.get('/api/smtp-from', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { appId } = req.query as any;
    
    if (!appId) {
      return reply.code(400).send({ error: 'appId is required' });
    }
    
    const prisma = getPrisma();
    
    // Look for app-specific config first, then tenant, then global
    const app = await prisma.app.findUnique({
      where: { id: appId },
      include: {
        tenant: true
      }
    });
    
    if (!app) {
      return reply.code(404).send({ error: 'App not found' });
    }
    
    let smtpConfig = null;
    
    // Try app-specific config
    const appSmtpConfigs = await prisma.smtpConfig.findMany({
      where: { 
        appId: app.id,
        isActive: true 
      }
    });
    
    if (appSmtpConfigs.length > 0) {
      smtpConfig = appSmtpConfigs[0];
    } else {
      // Try tenant config
      const tenantConfig = await prisma.smtpConfig.findFirst({
        where: {
          scope: 'TENANT',
          tenantId: app.tenantId,
          isActive: true
        }
      });
      
      if (tenantConfig) {
        smtpConfig = tenantConfig;
      } else {
        // Try global config
        const globalConfig = await prisma.smtpConfig.findFirst({
          where: {
            scope: 'GLOBAL',
            isActive: true
          }
        });
        
        if (globalConfig) {
          smtpConfig = globalConfig;
        }
      }
    }
    
    if (!smtpConfig) {
      return reply.code(404).send({ error: 'No SMTP configuration found' });
    }
    
    const fromName = smtpConfig.fromName || 'Mail Service';
    const fromAddress = smtpConfig.fromAddress || smtpConfig.user || 'noreply@example.com';
    
    return {
      fromName,
      fromAddress,
      formatted: `${fromName} <${fromAddress}>`
    };
  });
  
  // Track email opens via pixel
  app.get('/api/track-open/:messageId', async (req, reply) => {
    const { messageId } = req.params as any;
    
    const prisma = getPrisma();
    
    // Update opened timestamp if not already set
    await prisma.maillog.updateMany({
      where: { 
        messageId,
        opened: null // Only update if not already opened
      },
      data: { 
        opened: new Date()
      }
    });
    
    // Return a 1x1 transparent pixel
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
    
    reply
      .header('Content-Type', 'image/png')
      .header('Content-Length', pixel.length)
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
      .header('Pragma', 'no-cache')
      .send(pixel);
  });
}