// Test script for silent token refresh functionality
// This demonstrates the new behavior when API calls receive 401 responses

console.log('🧪 Testing Mail Service Silent Token Refresh');

// Mock the global variables that would normally be available in the mail-service frontend
let authToken = null;
const uiConfig = {
    idpLoginUrl: 'https://idp.worldspot.org/login'
};

// Token refresh utilities (copied from main.ts)
function extractUserEmailFromToken(token) {
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

async function refreshToken(currentToken, userEmail) {
    try {
        const idpBaseUrl = 'https://idp.worldspot.org';
        const appId = 'cmfka688r0001b77ofpgm57ix'; // mail-service app ID
        const refreshUrl = `${idpBaseUrl}/refresh-or-enhance-token.php`;
        
        const requestData = {
            appId: appId,
            token: currentToken,
            email: userEmail,
            claims: {}
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

        const result = await response.json();
        
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

// Mock API implementation with silent token refresh
async function apiWithRetry(path, opts = {}, allowRetry = true) {
    const headers = { 'Content-Type':'application/json', ...(opts.headers || {}) };
    
    // Add authorization header if we have a token
    if (authToken) {
        headers['Authorization'] = 'Bearer ' + authToken;
        console.debug(`[api] Using token for ${path}:`, {
            tokenStart: authToken.substring(0, 20) + '...'
        });
    }
    
    // Also add token as URL parameter to support enhanced authentication
    let finalPath = path;
    if (authToken) {
        const separator = path.includes('?') ? '&' : '?';
        finalPath = `${path}${separator}token=${encodeURIComponent(authToken)}`;
    }
    
    const res = await fetch(finalPath, { ...opts, headers });
    if (!res.ok) {
        // Handle 401 Unauthorized by attempting silent token refresh first
        if (res.status === 401 && allowRetry && authToken) {
            console.log('🔒 API returned 401 Unauthorized, attempting silent token refresh...');
            
            // Try to extract user email from current token
            const userEmail = extractUserEmailFromToken(authToken);
            
            // Attempt silent token refresh
            const newToken = await refreshToken(authToken, userEmail || undefined);
            
            if (newToken) {
                console.log('✅ Token successfully refreshed, retrying original request');
                
                // Update stored token
                authToken = newToken;
                localStorage.setItem('authToken', authToken);
                
                // Retry the original request with the new token
                return apiWithRetry(path, opts, false); // Prevent infinite retry loop
            } else {
                console.log('❌ Silent token refresh failed, would redirect to IDP for re-authentication...');
                
                // Clear expired token
                authToken = null;
                localStorage.removeItem('authToken');
                
                // In a real scenario, would redirect to IDP
                throw new Error('Authentication failed - would redirect to IDP');
            }
        }
        
        const tx = await res.text();
        throw new Error(tx || res.statusText);
    }
    return res.json();
}

// Test function
async function testSilentRefresh() {
    console.log('\n=== Testing Silent Token Refresh ===');
    
    // Set a test token (in real scenario this would be a valid but potentially expired token)
    authToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.eyJzdWIiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiYXBwSWQiOiJjbWZrYTY4OHIwMDAxYjc3b2ZwZ201N2l4IiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDM2MDB9.test-signature';
    
    try {
        // This would normally make a request to mail-service, but for testing we'll just simulate
        console.log('Simulating API call that returns 401...');
        
        // Create a mock server response that returns 401
        const mockResponse = new Response('Unauthorized', { status: 401 });
        
        // Test the token refresh logic directly
        console.log('Testing token refresh with expired token...');
        const userEmail = extractUserEmailFromToken(authToken);
        console.log('Extracted user email:', userEmail);
        
        const newToken = await refreshToken(authToken, userEmail);
        if (newToken) {
            console.log('✅ Token refresh successful!');
            console.log('New token preview:', newToken.substring(0, 50) + '...');
        } else {
            console.log('❌ Token refresh failed');
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testSilentRefresh();