import fp from 'fastify-plugin';
import fastifyJwt, { FastifyJWTOptions } from '@fastify/jwt';
import { getSigningKey } from './jwks.js';
import { config } from '../config.js';

export default fp(async function authPlugin(app) {
  app.register(fastifyJwt, <FastifyJWTOptions>{
    secret: async (_request: any, token: any) => {
      const kid = token?.header.kid;
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
    } catch (err) {
      return reply.unauthorized();
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}