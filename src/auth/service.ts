import { FastifyRequest, FastifyReply } from 'fastify';
import { flags } from '../config.js';
import { extractUser, UserContext, UserRole, hasRole } from './roles.js';

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

    // Manually handle JWT verification without sending response
    try {
      await (request as any).jwtVerify();
      // Extract user context from verified JWT using proper role claim extraction
      return await extractUser((request as any).user);
    } catch (error) {
      // Authentication failed, return null without sending response
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
  static async requireRole(request: FastifyRequest, reply: FastifyReply, roles: UserRole | UserRole[]): Promise<UserContext | null> {
    const userContext = await this.requireAuth(request, reply);
    if (!userContext) return null; // Response already sent by requireAuth
    
    const roleArray = Array.isArray(roles) ? roles : [roles];
    
    if (!userContext.roles.some(role => roleArray.includes(role))) {
      reply.forbidden();
      return null;
    }
    
    return userContext;
  }

  /**
   * Create middleware that requires specific role(s)
   * Returns a Fastify preHandler middleware function
   */
  static requireRoleMiddleware(roles: string | string[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          return reply.code(401).send({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.slice(7);
        await (request as any).jwtVerify();
        
        // Extract user context from token (extractUser handles tenantId resolution)
        const userContext = await extractUser(request);
        
        if (!userContext) {
          return reply.code(401).send({ error: 'Invalid token' });
        }

        if (!userContext.roles.some((role: string) => roleArray.includes(role))) {
          return reply.code(403).send({ error: 'Insufficient permissions' });
        }

        (request as any).userContext = userContext;
      } catch (error) {
        return reply.code(401).send({ error: 'Invalid token' });
      }
    };
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