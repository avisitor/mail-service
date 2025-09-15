#!/usr/bin/env node

// Simple test data creation using curl commands
console.log('=== Creating Test Data for Superadmin Tenant Management ===');
console.log('');
console.log('Run these commands to create test tenants and apps:');
console.log('');

const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjViOGExZGI1ZTA1M2ZmZmYifQ.eyJzdWIiOiJ1c2VyLWxvY2FsIiwicm9sZXMiOlsic3VwZXJhZG1pbiJdLCJpYXQiOjE3NTc3OTI0ODEsImV4cCI6MTc1Nzc5NjA4MSwiYXVkIjoibWFpbC1zZXJ2aWNlIiwiaXNzIjoiaHR0cDovL2xvY2FsaG9zdDozMTAwIn0.VEATOlOnaRUkokooHFIRr-5xKC77fBUeaNscJGl6oi266pVcB-gyMXwR2JUoAWjjlrfyKz5hJNui4GZAHmumVMq5mOw-KxQiSPPAlBDv-26bu_gp2RubknJWjuT_pcH-5qaDKfbS_2Ex5Bje7cs8yQnrdJaRKGf-7nInLcSjWAGcuvJq1AmyqhukrVvPr1Xo3C482eihQAEVttDvSIAS2ne49DUfHCzVgRWEnhYdjz_lXSkI-h-38nJPcPufyo_WOrM0OPgtm26GHmUf81lck-kuTryqdxbI3GXW6Umurk0cjB2Q_5rma1fbWbb5uk3gBPX37jRETNl7vm2eZlEP8Q';

console.log('# Create test tenants');
console.log(`curl -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"name":"Acme Corporation"}' http://localhost:3100/tenants`);
console.log('');
console.log(`curl -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"name":"Global Industries"}' http://localhost:3100/tenants`);
console.log('');
console.log(`curl -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"name":"Empty Tenant"}' http://localhost:3100/tenants`);
console.log('');
console.log('# Get tenant IDs for creating apps');
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3100/tenants`);
console.log('');
console.log('# Create apps (replace TENANT_ID with actual tenant IDs from above)');
console.log(`curl -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"name":"Web Portal","tenantId":"TENANT_ID","clientId":"acme-web"}' http://localhost:3100/apps`);
console.log('');
console.log(`curl -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"name":"Mobile App","tenantId":"TENANT_ID","clientId":"acme-mobile"}' http://localhost:3100/apps`);
console.log('');
console.log('Or just use the UI to create tenants and apps manually!');
console.log('');
console.log('🎯 **After creating test data, test these scenarios:**');
console.log('');
console.log('1. **Edit Tenant Dialog**');
console.log('   - Should show "Change tenant name" (not "New tenant name")');
console.log('   - Should display Tenant ID and current name');
console.log('');
console.log('2. **Delete Tenant with Apps**');
console.log('   - Should list all apps that will be deleted');
console.log('   - Should show app names and IDs');
console.log('');
console.log('3. **Delete Empty Tenant**');
console.log('   - Should not mention apps if none exist');
console.log('   - Should still show soft delete message');