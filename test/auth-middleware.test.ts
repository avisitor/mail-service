import { describe, it, expect } from 'vitest';
import { policies, authorize } from '../src/auth/middleware.js';
import { UserContext } from '../src/auth/roles.js';

describe('Unified Auth Middleware', () => {
  describe('Authorization Policies', () => {
    const superadmin: UserContext = {
      sub: 'super@example.com',
      roles: ['superadmin'],
      tenantId: undefined,
      appId: undefined
    };

    const tenantAdmin: UserContext = {
      sub: 'admin@example.com',
      roles: ['tenant_admin'],
      tenantId: 'tenant-1',
      appId: 'app-1'
    };

    const editor: UserContext = {
      sub: 'editor@example.com',
      roles: ['editor'],
      tenantId: 'tenant-1',
      appId: 'app-1'
    };

    describe('authenticated policy', () => {
      it('should allow any authenticated user', () => {
        expect(authorize(superadmin, policies.authenticated)).toBe(true);
        expect(authorize(tenantAdmin, policies.authenticated)).toBe(true);
        expect(authorize(editor, policies.authenticated)).toBe(true);
      });

      it('should deny unauthenticated user', () => {
        expect(authorize(null, policies.authenticated)).toBe(false);
      });
    });

    describe('superadmin policy', () => {
      it('should only allow superadmin', () => {
        expect(authorize(superadmin, policies.superadmin)).toBe(true);
        expect(authorize(tenantAdmin, policies.superadmin)).toBe(false);
        expect(authorize(editor, policies.superadmin)).toBe(false);
        expect(authorize(null, policies.superadmin)).toBe(false);
      });
    });

    describe('tenantAdmin policy', () => {
      it('should allow superadmin and tenant admin', () => {
        expect(authorize(superadmin, policies.tenantAdmin)).toBe(true);
        expect(authorize(tenantAdmin, policies.tenantAdmin)).toBe(true);
        expect(authorize(editor, policies.tenantAdmin)).toBe(false);
        expect(authorize(null, policies.tenantAdmin)).toBe(false);
      });
    });

    describe('tenantAccess policy', () => {
      it('should allow superadmin to access any tenant', () => {
        expect(authorize(superadmin, policies.tenantAccess, { tenantId: 'any-tenant' })).toBe(true);
      });

      it('should allow users to access their own tenant', () => {
        expect(authorize(tenantAdmin, policies.tenantAccess, { tenantId: 'tenant-1' })).toBe(true);
        expect(authorize(editor, policies.tenantAccess, { tenantId: 'tenant-1' })).toBe(true);
      });

      it('should deny users access to other tenants', () => {
        expect(authorize(tenantAdmin, policies.tenantAccess, { tenantId: 'other-tenant' })).toBe(false);
        expect(authorize(editor, policies.tenantAccess, { tenantId: 'other-tenant' })).toBe(false);
      });

      it('should deny access without tenant context', () => {
        expect(authorize(tenantAdmin, policies.tenantAccess)).toBe(false);
        expect(authorize(tenantAdmin, policies.tenantAccess, {})).toBe(false);
      });
    });

    describe('tenantWrite policy', () => {
      it('should allow superadmin to write to any tenant', () => {
        expect(authorize(superadmin, policies.tenantWrite, { tenantId: 'any-tenant' })).toBe(true);
      });

      it('should allow tenant admin to write to their tenant', () => {
        expect(authorize(tenantAdmin, policies.tenantWrite, { tenantId: 'tenant-1' })).toBe(true);
      });

      it('should deny editor write access even to their own tenant', () => {
        expect(authorize(editor, policies.tenantWrite, { tenantId: 'tenant-1' })).toBe(false);
      });

      it('should deny tenant admin write to other tenants', () => {
        expect(authorize(tenantAdmin, policies.tenantWrite, { tenantId: 'other-tenant' })).toBe(false);
      });
    });
  });

  describe('Debug Logging', () => {
    it('should log authorization decisions when DEBUG_AUTH is enabled', () => {
      const consoleLogs: any[] = [];
      const originalLog = console.log;
      console.log = (...args) => consoleLogs.push(args);

      // Temporarily enable debug auth
      const originalDebugAuth = process.env.DEBUG_AUTH;
      process.env.DEBUG_AUTH = 'true';

      const user: UserContext = {
        sub: 'test@example.com',
        roles: ['tenant_admin'],
        tenantId: 'tenant-1',
        appId: 'app-1'
      };

      authorize(user, policies.tenantAccess, { tenantId: 'tenant-1' }, 'test-context');

      // Restore
      console.log = originalLog;
      process.env.DEBUG_AUTH = originalDebugAuth;

      // Should have logged the authorization decision
      expect(consoleLogs.length).toBeGreaterThan(0);
      const logEntry = consoleLogs.find(log => 
        log[0]?.includes?.('[AUTH-CHECK]') && log[0]?.includes?.('test-context')
      );
      expect(logEntry).toBeDefined();
    });
  });
});