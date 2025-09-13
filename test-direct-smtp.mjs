#!/usr/bin/env node
/**
 * Direct SMTP Test to MailHog
 * Tests SMTP delivery directly without going through the mail service
 */

import nodemailer from 'nodemailer';

async function testDirectSmtp() {
  console.log('🧪 Testing Direct SMTP to MailHog');
  console.log('=================================');
  
  // Create transporter pointing directly to MailHog
  const transporter = nodemailer.createTransport({
    host: 'localhost',
    port: 1025,
    secure: false, // MailHog doesn't use TLS
    auth: null,    // MailHog doesn't require auth
    tls: {
      rejectUnauthorized: false
    }
  });
  
  console.log('📧 Creating email...');
  
  const mailOptions = {
    from: 'direct-test@localhost.local',
    to: 'recipient@localhost.local',
    subject: `Direct SMTP Test ${new Date().toISOString()}`,
    html: '<h1>Direct SMTP Test</h1><p>This email was sent directly to MailHog using nodemailer.</p><p>Time: ' + new Date().toLocaleString() + '</p>',
    text: 'Direct SMTP Test - This email was sent directly to MailHog using nodemailer.'
  };
  
  try {
    console.log('📤 Sending email directly to MailHog...');
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    
    // Wait a moment and check MailHog
    console.log('\n⏳ Waiting 2 seconds and checking MailHog...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const response = await fetch('http://localhost:8025/api/v2/messages');
    const messages = await response.json();
    
    console.log(`📬 MailHog now has ${messages.total} messages`);
    
    if (messages.total > 0) {
      const latest = messages.items[0];
      console.log('   Latest message:');
      console.log(`   - Subject: ${latest.Content.Headers.Subject[0]}`);
      console.log(`   - To: ${latest.Content.Headers.To[0]}`);
      console.log(`   - From: ${latest.Content.Headers.From[0]}`);
      
      if (latest.Content.Headers.Subject[0].includes('Direct SMTP Test')) {
        console.log('✅ Our test email was received!');
      } else {
        console.log('⚠️  Latest email is not our test email');
      }
    } else {
      console.log('❌ No emails found in MailHog');
    }
    
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    console.error('   Error details:', error);
    
    // Additional diagnostics
    console.log('\n🔍 Diagnostics:');
    console.log('   - Check if MailHog is running: mailhog');
    console.log('   - Check if port 1025 is open: netstat -ln | grep :1025');
    console.log('   - MailHog web UI: http://localhost:8025');
  }
}

async function checkMailHogConnectivity() {
  console.log('\n🔌 Testing MailHog connectivity...');
  
  try {
    // Test SMTP port
    const net = await import('net');
    const socket = new net.Socket();
    
    const connectPromise = new Promise((resolve, reject) => {
      socket.setTimeout(5000);
      socket.on('connect', () => {
        console.log('✅ SMTP port 1025 is reachable');
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        console.log('❌ SMTP port 1025 timeout');
        socket.destroy();
        reject(new Error('Timeout'));
      });
      socket.on('error', (err) => {
        console.log('❌ SMTP port 1025 connection failed:', err.message);
        reject(err);
      });
      socket.connect(1025, 'localhost');
    });
    
    await connectPromise;
    
  } catch (error) {
    console.log('❌ Cannot connect to MailHog SMTP port:', error.message);
    return false;
  }
  
  try {
    // Test HTTP API
    const response = await fetch('http://localhost:8025/api/v2/messages');
    if (response.ok) {
      console.log('✅ MailHog HTTP API is reachable');
      return true;
    } else {
      console.log('❌ MailHog HTTP API returned:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ MailHog HTTP API failed:', error.message);
    return false;
  }
}

async function main() {
  const connected = await checkMailHogConnectivity();
  if (connected) {
    await testDirectSmtp();
  } else {
    console.log('\n❌ Cannot proceed with SMTP test - MailHog connectivity issues');
    console.log('   Make sure MailHog is running: mailhog');
  }
}

main();