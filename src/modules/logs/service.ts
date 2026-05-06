import { getPrisma } from '../../db/prisma.js';
import { UserContext } from '../../auth/roles.js';
import { requireRole } from '../../auth/roles.js';

export interface EmailLogQuery {
  limit: number;
  offset: number;
  appId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SmsLogQuery {
  limit: number;
  offset: number;
  appId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Get email logs with filtering and pagination
 */
export async function getEmailLogs(userContext: UserContext, query: EmailLogQuery) {
  // Check if user has admin role for tenant access
  requireRole(userContext, ['tenant_admin', 'superadmin']);

  const prisma = getPrisma();

  // Build where clause
  const where: any = {};

  // Filter by appId if provided
  if (query.appId) {
    where.appId = query.appId;
  }

  // Filter by tenant if user is not super admin
  if (userContext.roles && !userContext.roles.includes('superadmin')) {
    // Note: The current Maillog schema doesn't have tenantId field
    // This would need to be added for proper tenant isolation
    // For now, we'll rely on appId filtering
  }

  // Search filter
  if (query.search) {
    where.OR = [
      { subject: { contains: query.search } },
      { recipients: { contains: query.search } },
      { senderEmail: { contains: query.search } }
    ];
  }

  // Date range filters
  if (query.startDate || query.endDate) {
    where.sent = {};
    if (query.startDate) {
      where.sent.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      where.sent.lte = new Date(query.endDate);
    }
  }

  // Get total count
  const total = await prisma.maillog.count({ where });

  // Build orderBy clause based on sortBy parameter
  let orderBy: any = { sent: 'desc' }; // Default sorting
  
  if (query.sortBy) {
    const validSortFields = {
      'sent': 'sent',
      'senderEmail': 'senderEmail', 
      'recipients': 'recipients',
      'subject': 'subject'
    };
    
    const sortField = validSortFields[query.sortBy as keyof typeof validSortFields];
    if (sortField) {
      orderBy = { [sortField]: query.sortOrder || 'desc' };
    }
  }

  // Get paginated results
  const logs = await prisma.maillog.findMany({
    where,
    select: {
      id: true,
      subject: true,
      recipients: true,
      sent: true,
      appId: true,
      senderEmail: true,
      senderName: true,
      message: true
    },
    orderBy,
    take: query.limit,
    skip: query.offset
  });

  return {
    logs: logs.map(log => ({
      ...log,
      status: 'sent', // Default status since it's not in schema
      fromAddress: log.senderEmail,
      fromName: log.senderName,
      tenantId: null // Not available in current schema
    })),
    pagination: {
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + query.limit < total
    }
  };
}

/**
 * Get specific email log by ID
 */
export async function getEmailLogById(userContext: UserContext, id: string) {
  // Check if user has admin role for tenant access
  requireRole(userContext, ['tenant_admin', 'superadmin']);

  const prisma = getPrisma();

  // Build where clause
  const where: any = { id };

  // Filter by tenant if user is not super admin
  if (userContext.roles && !userContext.roles.includes('superadmin')) {
    // Note: The current Maillog schema doesn't have tenantId field
    // This would need to be added for proper tenant isolation
  }

  const log = await prisma.maillog.findFirst({
    where,
    select: {
      id: true,
      messageId: true,
      subject: true,
      recipients: true,
      sent: true,
      appId: true,
      senderEmail: true,
      senderName: true,
      message: true
    }
  });

  if (!log) {
    return null;
  }

  return {
    ...log,
    status: 'sent', // Default status since it's not in schema
    fromAddress: log.senderEmail,
    fromName: log.senderName,
    tenantId: null, // Not available in current schema
    headers: null, // Not available in current schema
    errorMessage: null // Not available in current schema
  };
}

/**
 * Get SMS logs with filtering and pagination
 */
export async function getSmsLogs(userContext: UserContext, query: SmsLogQuery) {
  // Check if user has admin role for tenant access
  requireRole(userContext, ['tenant_admin', 'superadmin']);

  const prisma = getPrisma();

  // Build where clause
  const where: any = {};

  // Filter by app if specified
  if (query.appId) {
    where.appId = query.appId;
  }

  // Filter by tenant if user is not super admin
  if (userContext.roles && !userContext.roles.includes('superadmin')) {
    // Note: The current Smslog schema doesn't have tenantId field
    // This would need to be added for proper tenant isolation
    // For now, we'll rely on appId filtering
  }

  // Search filter
  if (query.search) {
    where.OR = [
      { recipients: { contains: query.search } },
      { senderPhone: { contains: query.search } },
      { senderName: { contains: query.search } }
    ];
  }

  // Date range filters
  if (query.startDate || query.endDate) {
    where.sent = {};
    if (query.startDate) {
      where.sent.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      where.sent.lte = new Date(query.endDate);
    }
  }

  // Build orderBy clause based on sortBy parameter
  let orderBy: any = { sent: 'desc' }; // Default sorting
  
  if (query.sortBy) {
    const validSortFields = {
      'sent': 'sent',
      'senderPhone': 'senderPhone',
      'recipients': 'recipients', 
      'senderName': 'senderName',
      'delivered': 'delivered'
    };
    
    const sortField = validSortFields[query.sortBy as keyof typeof validSortFields];
    if (sortField) {
      orderBy = { [sortField]: query.sortOrder || 'desc' };
    }
  }

  // Get total count
  const total = await prisma.smslog.count({ where });

  // Get paginated results
  const logs = await prisma.smslog.findMany({
    where,
    select: {
      id: true,
      messageId: true,
      recipients: true,
      sent: true,
      appId: true,
      senderPhone: true,
      senderName: true,
      message: true,
      delivered: true,
      failed: true,
      errorCode: true,
      errorMessage: true
    },
    orderBy,
    take: query.limit,
    skip: query.offset
  });

  return {
    logs: logs.map((log: any) => ({
      ...log,
      status: log.delivered ? 'delivered' : (log.failed ? 'failed' : 'sent'),
      fromPhone: log.senderPhone,
      fromName: log.senderName,
      tenantId: null // Not available in current schema
    })),
    pagination: {
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + query.limit < total
    }
  };
}

/**
 * Get specific SMS log by ID
 */
export async function getSmsLogById(userContext: UserContext, id: string) {
  // Check if user has admin role for tenant access
  requireRole(userContext, ['tenant_admin', 'superadmin']);

  const prisma = getPrisma();

  // Build where clause
  const where: any = { id };

  // Filter by tenant if user is not super admin
  if (userContext.roles && !userContext.roles.includes('superadmin')) {
    // Note: The current Smslog schema doesn't have tenantId field
    // This would need to be added for proper tenant isolation
  }

  const log = await prisma.smslog.findFirst({
    where,
    select: {
      id: true,
      messageId: true,
      recipients: true,
      sent: true,
      appId: true,
      senderPhone: true,
      senderName: true,
      message: true,
      delivered: true,
      failed: true,
      errorCode: true,
      errorMessage: true
    }
  });

  if (!log) {
    return null;
  }

  return {
    ...log,
    status: log.delivered ? 'delivered' : (log.failed ? 'failed' : 'sent'),
    fromPhone: log.senderPhone,
    fromName: log.senderName,
    tenantId: null, // Not available in current schema
    headers: null, // Not available in current schema
  };
}