import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createIdpRedirectUrl, checkAuthentication } from '../src/auth/idp-redirect.js';

// Mock the config
vi.mock('../src/config.js', () => ({
  config: {
    auth: {
      issuer: 'https://idp.example.com',
      idpLoginUrl: 'https://idp.example.com/auth',
      roleClaim: 'roles',
      tenantClaim: 'tenantId',
      appClaim: 'appId'
    }
  }
}));

describe('IDP Redirect Utilities', () => {
  describe('createIdpRedirectUrl', () => {
    it('should create basic redirect URL with return URL', () => {
      const options = {
        returnUrl: 'https://app.example.com/callback'
      };

      const result = createIdpRedirectUrl(options);
      const url = new URL(result);

      expect(url.origin + url.pathname).toBe('https://idp.example.com/auth');
      expect(url.searchParams.get('return')).toBe('https://app.example.com/callback');
      expect(url.searchParams.get('appId')).toBe('cmfka688r0001b77ofpgm57ix'); // Default ReTree Hawaii appId
    });

    it('should include custom appId when provided', () => {
      const options = {
        returnUrl: 'https://app.example.com/callback',
        appId: 'custom-app-id'
      };

      const result = createIdpRedirectUrl(options);
      const url = new URL(result);

      expect(url.searchParams.get('appId')).toBe('custom-app-id');
    });

    it('should include state parameter with mode and tenantId', () => {
      const options = {
        returnUrl: 'https://app.example.com/callback',
        appId: 'custom-app-id',
        mode: 'compose',
        tenantId: 'tenant-123'
      };

      const result = createIdpRedirectUrl(options);
      const url = new URL(result);

      const state = JSON.parse(url.searchParams.get('state') || '{}');
      expect(state).toEqual({
        mode: 'compose',
        tenantId: 'tenant-123'
      });
    });

    it('should handle mode without tenantId', () => {
      const options = {
        returnUrl: 'https://app.example.com/callback',
        mode: 'admin'
      };

      const result = createIdpRedirectUrl(options);
      const url = new URL(result);

      const state = JSON.parse(url.searchParams.get('state') || '{}');
      expect(state).toEqual({
        mode: 'admin',
        tenantId: undefined
      });
    });

    it('should handle tenantId without mode', () => {
      const options = {
        returnUrl: 'https://app.example.com/callback',
        tenantId: 'tenant-456'
      };

      const result = createIdpRedirectUrl(options);
      const url = new URL(result);

      const state = JSON.parse(url.searchParams.get('state') || '{}');
      expect(state).toEqual({
        mode: undefined,
        tenantId: 'tenant-456'
      });
    });

    it('should fallback to issuer when idpLoginUrl is not set', () => {
      const options = {
        returnUrl: 'https://app.example.com/callback'
      };

      const result = createIdpRedirectUrl(options);
      const url = new URL(result);
      
      // Should use the mocked idpLoginUrl
      expect(url.origin + url.pathname).toBe('https://idp.example.com/auth');
    });
  });

  describe('checkAuthentication', () => {
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        headers: {},
        jwtVerify: vi.fn(),
        userContext: null
      };
    });

    it('should return unauthenticated when no auth header', async () => {
      const result = await checkAuthentication(mockRequest);

      expect(result).toEqual({
        isAuthenticated: false,
        userContext: null
      });
    });

    it('should return unauthenticated when auth header is not Bearer', async () => {
      mockRequest.headers.authorization = 'Basic dXNlcjpwYXNz';

      const result = await checkAuthentication(mockRequest);

      expect(result).toEqual({
        isAuthenticated: false,
        userContext: null
      });
    });

    it('should return unauthenticated when auth header is malformed', async () => {
      mockRequest.headers.authorization = 'Bearer';

      const result = await checkAuthentication(mockRequest);

      expect(result).toEqual({
        isAuthenticated: false,
        userContext: null
      });
    });

    it('should return authenticated when JWT verification succeeds', async () => {
      mockRequest.headers.authorization = 'Bearer valid.jwt.token';
      mockRequest.user = {
        sub: 'user@example.com',
        roles: ['tenant_admin'],  // Default role claim key
        tenantId: 'tenant-123'    // Default tenant claim key
      };
      mockRequest.jwtVerify.mockResolvedValueOnce(undefined);

      const result = await checkAuthentication(mockRequest);

      expect(result).toEqual({
        isAuthenticated: true,
        userContext: {
          sub: 'user@example.com',
          roles: ['tenant_admin'],
          tenantId: 'tenant-123',
          appId: undefined
        }
      });

      expect(mockRequest.jwtVerify).toHaveBeenCalledOnce();
    });

    it('should return unauthenticated when JWT verification fails', async () => {
      mockRequest.headers.authorization = 'Bearer invalid.jwt.token';
      mockRequest.jwtVerify.mockRejectedValueOnce(new Error('Invalid token'));

      const result = await checkAuthentication(mockRequest);

      expect(result).toEqual({
        isAuthenticated: false,
        userContext: null
      });

      expect(mockRequest.jwtVerify).toHaveBeenCalledOnce();
    });

    it('should handle Authorization header with capital A', async () => {
      mockRequest.headers.Authorization = 'Bearer valid.jwt.token';
      mockRequest.user = { sub: 'user@example.com', roles: [] };
      mockRequest.jwtVerify.mockResolvedValueOnce(undefined);

      const result = await checkAuthentication(mockRequest);

      expect(result.isAuthenticated).toBe(true);
    });

    it('should return null userContext when not set after successful verification', async () => {
      mockRequest.headers.authorization = 'Bearer valid.jwt.token';
      mockRequest.user = {}; // Empty user object - no user context data
      mockRequest.jwtVerify.mockResolvedValueOnce(undefined);

      const result = await checkAuthentication(mockRequest);

      expect(result).toEqual({
        isAuthenticated: true,
        userContext: null
      });
    });
  });
});