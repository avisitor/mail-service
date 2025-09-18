import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { resolveSmtpConfig } from '../src/modules/smtp/service.js';
import { getPrisma } from '../src/db/prisma.js';

describe('Email Configuration Resolution (Self-Contained)', () => {
  let testData = {
    tenant: null as any,
    smtpApp: null as any,
    sesApp: null as any,
    smtpConfig: null as any,
    sesConfig: null as any
  };

  const prisma = getPrisma();

  beforeAll(async () => {
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Email Test Tenant'
      }
    });
    testData.tenant = tenant;

    // Create SMTP app
    const smtpApp = await prisma.app.create({
      data: {
        tenantId: tenant.id,
        name: 'SMTP Test App',
        clientId: `smtp-test-${Date.now()}`
      }
    });
    testData.smtpApp = smtpApp;

    // Create SES app (without its own config)
    const sesApp = await prisma.app.create({
      data: {
        tenantId: tenant.id,
        name: 'SES Test App',
        clientId: `ses-test-${Date.now()}`
      }
    });
    testData.sesApp = sesApp;

    // Create APP-level SMTP config
    const smtpConfig = await prisma.smtpConfig.create({
      data: {
        scope: 'APP',
        appId: smtpApp.id,
        service: 'smtp',
        host: 'localhost',
        port: 1025,
        secure: false,
        fromAddress: 'test-smtp@localhost.local',
        fromName: 'SMTP Test Service',
        isActive: true
      }
    });
    testData.smtpConfig = smtpConfig;

    // Create TENANT-level SES config
    const sesConfig = await prisma.smtpConfig.create({
      data: {
        scope: 'TENANT',
        tenantId: tenant.id,
        service: 'ses',
        host: 'email.us-east-1.amazonaws.com', // Required field for SES
        awsRegion: 'us-east-1',
        awsAccessKey: 'test-access-key',
        awsSecretKey: 'test-secret-key',
        fromAddress: 'test-ses@example.com',
        fromName: 'SES Test Service',
        isActive: true
      }
    });
    testData.sesConfig = sesConfig;
  });

  afterAll(async () => {
    // Cleanup in reverse order to respect foreign key constraints
    if (testData.smtpConfig) {
      await prisma.smtpConfig.delete({ where: { id: testData.smtpConfig.id } });
    }
    if (testData.sesConfig) {
      await prisma.smtpConfig.delete({ where: { id: testData.sesConfig.id } });
    }
    if (testData.smtpApp) {
      await prisma.app.delete({ where: { id: testData.smtpApp.id } });
    }
    if (testData.sesApp) {
      await prisma.app.delete({ where: { id: testData.sesApp.id } });
    }
    if (testData.tenant) {
      await prisma.tenant.delete({ where: { id: testData.tenant.id } });
    }
  });

  describe('APP-level Configuration Resolution', () => {
    it('should resolve SMTP configuration from APP scope', async () => {
      const config = await resolveSmtpConfig(testData.smtpApp.id);
      
      expect(config.service).toBe('smtp');
      expect(config.resolvedFrom).toBe('APP');
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(1025);
      expect(config.secure).toBe(false);
      expect(config.fromAddress).toBe('test-smtp@localhost.local');
      expect(config.fromName).toBe('SMTP Test Service');
      expect(config.configId).toBe(testData.smtpConfig.id);
    });

    it('should resolve configuration using clientId', async () => {
      const config = await resolveSmtpConfig(testData.smtpApp.clientId);
      
      expect(config.service).toBe('smtp');
      expect(config.resolvedFrom).toBe('APP');
      expect(config.configId).toBe(testData.smtpConfig.id);
    });
  });

  describe('TENANT-level Configuration Inheritance', () => {
    it('should inherit SES configuration from TENANT scope when APP has no config', async () => {
      const config = await resolveSmtpConfig(testData.sesApp.id);
      
      expect(config.service).toBe('ses');
      expect(config.resolvedFrom).toBe('TENANT');
      expect(config.awsRegion).toBe('us-east-1');
      expect(config.fromAddress).toBe('test-ses@example.com');
      expect(config.fromName).toBe('SES Test Service');
      expect(config.configId).toBe(testData.sesConfig.id);
    });

    it('should inherit configuration using clientId', async () => {
      const config = await resolveSmtpConfig(testData.sesApp.clientId);
      
      expect(config.service).toBe('ses');
      expect(config.resolvedFrom).toBe('TENANT');
      expect(config.configId).toBe(testData.sesConfig.id);
    });
  });

  describe('Fallback Scenarios', () => {
    it('should fallback to GLOBAL when app does not exist', async () => {
      const config = await resolveSmtpConfig('non-existent-app-id');
      
      expect(config.resolvedFrom).toBe('GLOBAL');
      // Should fallback to either existing global config or env-fallback
      expect(['env-fallback'].includes(config.configId) || config.configId.startsWith('c')).toBe(true);
    });

    it('should fallback to GLOBAL when no appId provided', async () => {
      const config = await resolveSmtpConfig();
      
      expect(config.resolvedFrom).toBe('GLOBAL');
      // Should fallback to either existing global config or env-fallback
      expect(['env-fallback'].includes(config.configId) || config.configId.startsWith('c')).toBe(true);
    });
  });

  describe('Configuration Hierarchy', () => {
    it('should prefer APP config over TENANT config', async () => {
      // The SMTP app has both APP-level config and inherits TENANT-level config
      // It should prefer the APP-level config
      const config = await resolveSmtpConfig(testData.smtpApp.id);
      
      expect(config.resolvedFrom).toBe('APP');
      expect(config.service).toBe('smtp'); // APP config is SMTP
      expect(config.configId).toBe(testData.smtpConfig.id);
    });

    it('should use TENANT config when APP config does not exist', async () => {
      // The SES app has no APP-level config but tenant has SES config
      const config = await resolveSmtpConfig(testData.sesApp.id);
      
      expect(config.resolvedFrom).toBe('TENANT');
      expect(config.service).toBe('ses'); // TENANT config is SES
      expect(config.configId).toBe(testData.sesConfig.id);
    });
  });

  describe('AppId-Only API Design', () => {
    it('should automatically resolve tenantId from appId', async () => {
      // Both apps should resolve their configs without needing explicit tenantId
      const smtpConfig = await resolveSmtpConfig(testData.smtpApp.id);
      const sesConfig = await resolveSmtpConfig(testData.sesApp.id);
      
      expect(smtpConfig.resolvedFrom).toBe('APP');
      expect(sesConfig.resolvedFrom).toBe('TENANT');
      
      // Both should have resolved successfully despite not providing tenantId
      expect(smtpConfig.isActive).toBe(true);
      expect(sesConfig.isActive).toBe(true);
    });

    it('should handle both app.id and app.clientId as appId parameter', async () => {
      const configById = await resolveSmtpConfig(testData.smtpApp.id);
      const configByClientId = await resolveSmtpConfig(testData.smtpApp.clientId);
      
      // Both should resolve to the same configuration
      expect(configById.configId).toBe(configByClientId.configId);
      expect(configById.resolvedFrom).toBe(configByClientId.resolvedFrom);
      expect(configById.service).toBe(configByClientId.service);
    });
  });
});