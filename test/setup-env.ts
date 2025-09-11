process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://laana:0$o7Z&93@localhost:3306/mailservice';
process.env.AUTH_ISSUER = process.env.AUTH_ISSUER || 'http://localhost/test-issuer';
process.env.AUTH_AUDIENCE = process.env.AUTH_AUDIENCE || 'mail-service';
process.env.AUTH_JWKS_URI = process.env.AUTH_JWKS_URI || 'http://localhost/.well-known/jwks.json';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'localhost';
// Always MySQL; toggle auth & dry-run only when DB_TEST set
if (process.env.DB_TEST === '1') {
	process.env.DISABLE_AUTH = 'true';
	process.env.SMTP_DRY_RUN = 'true';
}