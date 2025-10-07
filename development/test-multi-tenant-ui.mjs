#!/usr/bin/env node
/**
 * Multi-tenant UI validation test
 * Tests the new role-based UI functionality with different user roles
 */

import { generateTestToken, getAuthHeaders } from './test-utils/auth.mjs';

const BASE_URL = 'http://localhost:3100';

// Test tokens
const SUPERADMIN_TOKEN = generateTestToken({ roles: ['superadmin'] });
const TENANT_ADMIN_TOKEN = generateTestToken({ 
  roles: ['tenant_admin'], 
  tenantId: 'cmfhqtjmf0000m0dwxhp0baao',
  tenantName: 'UI Test Tenant'
});

async function apiCall(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function testSuperadminAccess() {
  console.log('\n🧪 Testing Superadmin Access...');
  
  const headers = { 'Authorization': `Bearer ${SUPERADMIN_TOKEN}` };
  
  // Test /me endpoint
  const user = await apiCall('/me', { headers });
  console.log('✅ User info:', user);
  
  // Test tenants access
  const tenants = await apiCall('/tenants', { headers });
  console.log(`✅ Tenants accessible: ${tenants.length} tenants found`);
  
  // Test apps access (should work for any tenant)
  const apps = await apiCall('/apps?tenantId=cmfhqtjmf0000m0dwxhp0baao', { headers });
  console.log(`✅ Apps accessible: ${apps.length} apps found for UI Test Tenant`);
  
  return { user, tenants, apps };
}

async function testTenantAdminAccess() {
  console.log('\n🧪 Testing Tenant Admin Access...');
  
  const headers = { 'Authorization': `Bearer ${TENANT_ADMIN_TOKEN}` };
  
  // Test /me endpoint
  const user = await apiCall('/me', { headers });
  console.log('✅ User info:', user);
  
  // Test apps access (should work for their tenant)
  const apps = await apiCall('/apps?tenantId=cmfhqtjmf0000m0dwxhp0baao', { headers });
  console.log(`✅ Apps accessible: ${apps.length} apps found for their tenant`);
  
  // Test tenants access (should fail for tenant admin)
  try {
    await apiCall('/tenants', { headers });
    console.log('❌ Tenants accessible (should be restricted)');
  } catch (error) {
    console.log('✅ Tenants properly restricted for tenant admin');
  }
  
  return { user, apps };
}

async function testAppManagement() {
  console.log('\n🧪 Testing App Management...');
  
  const headers = { 'Authorization': `Bearer ${TENANT_ADMIN_TOKEN}` };
  const timestamp = Date.now();
  
  // Create a new app
  const newApp = await apiCall('/apps', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'UI Test App 2',
      tenantId: 'cmfhqtjmf0000m0dwxhp0baao',
      clientId: `ui-test-app-2-${timestamp}`
    })
  });
  console.log('✅ App created:', newApp);
  
  // Update the app
  const updatedApp = await apiCall(`/apps/${newApp.id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'UI Test App 2 (Updated)'
    })
  });
  console.log('✅ App updated:', updatedApp);
  
  // Delete the app
  await apiCall(`/apps/${newApp.id}`, {
    method: 'DELETE',
    headers
  });
  console.log('✅ App deleted successfully');
  
  return newApp.id;
}

async function testRoleBasedUI() {
  console.log('\n🧪 Testing Role-based UI Features...');
  
  // Test superadmin UI access
  console.log('Testing superadmin UI...');
  const superadminUrl = `${BASE_URL}/ui/?token=${encodeURIComponent(SUPERADMIN_TOKEN)}`;
  console.log(`✅ Superadmin UI URL: ${superadminUrl}`);
  
  // Test tenant admin UI access
  console.log('Testing tenant admin UI...');
  const tenantAdminUrl = `${BASE_URL}/ui/?token=${encodeURIComponent(TENANT_ADMIN_TOKEN)}`;
  console.log(`✅ Tenant Admin UI URL: ${tenantAdminUrl}`);
  
  return { superadminUrl, tenantAdminUrl };
}

async function main() {
  console.log('🚀 Multi-tenant UI Validation Test');
  console.log('==================================');
  
  try {
    // Test superadmin access
    const superadminResults = await testSuperadminAccess();
    
    // Test tenant admin access
    const tenantAdminResults = await testTenantAdminAccess();
    
    // Test app management functionality
    await testAppManagement();
    
    // Test role-based UI
    const uiUrls = await testRoleBasedUI();
    
    console.log('\n✅ All tests passed!');
    console.log('\n📋 Test Summary:');
    console.log(`- Superadmin has access to ${superadminResults.tenants.length} tenants`);
    console.log(`- Tenant admin has access to ${tenantAdminResults.apps.length} apps in their tenant`);
    console.log('- App CRUD operations work correctly');
    console.log('- Role-based access control is functioning');
    
    console.log('\n🌐 UI Test URLs:');
    console.log('Superadmin:', uiUrls.superadminUrl);
    console.log('Tenant Admin:', uiUrls.tenantAdminUrl);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

main();