#!/usr/bin/env node
/**
 * Quick Configuration Test
 * Just creates the hierarchy and checks if the configuration is properly created
 */

const API_BASE = 'http://localhost:3100';

async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options
  };
  
  const response = await fetch(url, config);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return response.json();
}

async function quickTest() {
  try {
    console.log('🧪 Quick Configuration Test');
    console.log('===========================\n');
    
    // Create tenant
    const tenant = await apiCall('/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Quick Test Tenant',
        description: 'Quick test for configuration creation'
      })
    });
    console.log(`✓ Created tenant: ${tenant.id}`);

    // Create app
    const app = await apiCall('/apps', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: tenant.id,
        name: 'Quick Test App',
        clientId: `quick-test-${Date.now()}`,
        description: 'App for quick configuration test'
      })
    });
    console.log(`✓ Created app: ${app.id}`);

    // Create APP-level SMTP config
    const smtpConfig = await apiCall('/smtp-configs', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'APP',
        appId: app.id, // This should link the config to the app
        service: 'smtp',
        host: 'localhost',
        port: 1025,
        username: '',
        password: '',
        secure: false
      })
    });
    console.log(`✓ Created SMTP config: ${smtpConfig.id}`);
    console.log(`   AppId: ${smtpConfig.appId}`);
    console.log(`   TenantId: ${smtpConfig.tenantId}`);
    console.log(`   Host: ${smtpConfig.host}:${smtpConfig.port}`);

    // Verify the config exists in the database
    console.log('\n🔍 Checking if config appears in database...');
    const allConfigs = await apiCall('/smtp-configs');
    const ourConfig = allConfigs.find(c => c.id === smtpConfig.id);
    
    if (ourConfig) {
      console.log('✅ Config found in database:');
      console.log(`   ID: ${ourConfig.id}`);
      console.log(`   Service: ${ourConfig.service}`);
      console.log(`   Scope: ${ourConfig.scope}`);
      console.log(`   AppId: ${ourConfig.appId}`);
      console.log(`   TenantId: ${ourConfig.tenantId}`);
      console.log(`   Host: ${ourConfig.host}:${ourConfig.port}`);
    } else {
      console.error('❌ Config NOT found in database!');
    }

    // Test resolution logic
    console.log('\n🎯 Testing Resolution...');
    const allApps = await apiCall('/apps');
    const ourApp = allApps.find(a => a.id === app.id);
    
    if (ourApp) {
      console.log(`Found our app: ${ourApp.id} (${ourApp.name})`);
      console.log(`   TenantId: ${ourApp.tenantId}`);
      
      // Check what config would be resolved
      const appConfig = allConfigs.find(c => 
        c.scope === 'APP' && c.appId === ourApp.id
      );
      
      if (appConfig) {
        console.log('✅ APP-level config would be found by resolution logic');
        console.log(`   Config: ${appConfig.service} → ${appConfig.host}:${appConfig.port}`);
      } else {
        console.log('❌ APP-level config would NOT be found by resolution logic');
        
        // Check tenant-level fallback
        const tenantConfig = allConfigs.find(c => 
          c.scope === 'TENANT' && c.tenantId === ourApp.tenantId
        );
        
        if (tenantConfig) {
          console.log(`   Would fall back to TENANT config: ${tenantConfig.service}`);
        } else {
          console.log('   Would fall back to GLOBAL config');
        }
      }
    }

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await apiCall(`/smtp-configs/${smtpConfig.id}`, { method: 'DELETE' });
    await apiCall(`/apps/${app.id}`, { method: 'DELETE' });
    await apiCall(`/tenants/${tenant.id}`, { method: 'DELETE' });
    console.log('✅ Cleanup complete');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

quickTest();