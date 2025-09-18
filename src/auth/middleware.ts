/**
 * Unified Authentication and Authorization Middleware
 * 
 * This module provides consistent authentication and authorization patterns
 * across all routes in the mail-service application.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { hasRole, UserContext, UserRole } from './roles.js';
import { flags } from '../config.js';

// Standardized authentication hook
export const authHook = (app: FastifyInstance) => ({
  preHandler: (req: FastifyRequest, reply: FastifyReply) => app.authenticate(req, reply)
});

// Authorization policies
export interface AuthPolicy {
  name: string;
  check: (user: UserContext | null, context?: any) => boolean;
  description: string;
}

export const policies = {
  // Anyone authenticated
  authenticated: {
    name: 'authenticated',
    check: (user: UserContext | null) => !!user,
    description: 'User must be authenticated'
  } as AuthPolicy,

  // Superadmin only
  superadmin: {
    name: 'superadmin',
    check: (user: UserContext | null) => hasRole(user, 'superadmin'),
    description: 'User must be superadmin'
  } as AuthPolicy,

  // Tenant admin or superadmin
  tenantAdmin: {
    name: 'tenantAdmin',
    check: (user: UserContext | null) => 
      hasRole(user, 'superadmin') || hasRole(user, 'tenant_admin'),
    description: 'User must be tenant admin or superadmin'
  } as AuthPolicy,

  // Access to specific tenant (superadmin or user's tenant matches)
  tenantAccess: {
    name: 'tenantAccess',
    check: (user: UserContext | null, context?: { tenantId: string }) => {
      if (!context?.tenantId) return false;
      return hasRole(user, 'superadmin') || user?.tenantId === context.tenantId;
    },
    description: 'User must be superadmin or have access to the specified tenant'
  } as AuthPolicy,

  // Write access to tenant (superadmin or tenant admin for that tenant)
  tenantWrite: {
    name: 'tenantWrite', 
    check: (user: UserContext | null, context?: { tenantId: string }) => {
      if (!context?.tenantId) return false;
      if (hasRole(user, 'superadmin')) return true;
      return hasRole(user, 'tenant_admin') && user?.tenantId === context.tenantId;
    },
    description: 'User must be superadmin or tenant admin for the specified tenant'
  } as AuthPolicy
};

// Authorization checker function
export function authorize(
  user: UserContext | null, 
  policy: AuthPolicy, 
  context?: any,
  debugContext?: string
): boolean {
  const result = policy.check(user, context);
  
  // Optional debug logging
  if (process.env.DEBUG_AUTH?.toLowerCase() === 'true' || process.env.LOG_LEVEL === 'DEBUG') {
    console.log(`[AUTH-CHECK] ${debugContext || 'Unknown'}:`, {
      policy: policy.name,
      user: user?.sub,
      userRoles: user?.roles,
      userTenantId: user?.tenantId,
      context,
      result,
      description: policy.description
    });
  }
  
  return result;
}

// Convenience function for route handlers
export function requireAuth(
  req: FastifyRequest, 
  reply: FastifyReply, 
  policy: AuthPolicy, 
  context?: any,
  debugContext?: string
): UserContext {
  // If auth is disabled, return system superadmin context
  if (flags.disableAuth) {
    return {
      sub: 'system',
      roles: ['superadmin'] as UserRole[],
      tenantId: undefined,
      appId: undefined
    };
  }
  
  // @ts-ignore
  const user = req.userContext as UserContext | null;
  
  if (!authorize(user, policy, context, debugContext)) {
    const error = new Error(`Access denied: ${policy.description}`);
    console.warn(`[AUTH-DENIED] ${debugContext || req.url}:`, {
      policy: policy.name,
      user: user?.sub,
      userRoles: user?.roles,
      userTenantId: user?.tenantId,
      context
    });
    reply.forbidden();
    throw error;
  }
  
  return user!;
}

// Helper to extract tenant ID from route params
export function getTenantIdFromParams(req: FastifyRequest): string | undefined {
  const params = req.params as any;
  return params?.tenantId;
}