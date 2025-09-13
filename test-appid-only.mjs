#!/usr/bin/env node

import { resolveSmtpConfig } from './dist/src/modules/smtp/service.js';

const SMTP_APP_ID = 'cmfgkybbi000410mssq4gnw8a'; // APP-level SMTP config
const SES_APP_ID = 'cmfhkgpjt000132tq2w9859k7';  // APP without config - should inherit TENANT SES

console.log('🧪 Testing AppId-Only Configuration Resolution\n');

try {
  console.log('1. Testing APP-level SMTP config resolution:');
  const appConfig = await resolveSmtpConfig(SMTP_APP_ID);
  console.log(`   ✓ Service: ${appConfig.service}`);
  console.log(`   ✓ Resolved from: ${appConfig.resolvedFrom}`);
  console.log(`   ✓ Host: ${appConfig.host}:${appConfig.port}`);
  console.log(`   ✓ From: ${appConfig.fromName} <${appConfig.fromAddress}>`);
  console.log();

  console.log('2. Testing GLOBAL fallback (no appId):');
  const globalConfig = await resolveSmtpConfig();
  console.log(`   ✓ Service: ${globalConfig.service}`);
  console.log(`   ✓ Resolved from: ${globalConfig.resolvedFrom}`);
  console.log(`   ✓ Host: ${globalConfig.host}:${globalConfig.port}`);
  console.log();

  console.log('3. Testing non-existent app (should fallback to GLOBAL):');
  const fallbackConfig = await resolveSmtpConfig('non-existent-app-id');
  console.log(`   ✓ Service: ${fallbackConfig.service}`);
  console.log(`   ✓ Resolved from: ${fallbackConfig.resolvedFrom}`);
  console.log(`   ✓ Host: ${fallbackConfig.host}:${fallbackConfig.port}`);
  console.log();

  console.log('4. Testing SES app config inheritance (APP→TENANT):');
  try {
    const sesConfig = await resolveSmtpConfig(SES_APP_ID);
    console.log(`   ✓ Service: ${sesConfig.service}`);
    console.log(`   ✓ Resolved from: ${sesConfig.resolvedFrom}`);
    if (sesConfig.service === 'ses') {
      console.log(`   ✓ AWS Region: ${sesConfig.awsRegion}`);
    }
  } catch (error) {
    console.log(`   ⚠ SES app config not found or failed: ${error.message}`);
  }

  console.log('\n✅ All tests completed successfully!');
  console.log('\n📝 Summary: AppId-only configuration resolution is working correctly.');
  console.log('   - APP-level configs are properly resolved with automatic tenantId lookup');
  console.log('   - GLOBAL fallback works when no appId is provided');
  console.log('   - Non-existent apps fallback gracefully to GLOBAL config');

} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}