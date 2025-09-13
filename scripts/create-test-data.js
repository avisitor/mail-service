#!/usr/bin/env node

// Script to create test tenant and app data for SMTP configuration testing
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestData() {
  console.log('Creating test tenant and app data...');
  
  try {
    // Create test tenants
    const tenant1 = await prisma.tenant.upsert({
      where: { id: 'test-tenant-1' },
      update: {},
      create: {
        id: 'test-tenant-1',
        name: 'Acme Corporation',
        status: 'active'
      }
    });
    
    const tenant2 = await prisma.tenant.upsert({
      where: { id: 'test-tenant-2' },
      update: {},
      create: {
        id: 'test-tenant-2',
        name: 'Beta Industries',
        status: 'active'
      }
    });
    
    console.log('Created tenants:', [tenant1.name, tenant2.name]);
    
    // Create test apps for tenant1
    const app1 = await prisma.app.upsert({
      where: { id: 'test-app-1' },
      update: {},
      create: {
        id: 'test-app-1',
        tenantId: 'test-tenant-1',
        name: 'Acme Web Portal',
        clientId: 'acme-web-portal-client'
      }
    });
    
    const app2 = await prisma.app.upsert({
      where: { id: 'test-app-2' },
      update: {},
      create: {
        id: 'test-app-2',
        tenantId: 'test-tenant-1',
        name: 'Acme Mobile App',
        clientId: 'acme-mobile-app-client'
      }
    });
    
    // Create test app for tenant2
    const app3 = await prisma.app.upsert({
      where: { id: 'test-app-3' },
      update: {},
      create: {
        id: 'test-app-3',
        tenantId: 'test-tenant-2',
        name: 'Beta Dashboard',
        clientId: 'beta-dashboard-client'
      }
    });
    
    console.log('Created apps:', [app1.name, app2.name, app3.name]);
    
    console.log('\nTenant and app data creation completed successfully!');
    console.log('\nCreated tenants:');
    console.log('- Acme Corporation (test-tenant-1)');
    console.log('- Beta Industries (test-tenant-2)');
    console.log('\nCreated apps:');
    console.log('- Acme Web Portal (test-app-1) under Acme Corporation');
    console.log('- Acme Mobile App (test-app-2) under Acme Corporation');
    console.log('- Beta Dashboard (test-app-3) under Beta Industries');
    console.log('\nYou can now test the SMTP configuration UI with:');
    console.log('- Global scope (SuperAdmin access)');
    console.log('- Tenant scope (Acme Corporation, Beta Industries)');
    console.log('- App scope (Acme Web Portal, Acme Mobile App, Beta Dashboard)');
    console.log('\nUse the UI or create additional SMTP configs via API endpoints.');
    
  } catch (error) {
    console.error('Error creating test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestData();