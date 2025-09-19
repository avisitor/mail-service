import fp from 'fastify-plugin';
import fastifyJwt, { FastifyJWTOptions } from '@fastify/jwt';
import { getSigningKey } from './jwks.js';
import { config, flags } from '../config.js';
import { extractUser, UserContext, UserRole } from './roles.js';
import jwt from 'jsonwebtoken';

export default fp(async function authPlugin(app) {
  app.register(fastifyJwt, <FastifyJWTOptions>{
    secret: async (_request: any, token: any) => {
      const dbg = (process.env.DEBUG_AUTH || '').toLowerCase() === 'true';
      
      // First check if we can detect an internal token from the request headers
      try {
        const auth = _request?.headers?.authorization || _request?.headers?.Authorization;
        if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
          const jwtToken = auth.substring('Bearer '.length).trim();
          const parts = jwtToken.split('.');
          if (parts.length === 3) {
            const b64urlToJson = (s: string) => {
              const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
              const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
              const str = Buffer.from(b64, 'base64').toString('utf8');
              return JSON.parse(str);
            };
            
            const hdr = b64urlToJson(parts[0]);
            
            // Check if this is an internal token (HS256, no kid OR kid=internal-secret)
            if (hdr?.alg === 'HS256' && (!hdr?.kid || hdr?.kid === 'internal-secret')) {
              return config.internalJwtSecret;
            }
            
            // For IDP tokens, get the kid and fetch the signing key
            if (hdr?.kid && hdr?.kid !== 'internal-secret') {
              if (dbg) {
                console.log('[JWT-SECRET] IDP token detected, kid:', hdr.kid);
              }
              return await getSigningKey(hdr.kid);
            }
          }
        }
      } catch (parseErr) {
        console.log('[JWT-SECRET] Error in header parsing:', parseErr);
      }
      
      // Fallback to original logic if needed
      const b64urlToJson = (s: string) => {
        const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
        const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
        const str = Buffer.from(b64, 'base64').toString('utf8');
        return JSON.parse(str);
      };

      let kid: string | undefined = token?.header?.kid as string | undefined;
      if (!kid) {
        throw new Error('Missing kid in token header and unable to detect token type');
      }
      return await getSigningKey(kid);
    },
    audience: config.auth.audience,
    issuer: config.auth.issuer,
    verify: { algorithms: ['RS256', 'HS256'] }, // Allow both RS256 (IDP) and HS256 (internal)
  });

  
  app.decorate('authenticate', async function (request, reply) {
    
    // Check if authentication is disabled
    if (flags.disableAuth) {
      // @ts-ignore
      request.userContext = {
        sub: 'system',
        roles: ['superadmin', 'tenant_admin'] as UserRole[],
        tenantId: 'test-tenant'
      };
      return;
    }
    
    // Check for internal application token manually first
    const authHeader = request.headers?.authorization || request.headers?.Authorization;
    
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring('Bearer '.length).trim();
      
      try {
        // Try to verify as internal token manually
        const decoded = jwt.verify(token, config.internalJwtSecret);
        
        // If verification succeeds and it's an app token, use it
        if (decoded && typeof decoded === 'object' && (decoded as any).sub?.startsWith('app:')) {
          // @ts-ignore
          request.userContext = {
            sub: (decoded as any).sub,
            roles: (decoded as any).roles || ['app'],
            tenantId: (decoded as any).tenantId,
            appId: (decoded as any).appId,
            clientId: (decoded as any).clientId
          };
          return;
        }
      } catch (internalErr) {
      }
    }
    
    try {
      await request.jwtVerify();
      
      // Check if this is an internal application token from fastify-jwt
      const payload = request.user as any;
      if (payload && payload.sub?.startsWith('app:')) {
        // @ts-ignore
        request.userContext = {
          sub: payload.sub,
          roles: payload.roles || ['app'],
          tenantId: payload.tenantId,
          appId: payload.appId,
          clientId: payload.clientId
        };
      } else {
        // Standard IDP token - extract user context
        // @ts-ignore
        const userContext = await extractUser(payload);
        // @ts-ignore
        request.userContext = userContext;
      }
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