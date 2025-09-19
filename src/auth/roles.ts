import { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { getPrisma } from '../db/prisma.js';

export type UserRole = 'editor' | 'tenant_admin' | 'superadmin';

export interface UserContext {
  sub: string;
  roles: UserRole[];
  tenantId?: string;
  appId?: string;
}

export async function extractUser(payload: any): Promise<UserContext | null> {
  if (!payload) return null;
  const roleClaim = payload[config.auth.roleClaim];
  const roles: UserRole[] = Array.isArray(roleClaim) ? roleClaim : (typeof roleClaim === 'string' ? roleClaim.split(/[ ,]/).filter(Boolean) : []);
  let tenantId = payload[config.auth.tenantClaim];
  const appId = payload[config.auth.appClaim];
  
  // CRITICAL: If no tenantId in token but appId present, lookup tenantId from app
  // This matches the logic in /me endpoint to ensure consistent tenant resolution
  if (!tenantId && appId) {
    try {
      const { getPrisma } = await import('../db/prisma.js');
      const prisma = getPrisma();
      const app = await prisma.app.findUnique({ where: { id: appId } });
      if (app) {
        tenantId = app.tenantId;
        console.log('[AUTH-DEBUG] Resolved tenantId from appId:', { appId, resolvedTenantId: tenantId });
      }
    } catch (error) {
      console.error('[AUTH-DEBUG] Failed to resolve tenantId from appId:', error);
    }
  }
  
  return { sub: payload.sub, roles: roles as UserRole[], tenantId, appId };
}

export function hasRole(user: UserContext | null, role: UserRole) {
  return !!user && user.roles.includes(role);
}

export function requireRole(user: UserContext | null, roles: UserRole[]) {
  if (!user) return false;
  return roles.some(r => user.roles.includes(r));
}

export function effectiveTenantScope(user: UserContext | null, requestedTenantId?: string) {
  if (!user) return null;
  if (hasRole(user, 'superadmin')) return requestedTenantId || null;
  if (hasRole(user, 'tenant_admin') || hasRole(user, 'editor')) return user.tenantId || null;
  return null;
}

export function hasEffectiveTenantAdminRole(user: UserContext | null): boolean {
  if (!user) return false;
  
  // Direct tenant admin role
  if (hasRole(user, 'tenant_admin')) {
    return true;
  }
  
  // Superadmin role only when they have a tenantId (in tenant context)
  if (hasRole(user, 'superadmin') && user.tenantId) {
    return true;
  }
  
  // Special case: when auth is disabled, superadmin gets full access
  if (hasRole(user, 'superadmin') && user.sub === 'system') {
    return true;
  }
  
  return false;
}
