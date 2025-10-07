#!/usr/bin/env node
/**
 * Test Mail Service SMTP Provider Directly
 * Tests the mail service's sendEmail function directly
 */

import { sendEmail } from './dist/src/providers/smtp.js';

async function testMailServiceProvider() {
  console.log('🧪 Testing Mail Service SMTP Provider');
  console.log('====================================');
  
  try {
    // Clear MailHog first
    try {
      await fetch('http://localhost:8025/api/v2/messages', { method: 'DELETE' });
      console.log('📧 MailHog inbox cleared');
    } catch (error) {
      console.log('⚠️  Could not clear MailHog:', error.message);
    }
    
    // Get initial count
    const initialResponse = await fetch('http://localhost:8025/api/v2/messages');
    const initialMessages = await initialResponse.json();
    const initialCount = initialMessages.total;
    console.log(`📬 Initial MailHog count: ${initialCount}`);
    
    // Test with existing SMTP app
    const emailInput = {
      appId: 'cmfgkybbi000410mssq4gnw8a', // Known SMTP app
      to: 'provider-test@localhost.local',
      subject: `Provider Test ${new Date().toISOString()}`,
      html: '<h1>Provider Test</h1><p>This email was sent directly through the mail service SMTP provider.</p>',
      text: 'Provider Test - This email was sent directly through the mail service SMTP provider.'
    };
    
    console.log('📤 Sending email via mail service provider...');
    console.log(`   App ID: ${emailInput.appId}`);
    console.log(`   To: ${emailInput.to}`);
    console.log(`   Subject: ${emailInput.subject}`);
    
    await sendEmail(emailInput);
    console.log('✅ sendEmail() completed without errors');
    
    // Wait and check MailHog
    console.log('\n⏳ Waiting 3 seconds and checking MailHog...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const finalResponse = await fetch('http://localhost:8025/api/v2/messages');
    const finalMessages = await finalResponse.json();
    const finalCount = finalMessages.total;
    
    console.log(`📬 Final MailHog count: ${finalCount}`);
    
    if (finalCount > initialCount) {
      console.log('✅ Email delivered successfully!');
      const latest = finalMessages.items[0];
      console.log('   Latest message:');
      console.log(`   - Subject: ${latest.Content.Headers.Subject[0]}`);
      console.log(`   - To: ${latest.Content.Headers.To[0]}`);
      console.log(`   - From: ${latest.Content.Headers.From[0]}`);
    } else {
      console.log('❌ No new email received in MailHog');
      console.log('   The provider function completed but email was not delivered');
    }
    
  } catch (error) {
    console.error('❌ Provider test failed:', error.message);
    console.error('   Stack:', error.stack);
    
    // Check if it's a config resolution issue
    if (error.message.includes('config') || error.message.includes('resolve')) {
      console.log('\n🔍 This might be a configuration resolution issue');
      console.log('   - Check if the app exists in the database');
      console.log('   - Verify SMTP configuration is properly set up');
    }
  }
}

async function testConfigResolution() {
  console.log('\n🔧 Testing Configuration Resolution...');
  
  try {
    const { resolveSmtpConfig } = await import('./dist/src/modules/smtp/service.js');
    
    const config = await resolveSmtpConfig('cmfgkybbi000410mssq4gnw8a');
    console.log('✅ Configuration resolved successfully:');
    console.log(`   Service: ${config.service}`);
    console.log(`   Host: ${config.host}:${config.port}`);
    console.log(`   Resolved from: ${config.resolvedFrom}`);
    console.log(`   From address: ${config.fromAddress}`);
    
    return true;
  } catch (error) {
    console.error('❌ Configuration resolution failed:', error.message);
    return false;
  }
}

async function main() {
  // First test config resolution
  const configOk = await testConfigResolution();
  
  if (configOk) {
    await testMailServiceProvider();
  } else {
    console.log('\n❌ Cannot test provider - configuration resolution failed');
  }
}

main();