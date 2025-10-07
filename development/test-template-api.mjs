#!/usr/bin/env node

/**
 * Test script for template ID-based email sending via /send-now API
 * This tests the new template processing functionality
 */

const API_BASE = 'http://localhost:3100';
const AUTH_TOKEN = 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjZjYTFhMzA5YTczNWZiODMifQ.eyJzdWIiOiJ0ZW5hbnQtYWRtaW4tY21mZ2t4bHl0MDAwMDEwbXNpOHF4bXJhYSIsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzEwMCIsImF1ZCI6Im1haWwtc2VydmljZSIsImV4cCI6MTc1ODE2NjcyMiwiaWF0IjoxNzU4MTYzMTIyLCJyb2xlcyI6WyJ0ZW5hbnRfYWRtaW4iXSwidGVuYW50SWQiOiJjbWZna3hseXQwMDAwMTBtc2k4cXhtcmFhIiwiYXBwSWQiOiJjbWZna3liYmkwMDA0MTBtc3NxNGdudzhhIn0.WlV-tYHU712R0flHol3OqtF81ux04TKV9UeXmWZycNmyaLkqjyZnwwRkqwmm-E1EwnkmKK-qwB2e5emxepimRe3ZgG8A6gJtxsbQbvhJf8WsSc-ag20vZbrnJfz8kaD7033LPJ1Ox20bUfj_WC-p2p-1ttsyu3noaaUZTajI-MVa-aswfPyFFe9ygrmeTzpGhdabLljw5ta9F6T0R6c5rP09LDl3_UbO3Y2cVJS1kGzUocpoyCG75W7h960Xn6x_Njrq5uabup5tTxNGR2LuThNVW6Tpkg_-zmMGSC6Gh8g1TJjOtRAX1N7V2iMJDYTgrGylPCwv5KNBQUeFURYL_Q';

async function testTemplateAPI() {
  console.log('🧪 Testing Template ID-based Email Sending');
  console.log('==========================================');

  // Test data with template variables (same as test 2b)
  const testPayload = {
    appId: 'cmfka688r0001b77ofpgm57ix', // ReTree Hawaii app ID
    templateId: 'tpl_00000090_school_-_please_join_us',
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
    console.log('📤 Sending request to /send-now with template ID...');
    console.log('Template ID:', testPayload.templateId);
    console.log('Recipients:', testPayload.recipients.length);

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
      console.log('✅ Success! Template-based email sending working');
      console.log('Result:', result);
      console.log('📧 Template emails should be processed with variable substitution');
      console.log('   - Template loaded from database');
      console.log('   - Variables substituted for each recipient');
      console.log('   - Individual jobs created for each recipient');
    } else {
      console.log('❌ API Error:', result);
      if (result.message && result.message.includes('not found')) {
        console.log('💡 Tip: Make sure the template ID exists in the database');
      }
    }

  } catch (error) {
    console.error('❌ Network Error:', error.message);
    console.log('💡 Make sure the mail service is running on http://localhost:3100');
  }
}

// Test the /api/test-token endpoint
async function testTokenGeneration() {
  console.log('\n🔑 Testing Token Generation');
  console.log('============================');

  try {
    const response = await fetch(`${API_BASE}/api/test-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appId: 'cmfka688r0001b77ofpgm57ix'
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Token generation working');
      console.log('Token length:', result.token.length);
      console.log('Token prefix:', result.token.substring(0, 20) + '...');
    } else {
      console.log('❌ Token generation failed:', result);
    }

  } catch (error) {
    console.error('❌ Token generation error:', error.message);
  }
}

// Run tests
async function runTests() {
  await testTokenGeneration();
  await testTemplateAPI();
}

runTests();