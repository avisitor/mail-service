#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { generateJWT, generateKeyPair } from './scripts/jwt-utils.cjs';

// Generate an editor-only token for testing
const keyPair = generateKeyPair();
const editorToken = generateJWT({
  sub: 'editor-test-user',
  roles: ['editor'], // Only editor role, no tenant_admin or superadmin
  tenantId: 'test-tenant',
  appId: 'test-app'
}, keyPair.privateKey);

console.log('=== Editor Role UI Test ===');
console.log('');
console.log('Generated Editor Token:');
console.log(editorToken);
console.log('');
console.log('Expected UI Behavior for Editor Role:');
console.log('✅ Should see: Compose navigation only');
console.log('✅ Should see: Email composition interface');
console.log('❌ Should NOT see: Config navigation button');
console.log('❌ Should NOT see: Context pane (tenant/app selection)');
console.log('❌ Should NOT see: Apps navigation');
console.log('❌ Should NOT see: Tenants navigation');
console.log('❌ Should NOT see: Role context switching');
console.log('');
console.log('Test Instructions:');
console.log('1. Open http://localhost:3100/ui/ in incognito mode');
console.log('2. Complete IDP auth (or manually paste the token above)');
console.log('3. Verify the UI only shows compose functionality');
console.log('4. Try to manually navigate to /ui/?view=smtp-config - should redirect to compose');
console.log('');
console.log('For comparison, test with a tenant_admin token:');

const tenantAdminToken = generateJWT({
  sub: 'tenant-admin-test-user',
  roles: ['tenant_admin'],
  tenantId: 'test-tenant',
  appId: 'test-app'
}, keyPair.privateKey);

console.log(tenantAdminToken);
console.log('');
console.log('Tenant Admin should see: Compose + Config + Apps navigation');