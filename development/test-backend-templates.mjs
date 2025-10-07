#!/usr/bin/env node

/**
 * Test script for backend template variable substitution API
 * Usage: node test-backend-templates.mjs
 */

const API_BASE = 'http://localhost:3100';
const AUTH_TOKEN = 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjZjYTFhMzA5YTczNWZiODMifQ.eyJzdWIiOiJ0ZW5hbnQtYWRtaW4tY21mZ2t4bHl0MDAwMDEwbXNpOHF4bXJhYSIsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzEwMCIsImF1ZCI6Im1haWwtc2VydmljZSIsImV4cCI6MTc1ODE2NjcyMiwiaWF0IjoxNzU4MTYzMTIyLCJyb2xlcyI6WyJ0ZW5hbnRfYWRtaW4iXSwidGVuYW50SWQiOiJjbWZna3hseXQwMDAwMTBtc2k4cXhtcmFhIiwiYXBwSWQiOiJjbWZna3liYmkwMDA0MTBtc3NxNGdudzhhIn0.WlV-tYHU712R0flHol3OqtF81ux04TKV9UeXmWZycNmyaLkqjyZnwwRkqwmm-E1EwnkmKK-qwB2e5emxepimRe3ZgG8A6gJtxsbQbvhJf8WsSc-ag20vZbrnJfz8kaD7033LPJ1Ox20bUfj_WC-p2p-1ttsyu3noaaUZTajI-MVa-aswfPyFFe9ygrmeTzpGhdabLljw5ta9F6T0R6c5rP09LDl3_UbO3Y2cVJS1kGzUocpoyCG75W7h960Xn6x_Njrq5uabup5tTxNGR2LuThNVW6Tpkg_-zmMGSC6Gh8g1TJjOtRAX1N7V2iMJDYTgrGylPCwv5KNBQUeFURYL_Q';

async function testBackendTemplateAPI() {
  console.log('🧪 Testing Backend Template Substitution API');
  console.log('================================================');

  // Test data with template variables
  const testPayload = {
    appId: 'cmfka688r0001b77ofpgm57ix', // ReTree Hawaii app ID
    subject: 'Welcome ${first name} from ${company}!',
    html: '<h1>Hello ${first name} ${last name}!</h1>' +
          '<p>Thank you for your interest from <strong>${company}</strong> on ${island}.</p>' +
          '<p>This message was sent by ${sender name} (${sender email}).</p>' +
          '<p>Best regards,<br>${owner name}</p>',
    recipients: [
      {
        'id': 'lead1bcb2b7b4bc93',
        'email': 'robw@worldspot.com',
        'name': 'alealani evangelista',
        'company': 'Pilina ʻĀina',
        'island': 'bigisland',
        'category': '',
        'phone': '8089386534',
        'status': 'Registered',
        'first name': 'alealani',
        'last name': 'evangelista',
        'full name': 'alealani evangelista',
        'sender name': 'Rob Weltman',
        'sender email': 'robw@worldspot.com',
        'owner name': 'Rob Weltman',
        'owner email': 'robw@worldspot.com'
      },
      {
        'id': 'lead5365f8ca1ee82',
        'email': 'rew@worldspot.com',
        'name': 'Alexander Akana',
        'company': 'La&apos;au Kukahi Farms',
        'island': 'Maui',
        'category': 'Farm,',
        'phone': '8083756810',
        'status': 'Agreed',
        'first name': 'Alexander',
        'last name': 'Akana',
        'full name': 'Alexander Akana',
        'sender name': 'Rob Weltman',
        'sender email': 'robw@worldspot.com',
        'owner name': 'Rob Weltman',
        'owner email': 'robw@worldspot.com'
      }
    ]
  };

  try {
    console.log('📤 Sending request to /send-now with template variables...');
    console.log('Payload:', JSON.stringify(testPayload, null, 2));

    const response = await fetch(`${API_BASE}/send-now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': AUTH_TOKEN
      },
      body: JSON.stringify(testPayload)
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Success! Backend template processing working');
      console.log('Result:', result);
      console.log('📧 Emails should be processed with template variable substitution');
      console.log('   - Subject: "Welcome alealani from Pilina ʻĀina!"');
      console.log('   - Content: Personalized for each recipient');
    } else {
      console.log('❌ API Error:', result);
      if (result.message && result.message.includes('not found')) {
        console.log('💡 Tip: Make sure to use a valid appId from your database');
      }
    }

  } catch (error) {
    console.error('❌ Network Error:', error.message);
    console.log('💡 Make sure the mail service is running on http://localhost:3100');
  }
}

// Test the backend template substitution utility directly
async function testTemplateUtility() {
  console.log('\n🔧 Testing Template Utility Functions');
  console.log('=====================================');

  try {
    // Import the backend template functions
    const { substituteTemplateVariables, processEmailTemplate } = await import('./dist/src/utils/templates.js');

    const testContext = {
      email: 'test@example.com',
      'first name': 'John',
      'last name': 'Doe',
      company: 'ACME Corp',
      island: 'Oahu'
    };

    const testSubject = 'Welcome ${first name} from ${company}!';
    const testHtml = '<h1>Hello ${first name} ${last name}!</h1><p>From ${company} on ${island}</p>';

    console.log('Input:');
    console.log('  Subject:', testSubject);
    console.log('  HTML:', testHtml);
    console.log('  Context:', testContext);

    const result = processEmailTemplate(testSubject, testHtml, testContext);

    console.log('\nOutput:');
    console.log('  Subject:', result.subject);
    console.log('  HTML:', result.html);

    if (result.subject.includes('John') && result.html.includes('ACME Corp')) {
      console.log('✅ Template substitution working correctly!');
    } else {
      console.log('❌ Template substitution not working as expected');
    }

  } catch (error) {
    console.error('❌ Error testing template utility:', error.message);
  }
}

// Run tests
async function runTests() {
  await testTemplateUtility();
  await testBackendTemplateAPI();
}

runTests();