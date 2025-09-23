import { FastifyInstance } from 'fastify';
import { sendEmail } from '../../providers/smtp.js';
import { config } from '../../config.js';

interface WebhookRequestBody {
  email: string;
  verification_url?: string;
  reset_url?: string;
  app_name?: string;
  appId: string;  // Required for SMTP config resolution
}

export function registerWebhookRoutes(app: FastifyInstance) {
  // Verification email webhook for IDP user registration
  app.post<{ Body: WebhookRequestBody }>('/api/webhooks/send-verification', {
    preHandler: (req, reply) => app.authenticate(req, reply),
    schema: {
      body: {
        type: 'object',
        required: ['email', 'verification_url', 'appId'],
        properties: {
          email: { type: 'string', format: 'email' },
          verification_url: { type: 'string' },
          app_name: { type: 'string' },
          appId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, verification_url, app_name = 'ReTree Hawaii', appId } = request.body;

    try {
      // Resolve app for SMTP configuration (same pattern as /send-now)
      const prismaModule = await import('../../db/prisma.js');
      const prisma = prismaModule.getPrisma();
      
      let appRecord = await prisma.app.findUnique({ where: { id: appId }, include: { tenant: true } });
      if (!appRecord) {
        appRecord = await prisma.app.findUnique({ where: { clientId: appId }, include: { tenant: true } });
      }
      if (!appRecord) {
        reply.status(400);
        return { success: false, error: 'App not found (provide app id or clientId)' };
      }

      const emailContent = {
        to: email,
        toname: '', // No display name available at registration
        from: 'noreply@retree-hawaii.org',
        fromname: app_name,
        subject: `Verify Your ${app_name} Account`,
        message: `
          <html>
            <body>
              <h2>Welcome to ${app_name}!</h2>
              <p>Thank you for creating an account. Please verify your email address by clicking the link below:</p>
              <p><a href="${verification_url}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-align: center; text-decoration: none; display: inline-block; border-radius: 4px;">Verify Email Address</a></p>
              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p>${verification_url}</p>
              <p>This verification link will expire in 24 hours.</p>
              <p>If you did not create an account, please ignore this email.</p>
              <br>
              <p>Best regards,<br>The ${app_name} Team</p>
            </body>
          </html>
        `,
        groupid: `webhook-verification-${Date.now()}`,
        mailid: `verify-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        appId: appRecord.id  // Use resolved app ID for SMTP config resolution
      };

      const result = await sendEmail(emailContent);
      
      app.log.info({ email, app_name, appId: appRecord.id }, 'Verification email sent via webhook');
      
      return { 
        success: true, 
        message: 'Verification email sent successfully',
        mailid: emailContent.mailid
      };
      
    } catch (error) {
      app.log.error({ error, email, appId }, 'Failed to send verification email via webhook');
      
      reply.status(500);
      return { 
        success: false, 
        error: 'Failed to send verification email' 
      };
    }
  });

    // Password reset email webhook for IDP password reset
  app.post<{ Body: WebhookRequestBody }>('/api/webhooks/send-password-reset', {
    preHandler: (req, reply) => app.authenticate(req, reply),
    schema: {
      body: {
        type: 'object',
        required: ['email', 'reset_url', 'appId'],
        properties: {
          email: { type: 'string', format: 'email' },
          reset_url: { type: 'string' },
          app_name: { type: 'string' },
          appId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, reset_url, app_name = 'ReTree Hawaii', appId } = request.body;

    try {
      // Resolve app for SMTP configuration (same pattern as /send-now)
      const prismaModule = await import('../../db/prisma.js');
      const prisma = prismaModule.getPrisma();
      
      let appRecord = await prisma.app.findUnique({ where: { id: appId }, include: { tenant: true } });
      if (!appRecord) {
        appRecord = await prisma.app.findUnique({ where: { clientId: appId }, include: { tenant: true } });
      }
      if (!appRecord) {
        reply.status(400);
        return { success: false, error: 'App not found (provide app id or clientId)' };
      }

      const emailContent = {
        to: email,
        toname: '', // No display name available for password reset
        from: 'noreply@retree-hawaii.org',
        fromname: app_name,
        subject: `Password Reset for Your ${app_name} Account`,
        message: `
          <html>
            <body>
              <h2>Password Reset Request</h2>
              <p>We received a request to reset the password for your ${app_name} account.</p>
              <p>Click the link below to reset your password:</p>
              <p><a href="${reset_url}" style="background-color: #f44336; color: white; padding: 14px 20px; text-align: center; text-decoration: none; display: inline-block; border-radius: 4px;">Reset Password</a></p>
              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p>${reset_url}</p>
              <p>This password reset link will expire in 1 hour.</p>
              <p>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
              <br>
              <p>Best regards,<br>The ${app_name} Team</p>
            </body>
          </html>
        `,
        groupid: `webhook-reset-${Date.now()}`,
        mailid: `reset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        appId: appRecord.id  // Use resolved app ID for SMTP config resolution
      };

      const result = await sendEmail(emailContent);
      
      app.log.info({ email, app_name, appId: appRecord.id }, 'Password reset email sent via webhook');
      
      return { 
        success: true, 
        message: 'Password reset email sent successfully',
        mailid: emailContent.mailid
      };
      
    } catch (error) {
      app.log.error({ error, email, appId }, 'Failed to send password reset email via webhook');
      
      reply.status(500);
      return { 
        success: false, 
        error: 'Failed to send password reset email' 
      };
    }
  });

  // Health check for webhook endpoints
  app.get('/api/webhooks/health', async (request, reply) => {
    return { 
      status: 'healthy', 
      endpoints: [
        'POST /api/webhooks/send-verification',
        'POST /api/webhooks/send-password-reset'
      ],
      timestamp: new Date().toISOString()
    };
  });
}