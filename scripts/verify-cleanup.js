// Verify cleanup results
const { getPrisma } = await import('../dist/src/db/prisma.js');

try {
  const prisma = getPrisma();
  
  console.log('📊 Database state after cleanup:');
  console.log('================================');
  
  const tenantCount = await prisma.tenant.count();
  console.log(`📋 Total tenants: ${tenantCount}`);
  
  const appCount = await prisma.app.count();
  console.log(`📱 Total apps: ${appCount}`);
  
  const smtpCount = await prisma.smtpConfig.count();
  console.log(`📧 Total SMTP configs: ${smtpCount}`);
  
  const templateCount = await prisma.template.count();
  console.log(`📄 Total templates: ${templateCount}`);
  
  const messageGroupCount = await prisma.messageGroup.count();
  console.log(`📬 Total message groups: ${messageGroupCount}`);
  
  const messageCount = await prisma.message.count();
  console.log(`✉️  Total messages: ${messageCount}`);
  
  console.log('\n🔍 Remaining tenant names:');
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, createdAt: true }
  });
  
  tenants.forEach(tenant => {
    const date = new Date(tenant.createdAt).toISOString().split('T')[0];
    console.log(`   - ${tenant.id}: "${tenant.name}" (${date})`);
  });
  
  console.log('\n🔍 Remaining app names:');
  const apps = await prisma.app.findMany({
    select: { id: true, name: true, createdAt: true }
  });
  
  apps.forEach(app => {
    const date = new Date(app.createdAt).toISOString().split('T')[0];
    console.log(`   - ${app.id}: "${app.name}" (${date})`);
  });
  
  console.log('\n✅ Verification complete!');
  
} catch (error) {
  console.error('❌ Error during verification:', error);
} finally {
  process.exit(0);
}