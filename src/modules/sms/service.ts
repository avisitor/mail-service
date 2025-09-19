import { getPrisma, isPrismaDisabled } from '../../db/prisma.js';
import { SmsConfigInput, SmsConfigOutput, ResolvedSmsConfig } from './types.js';
import crypto from 'crypto';

// Simple encryption for sensitive fields (in production, use proper key management)
const ENCRYPTION_KEY_STRING = process.env.SMS_ENCRYPTION_KEY || 'default-key-change-in-production-32b';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

// Ensure key is exactly 32 bytes for AES-256
function getEncryptionKey(): Buffer {
  const keyStr = ENCRYPTION_KEY_STRING;
  if (keyStr.length === 32) {
    return Buffer.from(keyStr, 'utf8');
  } else if (keyStr.length > 32) {
    return Buffer.from(keyStr.slice(0, 32), 'utf8');
  } else {
    // Pad with zeros to reach 32 bytes
    return Buffer.concat([Buffer.from(keyStr, 'utf8'), Buffer.alloc(32 - keyStr.length)]);
  }
}

function encrypt(text: string): string {
  if (!text) return text;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
  if (!encryptedText) return encryptedText;
  
  // Check if this is new format with IV (contains ':')
  if (encryptedText.includes(':')) {
    try {
      const textParts = encryptedText.split(':');
      if (textParts.length !== 2) {
        throw new Error('Invalid format');
      }
      const iv = Buffer.from(textParts[0], 'hex');
      const encrypted = textParts[1];
      const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.warn('[SMS] Failed to decrypt with new method, trying legacy fallback:', error);
      // Fall through to legacy method
    }
  }
  
  // Legacy format - try old createDecipher simulation
  try {
    // Simulate the old createDecipher behavior with a fixed key
    const legacyKey = ENCRYPTION_KEY_STRING.slice(0, 32).padEnd(32, '0');
    
    // Try ECB mode (no IV) which is closest to createDecipher behavior
    const decipher = crypto.createDecipheriv('aes-256-ecb', Buffer.from(legacyKey, 'utf8'), null);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (ecbError) {
    // If ECB fails, try CBC with a zero IV (another createDecipher simulation)
    try {
      const legacyKey = ENCRYPTION_KEY_STRING.slice(0, 32).padEnd(32, '0');
      const zeroIv = Buffer.alloc(16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(legacyKey, 'utf8'), zeroIv);
      decipher.setAutoPadding(true);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (cbcError) {
      console.error('[SMS] Failed to decrypt with both ECB and CBC legacy methods:', { ecbError, cbcError });
      // If all methods fail, return original text (might be plain text)
      console.warn('[SMS] Returning original text as decryption failed');
      return encryptedText;
    }
  }
}

// Migration helper to detect and re-encrypt legacy data
function needsMigration(encryptedText: string): boolean {
  return Boolean(encryptedText && !encryptedText.includes(':'));
}

function migrateEncryption(plainText: string): string {
  // Re-encrypt using new format
  return encrypt(plainText);
}

interface UserContext {
  roles: string[];
  tenantId?: string;
}

/**
 * Resolves the active SMS configuration for the given context.
 * Follows hierarchy: APP > TENANT > GLOBAL
 */
export async function resolveSmsConfig(
  tenantId?: string,
  appId?: string,
  userContext?: UserContext
): Promise<ResolvedSmsConfig | null> {
  if (isPrismaDisabled()) {
    throw new Error('Database is disabled');
  }

  const prisma = getPrisma();

  // Access control
  if (userContext && !userContext.roles.includes('superadmin')) {
    if (!userContext.tenantId) {
      throw new Error('Access denied: No tenant context');
    }
    // Non-superadmin users can only access their own tenant's configs
    if (tenantId && tenantId !== userContext.tenantId) {
      throw new Error('Access denied: Cannot access other tenant configurations');
    }
    tenantId = userContext.tenantId;
  }

  try {
    let config = null;

    // 1. Try to find APP-level config first
    if (appId && tenantId) {
      config = await prisma.smsConfig.findFirst({
        where: {
          scope: 'APP',
          appId,
          tenantId,
          isActive: true,
        },
      });
    }

    // 2. If no APP config, try TENANT-level
    if (!config && tenantId) {
      config = await prisma.smsConfig.findFirst({
        where: {
          scope: 'TENANT',
          tenantId,
          isActive: true,
        },
      });
    }

    // 3. If no TENANT config, try GLOBAL
    if (!config) {
      config = await prisma.smsConfig.findFirst({
        where: {
          scope: 'GLOBAL',
          isActive: true,
        },
      });
    }

    if (!config) {
      return null;
    }

    // Decrypt sensitive fields
    return {
      id: config.id,
      scope: config.scope,
      tenantId: config.tenantId || undefined,
      appId: config.appId || undefined,
      accountSid: config.sid,
      authToken: decrypt(config.token),
      fromNumber: config.fromNumber,
      fallbackToNumber: config.fallbackTo || undefined,
      messagingServiceSid: config.serviceSid || undefined,
      isActive: config.isActive,
      source: config.scope,
    };
  } catch (error) {
    console.error('Error resolving SMS config:', error);
    throw error;
  }
}

/**
 * Lists SMS configurations based on user context and access control
 */
export async function listSmsConfigs(userContext?: UserContext): Promise<SmsConfigOutput[]> {
  if (isPrismaDisabled()) {
    throw new Error('Database is disabled');
  }

  const prisma = getPrisma();

  // Build where clause based on user access
  let where: any = {};

  if (userContext) {
    if (userContext.roles.includes('superadmin')) {
      // Superadmin can see all configs
      where = {};
    } else if (userContext.roles.includes('tenant_admin')) {
      if (!userContext.tenantId) {
        throw new Error('Tenant admin must have tenant context');
      }
      // Tenant admin can see global configs and their tenant's configs
      where = {
        OR: [
          { scope: 'GLOBAL' },
          { scope: 'TENANT', tenantId: userContext.tenantId },
          { scope: 'APP', app: { tenantId: userContext.tenantId } },
        ],
      };
    } else {
      // Regular users can only see global configs
      where = { scope: 'GLOBAL' };
    }
  } else {
    // No user context, only show global configs
    where = { scope: 'GLOBAL' };
  }

  const configs = await prisma.smsConfig.findMany({
    where,
    include: {
      tenant: { select: { id: true, name: true } },
      app: { select: { id: true, name: true } },
    },
    orderBy: [
      { scope: 'asc' },
      { createdAt: 'desc' },
    ],
  });

  return configs.map(config => ({
    id: config.id,
    scope: config.scope,
    tenantId: config.tenantId || undefined,
    appId: config.appId || undefined,
    tenantName: config.tenant?.name,
    appName: config.app?.name,
    sid: config.sid,
    token: config.token ? '***' : undefined, // Mask the token
    fromNumber: config.fromNumber,
    fallbackTo: config.fallbackTo || undefined,
    serviceSid: config.serviceSid || undefined,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt
  }));
}

/**
 * Creates a new SMS configuration
 */
export async function createSmsConfig(
  input: SmsConfigInput,
  userContext?: UserContext
): Promise<SmsConfigOutput> {
  if (isPrismaDisabled()) {
    throw new Error('Database is disabled');
  }

  const prisma = getPrisma();

  // Access control and validation
  if (input.scope === 'TENANT' || input.scope === 'APP') {
    if (!input.tenantId) {
      throw new Error('Tenant ID is required for TENANT and APP scope configurations');
    }

    if (userContext && !userContext.roles.includes('superadmin')) {
      if (userContext.tenantId !== input.tenantId) {
        throw new Error('Access denied: Cannot create configuration for other tenants');
      }
    }
  }

  if (input.scope === 'APP') {
    if (!input.appId) {
      throw new Error('App ID is required for APP scope configurations');
    }

    // Verify the app belongs to the specified tenant
    const app = await prisma.app.findFirst({
      where: { id: input.appId, tenantId: input.tenantId },
    });

    if (!app) {
      throw new Error('App not found or does not belong to the specified tenant');
    }
  }

  // If this config is set to active, deactivate others in the same scope/context
  if (input.isActive) {
    const deactivateWhere: any = {
      scope: input.scope,
      isActive: true,
    };

    if (input.scope === 'TENANT') {
      deactivateWhere.tenantId = input.tenantId;
    } else if (input.scope === 'APP') {
      deactivateWhere.appId = input.appId;
    }

    await prisma.smsConfig.updateMany({
      where: deactivateWhere,
      data: { isActive: false },
    });
  }

  const config = await prisma.smsConfig.create({
    data: {
      scope: input.scope,
      tenantId: input.tenantId || null,
      appId: input.appId || null,
      sid: input.accountSid,
      token: encrypt(input.authToken),
      fromNumber: input.fromNumber,
      fallbackTo: input.fallbackToNumber || null,
      serviceSid: input.messagingServiceSid || null,
      isActive: input.isActive || false,
      createdBy: userContext?.tenantId || 'system',
    },
    include: {
      tenant: { select: { id: true, name: true } },
      app: { select: { id: true, name: true } },
    },
  });

  return {
    id: config.id,
    scope: config.scope,
    tenantId: config.tenantId || undefined,
    appId: config.appId || undefined,
    tenantName: config.tenant?.name,
    appName: config.app?.name,
    sid: config.sid,
    token: '***', // Always mask in output
    fromNumber: config.fromNumber,
    fallbackTo: config.fallbackTo || undefined,
    serviceSid: config.serviceSid || undefined,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

/**
 * Updates an existing SMS configuration
 */
export async function updateSmsConfig(
  id: string,
  input: Partial<SmsConfigInput>,
  userContext?: UserContext
): Promise<SmsConfigOutput> {
  if (isPrismaDisabled()) {
    throw new Error('Database is disabled');
  }

  const prisma = getPrisma();

  // Check if config exists and user has access
  const existingConfig = await prisma.smsConfig.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, name: true } },
      app: { select: { id: true, name: true } },
    },
  });

  if (!existingConfig) {
    throw new Error('SMS configuration not found');
  }

  // Access control
  if (userContext && !userContext.roles.includes('superadmin')) {
    if (existingConfig.scope === 'TENANT' || existingConfig.scope === 'APP') {
      if (existingConfig.tenantId !== userContext.tenantId) {
        throw new Error('Access denied: Cannot modify configuration for other tenants');
      }
    } else if (existingConfig.scope === 'GLOBAL') {
      throw new Error('Access denied: Cannot modify global configurations');
    }
  }

  // If activating this config, deactivate others in the same scope/context
  if (input.isActive) {
    const deactivateWhere: any = {
      scope: existingConfig.scope,
      isActive: true,
      id: { not: id }, // Don't deactivate the config we're updating
    };

    if (existingConfig.scope === 'TENANT') {
      deactivateWhere.tenantId = existingConfig.tenantId;
    } else if (existingConfig.scope === 'APP') {
      deactivateWhere.appId = existingConfig.appId;
    }

    await prisma.smsConfig.updateMany({
      where: deactivateWhere,
      data: { isActive: false },
    });
  }

  // Prepare update data
  const updateData: any = {};
  
  if (input.accountSid !== undefined) updateData.sid = input.accountSid;
  if (input.authToken !== undefined) updateData.token = encrypt(input.authToken);
  if (input.fromNumber !== undefined) updateData.fromNumber = input.fromNumber;
  if (input.fallbackToNumber !== undefined) updateData.fallbackTo = input.fallbackToNumber || null;
  if (input.messagingServiceSid !== undefined) updateData.serviceSid = input.messagingServiceSid || null;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  const config = await prisma.smsConfig.update({
    where: { id },
    data: updateData,
    include: {
      tenant: { select: { id: true, name: true } },
      app: { select: { id: true, name: true } },
    },
  });

  return {
    id: config.id,
    scope: config.scope,
    tenantId: config.tenantId || undefined,
    appId: config.appId || undefined,
    tenantName: config.tenant?.name,
    appName: config.app?.name,
    sid: config.sid,
    token: '***', // Always mask in output
    fromNumber: config.fromNumber,
    fallbackTo: config.fallbackTo || undefined,
    serviceSid: config.serviceSid || undefined,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

/**
 * Deletes an SMS configuration
 */
export async function deleteSmsConfig(
  id: string,
  userContext?: UserContext
): Promise<void> {
  if (isPrismaDisabled()) {
    throw new Error('Database is disabled');
  }

  const prisma = getPrisma();

  // Check if config exists and user has access
  const existingConfig = await prisma.smsConfig.findUnique({
    where: { id },
    include: {
      app: { select: { tenantId: true } },
    },
  });

  if (!existingConfig) {
    throw new Error('SMS configuration not found');
  }

  // Access control
  if (userContext && !userContext.roles.includes('superadmin')) {
    if (existingConfig.scope === 'TENANT' || existingConfig.scope === 'APP') {
      const configTenantId = existingConfig.scope === 'APP' 
        ? existingConfig.app?.tenantId 
        : existingConfig.tenantId;
        
      if (configTenantId !== userContext.tenantId) {
        throw new Error('Access denied: Cannot delete configuration for other tenants');
      }
    } else if (existingConfig.scope === 'GLOBAL') {
      throw new Error('Access denied: Cannot delete global configurations');
    }
  }

  await prisma.smsConfig.delete({
    where: { id },
  });
}

/**
 * Gets a single SMS configuration by ID
 */
export async function getSmsConfigById(
  id: string,
  userContext?: UserContext
): Promise<SmsConfigOutput | null> {
  if (isPrismaDisabled()) {
    throw new Error('Database is disabled');
  }

  const prisma = getPrisma();

  const config = await prisma.smsConfig.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, name: true } },
      app: { select: { id: true, name: true, tenantId: true } },
    },
  });

  if (!config) {
    return null;
  }

  // Access control
  if (userContext && !userContext.roles.includes('superadmin')) {
    if (config.scope === 'TENANT' || config.scope === 'APP') {
      const configTenantId = config.scope === 'APP' 
        ? config.app?.tenantId 
        : config.tenantId;
        
      if (configTenantId !== userContext.tenantId) {
        throw new Error('Access denied: Cannot access configuration for other tenants');
      }
    }
  }

  // Decrypt sensitive data and check for migration needs
  const decryptedToken = config.token ? decrypt(config.token) : undefined;
  
  // Check if migration is needed and perform it
  let migrationPerformed = false;
  if (config.token && needsMigration(config.token)) {
    try {
      console.log(`[SMS] Migrating encryption for SMS config ${id}`);
      const newEncryptedToken = migrateEncryption(decryptedToken!);
      
      // Update the database with new encrypted format
      await prisma.smsConfig.update({
        where: { id },
        data: { token: newEncryptedToken }
      });
      
      migrationPerformed = true;
      console.log(`[SMS] Successfully migrated encryption for SMS config ${id}`);
    } catch (migrationError) {
      console.error(`[SMS] Failed to migrate encryption for SMS config ${id}:`, migrationError);
      // Continue without failing - the old data still works
    }
  }

  return {
    id: config.id,
    scope: config.scope,
    tenantId: config.tenantId || undefined,
    appId: config.appId || undefined,
    tenantName: config.tenant?.name,
    appName: config.app?.name,
    sid: config.sid,
    token: decryptedToken, // Return decrypted for editing
    fromNumber: config.fromNumber,
    fallbackTo: config.fallbackTo || undefined,
    serviceSid: config.serviceSid || undefined,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}