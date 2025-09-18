import { buildApp } from './app.js';
import { config, flags } from './config.js';
import { workerTick } from './modules/worker/service.js';
import { markDbReady } from './db/state.js';
import { getPrisma, isPrismaDisabled } from './db/prisma.js';

async function main() {
  const dbUrlRaw = config.databaseUrl || '';
  const dbUrl = dbUrlRaw.trim();
  const dbValid = /^mysql:\/\//i.test(dbUrl);
  if (!dbValid) {
    console.error('FATAL: DATABASE_URL must start with mysql:// (current value hidden)'); // eslint-disable-line no-console
    process.exit(1);
  }
  const app = buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  
  // Log startup environment for debugging
  app.log.info({
    port: config.port,
    env: config.env,
    disableAuth: flags.disableAuth,
    disableScheduler: flags.disableScheduler,
    databaseUrl: config.databaseUrl ? 'SET' : 'NOT SET',
    smtpHost: config.smtp.host,
    smtpPort: config.smtp.port,
    smtpDryRun: process.env.SMTP_DRY_RUN
  }, 'Server startup configuration');
  
  // Log effective auth posture at startup for diagnostics
  try {
    app.log.info({ env: config.env, disableAuth: flags.disableAuth, issuer: config.auth.issuer, audience: config.auth.audience, jwks: config.auth.jwksUri }, 'auth startup config');
  } catch {}
  app.log.info(`mail-service listening on ${config.port}`);
    const dbUrlForLog = dbUrlRaw.replace(/:[^:@/]+@/, ':***@');
  app.log.info({ dbUrlPreview: dbUrlForLog }, 'database URL evaluated for scheduler');
  app.log.info({ rawDbUrl: process.env.DATABASE_URL?.substring(0, 20) + '...' }, 'process.env.DATABASE_URL check');
  let dbReady = false;
  if (dbValid && !isPrismaDisabled()) {
    try {
      const prisma = getPrisma();
      await prisma.$connect();
  dbReady = true;
  markDbReady();
      app.log.info('database preflight succeeded');
    } catch (e: any) {
      app.log.error({ err: e }, 'database preflight failed; scheduler disabled');
    }
  }
  if (!flags.disableScheduler && dbValid && dbReady) {
    const intervalMs = config.scheduler.pollIntervalMs;
    app.log.info({ intervalMs }, 'starting scheduler loop');
        let workerErrorCount = 0;
        const handle = setInterval(async () => {
          try {
            const result = await workerTick();
            if (result.jobsProcessed > 0) {
              app.log.debug({ result }, 'worker tick processed jobs');
            }
          } catch (e: any) {
            workerErrorCount += 1;
            const initErr = e?.name === 'PrismaClientInitializationError' || /Error validating datasource/i.test(e?.message || '');
            if (initErr) {
              app.log.error({ err: e }, 'worker encountered Prisma initialization error; stopping scheduler to prevent noise');
              clearInterval(handle);
              return;
            }
            if (workerErrorCount <= 3 || workerErrorCount % 10 === 0) {
              app.log.error({ err: e, count: workerErrorCount }, 'worker tick failed');
            } else {
              app.log.debug({ err: e, count: workerErrorCount }, 'worker tick suppressed error');
            }
          }
        }, intervalMs);
        handle.unref();
  } else {
    if (dbValid && !dbReady) {
      app.log.warn('scheduler skipped (database not reachable)');
    } else {
      app.log.info('scheduler disabled via flag');
    }
  }
}

main().catch(err => {
  console.error(err); // eslint-disable-line no-console
  process.exit(1);
});
