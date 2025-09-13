#!/usr/bin/env node
/**
 * Debug Email Send Process
 * Creates a test setup and traces exactly what happens during email sending
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

async function debugEmailSend() {
  try {
    console.log('🔬 Debug Email Send Process');
    console.log('============================\n');
    
    // Create test hierarchy
    const tenant = await apiCall('/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Debug Test Tenant',
        description: 'Tenant for debugging email send'
      })
    });
    console.log(`✓ Created tenant: ${tenant.id}`);

    const app = await apiCall('/apps', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: tenant.id,
        name: 'Debug Test App',
        clientId: `debug-test-${Date.now()}`,
        description: 'App for debugging email send'
      })
    });
    console.log(`✓ Created app: ${app.id}`);

    const smtpConfig = await apiCall('/smtp-configs', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'APP',
        appId: app.id,
        service: 'smtp',
        host: 'localhost',
        port: 1025,
        username: '',
        password: '',
        secure: false
      })
    });
    console.log(`✓ Created SMTP config: ${smtpConfig.id}`);

    // Verify everything is in place
    console.log('\n🔍 Pre-flight checks...');
    const configs = await apiCall('/smtp-configs');
    const ourConfig = configs.find(c => c.id === smtpConfig.id);
    console.log(`   Config in DB: ${ourConfig ? '✅' : '❌'}`);
    if (ourConfig) {
      console.log(`   - Scope: ${ourConfig.scope}`);
      console.log(`   - AppId: ${ourConfig.appId}`);
      console.log(`   - Service: ${ourConfig.service}`);
      console.log(`   - Host: ${ourConfig.host}:${ourConfig.port}`);
    }

    const apps = await apiCall('/apps');
    const ourApp = apps.find(a => a.id === app.id);
    console.log(`   App in DB: ${ourApp ? '✅' : '❌'}`);
    if (ourApp) {
      console.log(`   - TenantId: ${ourApp.tenantId}`);
    }

    // Try to send email and trace what happens
    console.log('\n📧 Sending test email...');
    const emailPayload = {
      appId: app.id,
      subject: 'Debug Test Email',
      text: 'This is a debug test email',
      recipients: [
        {
          email: 'debug@localhost.local',
          name: 'Debug Test'
        }
      ]
    };

    console.log(`   Using appId: ${app.id}`);
    console.log(`   Expected to resolve to SMTP config: ${smtpConfig.id}`);

    const result = await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(emailPayload)
    });

    console.log(`   ✓ Email queued: Group ID ${result.groupId}`);

    // Let's check the queued emails in the database
    console.log('\n📋 Checking queued emails...');
    // Note: We don't have a direct API to check queued emails, 
    // but we can see if our email gets processed by checking MailHog

    console.log('   Waiting 10 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check MailHog
    const mailhogResponse = await fetch('http://localhost:8025/api/v2/messages');
    if (mailhogResponse.ok) {
      const messages = await mailhogResponse.json();
      const ourMessage = messages.items.find(m => 
        m.Content.Headers.Subject && 
        m.Content.Headers.Subject[0] === 'Debug Test Email'
      );

      if (ourMessage) {
        console.log('   ✅ Email found in MailHog!');
        console.log(`   - To: ${ourMessage.Content.Headers.To[0]}`);
        console.log(`   - Subject: ${ourMessage.Content.Headers.Subject[0]}`);
      } else {
        console.log('   ❌ Email NOT found in MailHog');
        console.log(`   - Total messages in MailHog: ${messages.total}`);
      }
    } else {
      console.log('   ⚠️  Could not check MailHog');
    }

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await apiCall(`/smtp-configs/${smtpConfig.id}`, { method: 'DELETE' });
    await apiCall(`/apps/${app.id}`, { method: 'DELETE' });
    await apiCall(`/tenants/${tenant.id}`, { method: 'DELETE' });
    console.log('✅ Cleanup complete');

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    process.exit(1);
  }
}

debugEmailSend();