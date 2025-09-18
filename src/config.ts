import dotenv from 'dotenv';

dotenv.config();

function required(name: string, altNames: string[] = []): string {
  const names = [name, ...altNames];
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(`Missing required env var ${names.join(' or ')}`);
}

export interface Config {
  env: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  internalJwtSecret: string;
  tls?: {
    keyFile?: string;
    certFile?: string;
    caFile?: string;
  };
  auth: {
    issuer: string;
    audience: string;
    jwksUri: string;
    roleClaim: string;
    tenantClaim: string;
    appClaim: string;
    idpLoginUrl?: string;
  };
  smtp: {
    host: string;
    port: number;
    user?: string;
    pass?: string;
    secure: boolean;
    fromDefault?: string;
    fromName?: string;
  };
  testSmtp: {
    enabled: boolean;
    host: string;
    port: number;
    user?: string;
    pass?: string;
    secure: boolean;
    fromDefault: string;
    fromName: string;
  };
  scheduler: {
    pollIntervalMs: number;
    batchSize: number;
  };
}

export interface Config {
  env: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  internalJwtSecret: string;
  tls?: {
    keyFile?: string;
    certFile?: string;
    caFile?: string;
  };
  auth: {
    issuer: string;
    audience: string;
    jwksUri: string;
  roleClaim: string;
  tenantClaim: string;
  appClaim: string;
  idpLoginUrl?: string;
  };
  smtp: {
    host: string;
    port: number;
    user?: string;
    pass?: string;
    secure: boolean;
    fromDefault?: string;
  fromName?: string;
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
  internalJwtSecret: required('INTERNAL_JWT_SECRET'),
  tls: {
    keyFile: process.env.TLS_KEY_FILE,
    certFile: process.env.TLS_CERT_FILE,
    caFile: process.env.TLS_CA_FILE,
  },
  auth: {
    issuer: required('AUTH_ISSUER', ['OAUTH_ISSUER']),
    audience: required('AUTH_AUDIENCE', ['OAUTH_AUDIENCE']),
    jwksUri: required('AUTH_JWKS_URI', ['JWKS_URL']),
  roleClaim: process.env.AUTH_ROLE_CLAIM || 'roles',
  tenantClaim: process.env.AUTH_TENANT_CLAIM || 'tenantId',
  appClaim: process.env.AUTH_APP_CLAIM || 'appId',
  idpLoginUrl: process.env.AUTH_IDP_LOGIN_URL,
  },
  smtp: {
    host: required('SMTP_HOST'),
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    secure: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    // Support either SMTP_FROM_DEFAULT (new) or legacy SMTP_FROM_ADDRESS
    fromDefault: process.env.SMTP_FROM_DEFAULT || process.env.SMTP_FROM_ADDRESS,
    fromName: process.env.SMTP_FROM_NAME,
  },
  testSmtp: {
    enabled: (process.env.TEST_SMTP_ENABLED || 'false').toLowerCase() === 'true',
    host: process.env.TEST_SMTP_HOST || 'localhost',
    port: parseInt(process.env.TEST_SMTP_PORT || '1025', 10),
    user: process.env.TEST_SMTP_USER || '',
    pass: process.env.TEST_SMTP_PASS || '',
    secure: (process.env.TEST_SMTP_SECURE || 'false').toLowerCase() === 'true',
    fromDefault: process.env.TEST_SMTP_FROM_DEFAULT || 'test@example.com',
    fromName: process.env.TEST_SMTP_FROM_NAME || 'Mail Service Test',
  },
  scheduler: {
    pollIntervalMs: parseInt(process.env.SCHEDULER_POLL_MS || '5000', 10),
    batchSize: parseInt(process.env.SCHEDULER_BATCH_SIZE || '100', 10),
  },
};

export const flags = {
  disableAuth: (process.env.DISABLE_AUTH || 'false').toLowerCase() === 'true',
  disableScheduler: (process.env.DISABLE_SCHEDULER || 'false').toLowerCase() === 'true',
};
