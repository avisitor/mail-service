#!/usr/bin/env node

// Script to create test tenants and apps for testing superadmin functionality
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3100';
const SUPERADMIN_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjViOGExZGI1ZTA1M2ZmZmYifQ.eyJzdWIiOiJ1c2VyLWxvY2FsIiwicm9sZXMiOlsic3VwZXJhZG1pbiJdLCJpYXQiOjE3NTc3OTI0ODEsImV4cCI6MTc1Nzc5NjA4MSwiYXVkIjoibWFpbC1zZXJ2aWNlIiwiaXNzIjoiaHR0cDovL2xvY2FsaG9zdDozMTAwIn0.VEATOlOnaRUkokooHFIRr-5xKC77fBUeaNscJGl6oi266pVcB-gyMXwR2JUoAWjjlrfyKz5hJNui4GZAHmumVMq5mOw-KxQiSPPAlBDv-26bu_gp2RubknJWjuT_pcH-5qaDKfbS_2Ex5Bje7cs8yQnrdJaRKGf-7nInLcSjWAGcuvJq1AmyqhukrVvPr1Xo3C482eihQAEVttDvSIAS2ne49DUfHCzVgRWEnhYdjz_lXSkI-h-38nJPcPufyo_WOrM0OPgtm26GHmUf81lck-kuTryqdxbI3GXW6Umurk0cjB2Q_5rma1fbWbb5uk3gBPX37jRETNl7vm2eZlEP8Q';

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SUPERADMIN_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API ${endpoint} failed: ${response.status} ${error}`);
  }
  
  return response.json();
}

async function createTestData() {
  console.log('Creating test data for superadmin tenant management...');
  
  try {
    // Create test tenants
    const tenant1 = await api('/tenants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Acme Corporation' })
    });
    console.log('✅ Created tenant:', tenant1.name, `(${tenant1.id})`);
    
    const tenant2 = await api('/tenants', {
      method: 'POST', 
      body: JSON.stringify({ name: 'Global Industries' })
    });
    console.log('✅ Created tenant:', tenant2.name, `(${tenant2.id})`);
    
    const tenant3 = await api('/tenants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Empty Tenant' })
    });
    console.log('✅ Created tenant:', tenant3.name, `(${tenant3.id})`, '- NO APPS');
    
    // Create apps for tenant1 (Acme Corporation)
    const app1 = await api('/apps', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Web Portal',
        tenantId: tenant1.id,
        clientId: 'acme-web-portal'
      })
    });
    console.log('✅ Created app:', app1.name, `(${app1.id})`, 'for', tenant1.name);
    
    const app2 = await api('/apps', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Mobile App',
        tenantId: tenant1.id,
        clientId: 'acme-mobile-app'
      })
    });
    console.log('✅ Created app:', app2.name, `(${app2.id})`, 'for', tenant1.name);
    
    // Create apps for tenant2 (Global Industries)
    const app3 = await api('/apps', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Enterprise Dashboard',
        tenantId: tenant2.id,
        clientId: 'global-dashboard'
      })
    });
    console.log('✅ Created app:', app3.name, `(${app3.id})`, 'for', tenant2.name);
    
    console.log('');
    console.log('🎯 **Test Data Created Successfully!**');
    console.log('');
    console.log('Now you can test:');
    console.log(`• Edit "${tenant1.name}" - should show tenant ID in dialog`);
    console.log(`• Delete "${tenant1.name}" - should show 2 apps will be deleted`);
    console.log(`• Delete "${tenant2.name}" - should show 1 app will be deleted`);
    console.log(`• Delete "${tenant3.name}" - should show no apps affected`);
    
  } catch (error) {
    console.error('❌ Error creating test data:', error.message);
  }
}

createTestData();