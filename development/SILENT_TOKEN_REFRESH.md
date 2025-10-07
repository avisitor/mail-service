# Silent Token Refresh Implementation

## Overview

The mail-service now implements **silent token refresh** to improve user experience by automatically refreshing expired tokens in the background instead of immediately redirecting users to the IDP login page.

## How It Works

### Frontend Flow

When the mail-service frontend makes an API call and receives a 401 Unauthorized response:

1. **Extract User Context**: The system extracts the user email from the expired token
2. **Attempt Silent Refresh**: Makes a request to the IDP's refresh endpoint
3. **Update Token**: If successful, updates the stored token and retries the original request
4. **Fallback to Redirect**: If refresh fails, falls back to the original behavior (redirect to IDP)

### Backend Integration

The IDP provides a `refresh-or-enhance-token.php` endpoint that:

- Accepts expired tokens and extracts user information
- Generates fresh tokens with the same user context
- Supports both token refresh and enhancement with additional claims
- Returns new signed JWT tokens

## Implementation Details

### Frontend Changes

**File**: `/var/www/html/mail-service/src/frontend/main.ts`

Added token refresh utilities:
```typescript
// Token refresh function
async function refreshToken(currentToken: string, userEmail?: string): Promise<string | null>

// Email extraction utility  
function extractUserEmailFromToken(token: string): string | null

// Enhanced API client with retry logic
async function apiWithRetry(path: string, opts: RequestInit = {}, allowRetry: boolean = true)
```

**Modified API Client**:
- `api()` function now calls `apiWithRetry()` 
- On 401 responses, attempts silent refresh before redirecting
- Prevents infinite retry loops with `allowRetry` flag
- Updates localStorage with refreshed tokens

### Backend Endpoint

**File**: `/var/www/html/idp/refresh-or-enhance-token.php`

**Endpoint**: `POST https://idp.worldspot.org/refresh-or-enhance-token.php`

**Request Format**:
```json
{
  "appId": "cmfka688r0001b77ofpgm57ix",
  "token": "expired-jwt-token",
  "email": "user@example.com",
  "claims": {}
}
```

**Response Format**:
```json
{
  "token": "new-jwt-token",
  "action": "refreshed/enhanced",
  "claims_added": []
}
```

### Error Handling

- **Network errors**: Falls back to IDP redirect
- **Invalid tokens**: Falls back to IDP redirect  
- **Unknown app IDs**: Returns 400 error
- **Missing user context**: Returns 400 error

## Configuration

### Required Environment Variables

**Mail Service**:
- `AUTH_IDP_LOGIN_URL`: IDP login URL for fallback redirects

**IDP**:
- `IDP_TOKEN_EXPIRY_SECONDS`: Token expiry time (default: 3600 seconds)

### CORS Configuration

The refresh endpoint includes CORS headers for cross-origin requests:
```php
header('Access-Control-Allow-Origin: https://mailservice.worldspot.org');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Allow-Credentials: true');
```

## Benefits

1. **Improved UX**: Users aren't interrupted by login redirects for expired tokens
2. **Seamless Experience**: API calls continue transparently after token refresh
3. **Fallback Safety**: Still redirects to IDP if silent refresh fails
4. **Security**: Maintains same security model with fresh signed tokens

## Testing

Test files created:
- `test-token-refresh.html`: Basic refresh endpoint testing
- `test-silent-refresh.js`: Complete flow testing with mock scenarios

## Monitoring

The implementation includes comprehensive logging:
- Debug logs for token usage and refresh attempts
- Success/failure indicators in console
- IDP logging for refresh operations

## Future Enhancements

- **Proactive Refresh**: Refresh tokens before they expire
- **Background Refresh**: Refresh tokens during idle periods
- **Multiple App Support**: Handle different app IDs dynamically
- **Retry Strategies**: Implement exponential backoff for failed refreshes