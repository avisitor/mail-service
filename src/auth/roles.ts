import { FastifyRequest } from 'fastify';
import { config } from '../config.js';

export type UserRole = 'editor' | 'tenant_admin' | 'superadmin';

export interface UserContext {
  sub: string;
  roles: UserRole[];
  tenantId?: string;
  appId?: string;
}

export function extractUser(req: any): UserContext | null {
  const payload: any = req.user;
  if (!payload) return null;
  const roleClaim = payload[config.auth.roleClaim];
  const roles: UserRole[] = Array.isArray(roleClaim) ? roleClaim : (typeof roleClaim === 'string' ? roleClaim.split(/[ ,]/).filter(Boolean) : []);
  const tenantId = payload[config.auth.tenantClaim];
  const appId = payload[config.auth.appClaim];
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
