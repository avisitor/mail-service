import nodemailer, { Transporter } from 'nodemailer';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { resolveSmtpConfig } from '../modules/smtp/service.js';

const execFileAsync = promisify(execFile);

let transporter: Transporter | null = null;
let cachedConfig: any = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const PROJECT_DIR = process.env.MAIL_SERVICE_DIR || process.cwd();
const ROLES_ANYWHERE_DIR = path.join(PROJECT_DIR, '.rolesanywhere');
const ROLES_ANYWHERE_BIN_DIR = path.join(ROLES_ANYWHERE_DIR, 'bin');
const ROLES_ANYWHERE_SSH_DIR = path.join(ROLES_ANYWHERE_DIR, '.ssh');

const ROLES_ANYWHERE_SOURCE_DIR = process.env.ROLES_ANYWHERE_SOURCE_DIR || '/var/www/html/outings';
const ROLES_ANYWHERE_SOURCE_BIN = path.join(ROLES_ANYWHERE_SOURCE_DIR, 'bin');
const ROLES_ANYWHERE_SOURCE_SSH = path.join(ROLES_ANYWHERE_SOURCE_DIR, '.ssh');

const ROLES_ANYWHERE_CERT = process.env.ROLES_ANYWHERE_CERT || path.join(ROLES_ANYWHERE_SSH_DIR, 'server.crt');
const ROLES_ANYWHERE_KEY = process.env.ROLES_ANYWHERE_KEY || path.join(ROLES_ANYWHERE_SSH_DIR, 'server.key');
const ROLES_ANYWHERE_HELPER = process.env.ROLES_ANYWHERE_HELPER || path.join(ROLES_ANYWHERE_BIN_DIR, 'aws_signing_helper');
const ROLES_ANYWHERE_TRUST_ANCHOR_ARN = process.env.ROLES_ANYWHERE_TRUST_ANCHOR_ARN || 'arn:aws:rolesanywhere:us-west-2:555195510146:trust-anchor/bd9865e9-2783-4012-9e50-1b2965b63559';
const ROLES_ANYWHERE_PROFILE_ARN = process.env.ROLES_ANYWHERE_PROFILE_ARN || 'arn:aws:rolesanywhere:us-west-2:555195510146:profile/78ae31ca-ffe9-4d32-b116-08b08eadf307';
const ROLES_ANYWHERE_ROLE_ARN = process.env.ROLES_ANYWHERE_ROLE_ARN || 'arn:aws:iam::555195510146:role/Rob-SES';

type RolesAnywhereCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
};

let cachedRolesAnywhereCreds: RolesAnywhereCredentials | null = null;
let cachedRolesAnywhereExpiry = 0;
const ROLES_ANYWHERE_REFRESH_SKEW_MS = 2 * 60 * 1000; // refresh 2 minutes before expiration

async function ensureRolesAnywhereFiles(): Promise<void> {
  await fs.mkdir(ROLES_ANYWHERE_BIN_DIR, { recursive: true });
  await fs.mkdir(ROLES_ANYWHERE_SSH_DIR, { recursive: true });

  const helperTarget = ROLES_ANYWHERE_HELPER;
  const certTarget = ROLES_ANYWHERE_CERT;
  const keyTarget = ROLES_ANYWHERE_KEY;

  const helperSource = path.join(ROLES_ANYWHERE_SOURCE_BIN, 'aws_signing_helper');
  const certSource = path.join(ROLES_ANYWHERE_SOURCE_SSH, 'server.crt');
  const keySource = path.join(ROLES_ANYWHERE_SOURCE_SSH, 'server.key');

  try {
    await fs.access(helperTarget);
  } catch {
    await fs.copyFile(helperSource, helperTarget);
    await fs.chmod(helperTarget, 0o755);
  }

  try {
    await fs.access(certTarget);
  } catch {
    await fs.copyFile(certSource, certTarget);
  }

  try {
    await fs.access(keyTarget);
  } catch {
    await fs.copyFile(keySource, keyTarget);
  }
}

async function getRolesAnywhereCredentials(): Promise<RolesAnywhereCredentials> {
  const now = Date.now();
  if (cachedRolesAnywhereCreds && cachedRolesAnywhereExpiry - ROLES_ANYWHERE_REFRESH_SKEW_MS > now) {
    return cachedRolesAnywhereCreds;
  }

  await ensureRolesAnywhereFiles();
  await Promise.all([
    fs.access(ROLES_ANYWHERE_CERT),
    fs.access(ROLES_ANYWHERE_KEY),
    fs.access(ROLES_ANYWHERE_HELPER),
  ]);

  const { stdout } = await execFileAsync(ROLES_ANYWHERE_HELPER, [
    'credential-process',
    '--certificate', ROLES_ANYWHERE_CERT,
    '--private-key', ROLES_ANYWHERE_KEY,
    '--trust-anchor-arn', ROLES_ANYWHERE_TRUST_ANCHOR_ARN,
    '--profile-arn', ROLES_ANYWHERE_PROFILE_ARN,
    '--role-arn', ROLES_ANYWHERE_ROLE_ARN,
  ]);

  const parsed = JSON.parse(stdout.toString());
  const creds: RolesAnywhereCredentials = {
    accessKeyId: parsed.AccessKeyId,
    secretAccessKey: parsed.SecretAccessKey,
    sessionToken: parsed.SessionToken,
    expiration: parsed.Expiration,
  };

  if (!creds.accessKeyId || !creds.secretAccessKey || !creds.sessionToken || !creds.expiration) {
    throw new Error('RolesAnywhere credential-process returned incomplete credentials');
  }

  cachedRolesAnywhereCreds = creds;
  cachedRolesAnywhereExpiry = Date.parse(creds.expiration) || 0;
  return creds;
}

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
      credentials: async () => {
        const creds = await getRolesAnywhereCredentials();
        return {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
        };
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
      requireTLS: smtpConfig.port === 587, // Use STARTTLS for port 587
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

  // Email routing validation
  const emailDomain = input.to.split('@')[1]?.toLowerCase();
  const isSimulatorEmail = emailDomain === 'simulator.amazonses.com';
  const isTestEmail = emailDomain === 'test.com' || 
                     emailDomain?.endsWith('.test') || 
                     ['a@test.com', 'b@test.com'].includes(input.to.toLowerCase());

  let transporter: nodemailer.Transporter;
  let fromAddr: string;
  let fromName: string | undefined;

  if (input.testEmail) {
    // Force MailHog configuration when testEmail flag is true
    // This ensures ALL testEmail=true requests go to MailHog regardless of environment config
    transporter = nodemailer.createTransport({
      host: config.testSmtp.enabled ? config.testSmtp.host : 'localhost',
      port: config.testSmtp.enabled ? config.testSmtp.port : 1025,
      secure: config.testSmtp.enabled ? config.testSmtp.secure : false,
      auth: (config.testSmtp.enabled && config.testSmtp.user && config.testSmtp.pass) ? {
        user: config.testSmtp.user,
        pass: config.testSmtp.pass
      } : undefined,
    });
    
    fromAddr = config.testSmtp.enabled ? config.testSmtp.fromDefault : 'test@example.com';
    fromName = config.testSmtp.enabled ? config.testSmtp.fromName : 'Mail Service Test';
  } else {
    // Use resolved application/tenant SMTP configuration
    transporter = await getTransporterAsync(input.tenantId, input.appId);
    const smtpConfig = await resolveSmtpConfig(input.appId);

    // Routing validation: ensure proper service is used for email types
    if (isSimulatorEmail && smtpConfig.service !== 'ses') {
      throw new Error(`simulator.amazonses.com emails must be sent through SES service, not ${smtpConfig.service}. Check your SMTP configuration.`);
    }
    
    if (isTestEmail && smtpConfig.service !== 'smtp') {
      throw new Error(`Test emails (${input.to}) must be sent through SMTP test servers like MailHog, not production services like ${smtpConfig.service}.`);
    }
    
    if (isTestEmail && smtpConfig.host !== 'localhost' && !smtpConfig.host?.includes('mailhog')) {
      throw new Error(`Test emails (${input.to}) must be sent through localhost/MailHog, not ${smtpConfig.host}.`);
    }
    
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