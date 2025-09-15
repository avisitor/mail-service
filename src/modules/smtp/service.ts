import { getPrisma, isPrismaDisabled } from '../../db/prisma.js';
import { SmtpConfigInput, SmtpConfigOutput, ResolvedSmtpConfig } from './types.js';
import { config } from '../../config.js';
import crypto from 'crypto';

// Simple encryption for sensitive fields (in production, use proper key management)
const ENCRYPTION_KEY = process.env.SMTP_ENCRYPTION_KEY || 'default-key-change-in-production-32b';
const ALGORITHM = 'aes-256-cbc';

function encrypt(text: string): string {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch {
    return text; // Fallback for development
  }
}

export function decrypt(text: string): string {
  if (!text || !text.includes(':')) return text;
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return text; // Fallback for development
  }
}

function maskSensitiveField(value?: string): string | undefined {
  if (!value) return value;
  if (value.length <= 4) return '****';
  return value.substring(0, 2) + '****' + value.substring(value.length - 2);
}

/**
 * Resolve SMTP configuration with hierarchical fallback:
 * 1. Try APP-level config (if appId provided)
 * 2. Fall back to TENANT-level config (if tenantId provided)
 * 3. Fall back to GLOBAL config
 * 4. Fall back to environment variables (current behavior)
 */
export async function resolveSmtpConfig(appId?: string): Promise<ResolvedSmtpConfig> {
  if (isPrismaDisabled()) {
    // Fallback to environment variables when Prisma is disabled
    return {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      user: config.smtp.user,
      pass: config.smtp.pass,
      fromAddress: config.smtp.fromDefault,
      fromName: config.smtp.fromName,
      service: 'smtp',
      resolvedFrom: 'GLOBAL',
      configId: 'env-fallback',
      isActive: true,
    };
  }

  const prisma = getPrisma();

  // If no appId provided, fall back to GLOBAL/ENV
  if (!appId) {
    const globalConfig = await prisma.smtpConfig.findFirst({
      where: { scope: 'GLOBAL', isActive: true },
    });
    if (globalConfig) {
      return {
        host: globalConfig.host,
        port: globalConfig.port,
        secure: globalConfig.secure,
        user: globalConfig.user || undefined,
        pass: globalConfig.pass ? decrypt(globalConfig.pass) : undefined,
        fromAddress: globalConfig.fromAddress || undefined,
        fromName: globalConfig.fromName || undefined,
        service: globalConfig.service,
        awsRegion: globalConfig.awsRegion || undefined,
        awsAccessKey: globalConfig.awsAccessKey ? decrypt(globalConfig.awsAccessKey) : undefined,
        awsSecretKey: globalConfig.awsSecretKey ? decrypt(globalConfig.awsSecretKey) : undefined,
        resolvedFrom: 'GLOBAL',
        configId: globalConfig.id,
        isActive: globalConfig.isActive,
      };
    }
    
    // Final fallback to environment variables
    return {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      user: config.smtp.user,
      pass: config.smtp.pass,
      fromAddress: config.smtp.fromDefault,
      fromName: config.smtp.fromName,
      service: 'smtp',
      resolvedFrom: 'GLOBAL',
      configId: 'env-fallback',
      isActive: true,
    };
  }

  // Lookup app to get tenantId and resolve actual appId if clientId was passed
  let tenantId: string | undefined;
  let resolvedAppId = appId;
  
  try {
    let app = await prisma.app.findUnique({
      where: { id: appId },
      select: { tenantId: true, id: true }
    });
    
    if (!app) {
      // Try by clientId as fallback
      app = await prisma.app.findUnique({
        where: { clientId: appId },
        select: { tenantId: true, id: true }
      });
      if (app) {
        resolvedAppId = app.id; // Use the actual ID for further queries
      }
    }
    
    if (app) {
      tenantId = app.tenantId;
    } else {
      console.warn(`App not found: ${appId}`);
      // Fall back to GLOBAL config if app not found
      const globalConfig = await prisma.smtpConfig.findFirst({
        where: { scope: 'GLOBAL', isActive: true },
      });
      if (globalConfig) {
        return {
          host: globalConfig.host,
          port: globalConfig.port,
          secure: globalConfig.secure,
          user: globalConfig.user || undefined,
          pass: globalConfig.pass ? decrypt(globalConfig.pass) : undefined,
          fromAddress: globalConfig.fromAddress || undefined,
          fromName: globalConfig.fromName || undefined,
          service: globalConfig.service,
          awsRegion: globalConfig.awsRegion || undefined,
          awsAccessKey: globalConfig.awsAccessKey ? decrypt(globalConfig.awsAccessKey) : undefined,
          awsSecretKey: globalConfig.awsSecretKey ? decrypt(globalConfig.awsSecretKey) : undefined,
          resolvedFrom: 'GLOBAL',
          configId: globalConfig.id,
          isActive: globalConfig.isActive,
        };
      }
      
      // Final fallback to environment
      return {
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        user: config.smtp.user,
        pass: config.smtp.pass,
        fromAddress: config.smtp.fromDefault,
        fromName: config.smtp.fromName,
        service: 'smtp',
        resolvedFrom: 'GLOBAL',
        configId: 'env-fallback',
        isActive: true,
      };
    }
  } catch (error) {
    console.warn('Error looking up app:', error);
  }

  // Hierarchical resolution: APP → TENANT → GLOBAL → ENV

  // Try APP-level first
  const appConfig = await prisma.smtpConfig.findFirst({
    where: { scope: 'APP', appId: resolvedAppId, isActive: true },
  });
  if (appConfig) {
    return {
      host: appConfig.host,
      port: appConfig.port,
      secure: appConfig.secure,
      user: appConfig.user || undefined,
      pass: appConfig.pass ? decrypt(appConfig.pass) : undefined,
      fromAddress: appConfig.fromAddress || undefined,
      fromName: appConfig.fromName || undefined,
      service: appConfig.service,
      awsRegion: appConfig.awsRegion || undefined,
      awsAccessKey: appConfig.awsAccessKey ? decrypt(appConfig.awsAccessKey) : undefined,
      awsSecretKey: appConfig.awsSecretKey ? decrypt(appConfig.awsSecretKey) : undefined,
      resolvedFrom: 'APP',
      configId: appConfig.id,
      isActive: appConfig.isActive,
    };
  }

  // Try TENANT-level if we have a tenantId
  if (tenantId) {
    const tenantConfig = await prisma.smtpConfig.findFirst({
      where: { scope: 'TENANT', tenantId, isActive: true },
    });
    if (tenantConfig) {
      return {
        host: tenantConfig.host,
        port: tenantConfig.port,
        secure: tenantConfig.secure,
        user: tenantConfig.user || undefined,
        pass: tenantConfig.pass ? decrypt(tenantConfig.pass) : undefined,
        fromAddress: tenantConfig.fromAddress || undefined,
        fromName: tenantConfig.fromName || undefined,
        service: tenantConfig.service,
        awsRegion: tenantConfig.awsRegion || undefined,
        awsAccessKey: tenantConfig.awsAccessKey ? decrypt(tenantConfig.awsAccessKey) : undefined,
        awsSecretKey: tenantConfig.awsSecretKey ? decrypt(tenantConfig.awsSecretKey) : undefined,
        resolvedFrom: 'TENANT',
        configId: tenantConfig.id,
        isActive: tenantConfig.isActive,
      };
    }
  }

  // Try GLOBAL level
  const globalConfig = await prisma.smtpConfig.findFirst({
    where: { scope: 'GLOBAL', isActive: true },
  });
  if (globalConfig) {
    return {
      host: globalConfig.host,
      port: globalConfig.port,
      secure: globalConfig.secure,
      user: globalConfig.user || undefined,
      pass: globalConfig.pass ? decrypt(globalConfig.pass) : undefined,
      fromAddress: globalConfig.fromAddress || undefined,
      fromName: globalConfig.fromName || undefined,
      service: globalConfig.service,
      awsRegion: globalConfig.awsRegion || undefined,
      awsAccessKey: globalConfig.awsAccessKey ? decrypt(globalConfig.awsAccessKey) : undefined,
      awsSecretKey: globalConfig.awsSecretKey ? decrypt(globalConfig.awsSecretKey) : undefined,
      resolvedFrom: 'GLOBAL',
      configId: globalConfig.id,
      isActive: globalConfig.isActive,
    };
  }

  // Final fallback to environment variables
  return {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    user: config.smtp.user,
    pass: config.smtp.pass,
    fromAddress: config.smtp.fromDefault,
    fromName: config.smtp.fromName,
    service: 'smtp',
    resolvedFrom: 'GLOBAL',
    configId: 'env-fallback',
    isActive: true,
  };
}

/**
 * List SMTP configurations with access control
 */
export async function listSmtpConfigs(userContext: { roles: string[], tenantId?: string } | null): Promise<SmtpConfigOutput[]> {
  if (isPrismaDisabled()) {
    return [];
  }

  const prisma = getPrisma();
  // When auth is disabled (userContext is null), act as superadmin
  const isSuperAdmin = !userContext || userContext.roles.includes('superadmin');

  let whereClause: any = {};

  if (isSuperAdmin) {
    // Superadmins see all configs (including inactive global configs for management)
    // For global configs, show both active and inactive to allow activation switching
    // For tenant/app configs, only show active ones
    whereClause = {
      OR: [
        { scope: 'GLOBAL' }, // Show all global configs (active and inactive)
        { isActive: true }    // Show only active tenant/app configs
      ]
    };
  } else {
    // Non-superadmin users only see active configs in their scope
    whereClause = { isActive: true };
    
    // Tenant admins can see their own tenant/app configs + global configs (read-only)
    if (userContext?.tenantId) {
      whereClause = {
        ...whereClause,
        OR: [
          { scope: 'GLOBAL' },  // Allow tenant admins to see global configs (read-only)
          { scope: 'TENANT', tenantId: userContext.tenantId },
          { scope: 'APP', tenantId: userContext.tenantId },
        ],
      };
    } else {
      // User has no tenant context, can't see any configs
      return [];
    }
  }

  const configs = await prisma.smtpConfig.findMany({
    where: whereClause,
    include: {
      tenant: { select: { name: true } },
      app: { select: { name: true } },
    },
    orderBy: [
      { scope: 'asc' },
      { tenantId: 'asc' },
      { appId: 'asc' },
    ],
  });

  return configs.map(config => ({
    id: config.id,
    scope: config.scope as 'GLOBAL' | 'TENANT' | 'APP',
    tenantId: config.tenantId || undefined,
    appId: config.appId || undefined,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user || undefined,
    pass: config.pass ? maskSensitiveField(config.pass) : undefined,
    fromAddress: config.fromAddress || undefined,
    fromName: config.fromName || undefined,
    service: config.service,
    awsRegion: config.awsRegion || undefined,
    awsAccessKey: config.awsAccessKey ? maskSensitiveField(config.awsAccessKey) : undefined,
    awsSecretKey: config.awsSecretKey ? maskSensitiveField(config.awsSecretKey) : undefined,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    createdBy: config.createdBy || undefined,
    tenantName: config.tenant?.name,
    appName: config.app?.name,
  }));
}

/**
 * Get a specific SMTP configuration with access control
 */
export async function getSmtpConfig(id: string, userContext: { roles: string[], tenantId?: string } | null): Promise<SmtpConfigOutput | null> {
  if (isPrismaDisabled()) {
    return null;
  }

  const prisma = getPrisma();
  const config = await prisma.smtpConfig.findUnique({
    where: { id },
    include: {
      tenant: { select: { name: true } },
      app: { select: { name: true } },
    },
  });

  if (!config) return null;

  // Access control
  // When auth is disabled (userContext is null), act as superadmin
  const isSuperAdmin = !userContext || userContext.roles.includes('superadmin');
  if (!isSuperAdmin) {
    // Tenant admins can only access their own tenant/app configs
    if (config.scope === 'GLOBAL' || config.tenantId !== userContext?.tenantId) {
      return null;
    }
  }

  return {
    id: config.id,
    scope: config.scope as 'GLOBAL' | 'TENANT' | 'APP',
    tenantId: config.tenantId || undefined,
    appId: config.appId || undefined,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user || undefined,
    pass: config.pass ? maskSensitiveField(config.pass) : undefined,
    fromAddress: config.fromAddress || undefined,
    fromName: config.fromName || undefined,
    service: config.service,
    awsRegion: config.awsRegion || undefined,
    awsAccessKey: config.awsAccessKey ? maskSensitiveField(config.awsAccessKey) : undefined,
    awsSecretKey: config.awsSecretKey ? maskSensitiveField(config.awsSecretKey) : undefined,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    createdBy: config.createdBy || undefined,
    tenantName: config.tenant?.name,
    appName: config.app?.name,
  };
}

/**
 * Create SMTP configuration with access control
 */
export async function createSmtpConfig(input: SmtpConfigInput, userContext: { roles: string[], tenantId?: string, sub: string } | null): Promise<SmtpConfigOutput> {
  if (isPrismaDisabled()) {
    throw new Error('SMTP configuration management requires database access');
  }

  const prisma = getPrisma();
  // When auth is disabled (userContext is null), act as superadmin
  const isSuperAdmin = !userContext || userContext.roles.includes('superadmin');

  // Access control
  if (input.scope === 'GLOBAL' && !isSuperAdmin) {
    throw new Error('Only superadmins can create global SMTP configurations');
  }

  if (!isSuperAdmin) {
    // Tenant admins can only create configs for their own tenant
    if (input.scope === 'TENANT' && input.tenantId !== userContext?.tenantId) {
      throw new Error('Cannot create SMTP configuration for different tenant');
    }
    if (input.scope === 'APP') {
      if (!input.appId) {
        throw new Error('APP scope requires appId');
      }
      // Verify the app belongs to the user's tenant and get the tenantId
      const app = await prisma.app.findUnique({
        where: { id: input.appId },
        select: { tenantId: true },
      });
      if (!app) {
        // Try by clientId as fallback
        const appByClientId = await prisma.app.findUnique({
          where: { clientId: input.appId },
          select: { tenantId: true, id: true },
        });
        if (!appByClientId) {
          throw new Error('App not found');
        }
        // Update input to use the actual app ID
        input.appId = appByClientId.id;
        // Set tenantId from the app record
        input.tenantId = appByClientId.tenantId;
        
        if (appByClientId.tenantId !== userContext?.tenantId) {
          throw new Error('Cannot create SMTP configuration for app in different tenant');
        }
      } else {
        // Set tenantId from the app record
        input.tenantId = app.tenantId;
        
        if (app.tenantId !== userContext?.tenantId) {
          throw new Error('Cannot create SMTP configuration for app in different tenant');
        }
      }
    }
  } else {
    // For superadmins, still need to resolve tenantId for APP scope
    if (input.scope === 'APP' && input.appId && !input.tenantId) {
      const app = await prisma.app.findUnique({
        where: { id: input.appId },
        select: { tenantId: true },
      });
      if (!app) {
        // Try by clientId as fallback
        const appByClientId = await prisma.app.findUnique({
          where: { clientId: input.appId },
          select: { tenantId: true, id: true },
        });
        if (!appByClientId) {
          throw new Error('App not found');
        }
        input.appId = appByClientId.id;
        input.tenantId = appByClientId.tenantId;
      } else {
        input.tenantId = app.tenantId;
      }
    }
  }

  // Validate scope constraints
  if (input.scope === 'GLOBAL' && (input.tenantId || input.appId)) {
    throw new Error('Global scope cannot have tenantId or appId');
  }
  if (input.scope === 'TENANT' && (!input.tenantId || input.appId)) {
    throw new Error('Tenant scope requires tenantId and cannot have appId');
  }
  if (input.scope === 'APP' && !input.appId) {
    throw new Error('App scope requires appId');
  }
  // Note: tenantId is now automatically resolved for APP scope

  // Check for existing configuration at the same scope (except for GLOBAL which allows multiple)
  if (input.scope !== 'GLOBAL') {
    const existing = await prisma.smtpConfig.findFirst({
      where: {
        scope: input.scope,
        tenantId: input.tenantId || null,
        appId: input.appId || null,
      },
    });

    if (existing) {
      throw new Error(`SMTP configuration already exists for this ${input.scope.toLowerCase()} scope`);
    }
  }

  // Encrypt sensitive fields
  const data: any = {
    scope: input.scope,
    tenantId: input.tenantId || null,
    appId: input.appId || null,
    host: input.host,
    port: input.port || 587,
    secure: input.secure || false,
    user: input.user || null,
    pass: input.pass ? encrypt(input.pass) : null,
    fromAddress: input.fromAddress || null,
    fromName: input.fromName || null,
    service: input.service || 'smtp',
    awsRegion: input.awsRegion || null,
    awsAccessKey: input.awsAccessKey ? encrypt(input.awsAccessKey) : null,
    awsSecretKey: input.awsSecretKey ? encrypt(input.awsSecretKey) : null,
    isActive: input.isActive !== false,
    createdBy: userContext?.sub || 'system',
  };

  // If creating an active GLOBAL config, deactivate existing active global configs
  if (input.scope === 'GLOBAL' && data.isActive) {
    await prisma.smtpConfig.updateMany({
      where: { 
        scope: 'GLOBAL',
        isActive: true
      },
      data: { isActive: false }
    });
  }

  const config = await prisma.smtpConfig.create({
    data,
    include: {
      tenant: { select: { name: true } },
      app: { select: { name: true } },
    },
  });

  return {
    id: config.id,
    scope: config.scope as 'GLOBAL' | 'TENANT' | 'APP',
    tenantId: config.tenantId || undefined,
    appId: config.appId || undefined,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user || undefined,
    pass: config.pass ? maskSensitiveField(input.pass) : undefined,
    fromAddress: config.fromAddress || undefined,
    fromName: config.fromName || undefined,
    service: config.service,
    awsRegion: config.awsRegion || undefined,
    awsAccessKey: config.awsAccessKey ? maskSensitiveField(input.awsAccessKey) : undefined,
    awsSecretKey: config.awsSecretKey ? maskSensitiveField(input.awsSecretKey) : undefined,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    createdBy: config.createdBy || undefined,
    tenantName: config.tenant?.name,
    appName: config.app?.name,
  };
}

/**
 * Update SMTP configuration with access control
 */
export async function updateSmtpConfig(id: string, input: Partial<SmtpConfigInput>, userContext: { roles: string[], tenantId?: string, sub: string } | null): Promise<SmtpConfigOutput> {
  if (isPrismaDisabled()) {
    throw new Error('SMTP configuration management requires database access');
  }

  const prisma = getPrisma();
  const existing = await getSmtpConfig(id, userContext);
  
  if (!existing) {
    throw new Error('SMTP configuration not found or access denied');
  }

  // Encrypt sensitive fields if provided
  const updateData: any = {};
  
  if (input.host !== undefined) updateData.host = input.host;
  if (input.port !== undefined) updateData.port = input.port;
  if (input.secure !== undefined) updateData.secure = input.secure;
  if (input.user !== undefined) updateData.user = input.user;
  if (input.pass !== undefined) updateData.pass = input.pass ? encrypt(input.pass) : null;
  if (input.fromAddress !== undefined) updateData.fromAddress = input.fromAddress;
  if (input.fromName !== undefined) updateData.fromName = input.fromName;
  if (input.service !== undefined) updateData.service = input.service;
  if (input.awsRegion !== undefined) updateData.awsRegion = input.awsRegion;
  if (input.awsAccessKey !== undefined) updateData.awsAccessKey = input.awsAccessKey ? encrypt(input.awsAccessKey) : null;
  if (input.awsSecretKey !== undefined) updateData.awsSecretKey = input.awsSecretKey ? encrypt(input.awsSecretKey) : null;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  const config = await prisma.smtpConfig.update({
    where: { id },
    data: updateData,
    include: {
      tenant: { select: { name: true } },
      app: { select: { name: true } },
    },
  });

  return {
    id: config.id,
    scope: config.scope as 'GLOBAL' | 'TENANT' | 'APP',
    tenantId: config.tenantId || undefined,
    appId: config.appId || undefined,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user || undefined,
    pass: config.pass ? maskSensitiveField('****') : undefined,
    fromAddress: config.fromAddress || undefined,
    fromName: config.fromName || undefined,
    service: config.service,
    awsRegion: config.awsRegion || undefined,
    awsAccessKey: config.awsAccessKey ? maskSensitiveField('****') : undefined,
    awsSecretKey: config.awsSecretKey ? maskSensitiveField('****') : undefined,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    createdBy: config.createdBy || undefined,
    tenantName: config.tenant?.name,
    appName: config.app?.name,
  };
}

/**
 * Delete SMTP configuration with access control
 */
export async function deleteSmtpConfig(id: string, userContext: { roles: string[], tenantId?: string } | null): Promise<void> {
  if (isPrismaDisabled()) {
    throw new Error('SMTP configuration management requires database access');
  }

  const existing = await getSmtpConfig(id, userContext);
  
  if (!existing) {
    throw new Error('SMTP configuration not found or access denied');
  }

  const prisma = getPrisma();
  
  // Check if we're deleting an active global config
  const wasActiveGlobal = existing.isActive && existing.scope === 'GLOBAL';
  
  // Delete the config
  await prisma.smtpConfig.delete({
    where: { id },
  });
  
  // If we deleted an active global config, auto-activate another one
  if (wasActiveGlobal) {
    // Find another global config to activate
    const otherGlobalConfigs = await prisma.smtpConfig.findMany({
      where: {
        scope: 'GLOBAL',
        id: { not: id }, // Exclude the one we just deleted (though it shouldn't exist anymore)
      },
      orderBy: [
        { updatedAt: 'desc' }, // Prefer most recently updated
        { createdAt: 'desc' },  // Then most recently created
      ],
      take: 1, // Just get the first candidate
    });
    
    if (otherGlobalConfigs.length > 0) {
      const newActiveConfig = otherGlobalConfigs[0];
      
      // Activate the replacement config
      await prisma.smtpConfig.update({
        where: { id: newActiveConfig.id },
        data: { isActive: true },
      });
      
      console.log(`Auto-activated global SMTP config ${newActiveConfig.id} (${newActiveConfig.host}) after deleting active config ${id}`);
    } else {
      console.warn(`Deleted the last active global SMTP config ${id} - no replacement available`);
    }
  }
}

/**
 * Get the next configuration that would be activated if the specified config is deleted
 */
export async function getNextActiveConfig(excludeId: string, userContext: { roles: string[], tenantId?: string } | null): Promise<SmtpConfigOutput | null> {
  if (isPrismaDisabled()) {
    return null;
  }

  const prisma = getPrisma();
  
  // Find the next global config that would be activated (using same logic as delete)
  const candidates = await prisma.smtpConfig.findMany({
    where: {
      scope: 'GLOBAL',
      id: { not: excludeId },
    },
    orderBy: [
      { updatedAt: 'desc' }, // Prefer most recently updated
      { createdAt: 'desc' },  // Then most recently created
    ],
    take: 1,
    include: {
      tenant: { select: { name: true } },
      app: { select: { name: true } },
    },
  });

  if (candidates.length === 0) {
    return null;
  }

  const config = candidates[0];

  // Apply access control (same logic as getSmtpConfig)
  const isSuperAdmin = !userContext || userContext.roles.includes('superadmin');
  if (!isSuperAdmin) {
    if (config.scope === 'GLOBAL' || config.tenantId !== userContext?.tenantId) {
      return null;
    }
  }

  return {
    id: config.id,
    scope: config.scope as 'GLOBAL' | 'TENANT' | 'APP',
    tenantId: config.tenantId || undefined,
    appId: config.appId || undefined,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user || undefined,
    pass: config.pass ? maskSensitiveField(config.pass) : undefined,
    fromAddress: config.fromAddress || undefined,
    fromName: config.fromName || undefined,
    service: config.service,
    awsRegion: config.awsRegion || undefined,
    awsAccessKey: config.awsAccessKey ? maskSensitiveField(config.awsAccessKey) : undefined,
    awsSecretKey: config.awsSecretKey ? maskSensitiveField(config.awsSecretKey) : undefined,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    createdBy: config.createdBy || undefined,
    tenantName: config.tenant?.name,
    appName: config.app?.name,
  };
}

/**
 * Get effective configuration with inheritance information
 * This shows what config would be used and where it comes from
 */
export async function getEffectiveSmtpConfig(tenantId?: string, appId?: string): Promise<SmtpConfigOutput & { isInherited: boolean; inheritedFrom?: string }> {
  const resolved = await resolveSmtpConfig(appId);
  
  // If it's from env fallback, create a synthetic config object
  if (resolved.configId === 'env-fallback') {
    return {
      id: 'env-fallback',
      scope: 'GLOBAL',
      host: resolved.host,
      port: resolved.port,
      secure: resolved.secure,
      user: resolved.user,
      pass: resolved.pass ? maskSensitiveField(resolved.pass) : undefined,
      fromAddress: resolved.fromAddress,
      fromName: resolved.fromName,
      service: resolved.service,
      isActive: resolved.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
      isInherited: false,
      inheritedFrom: undefined,
    };
  }

  // Get the actual config with full details
  if (isPrismaDisabled()) {
    // Return synthetic config for disabled Prisma
    return {
      id: resolved.configId,
      scope: resolved.resolvedFrom,
      host: resolved.host,
      port: resolved.port,
      secure: resolved.secure,
      user: resolved.user,
      pass: resolved.pass ? maskSensitiveField(resolved.pass) : undefined,
      fromAddress: resolved.fromAddress,
      fromName: resolved.fromName,
      service: resolved.service,
      isActive: resolved.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
      isInherited: false,
    };
  }

  const prisma = getPrisma();
  const config = await prisma.smtpConfig.findUnique({
    where: { id: resolved.configId },
    include: {
      tenant: { select: { name: true } },
      app: { select: { name: true } },
    },
  });

  if (!config) {
    throw new Error('Resolved configuration not found');
  }

  // Determine if this is inherited
  let isInherited = false;
  let inheritedFrom: 'GLOBAL' | 'TENANT' | undefined;

  if (appId && resolved.resolvedFrom !== 'APP') {
    isInherited = true;
    inheritedFrom = resolved.resolvedFrom as 'GLOBAL' | 'TENANT';
  } else if (tenantId && !appId && resolved.resolvedFrom === 'GLOBAL') {
    isInherited = true;
    inheritedFrom = 'GLOBAL';
  }

  return {
    id: config.id,
    scope: config.scope as 'GLOBAL' | 'TENANT' | 'APP',
    tenantId: config.tenantId || undefined,
    appId: config.appId || undefined,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user || undefined,
    pass: config.pass ? maskSensitiveField(config.pass) : undefined,
    fromAddress: config.fromAddress || undefined,
    fromName: config.fromName || undefined,
    service: config.service,
    awsRegion: config.awsRegion || undefined,
    awsAccessKey: config.awsAccessKey ? maskSensitiveField(config.awsAccessKey) : undefined,
    awsSecretKey: config.awsSecretKey ? maskSensitiveField(config.awsSecretKey) : undefined,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    createdBy: config.createdBy || undefined,
    tenantName: config.tenant?.name,
    appName: config.app?.name,
    isInherited,
    inheritedFrom,
  };
}

/**
 * Activate a global SMTP configuration (deactivates all others)
 * Only superadmins can activate global configurations
 */
export async function activateGlobalSmtpConfig(
  configId: string, 
  userContext: { roles: string[], tenantId?: string, sub: string } | null
): Promise<{ success: boolean, message: string, activeConfig?: SmtpConfigOutput }> {
  if (isPrismaDisabled()) {
    throw new Error('SMTP configuration management requires database access');
  }

  const prisma = getPrisma();
  const isSuperAdmin = !userContext || userContext.roles.includes('superadmin');

  if (!isSuperAdmin) {
    throw new Error('Only superadmins can activate global SMTP configurations');
  }

  // Check if the config exists and is global scope
  const config = await prisma.smtpConfig.findUnique({
    where: { id: configId },
    include: { tenant: true, app: true }
  });

  if (!config) {
    throw new Error('SMTP configuration not found');
  }

  if (config.scope !== 'GLOBAL') {
    throw new Error('Only global SMTP configurations can be activated/deactivated');
  }

  if (config.isActive) {
    return {
      success: true,
      message: 'Configuration is already active',
      activeConfig: {
        id: config.id,
        scope: config.scope as 'GLOBAL' | 'TENANT' | 'APP',
        tenantId: config.tenantId || undefined,
        appId: config.appId || undefined,
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user || undefined,
        pass: config.pass ? maskSensitiveField(config.pass) : undefined,
        fromAddress: config.fromAddress || undefined,
        fromName: config.fromName || undefined,
        service: config.service,
        awsRegion: config.awsRegion || undefined,
        awsAccessKey: config.awsAccessKey ? maskSensitiveField(config.awsAccessKey) : undefined,
        awsSecretKey: config.awsSecretKey ? maskSensitiveField(config.awsSecretKey) : undefined,
        isActive: config.isActive,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        createdBy: config.createdBy || undefined,
        tenantName: config.tenant?.name,
        appName: config.app?.name,
      }
    };
  }

  // Use a transaction to ensure atomicity
  await prisma.$transaction(async (tx) => {
    // First, deactivate all other global configs
    await tx.smtpConfig.updateMany({
      where: { 
        scope: 'GLOBAL',
        isActive: true
      },
      data: { isActive: false }
    });

    // Then activate the selected config
    await tx.smtpConfig.update({
      where: { id: configId },
      data: { isActive: true }
    });
  });

  // Fetch the updated config to return
  const updatedConfig = await prisma.smtpConfig.findUnique({
    where: { id: configId },
    include: { tenant: true, app: true }
  });

  return {
    success: true,
    message: 'Global SMTP configuration activated successfully',
    activeConfig: updatedConfig ? {
      id: updatedConfig.id,
      scope: updatedConfig.scope as 'GLOBAL' | 'TENANT' | 'APP',
      tenantId: updatedConfig.tenantId || undefined,
      appId: updatedConfig.appId || undefined,
      host: updatedConfig.host,
      port: updatedConfig.port,
      secure: updatedConfig.secure,
      user: updatedConfig.user || undefined,
      pass: updatedConfig.pass ? maskSensitiveField(updatedConfig.pass) : undefined,
      fromAddress: updatedConfig.fromAddress || undefined,
      fromName: updatedConfig.fromName || undefined,
      service: updatedConfig.service,
      awsRegion: updatedConfig.awsRegion || undefined,
      awsAccessKey: updatedConfig.awsAccessKey ? maskSensitiveField(updatedConfig.awsAccessKey) : undefined,
      awsSecretKey: updatedConfig.awsSecretKey ? maskSensitiveField(updatedConfig.awsSecretKey) : undefined,
      isActive: updatedConfig.isActive,
      createdAt: updatedConfig.createdAt,
      updatedAt: updatedConfig.updatedAt,
      createdBy: updatedConfig.createdBy || undefined,
      tenantName: updatedConfig.tenant?.name,
      appName: updatedConfig.app?.name,
    } : undefined
  };
}