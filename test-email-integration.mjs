#!/usr/bin/env node
/**
 * Manual Email Testing Script
 * Tests both SMTP (MailHog) and SES (AWS Simulator) email sending
 */

import { sendEmail } from '../src/providers/smtp.js';
import { resolveSmtpConfig } from '../src/modules/smtp/service.js';

// Test configuration from our sandbox setup
const SANDBOX_TENANT_ID = 'cmfgkxlyt000010msi8qxmraa'; // Email Testing Sandbox
const SMTP_APP_ID = 'cmfgkybbi000410mssq4gnw8a'; // SMTP Testing App
const MAILHOG_API = 'http://localhost:8025/api/v2';

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

async function testSmtpConfig() {
  console.log('\n🔧 Testing SMTP Configuration Resolution...');
  
  try {
    // Test APP-level config (should get SMTP)
    const appConfig = await resolveSmtpConfig(SANDBOX_TENANT_ID, SMTP_APP_ID);
    console.log(`✅ APP-level config: ${appConfig.service} (${appConfig.resolvedFrom})`);
    console.log(`   Host: ${appConfig.host}:${appConfig.port}, From: ${appConfig.fromAddress}`);
    
    // Test TENANT-level config (should get SES)
    const tenantConfig = await resolveSmtpConfig(SANDBOX_TENANT_ID);
    console.log(`✅ TENANT-level config: ${tenantConfig.service} (${tenantConfig.resolvedFrom})`);
    console.log(`   Region: ${tenantConfig.awsRegion}, From: ${tenantConfig.fromAddress}`);
    
  } catch (error) {
    console.error('❌ Configuration test failed:', error.message);
  }
}

async function testSmtpEmail() {
  console.log('\n📧 Testing SMTP Email (MailHog)...');
  
  const startCount = await checkMailHog();
  
  try {
    const emailInput = {
      to: 'smtp-test@localhost.local',
      subject: `SMTP Test ${new Date().toISOString()}`,
      html: '<h1>SMTP Test Email</h1><p>This email was sent through <strong>SMTP to MailHog</strong>.</p><p>Time: ' + new Date().toLocaleString() + '</p>',
      text: `SMTP Test Email - Sent at ${new Date().toLocaleString()}`,
      tenantId: SANDBOX_TENANT_ID,
      appId: SMTP_APP_ID
    };
    
    console.log('   Sending email...');
    await sendEmail(emailInput);
    console.log('✅ SMTP email sent successfully');
    
    // Wait and check MailHog
    await new Promise(resolve => setTimeout(resolve, 3000));
    const endCount = await checkMailHog();
    
    if (endCount > startCount) {
      console.log('✅ Email captured by MailHog successfully!');
      console.log('   View at: http://localhost:8025');
    } else {
      console.log('⚠️  Email not yet visible in MailHog (may still be processing)');
    }
    
  } catch (error) {
    console.error('❌ SMTP email test failed:', error.message);
  }
}

async function testSesEmail() {
  console.log('\n☁️  Testing SES Email (AWS Simulator)...');
  
  try {
    // Test successful email
    console.log('   Testing SES success scenario...');
    const successEmail = {
      to: 'success@simulator.amazonses.com',
      subject: `SES Success Test ${new Date().toISOString()}`,
      html: '<h1>SES Success Test</h1><p>This email was sent through <strong>Amazon SES</strong> to the success simulator.</p><p>Time: ' + new Date().toLocaleString() + '</p>',
      text: `SES Success Test - Sent at ${new Date().toLocaleString()}`,
      tenantId: SANDBOX_TENANT_ID,
      // No appId - should fall back to TENANT-level SES config
    };
    
    await sendEmail(successEmail);
    console.log('✅ SES success email sent successfully');
    
  } catch (error) {
    console.error('❌ SES success test failed:', error.message);
  }
  
  try {
    // Test bounce email
    console.log('   Testing SES bounce scenario...');
    const bounceEmail = {
      to: 'bounce@simulator.amazonses.com',
      subject: `SES Bounce Test ${new Date().toISOString()}`,
      html: '<h1>SES Bounce Test</h1><p>This email should trigger a <strong>bounce response</strong> from SES.</p>',
      text: `SES Bounce Test - This should bounce`,
      tenantId: SANDBOX_TENANT_ID,
    };
    
    await sendEmail(bounceEmail);
    console.log('✅ SES bounce email sent (bounce handling may be async)');
    
  } catch (error) {
    if (error.message.toLowerCase().includes('bounce') || 
        error.message.toLowerCase().includes('reject')) {
      console.log('✅ SES bounce correctly detected and handled');
    } else {
      console.error('❌ SES bounce test failed:', error.message);
    }
  }
}

async function testErrorHandling() {
  console.log('\n🚫 Testing Error Handling...');
  
  try {
    // Test invalid email
    await sendEmail({
      to: 'invalid-email-address',
      subject: 'Invalid Email Test',
      html: '<p>This should fail</p>',
      tenantId: SANDBOX_TENANT_ID,
      appId: SMTP_APP_ID
    });
    console.log('⚠️  Invalid email was accepted (may be validated downstream)');
  } catch (error) {
    console.log('✅ Invalid email correctly rejected:', error.message);
  }
  
  try {
    // Test missing required field
    await sendEmail({
      subject: 'Missing To Field',
      html: '<p>No recipient</p>',
      tenantId: SANDBOX_TENANT_ID,
      appId: SMTP_APP_ID
    });
    console.log('⚠️  Missing required field was accepted');
  } catch (error) {
    console.log('✅ Missing required field correctly rejected:', error.message);
  }
}

async function runAllTests() {
  console.log('🧪 Email Integration Testing Suite');
  console.log('==================================');
  
  await clearMailHog();
  await testSmtpConfig();
  await testSmtpEmail();
  await testSesEmail();
  await testErrorHandling();
  
  console.log('\n✅ All tests completed!');
  console.log('📧 Check MailHog UI: http://localhost:8025');
  console.log('🔧 Check AWS SES console for bounce notifications (if real SES)');
}

// Run tests
runAllTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});