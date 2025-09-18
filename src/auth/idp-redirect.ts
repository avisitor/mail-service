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
  
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    console.log('[checkAuthentication] No valid auth header found');
    return { isAuthenticated: false, userContext: null };
  }
  
  try {
    await request.jwtVerify();
    // Extract user context after successful verification
    const userContext = (request as any).userContext;
    console.log('[checkAuthentication] Authentication successful, userContext:', JSON.stringify(userContext, null, 2));
    return { isAuthenticated: true, userContext };
  } catch (error) {
    console.log('[checkAuthentication] JWT verification failed:', (error as Error).message);
    return { isAuthenticated: false, userContext: null };
  }
}