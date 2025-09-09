import { buildApp } from './app.js';
import { config } from './config.js';

async function main() {
  const app = buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`mail-service listening on ${config.port}`);
}

main().catch(err => {
  console.error(err); // eslint-disable-line no-console
  process.exit(1);
});
