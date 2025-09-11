#!/usr/bin/env node
/*
 * setup-local-auth.cjs
 * Generates a local RSA key pair and JWKS, writes jwks.json at project root (served by any static server),
 * and appends / updates .env with AUTH_ISSUER, AUTH_AUDIENCE, AUTH_JWKS_URI pointing to http://localhost:3100/jwks.json by default.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '..');
const jwksPath = path.join(projectRoot, 'jwks.json');
const envPath = path.join(projectRoot, '.env');

function genKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}

function pemToModExp(publicPem) {
  // Decode ASN.1 to extract modulus & exponent (simplistic approach)
  const pubDer = Buffer.from(publicPem.replace(/-----.*?-----/g, '').replace(/\s+/g, ''), 'base64');
  // Very lightweight DER parsing for RSA public key
  // Look for 0x02 0x82 (modulus length) pattern; fallback naive.
  let modulus, exponent;
  for (let i = 0; i < pubDer.length - 3; i++) {
    if (pubDer[i] === 0x02 && (pubDer[i+1] === 0x81 || pubDer[i+1] === 0x82)) {
      // first INTEGER (possibly modulus)
      const lenLen = pubDer[i+1] === 0x81 ? 1 : 2;
      const len = lenLen === 1 ? pubDer[i+2] : (pubDer[i+2] << 8) + pubDer[i+3];
      const start = i + 2 + lenLen;
      const candidate = pubDer.slice(start, start + len);
      if (candidate[0] === 0x00) {
        modulus = candidate.slice(1); // drop leading zero
      } else {
        modulus = candidate;
      }
      // move to next INTEGER for exponent
      let j = start + len;
      if (pubDer[j] === 0x02) {
        const elenByte = pubDer[j+1];
        let elen = elenByte;
        let eOffset = j + 2;
        if (elenByte === 0x81) {
          elen = pubDer[j+2];
          eOffset = j + 3;
        }
        exponent = pubDer.slice(eOffset, eOffset + elen);
        break;
      }
    }
  }
  if (!modulus || !exponent) throw new Error('Failed to parse modulus/exponent');
  return {
    n: modulus.toString('base64').replace(/=+$/,''),
    e: exponent.toString('base64').replace(/=+$/,'')
  };
}

function b64url(inputB64) {
  return inputB64.replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function toJwk(publicPem, kid) {
  const { n, e } = pemToModExp(publicPem);
  return {
    kty: 'RSA',
    use: 'sig',
    alg: 'RS256',
    kid,
    n: b64url(n),
    e: b64url(e)
  };
}

function main() {
  const kid = crypto.randomBytes(8).toString('hex');
  const { publicKey, privateKey } = genKeyPair();
  const jwk = toJwk(publicKey, kid);
  const jwks = { keys: [jwk] };
  fs.writeFileSync(jwksPath, JSON.stringify(jwks, null, 2));
  fs.writeFileSync(path.join(projectRoot, `private-${kid}.pem`), privateKey, { mode: 0o600 });
  console.log(`Created jwks.json and private-${kid}.pem`);

  let env = '';
  if (fs.existsSync(envPath)) {
    env = fs.readFileSync(envPath, 'utf8');
  }
  const lines = env.split(/\r?\n/).filter(Boolean);
  const setVar = (k,v) => {
    const idx = lines.findIndex(l => l.startsWith(k + '='));
    if (idx >= 0) lines[idx] = `${k}=${v}`; else lines.push(`${k}=${v}`);
  };
  setVar('AUTH_ISSUER', 'http://localhost:3100');
  setVar('AUTH_AUDIENCE', 'mail-service');
  setVar('AUTH_JWKS_URI', 'http://localhost:3100/jwks.json');
  // Provide claim names (defaults already present in code, but explicit helps)
  setVar('AUTH_ROLE_CLAIM', 'roles');
  setVar('AUTH_TENANT_CLAIM', 'tenantId');
  setVar('AUTH_APP_CLAIM', 'appId');
  fs.writeFileSync(envPath, lines.join('\n') + '\n');
  console.log('.env updated with local auth settings');
  console.log('Next: serve jwks.json statically (the Fastify app can be extended) or place at web root.');
  console.log('Use `npm run token` to mint test tokens.');
  console.log(`KID: ${kid}`);
}

main();
