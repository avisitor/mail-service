import jwksClient from 'jwks-rsa';
import { config } from '../config.js';

export const jwks = jwksClient({
  jwksUri: config.auth.jwksUri,
  cache: true,
  cacheMaxEntries: 10,
  cacheMaxAge: 10 * 60 * 1000,
  requestHeaders: {
    'User-Agent': 'MailService/1.0.0'
  }
});

export async function getSigningKey(kid: string): Promise<string> {
  const key = await jwks.getSigningKey(kid);
  // @ts-ignore - library typing nuance
  return key.getPublicKey();
}
