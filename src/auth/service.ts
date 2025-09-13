import { FastifyRequest, FastifyReply } from 'fastify';
import { flags } from '../config.js';
import { UserContext, UserRole, hasRole } from './roles.js';

/**
 * Centralized authentication service that handles both authenticated and bypass modes
 */
export class AuthService {
  /**
   * Get user context - either from authentication or system bypass
   */
  static async getUserContext(request: FastifyRequest, reply: FastifyReply): Promise<UserContext | null> {
    if (flags.disableAuth) {
      // In development mode with auth disabled, return system superadmin context
      return {
        sub: 'system',
        roles: ['superadmin'] as UserRole[],
        tenantId: undefined,
        appId: undefined
      };
    }

    // Use the existing authenticate decorator
    try {
      await (request.server as any).authenticate(request, reply);
      return (request as any).userContext;
    } catch (error) {
      // Authentication failed, return null
      return null;
    }
  }

  /**
   * Require authentication and return user context
   * If auth is disabled, returns system superadmin context
   * If auth fails, sends 401 response and returns null
   */
  static async requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<UserContext | null> {
    const userContext = await this.getUserContext(request, reply);
    
    if (!userContext && !flags.disableAuth) {
      reply.unauthorized();
      return null;
    }
    
    return userContext;
  }

  /**
   * Require specific role(s)
   * If auth is disabled, returns system superadmin context (which has all roles)
   * If user doesn't have required role, sends 403 response and returns null
   */
  static async requireRole(
    request: FastifyRequest, 
    reply: FastifyReply, 
    requiredRole: UserRole | UserRole[]
  ): Promise<UserContext | null> {
    const userContext = await this.requireAuth(request, reply);
    
    if (!userContext) {
      return null; // Auth already failed, response sent
    }

    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    const hasRequiredRole = roles.some(role => hasRole(userContext, role));
    
    if (!hasRequiredRole) {
      reply.forbidden();
      return null;
    }
    
    return userContext;
  }

  /**
   * Check if user has specific role without throwing
   */
  static checkRole(userContext: UserContext | null, role: UserRole): boolean {
    return hasRole(userContext, role);
  }

  /**
   * Get effective user context for service layer calls
   * Returns null when auth is disabled (service layer should treat as superadmin)
   */
  static getServiceContext(userContext: UserContext | null): UserContext | null {
    if (flags.disableAuth) {
      return null; // Service layer treats null as superadmin when auth disabled
    }
    return userContext;
  }
}