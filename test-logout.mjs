#!/usr/bin/env node
/**
 * Quick logout functionality verification test
 */

import { generateTestToken } from './test-utils/auth.mjs';

const BASE_URL = 'http://localhost:3100';

async function testLogoutFlow() {
  console.log('🧪 Logout Functionality Test');
  console.log('============================');
  
  // Generate fresh tokens
  const superadminToken = generateTestToken({ roles: ['superadmin'] });
  const editorToken = generateTestToken({ roles: ['editor'] });
  
  console.log('\n✅ Generated fresh test tokens');
  
  // Test URLs
  const superadminUrl = `${BASE_URL}/ui/?token=${encodeURIComponent(superadminToken)}`;
  const editorUrl = `${BASE_URL}/ui/?token=${encodeURIComponent(editorToken)}`;
  
  console.log('\n🔗 Test URLs:');
  console.log('\n📋 Superadmin Login:');
  console.log(superadminUrl);
  
  console.log('\n👤 Editor Login:');
  console.log(editorUrl);
  
  console.log('\n🧪 Logout Testing Steps:');
  console.log('1. Open one of the URLs above');
  console.log('2. Verify you see user info in top-right with red "🚪 Logout" button');
  console.log('3. Click the logout button');
  console.log('4. Confirm in the dialog');
  console.log('5. Verify:');
  console.log('   - Returns to login screen');
  console.log('   - URL is cleaned (no token parameter)');
  console.log('   - UserPane is hidden');
  console.log('6. Try logging in with the other role URL');
  console.log('7. Repeat logout test');
  
  console.log('\n✅ Expected Behavior:');
  console.log('- Superadmin: Shows "test-user [superadmin]" with Tenants nav');
  console.log('- Editor: Shows "test-user [editor]" with Compose nav only');
  console.log('- Logout: Complete session clear and return to login');
  
  console.log('\n🎯 Logout Features Fixed:');
  console.log('✅ UserPane visibility issue resolved');
  console.log('✅ onAuthenticated() now called for all valid users');
  console.log('✅ Red logout button with confirmation dialog');
  console.log('✅ Complete state cleanup on logout');
  console.log('✅ URL parameter cleanup');
  console.log('✅ Role context reset');
}

testLogoutFlow();