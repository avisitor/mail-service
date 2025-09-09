# Mail Service

Independent multi-tenant email subsystem (Fastify + TypeScript) providing template rendering, message scheduling, sending, and logging with OAuth2/JWT auth.

## High-Level Features (Phase 1)
- OAuth2 client credentials for app authentication (pluggable provider)
- JWT end-user passthrough (optional) for audit
- Template CRUD + render preview
- Message group (campaign) creation (draft -> scheduled -> processing -> complete)
- Recipient ingestion (simple or contextual JSON)
- Immediate send or future schedule (DB queue)
- Per-recipient personalization via Mustache templates
- Event & log endpoints (basic sent/open)

## Stack
- Node.js (>=18), TypeScript
- Fastify for HTTP
- Prisma (MySQL) or Knex (choose via ENV); default SQL schema provided
- Nodemailer provider abstraction (swap for SES/SMTP later)

## Directory Layout
```
src/
  app.ts              # Fastify bootstrap
  server.ts           # CLI entrypoint
  config/             # Configuration loading & validation
  auth/               # OAuth2/JWT middlewares & types
  db/                 # Prisma or query builder init
  modules/
    templates/
    groups/
    recipients/
    messages/
    events/
    suppression/
  plugins/            # Fastify plugins (logging, security headers)
  queue/              # Scheduling & worker loop
  rendering/          # Mustache renderer + variable extraction
  utils/              # Shared helpers
 prisma/               # Prisma schema (if using Prisma)
 migrations/          # SQL migrations (if using raw SQL)
 scripts/             # One-off maintenance scripts
 test/                # Unit/integration tests
 docs/                # Architecture & API docs
```

## Quick Start
1. Install deps:
```bash
npm install
```
2. Copy env:
```bash
cp .env.example .env
```
3. Generate client (if using Prisma):
```bash
npm run prisma:generate
```
4. Run dev:
```bash
npm run dev
```

## Env Variables (.env.example)
See `.env.example` for all settings (DB, OAuth2 issuer, JWKS, etc.).

## Next Steps
- Flesh out Prisma schema & initial migration
- Implement auth middleware & tenant scoping
- Implement template endpoints
- Implement message group + recipient ingestion
- Add scheduler worker
- Add open tracking pixel route

## License
TBD
