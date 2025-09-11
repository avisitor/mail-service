#!/usr/bin/env bash
set -euo pipefail

# Simple launcher: MySQL DB required, auth disabled, scheduler enabled, dry-run SMTP (override before prod)
# Edit below (or export) SMTP_* vars for real delivery (unset SMTP_DRY_RUN and set SMTP_USER/PASS etc.)

PORT=${PORT:-3100}
export PORT
export NODE_ENV=development
export DISABLE_AUTH=true
unset USE_INMEMORY_DB
# Provide a sample MySQL connection string (adjust user/pass/host/db before running)
export DATABASE_URL=${DATABASE_URL:-"mysql://user:pass@localhost:3306/mailservice"}
export SMTP_HOST=${SMTP_HOST:-localhost}
export SMTP_PORT=${SMTP_PORT:-1025}
export SMTP_SECURE=${SMTP_SECURE:-false}
export SMTP_DRY_RUN=${SMTP_DRY_RUN:-true}
# Optional from settings (user may override)
[ -n "${SMTP_FROM_DEFAULT:-}" ] && export SMTP_FROM_DEFAULT
[ -n "${SMTP_FROM_NAME:-}" ] && export SMTP_FROM_NAME

# Dummy auth issuer/audience since auth disabled anyway
export AUTH_ISSUER=local
export AUTH_AUDIENCE=local
export AUTH_JWKS_URI=http://localhost/jwks.json

# Build if dist missing
if [ ! -d dist ]; then
  echo "[build] Compiling TypeScript..."
  npm run build >/dev/null
fi

echo "Starting mail-service on port $PORT (auth disabled, mysql DB: $DATABASE_URL, dry-run SMTP: $SMTP_DRY_RUN)"
exec node dist/src/server.js
