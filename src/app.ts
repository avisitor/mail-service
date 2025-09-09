import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config, flags } from './config.js';
import { registerHealthRoutes } from './routes/health.js';
import authPlugin from './auth/plugin.js';
import { registerTemplateRoutes } from './modules/templates/routes.js';

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

  // Auth (can be toggled off in test env)
  if (!flags.disableAuth && config.env !== 'test') {
    app.register(authPlugin);
  }

  // Routes
  registerHealthRoutes(app);
  registerTemplateRoutes(app);

  app.get('/', async () => ({ service: 'mail-service', status: 'ok' }));

  return app;
}
