// SMS provider using Twilio service
// @ts-ignore
import { Twilio } from 'twilio';
import { resolveSmsConfig } from '../modules/sms/service.js';
import { getPrisma } from '../db/prisma.js';

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
  testMode?: boolean;
  testConfigOverride?: SmsConfig | null;
}

interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

// Function to log SMS send to database
async function logSmsToDatabase(params: {
  messageId?: string;
  appId?: string;
  recipients: string;
  message: string;
  senderPhone?: string;
  senderName?: string;
  delivered?: boolean;
  failed?: boolean;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  try {
    const prisma = getPrisma();
    
    await prisma.smslog.create({
      data: {
        messageId: params.messageId || null,
        appId: params.appId || null,
        recipients: params.recipients,
        message: params.message,
        senderPhone: params.senderPhone || null,
        senderName: params.senderName || null,
        delivered: params.delivered ? new Date() : null,
        failed: params.failed ? new Date() : null,
        errorCode: params.errorCode || null,
        errorMessage: params.errorMessage || null,
        sent: new Date(),
        createdAt: new Date()
      }
    });
    
    console.log('[SMS] Logged to database:', { messageId: params.messageId, recipients: params.recipients });
  } catch (error) {
    console.error('[SMS] Failed to log to database:', error);
    // Don't throw - logging failure shouldn't break SMS sending
  }
}

// Function to get SMS configuration from database
function getTestSmsConfig(): SmsConfig | null {
  const sid = process.env.SMS_TEST_SID?.trim() || '';
  const token = process.env.SMS_TEST_TOKEN?.trim() || '';
  const from = process.env.SMS_TEST_FROM?.trim() || '';
  if (!sid || !token || !from) {
    return null;
  }

  return {
    accountSid: sid,
    authToken: token,
    fromNumber: from,
    fallbackTo: process.env.SMS_TEST_FALLBACK_TO?.trim() || undefined,
    serviceSid: process.env.SMS_TEST_SERVICE?.trim() || undefined,
  };
}

async function getSmsConfig(tenantId?: string, appId?: string): Promise<SmsConfig | null> {
  try {
    const config = await resolveSmsConfig(appId);
    
    if (!config) {
      console.error('[SMS] No active SMS configuration found');
      return null;
    }
    
    return {
      accountSid: config.accountSid,
      authToken: config.authToken,
      fromNumber: config.fromNumber,
      fallbackTo: config.fallbackToNumber || undefined,
      serviceSid: config.messagingServiceSid || undefined
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
let testTwilioClient: TwilioClient | null = null;
let cachedTestConfig: SmsConfig | null = null;

async function getTwilioClient(
  tenantId?: string,
  appId?: string,
  testMode?: boolean,
  testConfigOverride?: SmsConfig | null
): Promise<TwilioClient | null> {
  if (testMode && testConfigOverride) {
    console.log('[SMS] Using request-provided TEST credentials');
    return new TwilioClient(testConfigOverride);
  }
  const testConfig = testMode ? getTestSmsConfig() : null;
  const config = testConfig ?? await getSmsConfig(tenantId, appId);
  
  if (!config) {
    console.error('[SMS] No SMS configuration available');
    return null;
  }

  if (testConfig) {
    if (!testTwilioClient || !cachedTestConfig ||
        cachedTestConfig.accountSid !== config.accountSid ||
        cachedTestConfig.authToken !== config.authToken ||
        cachedTestConfig.fromNumber !== config.fromNumber ||
        cachedTestConfig.serviceSid !== config.serviceSid) {
      testTwilioClient = new TwilioClient(config);
      cachedTestConfig = config;
      console.log('[SMS] Initialized Twilio client with TEST config:', {
        accountSid: config.accountSid,
        fromNumber: config.fromNumber,
        serviceSid: config.serviceSid
      });
    }
    return testTwilioClient;
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
  const { to, message, tenantId, appId, testMode, testConfigOverride } = input;
  
  console.log('[SMS] Sending SMS to', to.length, 'recipients');
  console.log('[SMS] Context:', { tenantId, appId });
  
  const client = await getTwilioClient(tenantId, appId, testMode, testConfigOverride);
  if (!client) {
    const senderName = 'System';
    for (const phoneNumber of to) {
      const cleanNumber = phoneNumber.trim();
      if (!cleanNumber) {
        continue;
      }
      await logSmsToDatabase({
        appId,
        recipients: cleanNumber,
        message,
        senderName,
        failed: true,
        errorMessage: 'No SMS configuration available'
      });
    }
    return to.map(() => ({
      success: false,
      error: 'No SMS configuration available'
    }));
  }
  
  // Get config details for logging
  const config = testConfigOverride ?? (testMode ? getTestSmsConfig() : null) ?? await getSmsConfig(tenantId, appId);
  const senderPhone = config?.fromNumber;
  const senderName = 'System'; // You could make this configurable
  
  const results: SmsResult[] = [];
  
  // Send SMS to each recipient individually
  for (const phoneNumber of to) {
    const cleanNumber = phoneNumber.trim();
    if (!cleanNumber) {
      results.push({
        success: false,
        error: 'Empty phone number'
      });
      
      // Log failed send attempt
      await logSmsToDatabase({
        appId,
        recipients: cleanNumber,
        message,
        senderPhone,
        senderName,
        failed: true,
        errorMessage: 'Empty phone number'
      });
      
      continue;
    }
    
    try {
      const result = await client.sendSms(cleanNumber, message);
      results.push(result);
      
      // Log successful send
      await logSmsToDatabase({
        messageId: result.messageId,
        appId,
        recipients: cleanNumber,
        message,
        senderPhone,
        senderName,
        delivered: result.success,
        failed: !result.success,
        errorMessage: result.error
      });
      
      // Small delay between messages to avoid rate limiting
      if (to.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      const errorResult = {
        success: false,
        error: (error as Error).message
      };
      results.push(errorResult);
      
      // Log failed send attempt
      await logSmsToDatabase({
        appId,
        recipients: cleanNumber,
        message,
        senderPhone,
        senderName,
        failed: true,
        errorMessage: (error as Error).message
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