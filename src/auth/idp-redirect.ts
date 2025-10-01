import jwt from 'jsonwebtoken';
import { config } from '../config.js';

interface IdpRedirectOptions {
  returnUrl: string;
  appId?: string;
  mode?: string;
  tenantId?: string;
}

/**
 * Creates a standardized IDP redirect URL using the same pattern as the working UI authentication
 */
export function createIdpRedirectUrl(options: IdpRedirectOptions): string {
  const { returnUrl, appId, mode, tenantId } = options;
  
  const idpUrl = new URL(config.auth.idpLoginUrl || config.auth.issuer);
  
  // Use the working pattern from main.ts
  idpUrl.searchParams.set('return', returnUrl);
  
  // Include appId - do NOT use default if invalid appId provided
  if (appId) {
    idpUrl.searchParams.set('appId', appId);
  } else {
    // Only use default ReTree Hawaii appId if NO appId provided at all (backward compatibility)
    idpUrl.searchParams.set('appId', 'cmfka688r0001b77ofpgm57ix');
  }
  
  // Add any additional context as state parameter
  if (mode || tenantId) {
    const state = JSON.stringify({ mode, tenantId });
    idpUrl.searchParams.set('state', state);
  }
  
  return idpUrl.toString();
}

/**
 * Check if user is authenticated without throwing errors
 */
export async function checkAuthentication(request: any): Promise<{ isAuthenticated: boolean; userContext: any | null }> {
  const authHeader = request.headers?.authorization || request.headers?.Authorization;
  const tokenParam = request.query?.token;
  
  console.log('[checkAuthentication] Request URL:', request.url);
  console.log('[checkAuthentication] Token param present:', !!tokenParam, 'Type:', typeof tokenParam);
  console.log('[checkAuthentication] Auth header present:', !!authHeader);
  
  // Check for token URL parameter FIRST (it has enhanced roles)
  if (tokenParam && typeof tokenParam === 'string') {
    console.log('[checkAuthentication] Attempting token param authentication...');
    try {
      // Manually verify the JWT token from the URL parameter using the same logic as the auth plugin
      const decoded = await verifyJwtToken(tokenParam);
      
      if (decoded && typeof decoded === 'object') {
        console.log('[checkAuthentication] Token param JWT payload:', JSON.stringify(decoded, null, 2));
        const { extractUser } = await import('./roles.js');
        const userContext = await extractUser(decoded);
        console.log('[checkAuthentication] Authentication successful via token param, userContext:', JSON.stringify(userContext, null, 2));
        console.log('[checkAuthentication] User roles:', userContext?.roles);
        return { isAuthenticated: true, userContext };
      }
    } catch (error) {
      console.log('[checkAuthentication] JWT verification failed for token param:', (error as Error).message);
    }
  }
  
  // Fall back to Authorization header if token param failed or not present
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    console.log('[checkAuthentication] Attempting header authentication...');
    try {
      await request.jwtVerify();
      // Extract user context from the JWT payload using the same logic as the auth middleware
      const tokenPayload = (request as any).user || {};
      const { extractUser } = await import('./roles.js');
      const userContext = await extractUser(tokenPayload);
      console.log('[checkAuthentication] Authentication successful via header, userContext:', JSON.stringify(userContext, null, 2));
      console.log('[checkAuthentication] User roles:', userContext?.roles);
      return { isAuthenticated: true, userContext };
    } catch (error) {
      console.log('[checkAuthentication] JWT verification failed for header:', (error as Error).message);
    }
  }
  
  console.log('[checkAuthentication] No valid auth header or token parameter found');
  return { isAuthenticated: false, userContext: null };
}

// Helper function to verify JWT tokens using the same logic as the auth plugin
async function verifyJwtToken(token: string): Promise<any> {
  const { getSigningKey } = await import('./jwks.js');
  
  // Parse the token header to get the key ID
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT token format');
  }
  
  const b64urlToJson = (s: string) => {
    const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const str = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(str);
  };
  
  const header = b64urlToJson(parts[0]);
  
  let secret: string;
  
  // Check if this is an internal token (HS256, no kid OR kid=internal-secret)
  if (header?.alg === 'HS256' && (!header?.kid || header?.kid === 'internal-secret')) {
    secret = config.internalJwtSecret;
  } else if (header?.kid && header?.kid !== 'internal-secret') {
    // For IDP tokens, get the signing key using JWKS
    secret = await getSigningKey(header.kid);
  } else {
    throw new Error('Unable to determine signing key for token');
  }
  
  // Verify the token
  return jwt.verify(token, secret, {
    issuer: config.auth.issuer,
    audience: config.auth.audience
  });
}