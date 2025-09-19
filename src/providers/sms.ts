// SMS provider using Twilio service
// @ts-ignore
import { Twilio } from 'twilio';
import { PrismaClient, SmsConfigScope } from '@prisma/client';

const prisma = new PrismaClient();

interface SmsConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  fallbackTo?: string;
  serviceSid?: string;
}

interface SendSmsInput {
  to: string[];
  message: string;
  tenantId?: string;
  appId?: string;
}

interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

// Function to get SMS configuration from database
async function getSmsConfig(tenantId?: string, appId?: string): Promise<SmsConfig | null> {
  try {
    // Try to find config in order: APP -> TENANT -> GLOBAL
    let smsConfig = null;
    
    if (appId) {
      smsConfig = await prisma.smsConfig.findFirst({
        where: { scope: SmsConfigScope.APP, appId, isActive: true }
      });
    }
    
    if (!smsConfig && tenantId) {
      smsConfig = await prisma.smsConfig.findFirst({
        where: { scope: SmsConfigScope.TENANT, tenantId, isActive: true }
      });
    }
    
    if (!smsConfig) {
      smsConfig = await prisma.smsConfig.findFirst({
        where: { scope: SmsConfigScope.GLOBAL, isActive: true }
      });
    }
    
    if (!smsConfig) {
      console.error('[SMS] No active SMS configuration found');
      return null;
    }
    
    return {
      accountSid: smsConfig.sid,
      authToken: smsConfig.token,
      fromNumber: smsConfig.fromNumber,
      fallbackTo: smsConfig.fallbackTo || undefined,
      serviceSid: smsConfig.serviceSid || undefined
    };
  } catch (error) {
    console.error('[SMS] Error getting SMS config:', error);
    return null;
  }
}

class TwilioClient {
  private config: SmsConfig;
  private client: any;

  constructor(config: SmsConfig) {
    this.config = config;
    this.client = new Twilio(config.accountSid, config.authToken);
  }

  async sendSms(to: string, message: string): Promise<SmsResult> {
    try {
      console.log('[TwilioClient] Sending SMS:', { to, message: message.substring(0, 50) + '...' });
      
      const messageOptions: any = {
        body: message,
        from: this.config.fromNumber,
        to: to
      };
      
      // Use messaging service if available
      if (this.config.serviceSid) {
        messageOptions.messagingServiceSid = this.config.serviceSid;
        delete messageOptions.from; // When using messaging service, don't specify from
      }
      
      const result = await this.client.messages.create(messageOptions);
      
      console.log('[TwilioClient] SMS sent successfully:', { 
        messageId: result.sid, 
        to, 
        status: result.status 
      });
      
      return {
        success: true,
        messageId: result.sid,
        details: {
          to: result.to,
          from: result.from,
          body: result.body,
          status: result.status,
          dateCreated: result.dateCreated,
          dateSent: result.dateSent,
          dateUpdated: result.dateUpdated,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage
        }
      };

    } catch (error: any) {
      console.error('[TwilioClient] Failed to send SMS:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
        details: {
          code: error.code,
          status: error.status,
          moreInfo: error.moreInfo
        }
      };
    }
  }

  // Method to check message status
  async getMessageStatus(messageId: string): Promise<any> {
    try {
      const message = await this.client.messages(messageId).fetch();
      return {
        success: true,
        status: message.status,
        details: {
          sid: message.sid,
          to: message.to,
          from: message.from,
          status: message.status,
          dateCreated: message.dateCreated,
          dateSent: message.dateSent,
          dateUpdated: message.dateUpdated,
          errorCode: message.errorCode,
          errorMessage: message.errorMessage,
          price: message.price,
          priceUnit: message.priceUnit
        }
      };
    } catch (error: any) {
      console.error('[TwilioClient] Failed to get message status:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}

// Cache for Twilio client
let twilioClient: TwilioClient | null = null;
let cachedConfig: SmsConfig | null = null;

async function getTwilioClient(tenantId?: string, appId?: string): Promise<TwilioClient | null> {
  const config = await getSmsConfig(tenantId, appId);
  
  if (!config) {
    console.error('[SMS] No SMS configuration available');
    return null;
  }
  
  // Check if we need to create a new client
  if (!twilioClient || !cachedConfig || 
      cachedConfig.accountSid !== config.accountSid ||
      cachedConfig.authToken !== config.authToken) {
    
    twilioClient = new TwilioClient(config);
    cachedConfig = config;
    console.log('[SMS] Initialized Twilio client with config:', {
      accountSid: config.accountSid,
      fromNumber: config.fromNumber,
      serviceSid: config.serviceSid
    });
  }
  
  return twilioClient;
}

export async function sendSms(input: SendSmsInput): Promise<SmsResult[]> {
  const { to, message, tenantId, appId } = input;
  
  console.log('[SMS] Sending SMS to', to.length, 'recipients');
  console.log('[SMS] Context:', { tenantId, appId });
  
  const client = await getTwilioClient(tenantId, appId);
  if (!client) {
    return to.map(() => ({
      success: false,
      error: 'No SMS configuration available'
    }));
  }
  
  const results: SmsResult[] = [];
  
  // Send SMS to each recipient individually
  for (const phoneNumber of to) {
    const cleanNumber = phoneNumber.trim();
    if (!cleanNumber) {
      results.push({
        success: false,
        error: 'Empty phone number'
      });
      continue;
    }
    
    try {
      const result = await client.sendSms(cleanNumber, message);
      results.push(result);
      
      // Small delay between messages to avoid rate limiting
      if (to.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      results.push({
        success: false,
        error: (error as Error).message
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log('[SMS] Completed sending:', { total: to.length, successful: successCount, failed: to.length - successCount });
  
  return results;
}

export async function sendSingleSms(phoneNumber: string, message: string, context?: { tenantId?: string; appId?: string }): Promise<SmsResult> {
  const results = await sendSms({
    to: [phoneNumber],
    message,
    tenantId: context?.tenantId,
    appId: context?.appId
  });
  
  return results[0];
}

// Function to check message delivery status
export async function getMessageStatus(messageId: string, context?: { tenantId?: string; appId?: string }): Promise<any> {
  const client = await getTwilioClient(context?.tenantId, context?.appId);
  if (!client) {
    return {
      success: false,
      error: 'No SMS configuration available'
    };
  }
  
  return await client.getMessageStatus(messageId);
}

// Export types for use in other modules
export type { SmsConfig, SendSmsInput, SmsResult };