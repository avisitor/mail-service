const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Check existing tenants
    console.log('=== Existing Tenants ===');
    const tenants = await prisma.tenant.findMany({
      include: {
        apps: true
      }
    });
    console.log(JSON.stringify(tenants, null, 2));
    
    // Check if 'Robs World' tenant exists
    let robsWorldTenant = tenants.find(t => t.name === 'Robs World');
    
    if (!robsWorldTenant) {
      console.log('\n=== Creating Robs World Tenant ===');
      robsWorldTenant = await prisma.tenant.create({
        data: {
          name: 'Robs World'
        }
      });
      console.log('Created tenant:', robsWorldTenant);
    }
    
    // Check existing apps for Robs World
    const existingApps = await prisma.app.findMany({
      where: {
        tenantId: robsWorldTenant.id
      }
    });
    
    console.log('\n=== Existing Apps for Robs World ===');
    console.log(JSON.stringify(existingApps, null, 2));
    
    // Create ReTree Hawaii app if it doesn't exist
    const reTreeApp = existingApps.find(app => app.clientId === 'retree-hawaii');
    if (!reTreeApp) {
      console.log('\n=== Creating ReTree Hawaii App ===');
      const newReTreeApp = await prisma.app.create({
        data: {
          name: 'ReTree Hawaii',
          clientId: 'retree-hawaii',
          tenantId: robsWorldTenant.id
        }
      });
      console.log('Created ReTree Hawaii app:', newReTreeApp);
    }
    
    // Create Outings app if it doesn't exist
    const outingsApp = existingApps.find(app => app.clientId === 'outings');
    if (!outingsApp) {
      console.log('\n=== Creating Outings App ===');
      const newOutingsApp = await prisma.app.create({
        data: {
          name: 'Outings',
          clientId: 'outings',
          tenantId: robsWorldTenant.id
        }
      });
      console.log('Created Outings app:', newOutingsApp);
    }
    
    // Final check - show all apps for Robs World
    const finalApps = await prisma.app.findMany({
      where: {
        tenantId: robsWorldTenant.id
      }
    });
    
    console.log('\n=== Final Apps for Robs World ===');
    console.log(JSON.stringify(finalApps, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();