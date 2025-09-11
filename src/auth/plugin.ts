import fp from 'fastify-plugin';
import fastifyJwt, { FastifyJWTOptions } from '@fastify/jwt';
import { getSigningKey } from './jwks.js';
import { config } from '../config.js';
import { extractUser, UserContext } from './roles.js';
import { resolveRoles } from './roleResolver.js';

export default fp(async function authPlugin(app) {
  app.register(fastifyJwt, <FastifyJWTOptions>{
    secret: async (_request: any, token: any) => {
      const dbg = (process.env.DEBUG_AUTH || '').toLowerCase() === 'true';
      const b64urlToJson = (s: string) => {
        const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
        const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
        const str = Buffer.from(b64, 'base64').toString('utf8');
        return JSON.parse(str);
      };

      let kid: string | undefined = token?.header?.kid as string | undefined;
      let hdr: any = token?.header || null;
      if (!kid) {
        // Fallback: parse from Authorization header
        try {
          const auth = _request?.headers?.authorization || _request?.headers?.Authorization;
          if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
            const jwt = auth.substring('Bearer '.length).trim();
            const parts = jwt.split('.');
            if (parts.length === 3) {
              hdr = b64urlToJson(parts[0]);
              kid = hdr?.kid;
            }
          }
        } catch {}
      }
      if (dbg) {
        try { app.log.info({ header: hdr || null }, 'jwt secret lookup'); } catch {}
      }
      if (!kid) throw new Error('Missing kid in token header');
      return await getSigningKey(kid);
    },
    audience: config.auth.audience,
    issuer: config.auth.issuer,
    verify: { algorithms: ['RS256'] },
  });

  app.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
      // Build initial context from token (sub + optional tenant/app hints)
      const base = extractUser(request);
      if (!base) throw new Error('No user context in token');
      // Derive roles from DB bindings (Option 1: app-owned authorization)
      try {
        const derived = await resolveRoles({ userSub: base.sub, tenantId: base.tenantId, appId: base.appId });
        base.roles = derived as any;
      } catch (e) {
        if ((process.env.DEBUG_AUTH || '').toLowerCase() === 'true') {
          try { app.log.warn({ err: (e as any)?.message || String(e) }, 'role resolution failed'); } catch {}
        }
      }
      // @ts-ignore
      request.userContext = base;
    } catch (err) {
      if ((process.env.DEBUG_AUTH || '').toLowerCase() === 'true') {
        try {
          // Basic hinting only; avoid logging full token
          const hasAuth = !!request.headers?.authorization;
          // @ts-ignore
          app.log.warn({ err, hasAuth, audience: config.auth.audience, issuer: config.auth.issuer }, 'jwtVerify failed');
        } catch {}
      }
      return reply.unauthorized();
    }
  });

  app.decorateRequest('userContext', null);
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
  }
  interface FastifyRequest {
    userContext: UserContext | null;
  }
}