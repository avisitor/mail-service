import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export interface Config {
  env: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  auth: {
    issuer: string;
    audience: string;
    jwksUri: string;
  };
  smtp: {
    host: string;
    port: number;
    user?: string;
    pass?: string;
    secure: boolean;
    fromDefault?: string;
  };
  scheduler: {
    pollIntervalMs: number;
    batchSize: number;
  };
}

export const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3100', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  databaseUrl: required('DATABASE_URL'),
  auth: {
    issuer: required('AUTH_ISSUER'),
    audience: required('AUTH_AUDIENCE'),
    jwksUri: required('AUTH_JWKS_URI'),
  },
  smtp: {
    host: required('SMTP_HOST'),
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    secure: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    fromDefault: process.env.SMTP_FROM_DEFAULT,
  },
  scheduler: {
    pollIntervalMs: parseInt(process.env.SCHEDULER_POLL_MS || '5000', 10),
    batchSize: parseInt(process.env.SCHEDULER_BATCH_SIZE || '100', 10),
  },
};

export const flags = {
  disableAuth: (process.env.DISABLE_AUTH || 'false').toLowerCase() === 'true',
};
