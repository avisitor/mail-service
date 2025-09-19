// Shared utility functions for app validation
// Following the rule: "Do not duplicate code. Use a shared utility class or a shared baseclass for functionality required in more than one module or location"

export interface AppValidationResult {
  isValid: boolean;
  app: any | null;
  error?: string;
}

export async function validateAppId(appId: string): Promise<AppValidationResult> {
  if (!appId) {
    return { isValid: false, app: null, error: 'appId is required' };
  }

  try {
    const prismaModule = await import('../db/prisma.js');
    const prisma = prismaModule.getPrisma();
    
    // Find app by ID or clientId (following existing pattern)
    let appRecord = await prisma.app.findUnique({ where: { id: appId } });
    if (!appRecord) {
      appRecord = await prisma.app.findUnique({ where: { clientId: appId } });
    }
    
    if (!appRecord) {
      return { isValid: false, app: null, error: `Application '${appId}' not found in mail-service database` };
    }
    
    return { isValid: true, app: appRecord };
  } catch (error) {
    console.error('[validateAppId] Database error:', error);
    return { isValid: false, app: null, error: 'Database validation failed' };
  }
}

// Enhanced validation that includes request context (for future auth enhancements)
export async function validateAppAccess(req: any, appId: string): Promise<{ success: boolean; app: any | null; error?: string }> {
  const validation = await validateAppId(appId);
  return {
    success: validation.isValid,
    app: validation.app,
    error: validation.error
  };
}