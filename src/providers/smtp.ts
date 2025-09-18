import nodemailer, { Transporter } from 'nodemailer';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from '../config.js';
import { resolveSmtpConfig } from '../modules/smtp/service.js';

let transporter: Transporter | null = null;
let cachedConfig: any = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getTransporter(tenantId?: string, appId?: string): Transporter {
  // Use cached transporter if configuration hasn't changed
  const now = Date.now();
  if (transporter && cachedConfig && (now - cacheTimestamp) < CACHE_TTL) {
    return transporter;
  }

  // For backward compatibility, if no tenant/app context, use environment config
  if (!tenantId && !appId) {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      });
    }
    return transporter;
  }

  // This will be replaced with async version in the refactored sendEmail function
  throw new Error('Dynamic SMTP configuration requires async resolution. Use sendEmailWithConfig instead.');
}

async function getTransporterAsync(tenantId?: string, appId?: string): Promise<Transporter> {
  const now = Date.now();
  
  // Check if we can use cached transporter
  if (transporter && cachedConfig && (now - cacheTimestamp) < CACHE_TTL) {
    // Verify cache is for the same tenant/app context
    if (cachedConfig.tenantId === tenantId && cachedConfig.appId === appId) {
      return transporter;
    }
  }

  // Resolve configuration from database
  const smtpConfig = await resolveSmtpConfig(appId);
  
  // Create new transporter with resolved config based on service type
  if (smtpConfig.service === 'ses') {
    // For SES, we'll use a custom transport that leverages AWS SDK
    // This is a simplified approach - in production you might want a more robust implementation
    const sesClient = new SESClient({
      region: smtpConfig.awsRegion || 'us-east-1',
      credentials: {
        accessKeyId: smtpConfig.awsAccessKey!,
        secretAccessKey: smtpConfig.awsSecretKey!,
      },
    });
    
    // Create a custom transport that uses SES SDK
    transporter = nodemailer.createTransport({
      name: 'ses',
      version: '1.0.0',
      send: async (mail: any, callback: any) => {
        try {
          const params = {
            Source: mail.data.from,
            Destination: {
              ToAddresses: Array.isArray(mail.data.to) ? mail.data.to : [mail.data.to],
            },
            Message: {
              Subject: { Data: mail.data.subject },
              Body: {
                Html: mail.data.html ? { Data: mail.data.html } : undefined,
                Text: mail.data.text ? { Data: mail.data.text } : undefined,
              },
            },
          };
          
          const command = new SendEmailCommand(params);
          await sesClient.send(command);
          callback(null, { messageId: 'ses-sent' });
        } catch (error) {
          callback(error);
        }
      },
    });
  } else {
    // Standard SMTP transporter
    transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.user ? { 
        user: smtpConfig.user, 
        pass: smtpConfig.pass 
      } : undefined,
    });
  }

  // Cache the config and timestamp
  cachedConfig = {
    tenantId,
    appId,
    service: smtpConfig.service,
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: smtpConfig.user,
    awsRegion: smtpConfig.awsRegion,
  };
  cacheTimestamp = now;

  return transporter!;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  // Optional context for configuration resolution
  tenantId?: string;
  appId?: string;
  // Flag to use test SMTP configuration instead of resolved config
  testEmail?: boolean;
}

export async function sendEmail(input: SendEmailInput) {
  if (process.env.TEST_FAIL_ONCE === 'true') {
    // flip flag so only first attempt fails
    delete process.env.TEST_FAIL_ONCE;
    throw new Error('Simulated transient timeout');
  }
  if (process.env.TEST_FAIL_ALWAYS === 'true') {
    throw new Error('Simulated permanent failure');
  }
  if ((process.env.SMTP_DRY_RUN || 'false').toLowerCase() === 'true') {
    return {
      messageId: 'dry-run-' + Date.now(),
      accepted: [input.to],
      rejected: [],
      response: 'Dry run mode - email not actually sent',
      status: 'queued'
    };
  }

  let transporter: nodemailer.Transporter;
  let fromAddr: string;
  let fromName: string | undefined;

  if (input.testEmail && config.testSmtp.enabled) {
    // Use test SMTP configuration
    transporter = nodemailer.createTransport({
      host: config.testSmtp.host,
      port: config.testSmtp.port,
      secure: config.testSmtp.secure,
      auth: (config.testSmtp.user && config.testSmtp.pass) ? {
        user: config.testSmtp.user,
        pass: config.testSmtp.pass
      } : undefined,
    });
    
    fromAddr = config.testSmtp.fromDefault;
    fromName = config.testSmtp.fromName;
  } else {
    // Use resolved application/tenant SMTP configuration
    transporter = await getTransporterAsync(input.tenantId, input.appId);
    const smtpConfig = await resolveSmtpConfig(input.appId);
    
    fromAddr = smtpConfig.fromAddress || config.smtp.fromDefault || config.smtp.user || '';
    fromName = smtpConfig.fromName;
  }

  const from = fromName && fromAddr ? `${fromName} <${fromAddr}>` : fromAddr;
  
  const result = await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  // Return detailed delivery information
  return {
    messageId: result.messageId,
    accepted: result.accepted || [],
    rejected: result.rejected || [],
    response: result.response || 'Email sent successfully',
    status: (result.rejected && result.rejected.length > 0) ? 'partial_failure' : 'sent'
  };
}

// Legacy function for backward compatibility - will be deprecated
export async function sendEmailWithConfig(input: SendEmailInput) {
  return sendEmail(input);
}