import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  extractUser, 
  hasRole, 
  requireRole, 
  effectiveTenantScope, 
  UserContext, 
  UserRole 
} from '../src/auth/roles.js';

// Mock the prisma module
const mockApp = { tenantId: 'tenant-123' };
const mockPrisma = {
  app: {
    findUnique: vi.fn()
  }
};

vi.mock('../src/db/prisma.js', () => ({
  getPrisma: () => mockPrisma
}));

vi.mock('../src/config.js', () => ({
  config: {
    auth: {
      roleClaim: 'roles',
      tenantClaim: 'tenantId', 
      appClaim: 'appId'
    }
  }
}));

describe('Auth Roles Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractUser', () => {
    it('should return null for null payload', async () => {
      const result = await extractUser(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined payload', async () => {
      const result = await extractUser(undefined);
      expect(result).toBeNull();
    });

    it('should extract user context with all fields present', async () => {
      const payload = {
        sub: 'user@example.com',
        roles: ['tenant_admin'],
        tenantId: 'tenant-123',
        appId: 'app-456'
      };

      const result = await extractUser(payload);
      
      expect(result).toEqual({
        sub: 'user@example.com',
        roles: ['tenant_admin'],
        tenantId: 'tenant-123',
        appId: 'app-456'
      });
    });

    it('should handle string roles with comma separation', async () => {
      const payload = {
        sub: 'user@example.com',
        roles: 'tenant_admin,editor',
        tenantId: 'tenant-123'
      };

      const result = await extractUser(payload);
      
      expect(result?.roles).toEqual(['tenant_admin', 'editor']);
    });

    it('should handle string roles with space separation', async () => {
      const payload = {
        sub: 'user@example.com',
        roles: 'tenant_admin editor',
        tenantId: 'tenant-123'
      };

      const result = await extractUser(payload);
      
      expect(result?.roles).toEqual(['tenant_admin', 'editor']);
    });

    it('should default to empty roles for non-string/non-array', async () => {
      const payload = {
        sub: 'user@example.com',
        roles: null,
        tenantId: 'tenant-123'
      };

      const result = await extractUser(payload);
      
      expect(result?.roles).toEqual([]);
    });

    it('should resolve tenantId from appId when tenantId is missing', async () => {
      mockPrisma.app.findUnique.mockResolvedValueOnce(mockApp);

      const payload = {
        sub: 'user@example.com',
        roles: ['tenant_admin'],
        appId: 'app-456'
        // No tenantId
      };

      const result = await extractUser(payload);
      
      expect(result).toEqual({
        sub: 'user@example.com',
        roles: ['tenant_admin'],
        tenantId: 'tenant-123', // Resolved from app
        appId: 'app-456'
      });

      expect(mockPrisma.app.findUnique).toHaveBeenCalledWith({
        where: { id: 'app-456' }
      });
    });

    it('should handle database lookup failure gracefully', async () => {
      mockPrisma.app.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const payload = {
        sub: 'user@example.com',
        roles: ['tenant_admin'],
        appId: 'app-456'
      };

      const result = await extractUser(payload);
      
      expect(result).toEqual({
        sub: 'user@example.com',
        roles: ['tenant_admin'],
        tenantId: undefined, // Not resolved due to error
        appId: 'app-456'
      });
    });

    it('should handle app not found in database', async () => {
      mockPrisma.app.findUnique.mockResolvedValueOnce(null);

      const payload = {
        sub: 'user@example.com',
        roles: ['tenant_admin'],
        appId: 'invalid-app-456'
      };

      const result = await extractUser(payload);
      
      expect(result).toEqual({
        sub: 'user@example.com',
        roles: ['tenant_admin'],
        tenantId: undefined, // Not found
        appId: 'invalid-app-456'
      });
    });
  });

  describe('hasRole', () => {
    it('should return false for null user', () => {
      expect(hasRole(null, 'superadmin')).toBe(false);
    });

    it('should return true when user has the role', () => {
      const user: UserContext = {
        sub: 'user@example.com',
        roles: ['tenant_admin', 'editor'],
        tenantId: 'tenant-123'
      };

      expect(hasRole(user, 'tenant_admin')).toBe(true);
      expect(hasRole(user, 'editor')).toBe(true);
    });

    it('should return false when user does not have the role', () => {
      const user: UserContext = {
        sub: 'user@example.com',
        roles: ['editor'],
        tenantId: 'tenant-123'
      };

      expect(hasRole(user, 'superadmin')).toBe(false);
      expect(hasRole(user, 'tenant_admin')).toBe(false);
    });
  });

  describe('requireRole', () => {
    it('should return false for null user', () => {
      expect(requireRole(null, ['superadmin'])).toBe(false);
    });

    it('should return true when user has any of the required roles', () => {
      const user: UserContext = {
        sub: 'user@example.com',
        roles: ['editor'],
        tenantId: 'tenant-123'
      };

      expect(requireRole(user, ['tenant_admin', 'editor'])).toBe(true);
    });

    it('should return false when user has none of the required roles', () => {
      const user: UserContext = {
        sub: 'user@example.com',
        roles: ['editor'],
        tenantId: 'tenant-123'
      };

      expect(requireRole(user, ['superadmin', 'tenant_admin'])).toBe(false);
    });

    it('should return true for superadmin even if not explicitly listed', () => {
      const user: UserContext = {
        sub: 'admin@example.com',
        roles: ['superadmin'],
        tenantId: 'tenant-123'
      };

      expect(requireRole(user, ['tenant_admin'])).toBe(false); // superadmin != tenant_admin
      expect(requireRole(user, ['superadmin', 'tenant_admin'])).toBe(true);
    });
  });

  describe('effectiveTenantScope', () => {
    it('should return null for null user', () => {
      expect(effectiveTenantScope(null)).toBeNull();
      expect(effectiveTenantScope(null, 'tenant-123')).toBeNull();
    });

    it('should return requested tenantId for superadmin', () => {
      const superadmin: UserContext = {
        sub: 'admin@example.com',
        roles: ['superadmin'],
        tenantId: 'admin-tenant'
      };

      expect(effectiveTenantScope(superadmin, 'tenant-123')).toBe('tenant-123');
      expect(effectiveTenantScope(superadmin)).toBeNull();
    });

    it('should return user tenantId for tenant_admin', () => {
      const tenantAdmin: UserContext = {
        sub: 'admin@example.com',
        roles: ['tenant_admin'],
        tenantId: 'tenant-123'
      };

      expect(effectiveTenantScope(tenantAdmin, 'other-tenant')).toBe('tenant-123');
      expect(effectiveTenantScope(tenantAdmin)).toBe('tenant-123');
    });

    it('should return user tenantId for editor', () => {
      const editor: UserContext = {
        sub: 'editor@example.com',
        roles: ['editor'],
        tenantId: 'tenant-123'
      };

      expect(effectiveTenantScope(editor, 'other-tenant')).toBe('tenant-123');
      expect(effectiveTenantScope(editor)).toBe('tenant-123');
    });

    it('should return null for user without tenant access roles', () => {
      const user: UserContext = {
        sub: 'user@example.com',
        roles: ['unknown_role' as UserRole],
        tenantId: 'tenant-123'
      };

      expect(effectiveTenantScope(user, 'tenant-123')).toBeNull();
    });

    it('should return null when user tenantId is missing', () => {
      const user: UserContext = {
        sub: 'user@example.com',
        roles: ['tenant_admin'],
        tenantId: undefined
      };

      expect(effectiveTenantScope(user, 'tenant-123')).toBeNull();
    });
  });
});