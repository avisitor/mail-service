import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config, flags } from './config.js';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { registerHealthRoutes } from './routes/health.js';
import authPlugin from './auth/plugin.js';
import { registerTemplateRoutes } from './modules/templates/routes.js';
import { registerSmtpRoutes } from './modules/smtp/routes.js';
import { registerComposeRoutes } from './modules/compose/routes.js';
import { registerSmsRoutes } from './modules/sms/routes.js';
import { registerWebhookRoutes } from './modules/webhooks/routes.js';
import { extractUser } from './auth/roles.js';
import { createIdpRedirectUrl, checkAuthentication } from './auth/idp-redirect.js';
import { registerTenantRoutes } from './modules/tenants/routes.js';
import { registerAppRoutes } from './modules/apps/routes.js';
import { registerLogRoutes } from './modules/logs/routes.js';
import { sendEmail } from './providers/smtp.js';
import { createRequire } from 'module';
import { getSigningKey } from './auth/jwks.js';
import jwt from 'jsonwebtoken';
import { validateAppId, validateAppAccess } from './utils/app-validation.js';

export function buildApp() {
  // Optional pretty logging in development if pino-pretty is installed; fall back silently if not.
  let transport: any = undefined;
  if (config.env === 'development') {
    try {
      const require = createRequire(import.meta.url);
      require.resolve('pino-pretty');
      transport = { target: 'pino-pretty' };
    } catch {
      // pino-pretty not installed; ignore.
    }
  }
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: config.logLevel,
      transport,
    }
  });

  app.register(sensible);
  app.register(cors, { origin: true });
  app.register(helmet, { 
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tiny.cloud"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tiny.cloud"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://cdn.tiny.cloud"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  });

  // Auth (can be toggled off via DISABLE_AUTH env var)
  if (!flags.disableAuth) {
    app.register(authPlugin);
  } else {
    // Provide a noop authenticate decorator so route configs still work
    app.decorate('authenticate', async function (request, reply) { 
      // @ts-ignore
      request.userContext = {
        sub: 'system',
        roles: ['superadmin'],
        tenantId: undefined
      };
    });
  }

  // Add app validation decorator for reuse across routes
  app.decorate('validateAppAccess', validateAppAccess);

  // Routes
  registerHealthRoutes(app);
  registerTemplateRoutes(app);
  registerSmtpRoutes(app);
  registerComposeRoutes(app);
  registerSmsRoutes(app);
  registerWebhookRoutes(app);
  registerTenantRoutes(app);
  registerAppRoutes(app);
  registerLogRoutes(app);
  // Simple identity endpoint
  app.get('/me', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req) => {
    // @ts-ignore
    let uc = req.userContext || null;
    const tokenAny: any = (req as any).user || {};
    
    console.log('[ME-DEBUG] Raw token from IDP:', JSON.stringify(tokenAny, null, 2));
    console.log('[ME-DEBUG] UserContext from auth:', JSON.stringify(uc, null, 2));
    
    // If userContext is empty but we have a JWT payload, extract it directly
    if ((!uc || Object.keys(uc).length === 0) && tokenAny) {
      console.log('[ME-DEBUG] Extracting user context directly from JWT payload');
      const { extractUser } = await import('./auth/roles.js');
      uc = await extractUser(tokenAny);
      console.log('[ME-DEBUG] Extracted UserContext:', JSON.stringify(uc, null, 2));
    }
    
    if (!uc) return null;
    try {
      const prismaModule = await import('./db/prisma.js');
      const prisma = prismaModule.getPrisma();
      const isSuperadmin = uc.roles && uc.roles.includes('superadmin');
      
      if (isSuperadmin) {
        // Superadmins are authenticated independently - no app or tenant context needed
        console.log('[ME-DEBUG] Superadmin detected - bypassing app/tenant lookup');
        return { 
          ...uc, 
          tenantId: undefined,
          tenantName: null, 
          appName: null, 
          appClientId: null 
        };
      }
      
      // For non-superadmin users, perform normal app/tenant lookup
      const [tenant, appRecInitial] = await Promise.all([
        uc.tenantId ? prisma.tenant.findUnique({ where: { id: uc.tenantId } }) : Promise.resolve(null),
        uc.appId ? prisma.app.findUnique({ where: { id: uc.appId } }) : Promise.resolve(null)
      ]);
      
      console.log('[ME-DEBUG] Initial DB lookup:', {
        tenantFromToken: uc.tenantId,
        appIdFromToken: uc.appId,
        tenantFound: tenant?.name || null,
        appFound: appRecInitial?.name || null
      });
      
      let appRec = appRecInitial;
      const tokenAny: any = (req as any).user || {};
      
      // If not found by appId but clientId present in token, try lookup by clientId
      if (!appRec && tokenAny.clientId) {
        try { appRec = await prisma.app.findUnique({ where: { clientId: tokenAny.clientId } }); } catch {}
      }
      
      // If still no app found and no appId in token, use default app for testing
      // This allows testing the tenantId lookup functionality until proper appId flow is implemented
      if (!appRec && !uc.appId) {
        try { 
          appRec = await prisma.app.findUnique({ where: { clientId: 'smtp-test-app' } }); 
        } catch {}
      }
      
      // For non-superadmin users, resolve tenantId from app if not present in token
      let effectiveTenantId = uc.tenantId;
      let effectiveTenant = tenant;
      
      if (appRec && !effectiveTenantId) {
        effectiveTenantId = appRec.tenantId;
        try {
          effectiveTenant = await prisma.tenant.findUnique({ where: { id: effectiveTenantId } });
        } catch {}
      }
      
      // Prefer explicit clientId from token if present, else DB value
      const clientId = tokenAny.clientId || appRec?.clientId || null;
      return { 
        ...uc, 
        tenantId: effectiveTenantId,
        tenantName: effectiveTenant?.name || null, 
        appName: appRec?.name || null, 
        appClientId: clientId 
      };
    } catch {
      return uc;
    }
  });

  // Simple UI (first pass) served from /ui
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Primary: compiled location (dist/src/frontend)
    let uiDir = join(__dirname, 'frontend');
    // Fallback: source directory (src/frontend) when assets not copied to dist
    if (!existsSync(join(uiDir, 'index.html'))) {
      const candidate = join(process.cwd(), 'src', 'frontend');
      if (existsSync(join(candidate, 'index.html'))) {
        uiDir = candidate;
      }
    }
    if (!existsSync(join(uiDir, 'index.html'))) {
      app.log.warn({ uiDir }, 'UI index.html not found; static UI disabled');
    } else {
      app.log.info({ uiDir }, 'mounting static UI');
      app.register(fastifyStatic, { root: uiDir, prefix: '/ui/' });
      // Also serve uncompiled source frontend (TS) directory for assets like updated index while using dist build
      const srcUi = join(process.cwd(), 'src', 'frontend');
      if (srcUi !== uiDir && existsSync(join(srcUi, 'main.ts'))) {
        app.log.info({ srcUi }, 'mounting source UI for dev');
  // Register a second static root with a different prefix. Avoid re-decorating reply
  // with sendFile (fastify-static adds reply.sendFile) or Fastify will throw
  // FST_ERR_DEC_ALREADY_PRESENT. We only need one sendFile; disable on this mount.
  app.register(fastifyStatic, { root: srcUi, prefix: '/ui-src/', decorateReply: false });
      }
    }
  } catch (e) {
    app.log.warn({ err: e }, 'static ui mount failed');
  }

  // Expose jwks.json (if generated) at root for local auth without extra server
  try {
    const jwksPath = join(process.cwd(), 'jwks.json');
    if (existsSync(jwksPath)) {
      // Lightweight file route instead of an additional static root
      app.get('/jwks.json', async (_req, reply) => {
        try {
          const data = await import('fs/promises').then(m => m.readFile(jwksPath, 'utf8'));
          reply.header('content-type', 'application/json').send(data);
        } catch (e: any) {
          reply.code(500).send({ error: e.message });
        }
      });
      app.log.info('jwks.json route mounted');
    }
  } catch (e) {
    app.log.warn({ err: e }, 'jwks.json mount failed');
  }

  app.get('/', async () => ({ service: 'mail-service', status: 'ok' }));
  // Debug endpoint to inspect Authorization header and JWKS key resolution
  app.get('/debug/auth', async (req, reply) => {
    const auth = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
    const out: any = { hasAuth: !!auth };
    
    // Include user context from authentication middleware if available
    out.user = (req as any).userContext || null;
    
    try {
      if (auth?.startsWith('Bearer ')) {
        const token = auth.substring('Bearer '.length).trim();
        const parts = token.split('.');
        if (parts.length === 3) {
          const b64urlToJson = (s: string) => {
            const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
            const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
            const str = Buffer.from(b64, 'base64').toString('utf8');
            return JSON.parse(str);
          };
          const header = b64urlToJson(parts[0]);
          const payload = b64urlToJson(parts[1]);
          out.header = { alg: header.alg, kid: header.kid, typ: header.typ };
          out.payload = { iss: payload.iss, aud: payload.aud, sub: payload.sub, roles: payload.roles, tenantId: payload.tenantId, appId: payload.appId, clientId: payload.clientId, exp: payload.exp, iat: payload.iat };
          if (header?.kid) {
            try {
              const key = await getSigningKey(header.kid);
              out.jwksKeyResolved = !!key;
            } catch (e: any) {
              out.jwksError = e?.message || String(e);
            }
          }
        } else {
          out.error = 'Invalid JWT format';
        }
      }
    } catch (e: any) {
      out.error = e?.message || String(e);
    }
    reply.send(out);
  });

  // Debug endpoint to check SMTP configuration for an app
  app.get('/debug/smtp', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { appId } = req.query as { appId?: string };
    
    if (!appId) {
      return reply.badRequest('appId query parameter required');
    }

    try {
      const prismaModule = await import('./db/prisma.js');
      const prisma = prismaModule.getPrisma();
      const { resolveSmtpConfig } = await import('./modules/smtp/service.js');

      // Find app
      let appRecord = await prisma.app.findUnique({ where: { id: appId }, include: { tenant: true } });
      if (!appRecord) {
        appRecord = await prisma.app.findUnique({ where: { clientId: appId }, include: { tenant: true } });
      }
      if (!appRecord) {
        return reply.badRequest('App not found');
      }

      // Resolve SMTP config
      const smtpConfig = await resolveSmtpConfig(appRecord.id);
      
      // Return config details (excluding sensitive data)
      return {
        app: {
          id: appRecord.id,
          clientId: appRecord.clientId,
          name: appRecord.name,
          tenantId: appRecord.tenantId,
          tenantName: appRecord.tenant.name
        },
        smtpConfig: {
          configId: smtpConfig.configId,
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          service: smtpConfig.service,
          fromAddress: smtpConfig.fromAddress,
          fromName: smtpConfig.fromName,
          resolvedFrom: smtpConfig.resolvedFrom,
          isActive: smtpConfig.isActive,
          user: smtpConfig.user ? '[CONFIGURED]' : '[NOT SET]',
          pass: smtpConfig.pass ? '[CONFIGURED]' : '[NOT SET]'
        }
      };
    } catch (error: any) {
      app.log.error(error, 'SMTP config debug failed');
      return reply.internalServerError('Failed to retrieve SMTP config: ' + error.message);
    }
  });
  // Provide a dynamic config for the UI including a return URL for IDP
  app.get('/ui/config.js', async (req, reply) => {
    // Compute absolute base url from request headers
    const proto = (req.headers['x-forwarded-proto'] as string) || (req.protocol || 'http');
    const hostHdr = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${config.port}`;
    // If x-forwarded-host has comma-separated values, take the first
    const host = (hostHdr as string).split(',')[0].trim();
    const base = `${proto}://${host}`;
    const returnUrl = `${base}/ui/`;
    const cfg = {
      returnUrl,
      idpLoginUrl: config.auth.idpLoginUrl || null,
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      logLevel: config.logLevel,
    };
    if ((process.env.DEBUG_AUTH || '').toLowerCase() === 'true') {
      try { app.log.info({ returnUrl: cfg.returnUrl, idp: cfg.idpLoginUrl }, 'ui/config computed'); } catch {}
    }
    const body = `window.__MAIL_UI_CONFIG__ = ${JSON.stringify(cfg)};`;
    reply.header('content-type', 'application/javascript').send(body);
  });
  app.get('/ui', async (req, reply) => {
    try {
      if ((process.env.DEBUG_AUTH || '').toLowerCase() === 'true') {
        try { app.log.info({ url: (req as any).raw?.url || (req as any).url, query: (req as any).query }, 'ui entry'); } catch {}
      }
      // @ts-ignore
      return reply.sendFile('index.html');
    } catch {
      reply.code(404).send({ error: 'UI index not available' });
    }
  });
  // Trailing slash variant (some browsers/requesters use /ui/)
  app.get('/ui/', async (req, reply) => {
    try {
      if ((process.env.DEBUG_AUTH || '').toLowerCase() === 'true') {
        try { app.log.info({ url: (req as any).raw?.url || (req as any).url, query: (req as any).query }, 'ui entry'); } catch {}
      }
      // @ts-ignore
      return reply.sendFile('index.html');
    } catch {
      reply.code(404).send({ error: 'UI index not available' });
    }
  });
  
  // Application token endpoint for client secret authentication
  app.post('/api/token', async (req, reply) => {
    const { appId, clientSecret, type } = (req.body as any) || {};
    
    // Validate required parameters
    if (!appId || type !== 'application') {
      return reply.badRequest('appId and type=application required');
    }
    
    // Check if we're in secure mode (production) or development mode
    const isDevelopment = process.env.NODE_ENV === 'development';
    const allowInsecure = process.env.ALLOW_INSECURE_APP_TOKENS === 'true';
    
    try {
      const bcrypt = await import('bcrypt');
      const prismaModule = await import('./db/prisma.js');
      const prisma = prismaModule.getPrisma();
      
      // Find app by ID or clientId
      let appRecord = await prisma.app.findUnique({ where: { id: appId } });
      if (!appRecord) {
        appRecord = await prisma.app.findUnique({ where: { clientId: appId } });
      }
      
      if (!appRecord) {
        return reply.notFound('Application not found');
      }
      
      // Type cast to access clientSecret field (Prisma typing issue)
      const appWithSecret = appRecord as any;
      
      // Security validation
      const secureMode = !isDevelopment || !allowInsecure;
      
      if (secureMode) {
        // Production mode or secure development mode - require client secret
        if (!clientSecret) {
          app.log.warn({ appId }, 'Token request missing client secret');
          return reply.unauthorized('Client secret required for token generation');
        }
        
        if (!appWithSecret.clientSecret) {
          app.log.warn({ appId: appRecord.id }, 'App has no client secret configured');
          return reply.unauthorized('Application not configured for secure authentication');
        }
        
        // Verify client secret
        const isValidSecret = await bcrypt.compare(clientSecret, appWithSecret.clientSecret);
        if (!isValidSecret) {
          app.log.warn({ appId: appRecord.id, clientId: appRecord.clientId }, 'Invalid client secret provided');
          return reply.unauthorized('Invalid client credentials');
        }
        
        app.log.info({ appId: appRecord.id, clientId: appRecord.clientId }, 'Secure token generated with client secret verification');
      } else {
        // Development mode with insecure tokens allowed
        // BUT still validate client secret if provided
        if (clientSecret && appWithSecret.clientSecret) {
          const isValidSecret = await bcrypt.compare(clientSecret, appWithSecret.clientSecret);
          if (!isValidSecret) {
            app.log.warn({ appId: appRecord.id, clientId: appRecord.clientId }, 'Invalid client secret provided');
            return reply.unauthorized('Invalid client credentials');
          }
        }
        
        app.log.warn({ 
          appId: appRecord.id, 
          clientId: appRecord.clientId,
          hasSecret: !!clientSecret,
          hasStoredSecret: !!appWithSecret.clientSecret
        }, 'INSECURE: Token generated without client secret verification (development mode)');
      }
      
      // Generate JWT token with unique timestamp
      const now = Date.now();
      const iat = Math.floor(now / 1000);
      const payload = {
        sub: `app:${appRecord.id}`,
        appId: appRecord.id,
        clientId: appRecord.clientId,
        tenantId: appRecord.tenantId,
        roles: ['app'],
        iss: config.auth.issuer,
        aud: config.auth.audience,
        iat: iat,
        exp: iat + (60 * 15), // 15 minutes
        jti: `${appRecord.id}-${now}` // Unique token ID
      };
      
      const token = jwt.sign(payload, config.internalJwtSecret);
      
      return { 
        token, 
        expiresIn: 900,
        developmentMode: !secureMode,
        // Include security info in development
        ...(isDevelopment && { 
          security: {
            mode: allowInsecure ? 'insecure-development' : 'secure',
            clientSecretRequired: !allowInsecure,
            clientSecretProvided: !!clientSecret,
            appHasSecret: !!appWithSecret.clientSecret
          }
        })
      };
      
    } catch (e: any) {
      app.log.error({ err: e, appId }, 'Error generating application token');
      return reply.internalServerError('Failed to generate token');
    }
  });
  
  // Compose email route - always redirects to frontend UI which handles authentication
  app.get('/compose', async (req, reply) => {
    const { appId, returnUrl, recipients } = req.query as any;
    
    // Validate appId is provided and exists in database
    if (!appId) {
      console.error('[/compose] AppId is required');
      return reply.code(400).send({ 
        error: 'Missing Application ID', 
        message: 'appId parameter is required for compose endpoint' 
      });
    }
    
    const validation = await validateAppId(appId);
    if (!validation.isValid) {
      console.error('[/compose] AppId validation failed:', validation.error);
      return reply.code(400).send({ 
        error: 'Invalid Application', 
        message: validation.error 
      });
    }
    console.log('[/compose] AppId validated successfully:', validation.app.name);
    
    // Always redirect to frontend UI - let frontend JavaScript handle authentication
    const composeParams = new URLSearchParams({
      view: 'compose',
      ...(appId && { appId }),
      ...(returnUrl && { returnUrl }),
      ...(recipients && { recipients })
    });
    return reply.redirect(`/ui?${composeParams}`);
  });
  
  // Template Editor route - redirects to IDP for authentication then shows template editor interface (tenant admin only)
  app.get('/template-editor', async (req, reply) => {
    const { appId, returnUrl } = req.query as any;
    
    // Validate appId is provided and exists in database
    if (!appId) {
      console.error('[/template-editor] AppId is required');
      return reply.code(400).send({ 
        error: 'Missing Application ID', 
        message: 'appId parameter is required for template editor endpoint' 
      });
    }
    
    const validation = await validateAppId(appId);
    if (!validation.isValid) {
      console.error('[/template-editor] AppId validation failed:', validation.error);
      return reply.code(400).send({ 
        error: 'Invalid Application', 
        message: validation.error 
      });
    }
    console.log('[/template-editor] AppId validated successfully:', validation.app.name);
    
    // Check authentication using the centralized helper
    const { isAuthenticated } = await checkAuthentication(req);
    
    if (isAuthenticated) {
      // User is authenticated, show template editor interface
      const templateEditorParams = new URLSearchParams({
        view: 'template-editor',
        ...(appId && { appId }),
        ...(returnUrl && { returnUrl })
      });
      return reply.redirect(`/ui?${templateEditorParams}`);
    } else {
      // User not authenticated, redirect to IDP using the working pattern
      const finalDestination = `/ui?view=template-editor${appId ? `&appId=${appId}` : ''}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
      const idpUrl = createIdpRedirectUrl({
        returnUrl: `${req.protocol}://${req.headers.host}${finalDestination}`,
        appId
      });
      
      return reply.redirect(idpUrl);
    }
  });
  
  // Admin route - redirects to IDP for authentication then shows admin interface
  app.get('/admin', async (req, reply) => {
    const { appId, returnUrl } = req.query as any;
    console.log('[/admin] Request received with appId:', appId, 'returnUrl:', returnUrl);
    
    // Validate appId is provided and exists in database
    if (!appId) {
      console.error('[/admin] AppId is required');
      return reply.code(400).send({ 
        error: 'Missing Application ID', 
        message: 'appId parameter is required for admin endpoint' 
      });
    }
    
    const validation = await validateAppId(appId);
    if (!validation.isValid) {
      console.error('[/admin] AppId validation failed:', validation.error);
      return reply.code(400).send({ 
        error: 'Invalid Application', 
        message: validation.error 
      });
    }
    console.log('[/admin] AppId validated successfully:', validation.app.name);
    
    // Check authentication using the centralized helper
    const { isAuthenticated, userContext } = await checkAuthentication(req);
    console.log('[/admin] Authentication check result:', { isAuthenticated, userContext });
    
    if (isAuthenticated) {
      // Check if user has admin permissions
      const hasAdminRole = userContext?.roles?.includes('tenant-admin') || userContext?.roles?.includes('superadmin');
      console.log('[/admin] User roles check - hasAdminRole:', hasAdminRole, 'roles:', userContext?.roles);
      
      if (!hasAdminRole) {
        console.log('[/admin] Access denied - insufficient permissions');
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }
      
      // User is authenticated and has admin role, show apps management interface
      const adminParams = new URLSearchParams({
        view: 'apps',
        ...(appId && { appId }),
        ...(returnUrl && { returnUrl })
      });
      console.log('[/admin] Redirecting to UI with params:', adminParams.toString());
      return reply.redirect(`/ui?${adminParams}`);
    } else {
      console.log('[/admin] User not authenticated, redirecting to IDP');
      // User not authenticated, redirect to IDP using the working pattern
      const finalDestination = `/ui?view=apps${appId ? `&appId=${appId}` : ''}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
      const idpUrl = createIdpRedirectUrl({
        returnUrl: `${req.protocol}://${req.headers.host}${finalDestination}`,
        appId
      });
      console.log('[/admin] IDP redirect URL:', idpUrl);
      
      return reply.redirect(idpUrl);
    }
  });
  
  // Email logs route - redirects to IDP for authentication then shows email logs interface (tenant admin only)
  app.get('/email-logs', async (req, reply) => {
    const { appId, returnUrl } = req.query as any;
    
    // Validate appId is provided and exists in database
    if (!appId) {
      console.error('[/email-logs] AppId is required');
      return reply.code(400).send({ 
        error: 'Missing Application ID', 
        message: 'appId parameter is required for email logs endpoint' 
      });
    }
    
    const validation = await validateAppId(appId);
    if (!validation.isValid) {
      console.error('[/email-logs] AppId validation failed:', validation.error);
      return reply.code(400).send({ 
        error: 'Invalid Application', 
        message: validation.error 
      });
    }
    console.log('[/email-logs] AppId validated successfully:', validation.app.name);
    
    // Check authentication using the centralized helper
    const { isAuthenticated, userContext } = await checkAuthentication(req);
    
    if (isAuthenticated) {
      // Check if user has admin permissions
      const hasAdminRole = userContext?.roles?.includes('tenant-admin') || userContext?.roles?.includes('superadmin');
      
      if (!hasAdminRole) {
        console.log('[/email-logs] Access denied - insufficient permissions');
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }
      
      // User is authenticated and has admin role, show email logs interface
      const logsParams = new URLSearchParams({
        view: 'email-logs',
        ...(appId && { appId }),
        ...(returnUrl && { returnUrl })
      });
      return reply.redirect(`/ui?${logsParams}`);
    } else {
      // User not authenticated, redirect to IDP using the working pattern
      const finalDestination = `/ui?view=email-logs${appId ? `&appId=${appId}` : ''}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
      const idpUrl = createIdpRedirectUrl({
        returnUrl: `${req.protocol}://${req.headers.host}${finalDestination}`,
        appId
      });
      
      return reply.redirect(idpUrl);
    }
  });
  
  // SMS logs route - redirects to IDP for authentication then shows SMS logs interface (tenant admin only)
  app.get('/sms-logs', async (req, reply) => {
    const { appId, returnUrl } = req.query as any;
    
    // Validate appId is provided and exists in database
    if (!appId) {
      console.error('[/sms-logs] AppId is required');
      return reply.code(400).send({ 
        error: 'Missing Application ID', 
        message: 'appId parameter is required for SMS logs endpoint' 
      });
    }
    
    const validation = await validateAppId(appId);
    if (!validation.isValid) {
      console.error('[/sms-logs] AppId validation failed:', validation.error);
      return reply.code(400).send({ 
        error: 'Invalid Application', 
        message: validation.error 
      });
    }
    console.log('[/sms-logs] AppId validated successfully:', validation.app.name);
    
    // Check authentication using the centralized helper
    const { isAuthenticated, userContext } = await checkAuthentication(req);
    
    if (isAuthenticated) {
      // Check if user has admin permissions
      const hasAdminRole = userContext?.roles?.includes('tenant-admin') || userContext?.roles?.includes('superadmin');
      
      if (!hasAdminRole) {
        console.log('[/sms-logs] Access denied - insufficient permissions');
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }
      
      // User is authenticated and has admin role, show SMS logs interface
      const smsLogsParams = new URLSearchParams({
        view: 'sms-logs',
        ...(appId && { appId }),
        ...(returnUrl && { returnUrl })
      });
      return reply.redirect(`/ui?${smsLogsParams}`);
    } else {
      // User not authenticated, redirect to IDP using the working pattern
      const finalDestination = `/ui?view=sms-logs${appId ? `&appId=${appId}` : ''}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
      const idpUrl = createIdpRedirectUrl({
        returnUrl: `${req.protocol}://${req.headers.host}${finalDestination}`,
        appId
      });
      
      return reply.redirect(idpUrl);
    }
  });
  
  // Test send endpoint without authentication for debugging
  app.post('/api/send-test', async (req, reply) => {
    const { to, subject, html, text, tenantId, appId, testEmail } = (req.body as any) || {};
    if (!to || !subject || (!html && !text)) return reply.badRequest('to, subject and html or text required');
    try {
      const result = await sendEmail({ to, subject, html, text, tenantId, appId, testEmail });
      return { 
        ok: true, 
        message: 'Email sent successfully',
        messageId: result?.messageId,
        accepted: result?.accepted || [],
        rejected: result?.rejected || [],
        status: result?.status || 'sent',
        response: result?.response,
        testMode: testEmail ? 'Test SMTP used' : 'Production SMTP used'
      };
    } catch (e: any) {
      return reply.internalServerError(e.message);
    }
  });
  
  // Simple test token endpoint for test page
  app.post('/api/test-token', async (req, reply) => {
    try {
      // For testing purposes, generate a simple token using the same method as generate-test-token.mjs
      const jwt = await import('jsonwebtoken');
      const fs = await import('fs');
      
      const body = (req.body as any) || {};
      const { appId } = body;
      
      const claims = {
        sub: `tenant-admin-test-tenant-1`,
        iss: 'https://idp.worldspot.org',  // Use the correct issuer that matches working tokens
        aud: 'mail-service',
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
        iat: Math.floor(Date.now() / 1000),
        roles: ['tenant_admin'],
        tenantId: 'test-tenant-1', // Use the same test tenant as working tokens
        appId: appId || 'cmfka688r0001b77ofpgm57ix' // Default to ReTree Hawaii app ID
      };
      
      const privateKey = fs.readFileSync('keys/private-6ca1a309a735fb83.pem', 'utf8');
      const token = jwt.default.sign(claims, privateKey, {
        algorithm: 'RS256',
        header: { 
          alg: 'RS256',
          kid: '6ca1a309a735fb83' 
        }
      });
      
      return { token: `Bearer ${token}` };
    } catch (error: any) {
      console.error('[/api/test-token] Error generating token:', error);
      return reply.internalServerError('Failed to generate test token');
    }
  });

  // API send endpoint (same as test-email but with /api prefix for consistency)
  app.post('/api/send', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { to, subject, html, text, tenantId, appId, testEmail } = (req.body as any) || {};
    if (!to || !subject || (!html && !text)) return reply.badRequest('to, subject and html or text required');
    try {
      const result = await sendEmail({ to, subject, html, text, tenantId, appId, testEmail });
      return { 
        ok: true, 
        message: 'Email sent successfully',
        messageId: result?.messageId,
        accepted: result?.accepted || [],
        rejected: result?.rejected || [],
        status: result?.status || 'sent',
        response: result?.response,
        testMode: testEmail ? 'Test SMTP used' : 'Production SMTP used'
      };
    } catch (e: any) {
      return reply.internalServerError(e.message);
    }
  });
  
  // Simple test email endpoint (auth optional depending on flags)
  app.post('/test-email', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { to, subject, html, text, tenantId, appId, testEmail } = (req.body as any) || {};
    if (!to || !subject || (!html && !text)) return reply.badRequest('to, subject and html or text required');
    try {
      await sendEmail({ to, subject, html, text, tenantId, appId, testEmail });
      return { ok: true };
    } catch (e: any) {
      return reply.internalServerError(e.message);
    }
  });

  // Convenience bulk send (unauthenticated if auth disabled): create an ad-hoc group and immediately process via worker.
  // Payload: { appId, templateId?, subject, html?, text?, recipients: [ { email, name?, context? } ], testEmail? }
  app.post('/send-now', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const body = (req.body as any) || {};
    const { appId, templateId, subject, html, text, recipients, testEmail, scheduleAt } = body;
    
    console.log('[/send-now] Received request:', {
      appId,
      subject,
      recipientCount: Array.isArray(recipients) ? recipients.length : 'not array',
      recipients: Array.isArray(recipients) ? recipients : 'not array',
      hasHtml: !!html,
      hasText: !!text
    });
    
    if (!appId || (!subject && !templateId) || !Array.isArray(recipients) || recipients.length === 0) {
      return reply.badRequest('appId, (subject or templateId), recipients required');
    }

    // Validate schedule time if provided
    if (scheduleAt) {
      const scheduledDate = new Date(scheduleAt);
      
      // Check if date is valid
      if (isNaN(scheduledDate.getTime())) {
        return reply.badRequest('Invalid scheduleAt format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)');
      }
      
      // Check if date is in the future
      if (scheduledDate <= new Date()) {
        return reply.badRequest('scheduleAt must be a future date and time');
      }
    }
    try {
      const prismaModule = await import('./db/prisma.js');
      const prisma = prismaModule.getPrisma();
      
      let finalSubject = subject;
      let finalHtml = html;
      
      // If templateId is provided, fetch template content
      if (templateId) {
        console.log('[/send-now] Using template:', templateId);
        const template = await prisma.template.findFirst({
          where: { 
            id: templateId,
            isActive: true
          }
        });
        
        if (!template) {
          return reply.badRequest(`Template '${templateId}' not found or not active`);
        }
        
        console.log('[/send-now] Found template:', { id: template.id, title: template.title, subject: template.subject });
        
        // Decode HTML entities that were incorrectly encoded when stored in database
        const { decode } = await import('html-entities');
        const decodedHtml = template.content ? decode(template.content) : '';
        
        // Use template content (subject/html from request override template if provided)
        finalSubject = subject || template.subject || 'No Subject';
        finalHtml = html || decodedHtml;
      }
      
      // Resolve app: accept either actual app id or clientId passed in appId field for convenience
      let appRecord = await prisma.app.findUnique({ where: { id: appId }, include: { tenant: true } });
      if (!appRecord) {
        appRecord = await prisma.app.findUnique({ where: { clientId: appId }, include: { tenant: true } });
      }
      if (!appRecord) return reply.badRequest('App not found (provide app id or clientId)');
      
      const tenantId = appRecord.tenantId;
      
      // Generate a unique group ID for this batch of emails
      const { nanoid } = await import('nanoid');
      const groupId = 'grp' + nanoid(12);
      
      // Get SMTP config for this app/tenant
      const smtpConfig = await prisma.smtpConfig.findFirst({
        where: {
          OR: [
            { appId: appRecord.id },
            { tenantId: appRecord.tenantId, appId: null },
            { tenantId: null, appId: null }
          ]
        },
        orderBy: [
          { appId: { sort: 'desc', nulls: 'last' } },
          { tenantId: { sort: 'desc', nulls: 'last' } }
        ]
      });
      
      const senderName = smtpConfig?.fromName || 'Mail Service';
      const senderEmail = smtpConfig?.fromAddress || 'noreply@localhost';
      const host = smtpConfig?.host || 'localhost';
      const username = smtpConfig?.user || '';
      
      // Parse schedule time if provided
      const scheduledAt = scheduleAt ? new Date(scheduleAt) : undefined;
      
      // Create email jobs for batch processing
      const { createEmailJobs } = await import('./modules/worker/service.js');
      const { jobIds } = await createEmailJobs({
        appId: appRecord.id,
        groupId,
        subject: finalSubject,
        html: finalHtml,
        recipients,
        scheduledAt,
        senderName,
        senderEmail,
        host,
        username
      });
      
      // If not scheduled, trigger worker to process immediately
      if (!scheduledAt) {
        const { workerTick } = await import('./modules/worker/service.js');
        // Don't await - let it process in background
        workerTick().catch(error => {
          console.error('Background worker tick failed:', error);
        });
      }
      
      return { 
        groupId, 
        scheduled: !!scheduledAt,
        jobCount: recipients.length,
        jobIds,
        scheduledAt: scheduledAt?.toISOString()
      };
    } catch (e: any) {
      return reply.internalServerError(e.message);
    }
  });
  // Explicit index route (fallback if static prefix mapping not matched in some env)
  app.get('/ui/index.html', async (_req, reply) => {
    try {
      // sendFile provided by fastify-static
      // if this throws, static not mounted
      // @ts-ignore
      return reply.sendFile('index.html');
    } catch {
      reply.code(404).send({ error: 'UI index not available' });
    }
  });
  
  // Test app page
  app.get('/test-app', async (_req, reply) => {
    try {
      const fs = await import('fs/promises');
      const testAppHtml = await fs.readFile(join(process.cwd(), 'test-app.html'), 'utf8');
      reply.header('content-type', 'text/html').send(testAppHtml);
    } catch (e: any) {
      reply.code(404).send({ error: 'Test app page not found' });
    }
  });

  return app;
}
