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
import { registerGroupRoutes } from './modules/groups/routes.js';
import { registerSmtpRoutes } from './modules/smtp/routes.js';
import { workerTick } from './modules/groups/service.js';
import { registerTenantRoutes } from './modules/tenants/routes.js';
import { registerAppRoutes } from './modules/apps/routes.js';
import { sendEmail } from './providers/smtp.js';
import { createRequire } from 'module';
import { getSigningKey } from './auth/jwks.js';

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
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  });

  // Auth (can be toggled off in test env)
  if (!flags.disableAuth && config.env !== 'test') {
    app.register(authPlugin);
  } else {
    // Provide a noop authenticate decorator so route configs still work
    app.decorate('authenticate', async function () { /* no-op auth disabled */ });
  }

  // Routes
  registerHealthRoutes(app);
  registerTemplateRoutes(app);
  registerGroupRoutes(app);
  registerSmtpRoutes(app);
  registerTenantRoutes(app);
  registerAppRoutes(app);
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
  // Simple test email endpoint (auth optional depending on flags)
  app.post('/test-email', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const { to, subject, html, text, tenantId, appId } = (req.body as any) || {};
    if (!to || !subject || (!html && !text)) return reply.badRequest('to, subject and html or text required');
    try {
      await sendEmail({ to, subject, html, text, tenantId, appId });
      return { ok: true };
    } catch (e: any) {
      return reply.internalServerError(e.message);
    }
  });

  // Convenience bulk send (unauthenticated if auth disabled): create an ad-hoc group and immediately process via worker.
  // Payload: { appId, templateId?, subject, html?, text?, recipients: [ { email, name?, context? } ] }
  app.post('/send-now', { preHandler: (req, reply) => app.authenticate(req, reply) }, async (req, reply) => {
    const body = (req.body as any) || {};
    const { appId, templateId, subject, html, text, recipients } = body;
    if (!appId || !subject || !Array.isArray(recipients) || recipients.length === 0) {
      return reply.badRequest('appId, subject, recipients required');
    }
    try {
      const prismaModule = await import('./db/prisma.js');
      const prisma = prismaModule.getPrisma();
      // Resolve app: accept either actual app id or clientId passed in appId field for convenience
      let appRecord = await prisma.app.findUnique({ where: { id: appId }, include: { tenant: true } });
      if (!appRecord) {
        appRecord = await prisma.app.findUnique({ where: { clientId: appId }, include: { tenant: true } });
      }
      if (!appRecord) return reply.badRequest('App not found (provide app id or clientId)');
      
      const tenantId = appRecord.tenantId;
      const group = await prisma.messageGroup.create({ data: { tenantId, appId: appRecord.id, templateId, subject, status: 'scheduled', scheduledAt: new Date(), bodyOverrideHtml: html, bodyOverrideText: text } });
      await prisma.recipient.createMany({ data: recipients.map((r: any) => ({ groupId: group.id, email: r.email, name: r.name, context: r.context || {} })) });
      await prisma.messageGroup.update({ where: { id: group.id }, data: { totalRecipients: recipients.length } });
      await workerTick();
      return { groupId: group.id, scheduled: true };
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

  return app;
}
