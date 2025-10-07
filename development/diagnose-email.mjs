#!/usr/bin/env node
/**
 * Email Processing Diagnostic Script
 * Checks if the scheduler is processing emails correctly
 */

const API_BASE = 'http://localhost:3100';

async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
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

async function sendTestEmail() {
  console.log('🧪 Sending test email...');
  
  try {
    const payload = {
      appId: 'cmfgkybbi000410mssq4gnw8a', // Use existing SMTP app
      subject: `Diagnostic Test ${new Date().toISOString()}`,
      html: '<h1>Diagnostic Test</h1><p>This is a diagnostic email to test the scheduler.</p>',
      recipients: [
        {
          email: 'diagnostic@localhost.local',
          name: 'Diagnostic Test'
        }
      ]
    };
    
    const result = await apiCall('/send-now', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    console.log(`✅ Email scheduled: Group ID ${result.groupId}`);
    return result.groupId;
    
  } catch (error) {
    console.error('❌ Failed to send test email:', error.message);
    return null;
  }
}

async function checkSchedulerActivity() {
  console.log('\n📊 Checking scheduler activity...');
  
  // Send a test email and monitor for a short time
  const groupId = await sendTestEmail();
  if (!groupId) return;
  
  console.log('⏳ Monitoring for 10 seconds...');
  
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check MailHog for new messages
    try {
      const response = await fetch('http://localhost:8025/api/v2/messages');
      const messages = await response.json();
      
      if (messages.total > 0) {
        console.log(`📬 MailHog has ${messages.total} messages`);
        const latest = messages.items[0];
        if (latest.Content.Headers.Subject[0].includes('Diagnostic Test')) {
          console.log('✅ Test email delivered successfully!');
          return;
        }
      }
    } catch (error) {
      console.log(`❌ MailHog check failed: ${error.message}`);
    }
    
    process.stdout.write('.');
  }
  
  console.log('\n❌ Test email was not delivered within 10 seconds');
  console.log('\nPossible issues:');
  console.log('- Mail service scheduler not running');
  console.log('- SMTP configuration pointing to wrong host/port');
  console.log('- MailHog not listening on localhost:1025');
  console.log('- Database connection issues');
}

async function main() {
  console.log('🔍 Email Processing Diagnostics');
  console.log('===============================');
  
  // Check if MailHog is available
  try {
    const response = await fetch('http://localhost:8025/api/v2/messages');
    if (response.ok) {
      console.log('✅ MailHog is accessible');
    }
  } catch (error) {
    console.log('❌ MailHog is not accessible:', error.message);
    return;
  }
  
  // Check if mail service is accessible
  try {
    const response = await fetch('http://localhost:3100/healthz');
    if (response.ok) {
      console.log('✅ Mail service is accessible');
    }
  } catch (error) {
    console.log('❌ Mail service is not accessible:', error.message);
    return;
  }
  
  await checkSchedulerActivity();
}

main();