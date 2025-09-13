#!/usr/bin/env node
/**
 * API-based Email Testing Script
 * Tests email sending through the REST API endpoints
 */

import { getAuthHeaders, getAdaptiveHeaders } from './test-utils/auth.mjs';

const SANDBOX_TENANT_ID = 'cmfgkxlyt000010msi8qxmraa'; // Email Testing Sandbox
const SMTP_APP_ID = 'cmfgkybbi000410mssq4gnw8a'; // SMTP Testing App
const SES_APP_ID = 'cmfhkgpjt000132tq2w9859k7'; // SES Testing App (no config - inherits from tenant)
const API_BASE = 'http://localhost:3100';
const MAILHOG_API = 'http://localhost:8025/api/v2';

// Global variable to cache auth headers once determined
let authHeaders = null;

async function getHeaders() {
  if (authHeaders === null) {
    authHeaders = await getAdaptiveHeaders({ 
      roles: ['admin'], 
      tenantId: SANDBOX_TENANT_ID 
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
  
  return response.json();
}

async function clearMailHog() {
  try {
    await fetch(`${MAILHOG_API}/messages`, { method: 'DELETE' });
    console.log('📧 MailHog inbox cleared');
  } catch (error) {
    console.warn('⚠️  Could not clear MailHog inbox:', error.message);
  }
}

async function checkMailHog() {
  try {
    const response = await fetch(`${MAILHOG_API}/messages`);
    const messages = await response.json();
    console.log(`📬 MailHog has ${messages.total} messages`);
    
    if (messages.total > 0) {
      const latest = messages.items[0];
      console.log(`   Latest: "${latest.Content.Headers.Subject[0]}" to ${latest.Content.Headers.To[0]}`);
    }
    
    return messages.total;
  } catch (error) {
    console.error('❌ Error checking MailHog:', error.message);
    return 0;
  }
}

async function testSmtpConfigurations() {
  console.log('\n🔧 Testing SMTP Configuration API...');
  
  try {
    const configs = await apiCall('/smtp-configs');
    console.log(`✅ Found ${configs.length} SMTP configurations`);
    
    // Find our test configurations
    const appConfig = configs.find(c => c.scope === 'APP' && c.appId === SMTP_APP_ID);
    const tenantConfig = configs.find(c => c.scope === 'TENANT' && c.tenantId === SANDBOX_TENANT_ID);
    
    if (appConfig) {
      console.log(`✅ APP-level config: ${appConfig.service} (${appConfig.host}:${appConfig.port})`);
    }
    
    if (tenantConfig) {
      console.log(`✅ TENANT-level config: ${tenantConfig.service} (${tenantConfig.awsRegion})`);
    }
    
  } catch (error) {
    console.error('❌ Configuration API test failed:', error.message);
  }
}

async function testSmtpEmailViaAPI() {
  console.log('\n📧 Testing SMTP Email via API...');
  
  const startCount = await checkMailHog();
  
  try {
    const payload = {
      appId: SMTP_APP_ID,
      subject: `API SMTP Test ${new Date().toISOString()}`,
      html: '<h1>API SMTP Test</h1><p>This email was sent via <strong>REST API</strong> through SMTP to MailHog.</p><p>Time: ' + new Date().toLocaleString() + '</p>',
      recipients: [
        {
          email: 'api-smtp-test@localhost.local',
          name: 'API Test User'
        }
      ]
    };
    
    console.log('   Sending email via /send-now...');
    const result = await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    console.log(`✅ Email scheduled: Group ID ${result.groupId}`);
    
    // Wait for processing
    console.log('   Waiting for email processing...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    
    const endCount = await checkMailHog();
    
    if (endCount > startCount) {
      console.log('✅ Email captured by MailHog successfully!');
    } else {
      console.log('⚠️  Email not yet visible in MailHog (may still be processing)');
    }
    
  } catch (error) {
    console.error('❌ API SMTP email test failed:', error.message);
  }
}

async function testSesEmailViaAPI() {
  console.log('\n☁️  Testing SES Email via API...');
  
  try {
    // Test successful SES email using app that inherits TENANT-level SES config
    const successPayload = {
      appId: SES_APP_ID, // App without config - should inherit SES from tenant level
      subject: `API SES Success Test ${new Date().toISOString()}`,
      html: '<h1>API SES Success</h1><p>This email was sent via <strong>REST API</strong> through Amazon SES.</p><p>Should succeed in SES sandbox.</p>',
      recipients: [
        {
          email: 'success@simulator.amazonses.com',
          name: 'SES Success Test'
        }
      ]
    };
    
    console.log('   Sending success email via /send-now...');
    const successResult = await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(successPayload)
    });
    
    console.log(`✅ SES success email scheduled: Group ID ${successResult.groupId}`);
    
  } catch (error) {
    console.error('❌ SES success test failed:', error.message);
  }
  
  try {
    // Test bounce SES email
    const bouncePayload = {
      appId: SES_APP_ID, // Same app - should inherit SES from tenant level
      subject: `API SES Bounce Test ${new Date().toISOString()}`,
      html: '<h1>API SES Bounce</h1><p>This email should trigger a <strong>bounce</strong> in SES.</p>',
      recipients: [
        {
          email: 'bounce@simulator.amazonses.com',
          name: 'SES Bounce Test'
        }
      ]
    };
    
    console.log('   Sending bounce email via /send-now...');
    const bounceResult = await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(bouncePayload)
    });
    
    console.log(`✅ SES bounce email scheduled: Group ID ${bounceResult.groupId}`);
    
  } catch (error) {
    console.error('❌ SES bounce test failed:', error.message);
  }
}

async function testErrorScenarios() {
  console.log('\n🚫 Testing Error Scenarios via API...');
  
  try {
    // Test missing required fields
    const invalidPayload = {
      appId: SMTP_APP_ID,
      // Missing subject and recipients
      html: '<p>Invalid email</p>'
    };
    
    await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(invalidPayload)
    });
    
    console.log('⚠️  Invalid payload was accepted');
    
  } catch (error) {
    console.log('✅ Invalid payload correctly rejected:', error.message);
  }
  
  try {
    // Test non-existent tenant
    const nonExistentPayload = {
      tenantId: 'non-existent-tenant',
      appId: 'non-existent-app',
      subject: 'Non-existent Config Test',
      html: '<p>Testing non-existent config</p>',
      recipients: [{ email: 'test@example.com', name: 'Test' }]
    };
    
    await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(nonExistentPayload)
    });
    
    console.log('⚠️  Non-existent tenant/app was accepted (may have fallback)');
    
  } catch (error) {
    console.log('✅ Non-existent tenant/app correctly rejected:', error.message);
  }
}

async function runAPITests() {
  console.log('🧪 Email API Integration Testing');
  console.log('================================');
  
  await clearMailHog();
  await testSmtpConfigurations();
  await testSmtpEmailViaAPI();
  await testSesEmailViaAPI();
  await testErrorScenarios();
  
  console.log('\n✅ All API tests completed!');
  console.log('📧 Check MailHog UI: http://localhost:8025');
  console.log('⏰ Allow 10-30 seconds for emails to be processed by the scheduler');
}

// Run tests
runAPITests().catch(error => {
  console.error('❌ API test suite failed:', error);
  process.exit(1);
});