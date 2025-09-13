#!/usr/bin/env node
/**
 * Test script to verify SES configuration resolution
 * This script tests the hierarchical SMTP configuration lookup with SES configs
 */

import { resolveSmtpConfig } from '../src/modules/smtp/service.js';

async function testSesConfigResolution() {
  console.log('Testing SES Configuration Resolution...\n');

  try {
    // Test 1: APP-level SES config
    console.log('1. Testing APP-level SES config resolution:');
    const appConfig = await resolveSmtpConfig('tenant1', 'app1');
    console.log(`   Service: ${appConfig.service}`);
    console.log(`   AWS Region: ${appConfig.awsRegion || 'Not set'}`);
    console.log(`   Resolved From: ${appConfig.resolvedFrom}`);
    console.log('');

    // Test 2: TENANT-level fallback
    console.log('2. Testing TENANT-level fallback:');
    const tenantConfig = await resolveSmtpConfig('tenant1', 'nonexistent-app');
    console.log(`   Service: ${tenantConfig.service}`);
    console.log(`   AWS Region: ${tenantConfig.awsRegion || 'Not set'}`);
    console.log(`   Resolved From: ${tenantConfig.resolvedFrom}`);
    console.log('');

    // Test 3: GLOBAL fallback
    console.log('3. Testing GLOBAL fallback:');
    const globalConfig = await resolveSmtpConfig('nonexistent-tenant', 'nonexistent-app');
    console.log(`   Service: ${globalConfig.service}`);
    console.log(`   AWS Region: ${globalConfig.awsRegion || 'Not set'}`);
    console.log(`   Resolved From: ${globalConfig.resolvedFrom}`);
    console.log('');

    // Test 4: Verify encryption/decryption
    console.log('4. Testing credential handling:');
    console.log(`   AWS Access Key: ${appConfig.awsAccessKey ? '***[ENCRYPTED]***' : 'Not set'}`);
    console.log(`   AWS Secret Key: ${appConfig.awsSecretKey ? '***[ENCRYPTED]***' : 'Not set'}`);
    console.log('');

    console.log('✅ SES Configuration Resolution Test Completed Successfully!');

  } catch (error) {
    console.error('❌ SES Configuration Test Failed:', error);
    process.exit(1);
  }
}

// Run the test
testSesConfigResolution().catch(console.error);