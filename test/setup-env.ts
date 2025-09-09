process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:pass@localhost:3306/mailservice_test';
process.env.AUTH_ISSUER = process.env.AUTH_ISSUER || 'http://localhost/test-issuer';
process.env.AUTH_AUDIENCE = process.env.AUTH_AUDIENCE || 'mail-service';
process.env.AUTH_JWKS_URI = process.env.AUTH_JWKS_URI || 'http://localhost/.well-known/jwks.json';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'localhost';
process.env.USE_INMEMORY_DB = 'true';