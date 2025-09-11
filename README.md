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

5. Send a test email (auth disabled in dev script):
```bash
curl -X POST http://localhost:3100/test-email \
  -H 'content-type: application/json' \
  -d '{"to":"you@example.com","subject":"Hello","text":"Testing"}'
```
### Quick no-auth start script

You can also use the helper script (auth disabled, in-memory DB, SMTP dry-run):

```bash
./scripts/dev-noauth.sh
```

Edit env vars (SMTP_*) before running for real delivery (set SMTP_DRY_RUN=false, provide SMTP_USER/SMTP_PASS, etc.).

If SMTP_DRY_RUN=true the send is simulated.

## Local Auth & JWKS Setup

For role-based UI / API testing without an external IdP you can generate a local JWKS and mint tokens.

1. Generate JWKS & update .env:
```bash
npm run setup:local-auth
```
This creates `jwks.json` and a `private-<kid>.pem` plus updates `.env` with AUTH_ISSUER/AUDIENCE/JWKS_URI.

2. (Optional) Serve jwks.json: ensure your Fastify server (or a simple static server) serves the project root so `http://localhost:3100/jwks.json` is reachable.

3. Mint a token:
```bash
npm run token -- --roles superadmin --sub admin1
```
Add tenant / app scoping:
```bash
npm run token -- --roles tenant_admin,editor --tenant tenantA --app app1
```

4. Use the token in requests:
```bash
curl -H "authorization: Bearer $(npm run -s token -- --roles superadmin)" http://localhost:3100/tenants
```

The token now purposely contains only identity + basic scoping hints (subject, optional tenantId/appId/clientId) and MAY omit any `roles` claim entirely. Authorization is resolved server‑side from the database (see Authorization Model below). If a `roles` claim is present (e.g. from an older IDP version) it is ignored for effective permissions.

### Browser SSO Redirect Contract

To integrate with an external IDP, the UI and IDP follow a strict, simple contract:

- When the UI has no token, it redirects the browser to `AUTH_IDP_LOGIN_URL` with a single query parameter named `return` containing the absolute URL to the UI home (e.g., `https://host:3100/ui/`).
- After successful login, the IDP must redirect the browser back to the provided `return` URL with a single query parameter named `token` that contains the JWT (RS256 signed and compatible with AUTH_ISSUER/AUTH_AUDIENCE).

Examples:

- UI → IDP:
  `https://idp.example.org/auth?return=https%3A%2F%2Fhost%3A3100%2Fui%2F`

- IDP → UI (on success):
  `https://host:3100/ui/?token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVC...`

Notes:
- The app serves `/ui/config.js` with a dynamic `returnUrl` based on the incoming request, honoring X-Forwarded-* headers when behind a proxy.
- Only `return` and `token` are used. Do not use alternative parameter names or hash fragments.

Troubleshooting auth:
- Set `DEBUG_AUTH=true` in `.env` to get server logs when JWT verification fails (no token, invalid audience/issuer, bad signature, expired, etc.).
- Open DevTools Console to see `[ui-auth]` logs from the browser during the redirect/token parsing phase.

## Env Variables (.env.example)
See `.env.example` for all settings (DB, OAuth2 issuer, JWKS, etc.).

## Authorization Model (Option 1: Application‑Owned)

Instead of trusting role claims issued by the IDP, the mail-service derives roles from its own `RoleBinding` table. This decouples authentication (who the user is) from authorization (what they can do) and allows the IDP to remain ignorant of application/tenant specifics or external providers (e.g. Google, other OIDC issuers).

Prisma model (simplified):

```
enum ScopeType { GLOBAL TENANT APP }

model RoleBinding {
  id        String    @id @default(cuid())
  userSub   String
  scopeType ScopeType
  scopeId   String?   // null for GLOBAL
  role      String    // superadmin | tenant_admin | editor
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  @@index([userSub, scopeType, scopeId])
}
```

Resolution algorithm (per request):
1. Authenticate JWT (issuer/audience + signature via JWKS).
2. Extract `sub`, plus optional `tenantId` / `appId` hints from token (if present). These hints are not trusted for permission—only for scoping lookups.
3. Load all matching bindings for: GLOBAL + (TENANT + tenantId) + (APP + appId).
4. Merge distinct roles; attach to `request.userContext`.
5. Route guards check for required roles (e.g. superadmin for tenant CRUD, tenant_admin or superadmin for app/template ops, editor for composition).

Initial bootstrap: manually insert a GLOBAL superadmin binding for your admin user (their JWT `sub`). Example SQL:

```sql
INSERT INTO RoleBinding (id,userSub,scopeType,scopeId,role,createdAt,updatedAt)
VALUES (REPLACE(UUID(),'-',''), 'admin@example.com', 'GLOBAL', NULL, 'superadmin', NOW(), NOW());
```

Changing roles takes effect on the next request (no need to re-issue tokens) because roles are re-resolved for every authenticated call.

Why this approach:
- IDP stays generic (can add Google / other identity sources later).
- Each application owns its authorization rules & data.
- Revoking a role is immediate without forcing logouts.

Future evolution (optional): introduce a centralized authz service; current resolver abstraction makes that a drop-in replacement.

## Next Steps
- Flesh out Prisma schema & initial migration
- Implement auth middleware & tenant scoping
- Implement template endpoints
- Implement message group + recipient ingestion
- Add scheduler worker
- Add open tracking pixel route
- Flesh out /test-email to support multiple recipients
- Add suppression list management UI

## License
TBD
