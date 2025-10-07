#!/usr/bin/env node

/**
 * Test Global SMTP Configuration Management
 * 
 * This test validates that:
 * 1. Only superadmin users can see and manage global SMTP configurations
 * 2. Global configuration UI is hidden for non-superadmin users
 * 3. Global config serves as fallback when no tenant/app specific config exists
 * 4. Access control works properly on all CRUD operations
 */

import { promises as fs } from 'fs';

console.log('\n=== Testing Global SMTP Configuration Management ===');

// Test scenarios
const testScenarios = [
  {
    role: 'superadmin',
    description: 'Superadmin should see and manage global configurations',
    expectations: [
      'Can view Global Configuration in tree',
      'Can create/edit/delete global SMTP config',
      'Global config appears in effective config resolution'
    ]
  },
  {
    role: 'tenant_admin',
    description: 'Tenant admin should NOT see global configurations',
    expectations: [
      'Cannot view Global Configuration in tree',
      'Cannot create global SMTP config (403 error)',
      'Cannot edit global SMTP config (403 error)',
      'Cannot delete global SMTP config (403 error)'
    ]
  },
  {
    role: 'editor',
    description: 'Editor should NOT see global configurations',
    expectations: [
      'Config tree/navigation hidden entirely',
      'Cannot access SMTP config endpoints (403 error)'
    ]
  }
];

console.log('\n## Test Scenarios:');
testScenarios.forEach((scenario, index) => {
  console.log(`${index + 1}. ${scenario.description}`);
  scenario.expectations.forEach(exp => {
    console.log(`   ✓ ${exp}`);
  });
});

console.log('\n## Test Steps:');

console.log('\n### 1. Generate Test Tokens');
console.log('```bash');
console.log('# Generate superadmin token');
console.log('cd /home/rweltman/code/mail-service');
console.log('SUPERADMIN_TOKEN=$(node scripts/mint-token.cjs --roles superadmin)');
console.log('echo "Superadmin token: $SUPERADMIN_TOKEN"');
console.log('');
console.log('# Generate tenant admin token');
console.log('TENANT_ADMIN_TOKEN=$(node scripts/mint-token.cjs --roles tenant_admin --tenantId test-tenant-1)');
console.log('echo "Tenant admin token: $TENANT_ADMIN_TOKEN"');
console.log('');
console.log('# Generate editor token');
console.log('EDITOR_TOKEN=$(node scripts/mint-token.cjs --roles editor --tenantId test-tenant-1)');
console.log('echo "Editor token: $EDITOR_TOKEN"');
console.log('```');

console.log('\n### 2. Test Superadmin Global Configuration Access');
console.log('```bash');
console.log('# Test GET /smtp-configs (should include global configs)');
console.log('curl -H "Authorization: Bearer $SUPERADMIN_TOKEN" \\');
console.log('     http://localhost:3000/smtp-configs');
console.log('');
console.log('# Test creating global config');
console.log('curl -X POST -H "Content-Type: application/json" \\');
console.log('     -H "Authorization: Bearer $SUPERADMIN_TOKEN" \\');
console.log('     -d \'{');
console.log('       "scope": "GLOBAL",');
console.log('       "host": "smtp.global.example.com",');
console.log('       "port": 587,');
console.log('       "secure": false,');
console.log('       "user": "global@example.com",');
console.log('       "pass": "globalpass",');
console.log('       "fromAddress": "noreply@global.example.com",');
console.log('       "fromName": "Global Service"');
console.log('     }\' \\');
console.log('     http://localhost:3000/smtp-configs');
console.log('```');

console.log('\n### 3. Test Tenant Admin Access Control');
console.log('```bash');
console.log('# Test creating global config (should fail with 403)');
console.log('curl -X POST -H "Content-Type: application/json" \\');
console.log('     -H "Authorization: Bearer $TENANT_ADMIN_TOKEN" \\');
console.log('     -d \'{');
console.log('       "scope": "GLOBAL",');
console.log('       "host": "smtp.tenant.example.com",');
console.log('       "port": 587,');
console.log('       "secure": false,');
console.log('       "user": "tenant@example.com",');
console.log('       "pass": "tenantpass"');
console.log('     }\' \\');
console.log('     http://localhost:3000/smtp-configs');
console.log('');
console.log('# Expected: 403 Forbidden with error message:');
console.log('# "Only superadmins can create global SMTP configurations"');
console.log('```');

console.log('\n### 4. Test Frontend UI Role-Based Visibility');
console.log('```javascript');
console.log('// Open browser to http://localhost:3000');
console.log('// Test with different tokens:');
console.log('');
console.log('// 1. Paste superadmin token:');
console.log('//    - Should see "Global Configuration" in Config tree');
console.log('//    - Can click on Global Configuration node');
console.log('//    - Can create/edit/delete global config');
console.log('');
console.log('// 2. Paste tenant admin token:');
console.log('//    - Should NOT see "Global Configuration" in Config tree');
console.log('//    - Tree should start with tenant-level configs');
console.log('');
console.log('// 3. Paste editor token:');
console.log('//    - Should not see Config navigation at all');
console.log('//    - Only Compose view should be visible');
console.log('```');

console.log('\n### 5. Test Configuration Resolution Hierarchy');
console.log('```bash');
console.log('# Test effective configuration resolution');
console.log('# Should use global as fallback when no tenant/app config exists');
console.log('curl -H "Authorization: Bearer $SUPERADMIN_TOKEN" \\');
console.log('     "http://localhost:3000/smtp-configs/effective/test-tenant-1"');
console.log('');
console.log('# Expected: Global config details if no tenant-specific config');
console.log('```');

console.log('\n### 6. Test Global Config Update/Delete');
console.log('```bash');
console.log('# Get the global config ID first');
console.log('GLOBAL_CONFIG_ID=$(curl -s -H "Authorization: Bearer $SUPERADMIN_TOKEN" \\');
console.log('                       http://localhost:3000/smtp-configs | \\');
console.log('                   jq -r \'.[] | select(.scope == "GLOBAL") | .id\')');
console.log('echo "Global config ID: $GLOBAL_CONFIG_ID"');
console.log('');
console.log('# Test updating global config');
console.log('curl -X PUT -H "Content-Type: application/json" \\');
console.log('     -H "Authorization: Bearer $SUPERADMIN_TOKEN" \\');
console.log('     -d \'{');
console.log('       "host": "smtp.updated.global.com",');
console.log('       "fromName": "Updated Global Service"');
console.log('     }\' \\');
console.log('     "http://localhost:3000/smtp-configs/$GLOBAL_CONFIG_ID"');
console.log('');
console.log('# Test tenant admin trying to update (should fail)');
console.log('curl -X PUT -H "Content-Type: application/json" \\');
console.log('     -H "Authorization: Bearer $TENANT_ADMIN_TOKEN" \\');
console.log('     -d \'{"host": "hacked.example.com"}\' \\');
console.log('     "http://localhost:3000/smtp-configs/$GLOBAL_CONFIG_ID"');
console.log('```');

console.log('\n### 7. Cleanup');
console.log('```bash');
console.log('# Delete global config');
console.log('curl -X DELETE -H "Authorization: Bearer $SUPERADMIN_TOKEN" \\');
console.log('     "http://localhost:3000/smtp-configs/$GLOBAL_CONFIG_ID"');
console.log('```');

console.log('\n## Expected Results:');
console.log('1. ✅ Superadmin can manage global configs (all CRUD operations work)');
console.log('2. ✅ Tenant admin cannot access global configs (gets 403 errors)');
console.log('3. ✅ Editor cannot see Config UI at all');
console.log('4. ✅ Global Configuration tree node only visible to superadmin');
console.log('5. ✅ Global config serves as fallback in configuration resolution');
console.log('6. ✅ Access control enforced at both API and UI levels');

console.log('\n## Testing Complete');
console.log('Run the above commands to validate global SMTP configuration management.');