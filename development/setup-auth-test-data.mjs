import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Exact IDs expected by auth integration tests
const REAL_TENANT_ID = 'cmfgkxlyt000010msi8qxmraa';
const REAL_APP_ID = 'cmfgkybbi000410mssq4gnw8a';

async function main() {
  try {
    console.log('Setting up auth test data...');
    
    // Check if tenant exists
    let tenant = await prisma.tenant.findUnique({ where: { id: REAL_TENANT_ID } });
    
    if (!tenant) {
      console.log('Creating Email Testing Sandbox tenant...');
      tenant = await prisma.tenant.create({
        data: {
          id: REAL_TENANT_ID,
          name: 'Email Testing Sandbox',
          status: 'active'
        }
      });
      console.log('Created tenant:', tenant);
    } else {
      console.log('Tenant already exists:', tenant.name);
    }
    
    // Check if app exists
    let app = await prisma.app.findUnique({ where: { id: REAL_APP_ID } });
    
    if (!app) {
      console.log('Creating test app...');
      app = await prisma.app.create({
        data: {
          id: REAL_APP_ID,
          name: 'Auth Test App',
          clientId: 'smtp-test-app', // This matches the fallback logic in /me endpoint
          tenantId: REAL_TENANT_ID
        }
      });
      console.log('Created app:', app);
    } else {
      console.log('App already exists:', app.name);
    }
    
    console.log('Auth test data setup complete!');
    console.log('Tenant ID:', REAL_TENANT_ID);
    console.log('App ID:', REAL_APP_ID);
    
  } catch (error) {
    console.error('Error setting up test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();