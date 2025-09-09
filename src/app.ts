import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from './config.js';
import { registerHealthRoutes } from './routes/health.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: config.env === 'development' ? { target: 'pino-pretty' } : undefined,
    }
  });

  app.register(sensible);
  app.register(cors, { origin: true });
  app.register(helmet, { global: true });

  // Routes
  registerHealthRoutes(app);

  app.get('/', async () => ({ service: 'mail-service', status: 'ok' }));

  return app;
}
