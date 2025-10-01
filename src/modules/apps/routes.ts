import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrisma } from '../../db/prisma.js';
import { AuthService } from '../../auth/service.js';
import { checkAuthentication } from '../../auth/idp-redirect.js';
import { customAlphabet } from 'nanoid';
import { generateClientSecret, hashClientSecret, maskClientSecret } from '../../security/secrets.js';

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
    // Use checkAuthentication to handle JWT tokens from URL params or headers
    const { isAuthenticated, userContext } = await checkAuthentication(req);
    
    if (!isAuthenticated || !userContext) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    // Check if user has admin permissions
    const hasAdminRole = userContext.roles?.includes('tenant_admin') || userContext.roles?.includes('superadmin');
    if (!hasAdminRole) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }

    const tenantId = (req.query as any)?.tenantId as string | undefined;
    
    // For tenant admins, automatically filter to their tenant
    let effectiveTenantId = tenantId;
    if (userContext.roles.includes('tenant_admin') && !userContext.roles.includes('superadmin')) {
      effectiveTenantId = userContext.tenantId;
    }
    
    const prisma = getPrisma();
    return prisma.app.findMany({ where: effectiveTenantId ? { tenantId: effectiveTenantId } : undefined, orderBy: { createdAt: 'desc' } });
  });

  // Get single app by ID
  app.get('/apps/:id', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, ['tenant_admin', 'superadmin', 'editor']);
    if (!userContext) return; // Response already sent

    const { id } = req.params as any;
    const prisma = getPrisma();
    
    try {
      const app = await prisma.app.findUnique({ 
        where: { id },
        select: { 
          id: true, 
          name: true, 
          clientId: true, 
          tenantId: true,
          createdAt: true
        }
      });
      
      if (!app) {
        return reply.notFound('Application not found');
      }
      
      // For tenant admins and editors, verify they have access to this app
      if (!userContext.roles.includes('superadmin')) {
        if (app.tenantId !== userContext.tenantId) {
          return reply.forbidden('Access denied to this application');
        }
      }
      
      return app;
    } catch (e: any) {
      app.log.error({ err: e, appId: id }, 'Error getting app');
      return reply.internalServerError('Failed to get application');
    }
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

  // Generate new client secret for an app
  app.post('/apps/:id/generate-secret', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, ['tenant_admin', 'superadmin']);
    if (!userContext) return; // Response already sent

    const { id } = req.params as any;
    const prisma = getPrisma();
    
    try {
      // Verify app exists and user has access
      const app = await prisma.app.findUnique({ where: { id } });
      if (!app) {
        return reply.notFound('Application not found');
      }
      
      // For tenant admins, verify they own this app
      if (userContext.roles.includes('tenant_admin') && !userContext.roles.includes('superadmin')) {
        if (app.tenantId !== userContext.tenantId) {
          return reply.forbidden('Access denied to this application');
        }
      }
      
      // Generate new secret
      const newSecret = generateClientSecret();
      const hashedSecret = await hashClientSecret(newSecret);
      
      // Update app with new secret
      await prisma.app.update({
        where: { id },
        data: { clientSecret: hashedSecret }
      });
      
      // Return the plaintext secret (only time it will be shown)
      return {
        clientSecret: newSecret,
        message: 'New client secret generated. Save this secret securely - it will not be shown again.',
        maskedSecret: maskClientSecret(newSecret)
      };
      
    } catch (e: any) {
      app.log.error({ err: e, appId: id }, 'Error generating client secret');
      return reply.internalServerError('Failed to generate client secret');
    }
  });

  // Remove client secret from an app (disable secure auth)
  app.delete('/apps/:id/client-secret', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, ['tenant_admin', 'superadmin']);
    if (!userContext) return; // Response already sent

    const { id } = req.params as any;
    const prisma = getPrisma();
    
    try {
      // Verify app exists and user has access
      const app = await prisma.app.findUnique({ where: { id } });
      if (!app) {
        return reply.notFound('Application not found');
      }
      
      // For tenant admins, verify they own this app
      if (userContext.roles.includes('tenant_admin') && !userContext.roles.includes('superadmin')) {
        if (app.tenantId !== userContext.tenantId) {
          return reply.forbidden('Access denied to this application');
        }
      }
      
      // Remove the client secret
      await prisma.app.update({
        where: { id },
        data: { clientSecret: null }
      });
      
      return {
        message: 'Client secret removed. This app will only work in development mode with ALLOW_INSECURE_APP_TOKENS=true.'
      };
      
    } catch (e: any) {
      app.log.error({ err: e, appId: id }, 'Error removing client secret');
      return reply.internalServerError('Failed to remove client secret');
    }
  });

  // Get app security status
  app.get('/apps/:id/security', async (req, reply) => {
    const userContext = await AuthService.requireRole(req, reply, ['tenant_admin', 'superadmin']);
    if (!userContext) return; // Response already sent

    const { id } = req.params as any;
    const prisma = getPrisma();
    
    try {
      // Verify app exists and user has access
      const app = await prisma.app.findUnique({ 
        where: { id },
        select: { id: true, name: true, clientId: true, tenantId: true, clientSecret: true }
      });
      
      if (!app) {
        return reply.notFound('Application not found');
      }
      
      // For tenant admins, verify they own this app
      if (userContext.roles.includes('tenant_admin') && !userContext.roles.includes('superadmin')) {
        if (app.tenantId !== userContext.tenantId) {
          return reply.forbidden('Access denied to this application');
        }
      }
      
      const hasClientSecret = !!app.clientSecret;
      const isDevelopment = process.env.NODE_ENV === 'development';
      const allowInsecure = process.env.ALLOW_INSECURE_APP_TOKENS === 'true';
      
      return {
        appId: app.id,
        clientId: app.clientId,
        name: app.name,
        hasClientSecret,
        maskedSecret: hasClientSecret ? maskClientSecret('••••••••••••••••••••••••••••••••') : null,
        securityStatus: hasClientSecret ? 'secure' : 'insecure',
        canGetTokens: hasClientSecret || (isDevelopment && allowInsecure),
        environment: {
          isDevelopment,
          allowInsecureTokens: allowInsecure
        },
        recommendations: hasClientSecret ? [] : [
          'Generate a client secret for secure authentication',
          'Store the client secret securely in your application',
          'Never commit client secrets to version control'
        ]
      };
      
    } catch (e: any) {
      app.log.error({ err: e, appId: id }, 'Error getting app security status');
      return reply.internalServerError('Failed to get security status');
    }
  });
}
