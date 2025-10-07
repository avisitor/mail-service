#!/usr/bin/env node

/**
 * CLI tool to generate client secrets for apps
 * Usage: node generate-app-secret.mjs <appId>
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set up environment
process.env.NODE_PATH = join(__dirname, 'dist');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

async function main() {
  const appId = process.argv[2];
  
  if (!appId) {
    console.error('Usage: node generate-app-secret.mjs <appId>');
    console.error('       node generate-app-secret.mjs --list-apps');
    process.exit(1);
  }
  
  if (appId === '--list-apps') {
    await listApps();
    return;
  }
  
  await generateSecret(appId);
}

async function listApps() {
  try {
    const { getPrisma } = await import('./dist/src/db/prisma.js');
    const prisma = getPrisma();
    
    const apps = await prisma.app.findMany({
      select: {
        id: true,
        name: true,
        clientId: true,
        clientSecret: true,
        tenant: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('\n📱 Available Apps:');
    console.log('==================');
    
    for (const app of apps) {
      const hasSecret = !!app.clientSecret;
      const status = hasSecret ? '🔒 Secure' : '⚠️  Insecure';
      
      console.log(`\nApp ID: ${app.id}`);
      console.log(`Name: ${app.name}`);
      console.log(`Client ID: ${app.clientId}`);
      console.log(`Tenant: ${app.tenant.name}`);
      console.log(`Status: ${status}`);
      
      if (hasSecret) {
        console.log('Secret: ••••••••••••••••••••••••••••••••');
      } else {
        console.log('Secret: Not set');
      }
    }
    
    console.log('\n💡 To generate a secret for an app:');
    console.log('   node generate-app-secret.mjs <app-id>');
    
  } catch (error) {
    console.error('❌ Error listing apps:', error.message);
    process.exit(1);
  }
}

async function generateSecret(appId) {
  try {
    const { getPrisma } = await import('./dist/src/db/prisma.js');
    const { generateClientSecret, hashClientSecret, maskClientSecret } = await import('./dist/src/security/secrets.js');
    
    const prisma = getPrisma();
    
    // Find the app
    const app = await prisma.app.findUnique({
      where: { id: appId },
      include: {
        tenant: {
          select: { name: true }
        }
      }
    });
    
    if (!app) {
      console.error(`❌ App not found: ${appId}`);
      console.log('\n💡 Use --list-apps to see available apps');
      process.exit(1);
    }
    
    console.log(`\n🔧 Generating client secret for app:`);
    console.log(`   Name: ${app.name}`);
    console.log(`   Client ID: ${app.clientId}`);
    console.log(`   Tenant: ${app.tenant.name}`);
    
    if (app.clientSecret) {
      console.log('\n⚠️  This app already has a client secret.');
      console.log('   Continuing will replace the existing secret.');
      console.log('   Any applications using the old secret will stop working.');
    }
    
    // Generate new secret
    const newSecret = generateClientSecret();
    const hashedSecret = await hashClientSecret(newSecret);
    
    // Update the app
    await prisma.app.update({
      where: { id: appId },
      data: { clientSecret: hashedSecret }
    });
    
    console.log('\n✅ Client secret generated successfully!');
    console.log('\n🔑 CLIENT SECRET (save this securely):');
    console.log('======================================');
    console.log(newSecret);
    console.log('======================================');
    
    console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
    console.log('• This secret will NOT be shown again');
    console.log('• Store it securely (environment variables, secure vault)');
    console.log('• Never commit it to version control');
    console.log('• Use it in your app\'s token requests');
    
    console.log('\n📋 Example usage in your application:');
    console.log('=====================================');
    console.log('const response = await fetch(\'/api/token\', {');
    console.log('  method: \'POST\',');
    console.log('  headers: { \'Content-Type\': \'application/json\' },');
    console.log('  body: JSON.stringify({');
    console.log(`    appId: '${app.clientId}',`);
    console.log('    clientSecret: process.env.CLIENT_SECRET,');
    console.log('    type: \'application\'');
    console.log('  })');
    console.log('});');
    
    console.log('\n🌍 Environment variable:');
    console.log(`CLIENT_SECRET=${newSecret}`);
    
  } catch (error) {
    console.error('❌ Error generating secret:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});