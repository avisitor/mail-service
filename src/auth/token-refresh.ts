/**
 * Token refresh utility for mail-service
 * Handles silent token refresh using IDP's refresh-or-enhance-token endpoint
 */

interface TokenRefreshConfig {
  idpBaseUrl: string;
  appId: string;
}

interface TokenRefreshResponse {
  token: string;
  action: string;
  claims_added: string[];
}

/**
 * Attempts to refresh a token silently using the IDP refresh endpoint
 * @param config - Configuration for token refresh
 * @param currentToken - The current (potentially expired) token
 * @param userEmail - Optional user email for fallback token generation
 * @returns Promise<string | null> - New token on success, null on failure
 */
export async function refreshToken(
  config: TokenRefreshConfig,
  currentToken: string,
  userEmail?: string
): Promise<string | null> {
  try {
    const refreshUrl = `${config.idpBaseUrl}/refresh-or-enhance-token.php`;
    
    const requestData = {
      appId: config.appId,
      token: currentToken,
      email: userEmail,
      claims: {} // Can be extended for additional claims if needed
    };

    console.debug('[token-refresh] Attempting token refresh at:', refreshUrl);
    
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestData),
      credentials: 'include'
    });

    if (!response.ok) {
      console.warn('[token-refresh] Failed to refresh token:', response.status, response.statusText);
      return null;
    }

    const result: TokenRefreshResponse = await response.json();
    
    if (result.token) {
      console.debug('[token-refresh] Token successfully refreshed:', {
        action: result.action,
        claimsAdded: result.claims_added
      });
      return result.token;
    } else {
      console.warn('[token-refresh] No token in refresh response');
      return null;
    }
  } catch (error) {
    console.error('[token-refresh] Error during token refresh:', error);
    return null;
  }
}

/**
 * Extracts the user email from a JWT token payload (even if expired)
 * @param token - JWT token string
 * @returns string | null - User email if found, null otherwise
 */
export function extractUserEmailFromToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub || payload.email || null;
  } catch (error) {
    console.debug('[token-refresh] Could not extract email from token:', error);
    return null;
  }
}