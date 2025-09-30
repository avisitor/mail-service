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
  
  // Check for Authorization header first
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
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
  
  // Check for token URL parameter if header auth failed or not present
  if (tokenParam && typeof tokenParam === 'string') {
    try {
      // Temporarily set the Authorization header for verification
      request.headers.authorization = `Bearer ${tokenParam}`;
      await request.jwtVerify();
      // Extract user context from the JWT payload using the same logic as the auth middleware
      const tokenPayload = (request as any).user || {};
      const { extractUser } = await import('./roles.js');
      const userContext = await extractUser(tokenPayload);
      console.log('[checkAuthentication] Authentication successful via token param, userContext:', JSON.stringify(userContext, null, 2));
      console.log('[checkAuthentication] User roles:', userContext?.roles);
      return { isAuthenticated: true, userContext };
    } catch (error) {
      console.log('[checkAuthentication] JWT verification failed for token param:', (error as Error).message);
      // Clean up the temporary header
      delete request.headers.authorization;
    }
  }
  
  console.log('[checkAuthentication] No valid auth header or token parameter found');
  return { isAuthenticated: false, userContext: null };
}