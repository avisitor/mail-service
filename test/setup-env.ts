import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const envTestPath = resolve(process.cwd(), '.env.test');
if (existsSync(envTestPath)) {
  loadEnv({ path: envTestPath });
}

// Ensure required defaults exist if not provided by .env.test
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://laana:WmC2UPRz@127.0.0.1:3306/mailservice';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'localhost';

// Always MySQL; toggle auth & dry-run only when DB_TEST set
if (process.env.DB_TEST === '1') {
	process.env.DISABLE_AUTH = 'true';
	process.env.SMTP_DRY_RUN = 'true';
}