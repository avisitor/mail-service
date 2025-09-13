#!/usr/bin/env node

// Quick debug script to check database records

const BASE_URL = 'http://localhost:3100';

async function checkDatabaseRecords() {
  console.log('🔍 Checking database records...');
  
  try {
    // First, let's send an email to create a messageGroup
    const emailData = {
      appId: 'cmfho0qz3000o100v986x8r3e', // Using the test appId
      recipients: [{ email: 'debug@test.com', name: 'Debug Test' }],
      subject: 'Debug Test Email',
      html: '<p>Debug test</p>',
      text: 'Debug test'
    };
    
    console.log('📧 Sending test email...');
    const response = await fetch(`${BASE_URL}/send-now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData)
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.log('❌ Failed to send email:', error);
      return;
    }
    
    const result = await response.json();
    console.log('✅ Email sent:', result);
    
    // Now manually trigger the worker
    console.log('🔄 Manually triggering worker...');
    const workerResponse = await fetch(`${BASE_URL}/internal/worker/tick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    if (!workerResponse.ok) {
      const error = await workerResponse.text();
      console.log('❌ Worker failed:', error);
      return;
    }
    
    const workerResult = await workerResponse.json();
    console.log('🔄 Worker result:', workerResult);
    
    // Check MailHog for emails
    const mailHogResponse = await fetch('http://localhost:8025/api/v2/messages');
    const mailHogData = await mailHogResponse.json();
    console.log('📬 MailHog messages:', mailHogData.total);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDatabaseRecords();