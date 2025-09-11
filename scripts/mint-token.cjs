#!/usr/bin/env node
/*
 * mint-token.cjs
 * Creates a JWT signed with the locally generated private key from setup-local-auth.
 * Usage examples:
 *   node scripts/mint-token.cjs --sub user1 --roles superadmin --tenant t1 --app app1
 *   npm run token -- --roles editor --tenant tenantA
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const jwt = require('jsonwebtoken');

const projectRoot = path.resolve(__dirname, '..');

function pickLatestPrivateKey() {
  const files = fs.readdirSync(projectRoot).filter(f => /^private-[a-f0-9]+\.pem$/.test(f));
  if (!files.length) throw new Error('No private-<kid>.pem found. Run npm run setup:local-auth first.');
  // pick newest by mtime
  const withTime = files.map(f => ({ f, t: fs.statSync(path.join(projectRoot, f)).mtimeMs }));
  withTime.sort((a,b) => b.t - a.t);
  const file = withTime[0].f;
  const kid = file.replace(/^private-([a-f0-9]+)\.pem$/, '$1');
  return { kid, key: fs.readFileSync(path.join(projectRoot, file), 'utf8') };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const k = args[i].substring(2);
      const v = args[i+1] && !args[i+1].startsWith('--') ? args[++i] : 'true';
      out[k] = v;
    }
  }
  return out;
}

function main() {
  const a = parseArgs();
  const issuer = process.env.AUTH_ISSUER || 'http://localhost:3100';
  const audience = process.env.AUTH_AUDIENCE || 'mail-service';
  const roles = (a.roles || 'editor').split(',');
  const sub = a.sub || 'user-local';
  const tenantId = a.tenant || a.tenantId;
  const appId = a.app || a.appId;
  const { kid, key } = pickLatestPrivateKey();

  const payload = { sub, roles };
  if (tenantId) payload.tenantId = tenantId;
  if (appId) payload.appId = appId;

  const token = jwt.sign(payload, key, {
    algorithm: 'RS256',
    issuer,
    audience,
    expiresIn: a.expires || '1h',
    header: { kid }
  });

  console.log(token);
}

main();
