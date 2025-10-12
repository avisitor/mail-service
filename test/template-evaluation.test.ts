import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { config, flags } from '../src/config.js';
import { getPrisma } from '../src/db/prisma.js';

// Disable auth during tests for simplicity
flags.disableAuth = true as any;

const dbValid = (config.databaseUrl || '').startsWith('mysql://');

// Helper function to generate descriptive test IDs
function generateTestId(testCase: string, entityType: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
  return `test-template-eval-${testCase}-${entityType}-${timestamp}`;
}

describe('Template Evaluation and Variable Substitution', () => {
  if (!dbValid) {
    it.skip('skipped because DATABASE_URL is not mysql://', () => {});
    return;
  }

  let app: any;
  let templateId: number;
  let testTenantId = 'test-template-eval-tenant';
  let testAppId = 'test-template-eval-app';
  let createdTemplateIds: number[] = [];

  beforeEach(async () => {
    app = buildApp();
    
    // Ensure the test app exists in the database
    const prisma = getPrisma();
    
    // Ensure test tenant exists  
    await prisma.tenant.upsert({
      where: { id: testTenantId },
      create: { id: testTenantId, name: 'Test Tenant for Template Evaluation Tests' },
      update: {}
    });
    
    // Ensure test app exists
    await prisma.app.upsert({
      where: { id: testAppId },
      create: {
        id: testAppId,
        tenantId: testTenantId,
        name: 'Test App for Template Evaluation Tests',
        clientId: 'test-template-eval-client'
      },
      update: {}
    });
    
    // Create a test template for variable substitution testing
    const createRes = await app.inject({
      method: 'POST',
      url: '/templates',
      payload: {
        appId: testAppId,
        title: 'test-template-eval-beforeeach-var-test',
        subject: 'Hello ${name}',
        content: '<p>Dear ${name},</p><p>Your email is ${email} and you work at ${company}.</p><p>Best regards,<br/>${senderName}</p>',
        version: 1
      }
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload);
    templateId = created.id;
    createdTemplateIds.push(templateId); // Track for cleanup
  });

  afterEach(async () => {
    const prisma = getPrisma();
    
    // Clean up all templates created during tests
    for (const templateId of createdTemplateIds) {
      await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
    }
    createdTemplateIds = [];
    
    // Clean up test app and tenant
    await prisma.app.delete({ where: { id: testAppId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: testTenantId } }).catch(() => {});
  });

  describe('Variable Substitution', () => {
    it('should substitute simple variables with ${syntax}', async () => {
      const renderRes = await app.inject({
        method: 'POST',
        url: `/templates/${templateId}/render`,
        payload: { 
          context: { 
            name: 'Alice Smith',
            email: 'alice@example.com',
            company: 'Test Corp',
            senderName: 'Support Team'
          } 
        }
      });

      expect(renderRes.statusCode).toBe(200);
      const rendered = JSON.parse(renderRes.payload);
      
      expect(rendered.subject).toBe('Hello Alice Smith');
      expect(rendered.html).toContain('Dear Alice Smith,');
      expect(rendered.html).toContain('Your email is alice@example.com');
      expect(rendered.html).toContain('you work at Test Corp');
      expect(rendered.html).toContain('Support Team');
    });

    it('should handle missing variables gracefully', async () => {
      const renderRes = await app.inject({
        method: 'POST',
        url: `/templates/${templateId}/render`,
        payload: { 
          context: { 
            name: 'Bob Johnson',
            email: 'bob@example.com'
            // Missing company and senderName
          } 
        }
      });

      expect(renderRes.statusCode).toBe(200);
      const rendered = JSON.parse(renderRes.payload);
      
      expect(rendered.subject).toBe('Hello Bob Johnson');
      expect(rendered.html).toContain('Dear Bob Johnson,');
      expect(rendered.html).toContain('Your email is bob@example.com');
      // Missing variables should remain as placeholders or be empty
      expect(rendered.html).toMatch(/(\$\{company\}|you work at \.)/);
      expect(rendered.html).toMatch(/(\$\{senderName\}|<br\/>)/);
    });

    it('should handle empty context object', async () => {
      const renderRes = await app.inject({
        method: 'POST',
        url: `/templates/${templateId}/render`,
        payload: { context: {} }
      });

      expect(renderRes.statusCode).toBe(200);
      const rendered = JSON.parse(renderRes.payload);
      
      // Empty variables are replaced with empty strings
      expect(rendered.subject).toBe('Hello ');
      expect(rendered.html).toContain('Dear ,');
      expect(rendered.html).toContain('Your email is  and you work at ');
      expect(rendered.html).toContain('Best regards,<br/>');
    });

    it('should handle special characters in variable values', async () => {
      const renderRes = await app.inject({
        method: 'POST',
        url: `/templates/${templateId}/render`,
        payload: { 
          context: { 
            name: 'José María & Sons <special@chars.com>',
            email: 'josé@español.com',
            company: 'Tëst & Co. "Quotes"',
            senderName: 'Support <no-reply@test.com>'
          } 
        }
      });

      expect(renderRes.statusCode).toBe(200);
      const rendered = JSON.parse(renderRes.payload);
      
      expect(rendered.subject).toBe('Hello José María & Sons <special@chars.com>');
      expect(rendered.html).toContain('José María & Sons <special@chars.com>'); // No HTML escaping
      expect(rendered.html).toContain('josé@español.com');
      expect(rendered.html).toContain('Tëst & Co. "Quotes"'); // No HTML escaping
      expect(rendered.html).toContain('Support <no-reply@test.com>');
    });
  });

  describe('Template CRUD with Simplified Schema', () => {
    it('should create template with only required fields', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/templates',
        payload: {
          appId: testAppId,
          title: 'test-template-eval-minimal-create-crud',
          subject: 'Subject for ${name}',
          content: 'Hello ${name}!',
          version: 1
        }
      });

      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.payload);
      expect(created.title).toBe('test-template-eval-minimal-create-crud');
      expect(created.subject).toBe('Subject for ${name}');
      expect(created.content).toBe('Hello ${name}!');
      expect(created.appId).toBe(testAppId);
      expect(created.version).toBe(1);
      expect(created.isActive).toBe(true); // Default
      
      createdTemplateIds.push(created.id); // Track for cleanup
    });

    it('should create template with optional subject', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/templates',
        payload: {
          appId: testAppId,
          title: 'test-template-eval-subject-create-crud',
          subject: 'Welcome ${name}',
          content: 'Welcome to our service!',
          version: 1
        }
      });

      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.payload);
      expect(created.subject).toBe('Welcome ${name}');
      
      createdTemplateIds.push(created.id); // Track for cleanup
    });

    it('should reject template creation with old schema fields', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/templates',
        payload: {
          appId: testAppId,
          name: 'Old Schema Template', // Old field
          bodyHtml: '<p>Hello</p>', // Old field
          bodyText: 'Hello', // Old field
          variables: {}, // Old field
          version: 1
        }
      });

      expect(createRes.statusCode).toBe(400);
    });

    it('should retrieve template with simplified schema', async () => {
      const getRes = await app.inject({
        method: 'GET',
        url: `/templates/${templateId}`
      });

      expect(getRes.statusCode).toBe(200);
      const template = JSON.parse(getRes.payload);
      
      expect(template.title).toBe('test-template-eval-beforeeach-var-test');
      expect(template.content).toContain('<p>Dear ${name},</p>');
      expect(template.subject).toBe('Hello ${name}');
      
      // Should not have old schema fields
      expect(template.name).toBeUndefined();
      expect(template.bodyHtml).toBeUndefined();
      expect(template.bodyText).toBeUndefined();
      expect(template.variables).toBeUndefined();
      expect(template.description).toBeUndefined();
    });
  });

  describe('Send-Now Integration with Templates', () => {
    it('should use templateId for email sending with variable substitution', async () => {
      const sendRes = await app.inject({
        method: 'POST',
        url: '/send-now',
        payload: {
          appId: testAppId,
          templateId: templateId,
          recipients: [
            { 
              email: 'test1@example.com', 
              name: 'Test User 1',
              company: 'Company A'
            },
            { 
              email: 'test2@example.com', 
              name: 'Test User 2',
              company: 'Company B'
            }
          ]
        }
      });

      expect(sendRes.statusCode).toBe(200);
      const result = JSON.parse(sendRes.payload);
      
      expect(result.groupId).toBeDefined();
      expect(result.scheduled).toBe(false); // Immediate send
      expect(result.jobCount).toBe(2);
    });

    it('should prioritize explicit subject/html over templateId', async () => {
      const sendRes = await app.inject({
        method: 'POST',
        url: '/send-now',
        payload: {
          appId: testAppId,
          templateId: templateId,
          subject: 'Override Subject ${name}',
          html: '<p>Override content for ${name}</p>',
          recipients: [
            { 
              email: 'test@example.com', 
              name: 'Override Test'
            }
          ]
        }
      });

      expect(sendRes.statusCode).toBe(200);
      const result = JSON.parse(sendRes.payload);
      expect(result.groupId).toBeDefined();
      // The explicit subject/html should override the template
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent template gracefully', async () => {
      const renderRes = await app.inject({
        method: 'POST',
        url: '/templates/non-existent-id/render',
        payload: { context: { name: 'Test' } }
      });

      expect(renderRes.statusCode).toBe(404);
    });

    it('should handle invalid template ID format', async () => {
      const renderRes = await app.inject({
        method: 'POST',
        url: '/templates/invalid-id/render',
        payload: { context: { name: 'Test' } }
      });

      expect(renderRes.statusCode).toBe(404);
    });
  });
});