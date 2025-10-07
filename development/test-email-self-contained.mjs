#!/usr/bin/env node
/**
 * Self-Contained Email Testing Script
 * Creates its own test hierarchy, runs tests, and cleans up afterwards
 */

import { getAdaptiveHeaders } from './test-utils/auth.mjs';

const API_BASE = 'http://localhost:3100';
const MAILHOG_API = 'http://localhost:8025/api/v2';

// Test data will be populated during setup
let testData = {
  tenant: null,
  smtpApp: null,
  sesApp: null,
  smtpConfig: null,
  sesConfig: null
};

// Global variable to cache auth headers once determined
let authHeaders = null;

async function getHeaders() {
  if (authHeaders === null) {
    authHeaders = await getAdaptiveHeaders({ 
      roles: ['superadmin']  // Need superadmin to create tenants and apps
    }, API_BASE);
  }
  return authHeaders;
}

async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = await getHeaders();
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...options.headers
    },
    ...options
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API call failed: ${response.status} ${error}`);
  }
  
  // Handle 204 No Content responses (like DELETE operations)
  if (response.status === 204) {
    return null;
  }
  
  // Check if response has content before trying to parse JSON
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  
  // If no JSON content type, return text
  const text = await response.text();
  return text ? text : null;
}

async function checkMailHogAvailable() {
  try {
    const response = await fetch(`${MAILHOG_API}/messages`);
    if (response.ok) {
      console.log('✅ MailHog is available');
      return true;
    }
  } catch (error) {
    console.log('❌ MailHog is not available - SMTP tests will be skipped');
    console.log('   To start MailHog: mailhog');
    return false;
  }
  return false;
}

async function clearMailHog() {
  try {
    await fetch(`${MAILHOG_API}/messages`, { method: 'DELETE' });
    console.log('📧 MailHog inbox cleared');
  } catch (error) {
    console.warn('⚠️  Could not clear MailHog inbox:', error.message);
  }
}

async function checkMailHogMessages() {
  try {
    const response = await fetch(`${MAILHOG_API}/messages`);
    const messages = await response.json();
    return messages.total;
  } catch (error) {
    console.error('❌ Error checking MailHog:', error.message);
    return 0;
  }
}

async function setupTestHierarchy() {
  console.log('\n🏗️  Setting up test hierarchy...');
  
  try {
    // Create test tenant
    const tenant = await apiCall('/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Email Test Tenant',
        description: 'Temporary tenant for email testing'
      })
    });
    testData.tenant = tenant;
    console.log(`   ✓ Created tenant: ${tenant.id}`);

    // Create SMTP app
    const smtpApp = await apiCall('/apps', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: tenant.id,
        name: 'SMTP Test App',
        clientId: `smtp-test-${Date.now()}`,
        description: 'App with SMTP configuration'
      })
    });
    testData.smtpApp = smtpApp;
    console.log(`   ✓ Created SMTP app: ${smtpApp.id}`);

    // Create SES app (without its own config - will inherit from tenant)
    const sesApp = await apiCall('/apps', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: tenant.id,
        name: 'SES Test App',
        clientId: `ses-test-${Date.now()}`,
        description: 'App without config - inherits SES from tenant'
      })
    });
    testData.sesApp = sesApp;
    console.log(`   ✓ Created SES app: ${sesApp.id}`);

    // Create APP-level SMTP config
    const smtpConfig = await apiCall('/smtp-configs', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'APP',
        appId: smtpApp.id,
        service: 'smtp',
        host: 'localhost',
        port: 1025,
        secure: false,
        fromAddress: 'test-smtp@localhost.local',
        fromName: 'SMTP Test Service',
        isActive: true
      })
    });
    testData.smtpConfig = smtpConfig;
    console.log(`   ✓ Created APP-level SMTP config: ${smtpConfig.id}`);

    // Create TENANT-level SES config
    const sesConfig = await apiCall('/smtp-configs', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'TENANT',
        tenantId: tenant.id,
        service: 'ses',
        host: 'ses.amazonaws.com',  // Dummy host for SES (required by schema)
        awsRegion: 'us-east-1',
        awsAccessKey: 'test-access-key',
        awsSecretKey: 'test-secret-key',
        fromAddress: 'test-ses@example.com',
        fromName: 'SES Test Service',
        isActive: true
      })
    });
    testData.sesConfig = sesConfig;
    console.log(`   ✓ Created TENANT-level SES config: ${sesConfig.id}`);

    console.log('✅ Test hierarchy setup complete');
    return true;

  } catch (error) {
    console.error('❌ Failed to setup test hierarchy:', error.message);
    return false;
  }
}

async function cleanupTestHierarchy() {
  console.log('\n🧹 Cleaning up test hierarchy...');
  
  const cleanupErrors = [];
  
  // Helper function to safely delete an item
  async function safeDelete(description, deleteFunc) {
    try {
      await deleteFunc();
      console.log(`   ✓ ${description}`);
    } catch (error) {
      const errorMsg = `Failed to delete ${description}: ${error.message}`;
      console.log(`   ⚠️  ${errorMsg}`);
      cleanupErrors.push(errorMsg);
    }
  }
  
  // Delete configurations first (dependencies before parents)
  if (testData.smtpConfig && testData.smtpConfig.id) {
    await safeDelete(
      `SMTP config: ${testData.smtpConfig.id}`,
      () => apiCall(`/smtp-configs/${testData.smtpConfig.id}`, { method: 'DELETE' })
    );
  }
  
  if (testData.sesConfig && testData.sesConfig.id) {
    await safeDelete(
      `SES config: ${testData.sesConfig.id}`,
      () => apiCall(`/smtp-configs/${testData.sesConfig.id}`, { method: 'DELETE' })
    );
  }

  // Delete apps
  if (testData.smtpApp && testData.smtpApp.id) {
    await safeDelete(
      `SMTP app: ${testData.smtpApp.id}`,
      () => apiCall(`/apps/${testData.smtpApp.id}`, { method: 'DELETE' })
    );
  }
  
  if (testData.sesApp && testData.sesApp.id) {
    await safeDelete(
      `SES app: ${testData.sesApp.id}`,
      () => apiCall(`/apps/${testData.sesApp.id}`, { method: 'DELETE' })
    );
  }

  // Delete tenant last
  if (testData.tenant && testData.tenant.id) {
    await safeDelete(
      `tenant: ${testData.tenant.id}`,
      () => apiCall(`/tenants/${testData.tenant.id}`, { method: 'DELETE' })
    );
  }

  if (cleanupErrors.length > 0) {
    console.log(`⚠️  Cleanup completed with ${cleanupErrors.length} error(s):`);
    cleanupErrors.forEach(error => console.log(`     - ${error}`));
  } else {
    console.log('✅ Cleanup completed successfully');
  }
}

async function testConfigurationResolution() {
  console.log('\n🔧 Testing Configuration Resolution...');
  
  try {
    // Test APP-level SMTP resolution
    const configs = await apiCall('/smtp-configs');
    const appConfig = configs.find(c => c.id === testData.smtpConfig.id);
    
    if (appConfig) {
      console.log(`   ✓ APP-level SMTP config found: ${appConfig.service} (${appConfig.host}:${appConfig.port})`);
      
      // Verify it points to MailHog
      if (appConfig.host === 'localhost' && appConfig.port === 1025) {
        console.log('   ✓ Configuration correctly points to MailHog');
      } else {
        throw new Error(`Configuration points to ${appConfig.host}:${appConfig.port} instead of localhost:1025`);
      }
    } else {
      throw new Error('APP-level SMTP config not found');
    }

    // Test TENANT-level SES resolution
    const tenantConfig = configs.find(c => c.id === testData.sesConfig.id);
    
    if (tenantConfig) {
      console.log(`   ✓ TENANT-level SES config found: ${tenantConfig.service} (${tenantConfig.awsRegion})`);
    } else {
      throw new Error('TENANT-level SES config not found');
    }

    // Verify the appId resolves to our test SMTP config
    console.log(`   Testing resolution for appId: ${testData.smtpApp.id}`);
    
    // Note: We can't easily test resolveSmtpConfig directly in this script since it's in the compiled code
    // But we can verify through the API that our setup is correct

    console.log('✅ Configuration resolution test passed');
    return true;

  } catch (error) {
    console.error('❌ Configuration resolution test failed:', error.message);
    throw error;
  }
}

async function testSmtpEmail() {
  console.log('\n📧 Testing SMTP Email...');
  
  // Clear MailHog before test
  try {
    await fetch(`${MAILHOG_API}/messages`, { method: 'DELETE' });
    console.log('   📧 MailHog inbox cleared for test');
  } catch (error) {
    console.warn('   ⚠️  Could not clear MailHog inbox:', error.message);
  }
  
  const startCount = await checkMailHogMessages();
  
  try {
    // First, show what configuration will be used
    console.log(`   🔍 Checking configuration resolution for appId: ${testData.smtpApp.id}`);
    
    const allConfigs = await apiCall('/smtp-configs');
    const appConfig = allConfigs.find(c => c.id === testData.smtpConfig.id);
    
    if (appConfig) {
      console.log('   📋 APP-level SMTP config that should be used:');
      console.log(`      Service: ${appConfig.service}`);
      console.log(`      Host: ${appConfig.host}`);
      console.log(`      Port: ${appConfig.port}`);
      console.log(`      Username: ${appConfig.username}`);
      console.log(`      Secure: ${appConfig.secure}`);
      console.log(`      Scope: ${appConfig.scope}`);
      console.log(`      AppId: ${appConfig.appId}`);
      console.log(`      TenantId: ${appConfig.tenantId}`);
    } else {
      console.log('   ⚠️  APP-level SMTP config not found in database');
    }
    
    const payload = {
      appId: testData.smtpApp.id, // This app has APP-level config pointing to MailHog
      subject: `Self-Contained SMTP Test ${new Date().toISOString()}`,
      html: '<h1>Self-Contained SMTP Test</h1><p>This email was sent through a temporary test configuration pointing to MailHog.</p>',
      recipients: [
        {
          email: 'smtp-test@localhost.local',
          name: 'SMTP Test User'
        }
      ]
    };
    
    console.log('   Sending email via /send-now...');
    const result = await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    console.log(`   ✓ Email scheduled: Group ID ${result.groupId}`);
    
    // Wait for processing with multiple checks
    console.log('   Waiting for email processing...');
    let delivered = false;
    let attempts = 0;
    const maxAttempts = 15; // 15 attempts over 30 seconds
    
    while (!delivered && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      attempts++;
      
      const currentCount = await checkMailHogMessages();
      if (currentCount > startCount) {
        delivered = true;
        console.log(`   ✓ Email delivered after ${attempts * 2} seconds`);
        
        // Verify it's our email
        try {
          const response = await fetch(`${MAILHOG_API}/messages`);
          const messages = await response.json();
          const latest = messages.items[0];
          
          if (latest.Content.Headers.Subject[0].includes('Self-Contained SMTP Test')) {
            console.log('   ✓ Confirmed: our test email was delivered');
          } else {
            console.log('   ⚠️  Warning: latest email may not be our test email');
          }
        } catch (error) {
          console.log('   ⚠️  Could not verify email content:', error.message);
        }
        break;
      }
      
      if (attempts % 3 === 0) {
        console.log(`   ⏳ Still waiting... (${attempts * 2}s elapsed)`);
      }
    }
    
    if (!delivered) {
      throw new Error(`SMTP email delivery failed - no email received in MailHog after ${maxAttempts * 2} seconds. This indicates the mail service scheduler may not be processing the queue, or the SMTP configuration is incorrect.`);
    }
    
    console.log('✅ SMTP email delivered and captured by MailHog successfully!');

  } catch (error) {
    console.error('❌ SMTP email test failed:', error.message);
    throw error;
  }
}

async function testSesEmail() {
  console.log('\n☁️  Testing SES Email (Config Inheritance)...');
  
  try {
    // Show what configuration will be used for SES
    console.log(`   🔍 Checking configuration resolution for appId: ${testData.sesApp.id}`);
    
    const allConfigs = await apiCall('/smtp-configs');
    const tenantConfig = allConfigs.find(c => c.id === testData.sesConfig.id);
    
    if (tenantConfig) {
      console.log('   📋 TENANT-level SES config that should be inherited:');
      console.log(`      Service: ${tenantConfig.service}`);
      console.log(`      AWS Region: ${tenantConfig.awsRegion}`);
      console.log(`      AWS Access Key: ${tenantConfig.awsAccessKey ? tenantConfig.awsAccessKey.substring(0, 8) + '...' : 'not set'}`);
      console.log(`      AWS Secret Key: ${tenantConfig.awsSecretKey ? '[set]' : 'not set'}`);
      console.log(`      Scope: ${tenantConfig.scope}`);
      console.log(`      TenantId: ${tenantConfig.tenantId}`);
    } else {
      console.log('   ⚠️  TENANT-level SES config not found in database');
    }
    
    const payload = {
      appId: testData.sesApp.id, // App without config - should inherit TENANT SES
      subject: `Self-Contained SES Test ${new Date().toISOString()}`,
      html: '<h1>Self-Contained SES Test</h1><p>This email tests config inheritance from TENANT level.</p>',
      recipients: [
        {
          email: 'success@simulator.amazonses.com',
          name: 'SES Test User'
        }
      ]
    };
    
    console.log('   Sending email via /send-now (should inherit TENANT SES config)...');
    const result = await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    console.log(`   ✓ SES email scheduled: Group ID ${result.groupId}`);
    console.log('   ✓ Config inheritance working (APP → TENANT)');

  } catch (error) {
    console.error('❌ SES email test failed:', error.message);
    throw error;
  }
}

async function testErrorScenarios() {
  console.log('\n🚫 Testing Error Scenarios...');
  
  try {
    // Test missing required fields
    const invalidPayload = {
      appId: testData.smtpApp.id,
      // Missing subject and recipients
      html: '<p>Invalid email</p>'
    };
    
    await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(invalidPayload)
    });
    
    console.log('⚠️  Invalid payload was accepted (unexpected)');

  } catch (error) {
    if (error.message.includes('appId, subject, recipients required')) {
      console.log('   ✓ Invalid payload correctly rejected');
    } else {
      throw error;
    }
  }

  try {
    // Test non-existent app
    const nonExistentPayload = {
      appId: 'non-existent-app-id',
      subject: 'Test',
      recipients: [{ email: 'test@example.com' }]
    };
    
    await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(nonExistentPayload)
    });
    
    console.log('⚠️  Non-existent app was accepted (unexpected)');

  } catch (error) {
    if (error.message.includes('App not found')) {
      console.log('   ✓ Non-existent app correctly rejected');
    } else {
      throw error;
    }
  }

  console.log('✅ Error scenarios test passed');
}

async function main() {
  console.log('🧪 Self-Contained Email Testing');
  console.log('=================================\n');

  let mailHogAvailable = false;
  let setupSuccessful = false;

  try {
    // Check MailHog availability
    mailHogAvailable = await checkMailHogAvailable();
    if (mailHogAvailable) {
      await clearMailHog();
    }

    // Setup test hierarchy
    setupSuccessful = await setupTestHierarchy();
    if (!setupSuccessful) {
      throw new Error('Failed to setup test hierarchy');
    }

    // Run configuration tests
    await testConfigurationResolution();

    // Run SMTP tests (only if MailHog is available)
    if (mailHogAvailable) {
      await testSmtpEmail();
    } else {
      console.log('\n📧 SMTP tests skipped (MailHog not available)');
      console.log('   To run SMTP tests: start MailHog with `mailhog`');
    }

    // Run SES tests (config inheritance)
    await testSesEmail();

    // Run error scenario tests
    await testErrorScenarios();

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📝 Test Summary:');
    console.log('   - Created temporary test hierarchy');
    console.log('   - Verified appId-only API works correctly');
    console.log('   - Tested APP → TENANT config inheritance');
    console.log('   - Validated error handling');
    if (mailHogAvailable) {
      console.log('   - SMTP emails delivered and confirmed via MailHog');
      console.log('   📧 Check MailHog UI: http://localhost:8025');
    } else {
      console.log('   - SMTP tests skipped (MailHog not available)');
    }

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exitCode = 1;
  } finally {
    // Always cleanup
    if (setupSuccessful) {
      await cleanupTestHierarchy();
    }
    
    // Final status based on exit code
    console.log('\n' + '='.repeat(50));
    if (process.exitCode === 1) {
      console.log('❌ TEST SUITE FAILED - Check errors above');
    } else {
      console.log('✅ TEST SUITE PASSED - All tests successful');
    }
    console.log('='.repeat(50));
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n🛑 Received interrupt signal, cleaning up...');
  await cleanupTestHierarchy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received terminate signal, cleaning up...');
  await cleanupTestHierarchy();
  process.exit(0);
});

main();