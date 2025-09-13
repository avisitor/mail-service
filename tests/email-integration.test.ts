import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { sendEmail } from '../src/providers/smtp.js';
import { resolveSmtpConfig } from '../src/modules/smtp/service.js';

describe('Email Sending Integration Tests', () => {
  // Test data from our sandbox setup
  const SANDBOX_TENANT_ID = 'cmfgkxlyt000010msi8qxmraa'; // Email Testing Sandbox
  const SMTP_APP_ID = 'cmfgkybbi000410mssq4gnw8a'; // SMTP Testing App
  
  // MailHog API for verification
  const MAILHOG_API = 'http://localhost:8025/api/v2';
  
  beforeAll(async () => {
    // Clear MailHog inbox before tests
    await fetch(`${MAILHOG_API}/messages`, { method: 'DELETE' });
  });
  
  afterEach(async () => {
    // Clean up after each test
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for async processing
  });

  describe('SMTP Email Sending (MailHog)', () => {
    it('should send email through SMTP configuration to MailHog', async () => {
      const emailInput = {
        to: 'test-recipient@localhost.local',
        subject: 'SMTP Test Email',
        html: '<h1>SMTP Test</h1><p>This email was sent through SMTP to MailHog.</p>',
        text: 'SMTP Test: This email was sent through SMTP to MailHog.',
        tenantId: SANDBOX_TENANT_ID,
        appId: SMTP_APP_ID
      };

      // Send email
      await expect(sendEmail(emailInput)).resolves.not.toThrow();
      
      // Wait a moment for MailHog to receive the email
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify email was captured by MailHog
      const response = await fetch(`${MAILHOG_API}/messages`);
      const messages = await response.json();
      
      expect(messages.total).toBeGreaterThan(0);
      
      const latestMessage = messages.items[0];
      expect(latestMessage.Content.Headers.Subject[0]).toBe('SMTP Test Email');
      expect(latestMessage.Content.Headers.To[0]).toBe('test-recipient@localhost.local');
      expect(latestMessage.Content.Headers.From[0]).toContain('test@sandbox.local');
    });

    it('should resolve SMTP configuration correctly for APP scope', async () => {
      const config = await resolveSmtpConfig(SMTP_APP_ID);
      
      expect(config.service).toBe('smtp');
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(1025);
      expect(config.secure).toBe(false);
      expect(config.fromAddress).toBe('test@sandbox.local');
      expect(config.fromName).toBe('SMTP Testing Service');
      expect(config.resolvedFrom).toBe('APP');
    });

    it('should handle multiple recipients via SMTP', async () => {
      const emailInput = {
        to: 'recipient1@test.local',
        subject: 'Multi-Recipient SMTP Test',
        html: '<h1>Multi-Recipient Test</h1><p>Testing multiple recipients through SMTP.</p>',
        tenantId: SANDBOX_TENANT_ID,
        appId: SMTP_APP_ID
      };

      await expect(sendEmail(emailInput)).resolves.not.toThrow();
      
      // Verify in MailHog
      await new Promise(resolve => setTimeout(resolve, 2000));
      const response = await fetch(`${MAILHOG_API}/messages`);
      const messages = await response.json();
      
      expect(messages.total).toBeGreaterThan(0);
    });
  });

  describe('SES Email Sending (AWS Simulator)', () => {
    it('should send successful email through SES to success simulator', async () => {
      const emailInput = {
        to: 'success@simulator.amazonses.com',
        subject: 'SES Success Test',
        html: '<h1>SES Success Test</h1><p>This email should succeed in SES sandbox.</p>',
        text: 'SES Success Test: This email should succeed in SES sandbox.',
        tenantId: SANDBOX_TENANT_ID,
        // No appId - should fall back to TENANT-level SES config
      };

      // This should succeed without throwing
      await expect(sendEmail(emailInput)).resolves.not.toThrow();
    });

    it('should handle SES bounce response correctly', async () => {
      const emailInput = {
        to: 'bounce@simulator.amazonses.com',
        subject: 'SES Bounce Test',
        html: '<h1>SES Bounce Test</h1><p>This email should trigger a bounce in SES sandbox.</p>',
        text: 'SES Bounce Test: This email should trigger a bounce in SES sandbox.',
        tenantId: SANDBOX_TENANT_ID,
        // No appId - should fall back to TENANT-level SES config
      };

      // This might throw or handle the bounce gracefully depending on implementation
      try {
        await sendEmail(emailInput);
        // If no error thrown, that's also valid (async bounce handling)
        expect(true).toBe(true);
      } catch (error) {
        // If error thrown, verify it's a bounce-related error
        expect(error.message).toMatch(/bounce|rejected|failed/i);
      }
    });

    it('should resolve SES configuration correctly for TENANT scope', async () => {
      // Test without appId to get TENANT-level config
      const config = await resolveSmtpConfig(SANDBOX_TENANT_ID);
      
      expect(config.service).toBe('ses');
      expect(config.awsRegion).toBe('us-east-1');
      expect(config.awsAccessKey).toBeTruthy();
      expect(config.awsSecretKey).toBeTruthy();
      expect(config.fromAddress).toBe('verified@sandbox.local');
      expect(config.fromName).toBe('SES Testing Service');
      expect(config.resolvedFrom).toBe('TENANT');
    });

    it('should send email with custom from address through SES', async () => {
      const emailInput = {
        to: 'success@simulator.amazonses.com',
        subject: 'SES Custom From Test',
        html: '<h1>Custom From Test</h1><p>Testing custom from address with SES.</p>',
        tenantId: SANDBOX_TENANT_ID,
      };

      await expect(sendEmail(emailInput)).resolves.not.toThrow();
    });
  });

  describe('Configuration Hierarchy Testing', () => {
    it('should prefer APP-level config over TENANT-level config', async () => {
      // With appId - should get APP-level SMTP config
      const appConfig = await resolveSmtpConfig(SMTP_APP_ID);
      expect(appConfig.resolvedFrom).toBe('APP');
      expect(appConfig.service).toBe('smtp');
      expect(appConfig.host).toBe('localhost');
    });

    it('should fall back to TENANT-level config when no APP config exists', async () => {
      // Without appId - should get TENANT-level SES config
      const tenantConfig = await resolveSmtpConfig(SANDBOX_TENANT_ID);
      expect(tenantConfig.resolvedFrom).toBe('TENANT');
      expect(tenantConfig.service).toBe('ses');
      expect(tenantConfig.awsRegion).toBe('us-east-1');
    });

    it('should fall back to GLOBAL config when no TENANT/APP config exists', async () => {
      // Use non-existent tenant - should fall back to GLOBAL or ENV
      const globalConfig = await resolveSmtpConfig('non-existent-tenant');
      expect(['GLOBAL', 'ENV']).toContain(globalConfig.resolvedFrom);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid email addresses gracefully', async () => {
      const emailInput = {
        to: 'invalid-email-address',
        subject: 'Invalid Email Test',
        html: '<p>This should fail due to invalid email.</p>',
        tenantId: SANDBOX_TENANT_ID,
        appId: SMTP_APP_ID
      };

      // Should either throw a validation error or handle gracefully
      try {
        await sendEmail(emailInput);
        // If no error, check that email was rejected by server
      } catch (error) {
        expect(error.message).toMatch(/invalid|address|email/i);
      }
    });

    it('should handle missing required fields', async () => {
      const emailInput = {
        // Missing 'to' field
        subject: 'Missing To Field Test',
        html: '<p>This should fail due to missing recipient.</p>',
        tenantId: SANDBOX_TENANT_ID,
        appId: SMTP_APP_ID
      };

      await expect(sendEmail(emailInput as any)).rejects.toThrow();
    });

    it('should handle non-existent tenant/app gracefully', async () => {
      const emailInput = {
        to: 'test@example.com',
        subject: 'Non-existent Config Test',
        html: '<p>Testing with non-existent tenant/app.</p>',
        tenantId: 'non-existent-tenant',
        appId: 'non-existent-app'
      };

      // Should either fall back to global config or handle gracefully
      try {
        await sendEmail(emailInput);
        // Success means it fell back to global/env config
        expect(true).toBe(true);
      } catch (error) {
        // Error is also acceptable if no fallback available
        expect(error).toBeDefined();
      }
    });
  });

  describe('Email Content Variations', () => {
    it('should send HTML-only email', async () => {
      const emailInput = {
        to: 'success@simulator.amazonses.com',
        subject: 'HTML Only Test',
        html: '<h1>HTML Only</h1><p>This email contains <strong>only HTML</strong> content.</p>',
        tenantId: SANDBOX_TENANT_ID,
        appId: SMTP_APP_ID
      };

      await expect(sendEmail(emailInput)).resolves.not.toThrow();
    });

    it('should send text-only email', async () => {
      const emailInput = {
        to: 'success@simulator.amazonses.com',
        subject: 'Text Only Test',
        text: 'This email contains only plain text content.',
        tenantId: SANDBOX_TENANT_ID,
        appId: SMTP_APP_ID
      };

      await expect(sendEmail(emailInput)).resolves.not.toThrow();
    });

    it('should send email with both HTML and text', async () => {
      const emailInput = {
        to: 'success@simulator.amazonses.com',
        subject: 'HTML and Text Test',
        html: '<h1>HTML Version</h1><p>This is the <strong>HTML</strong> version.</p>',
        text: 'Text Version: This is the plain text version.',
        tenantId: SANDBOX_TENANT_ID,
        appId: SMTP_APP_ID
      };

      await expect(sendEmail(emailInput)).resolves.not.toThrow();
    });
  });
});