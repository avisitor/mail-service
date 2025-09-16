#!/usr/bin/env node

// Use compiled JS version from dist
const { getPrisma } = await import('../dist/src/db/prisma.js');

const prisma = getPrisma();

// Legitimate production/development data that must be preserved
const PRESERVE_TENANTS = [
  'cmfc3o60i001uhzacbm7d8qn9', // Route Tenant
  'cmfc89dug0000j6fb1cury7v5', // Acme Corp  
  'test-tenant-1',              // Acme Corporation
  'test-tenant-2',              // Beta Industries
  'robs-world-tenant',          // Robs World
  'cmfgkxlyt000010msi8qxmraa'   // Email Testing Sandbox
];

const PRESERVE_APPS = [
  'cmfc3o60j001whzacuf0exyvw', // Default App (Route)
  'cmfc3o60m001yhzacacu0va5e', // Route App
  'cmfc89duj0002j6fb2f8ozs4f', // Default App (Acme)
  'test-app-1',                // Acme Web Portal
  'test-app-2',                // Acme Mobile App
  'cmfka688r0001b77ofpgm57ix', // ReTree Hawaii
  'outings-app-id',            // Outings
  'cmfm6bqcf0001ylk8lx4pyd6n', // ReTree Hawaii (newer)
  'cmfm6bqcj0003ylk8qbr4e9hb'  // Outings (newer)
];

const PRESERVE_SMTP_CONFIGS = [
  'cmfgbhgmt0001r9e0j40s7fzo', // Acme Corporation SMTP
  'cmfgbho460003r9e0e96cmi4j', // Acme Web Portal SMTP
  'cmfgkz9k2000810ms012dvp3u'  // SES Testing Service
];

const PRESERVE_TEMPLATES = [
  'cmfc3o60o0020hzacs9zo4vu7'  // routeTpl
];

async function cleanupTestData() {
  console.log('🧹 Starting selective cleanup of test pollution...');
  console.log(`📌 Preserving ${PRESERVE_TENANTS.length} legitimate tenants`);
  console.log(`📌 Preserving ${PRESERVE_APPS.length} legitimate apps`);
  console.log(`📌 Preserving ${PRESERVE_SMTP_CONFIGS.length} legitimate SMTP configs`);
  console.log(`📌 Preserving ${PRESERVE_TEMPLATES.length} legitimate templates`);
  
  try {
    // Find test pollution tenants (exclude legitimate ones)
    const testTenants = await prisma.tenant.findMany({
      where: {
        AND: [
          { id: { notIn: PRESERVE_TENANTS } },
          {
            OR: [
              // Created today (likely test pollution)
              { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
              // Obvious test patterns
              { name: { contains: 'Email Test Tenant' } },
              { name: { contains: 'Worker Test Tenant' } },
              { name: { contains: 'Debug Test Tenant' } },
              { name: { contains: 'Quick Test Tenant' } },
              { name: { contains: 'Auth Test Tenant' } },
              { name: { contains: 'SES Test Tenant' } },
              { name: { contains: 'SMTP Test Tenant' } },
              { name: { contains: 'UI Test Tenant' } },
              { name: { equals: 'Test Tenant' } },
              { name: { equals: 'Get Test Tenant' } },
              { name: { equals: 'Mem Test Tenant' } },
              { name: { equals: 'Groups Test Tenant' } },
              { name: { contains: 'Original Tenant Name' } },
              { name: { contains: 'Tenant to Delete' } },
              { name: { contains: 'Updated Tenant Name' } },
              { id: { in: ['t1', 'tenant1', 'test-tenant', 'tenant_mem', 'tenant-groups', 'tenant-worker', 'tenant-a', 'tenant-b'] } }
            ]
          }
        ]
      }
    });
    
    console.log(`🎯 Found ${testTenants.length} test pollution tenants to clean up`);
    
    // Get all test tenant IDs
    const testTenantIds = testTenants.map(t => t.id);
    
    if (testTenantIds.length === 0) {
      console.log('✅ No test pollution found - database is clean!');
      return;
    }
    
    // Show sample of what will be deleted
    console.log('📋 Sample tenants to be deleted:');
    testTenants.slice(0, 5).forEach(t => {
      console.log(`   - ${t.id}: "${t.name}"`);
    });
    if (testTenants.length > 5) {
      console.log(`   ... and ${testTenants.length - 5} more`);
    }
    
    // Clean up in reverse dependency order
    
    // 1. Clean up recipients and messages (they depend on message groups)
    console.log('🗑️  Cleaning up recipients and messages...');
    const messageGroups = await prisma.messageGroup.findMany({
      where: { tenantId: { in: testTenantIds } },
      select: { id: true }
    });
    const groupIds = messageGroups.map(g => g.id);
    
    if (groupIds.length > 0) {
      const recipients = await prisma.recipient.findMany({
        where: { groupId: { in: groupIds } },
        select: { id: true }
      });
      const recipientIds = recipients.map(r => r.id);
      
      if (recipientIds.length > 0) {
        const deletedMessages = await prisma.message.deleteMany({
          where: { recipientId: { in: recipientIds } }
        });
        console.log(`   Deleted ${deletedMessages.count} messages`);
      }
      
      const deletedRecipients = await prisma.recipient.deleteMany({
        where: { groupId: { in: groupIds } }
      });
      console.log(`   Deleted ${deletedRecipients.count} recipients`);
      
      const deletedEvents = await prisma.event.deleteMany({
        where: { groupId: { in: groupIds } }
      });
      console.log(`   Deleted ${deletedEvents.count} events`);
    }
    
    // 2. Clean up message groups
    console.log('🗑️  Cleaning up message groups...');
    const deletedGroups = await prisma.messageGroup.deleteMany({
      where: { tenantId: { in: testTenantIds } }
    });
    console.log(`   Deleted ${deletedGroups.count} message groups`);
    
    // 3. Clean up templates (exclude preserved ones)
    console.log('🗑️  Cleaning up templates...');
    const deletedTemplates = await prisma.template.deleteMany({
      where: {
        AND: [
          { id: { notIn: PRESERVE_TEMPLATES } },
          {
            OR: [
              { tenantId: { in: testTenantIds } },
              { name: { startsWith: 'welcome-' } },
              { name: { contains: 'test' } },
              { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
            ]
          }
        ]
      }
    });
    console.log(`   Deleted ${deletedTemplates.count} templates`);
    
    // 4. Clean up SMTP configs (exclude preserved ones)
    console.log('🗑️  Cleaning up SMTP configs...');
    const deletedSmtpConfigs = await prisma.smtpConfig.deleteMany({
      where: {
        AND: [
          { id: { notIn: PRESERVE_SMTP_CONFIGS } },
          {
            OR: [
              { tenantId: { in: testTenantIds } },
              { host: 'localhost' },
              { fromAddress: { contains: 'test' } },
              { fromName: { contains: 'Test' } },
              { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
            ]
          }
        ]
      }
    });
    console.log(`   Deleted ${deletedSmtpConfigs.count} SMTP configs`);
    
    // 5. Clean up apps (exclude preserved ones)
    console.log('🗑️  Cleaning up apps...');
    const deletedApps = await prisma.app.deleteMany({
      where: {
        AND: [
          { id: { notIn: PRESERVE_APPS } },
          {
            OR: [
              { tenantId: { in: testTenantIds } },
              { name: { contains: 'Test App' } },
              { name: { contains: 'SMTP Test' } },
              { name: { contains: 'SES Test' } },
              { name: { contains: 'Worker Test' } },
              { name: { contains: 'Auth Test' } },
              { name: { contains: 'Debug Test' } },
              { name: { contains: 'Quick Test' } },
              { clientId: { contains: 'test' } },
              { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
            ]
          }
        ]
      }
    });
    console.log(`   Deleted ${deletedApps.count} apps`);
    
    // 6. Clean up tenants (the test pollution ones we identified)
    console.log('🗑️  Cleaning up tenants...');
    const deletedTenants = await prisma.tenant.deleteMany({
      where: { id: { in: testTenantIds } }
    });
    console.log(`   Deleted ${deletedTenants.count} tenants`);
    
    console.log('\n✅ Selective test data cleanup completed successfully!');
    console.log('📌 All legitimate production/development data has been preserved');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupTestData();