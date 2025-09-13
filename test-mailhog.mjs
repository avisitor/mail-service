#!/usr/bin/env node
/**
 * Direct test of MailHog SMTP server using nodemailer
 */
import nodemailer from 'nodemailer';

async function testMailHog() {
  console.log('Testing direct connection to MailHog...');
  
  const transporter = nodemailer.createTransport({
    host: 'localhost',
    port: 1025,
    secure: false,
    ignoreTLS: true,
  });
  
  try {
    const info = await transporter.sendMail({
      from: 'test@sandbox.local',
      to: 'recipient@test.local',
      subject: 'Direct MailHog Test',
      html: '<h1>Direct Test</h1><p>This email was sent directly to MailHog to test connectivity.</p>',
    });
    
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Check MailHog UI at: http://localhost:8025');
    
  } catch (error) {
    console.error('❌ Error sending email:', error);
  }
}

testMailHog().catch(console.error);