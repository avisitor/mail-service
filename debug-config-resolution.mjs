#!/usr/bin/env node

/**
 * Debug Configuration Resolution
 * This script tests what configuration the mail service actually resolves for a given appId
 */

const BASE_URL = 'http://localhost:3100';

async function apiCall(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options
  };
  
  const response = await fetch(url, config);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return response.json();
}

async function debugConfigResolution() {
  try {
    console.log('🔍 Debug Configuration Resolution');
    console.log('=====================================\n');
    
    // Get all existing configs to understand the current state
    console.log('📋 All SMTP Configurations in database:');
    const allConfigs = await apiCall('/smtp-configs');
    
    allConfigs.forEach((config, index) => {
      console.log(`${index + 1}. ID: ${config.id}`);
      console.log(`   Service: ${config.service}`);
      console.log(`   Scope: ${config.scope}`);
      
      if (config.service === 'smtp') {
        console.log(`   Host: ${config.host}:${config.port}`);
        console.log(`   Username: ${config.username}`);
        console.log(`   Secure: ${config.secure}`);
      } else if (config.service === 'ses') {
        console.log(`   AWS Region: ${config.awsRegion}`);
        console.log(`   AWS Access Key: ${config.awsAccessKey ? config.awsAccessKey.substring(0, 8) + '...' : 'not set'}`);
      }
      
      if (config.scope === 'APP') {
        console.log(`   AppId: ${config.appId}`);
      }
      if (config.tenantId) {
        console.log(`   TenantId: ${config.tenantId}`);
      }
      console.log('');
    });
    
    // Get all apps to test resolution
    console.log('📱 All Apps in database:');
    const allApps = await apiCall('/apps');
    
    allApps.forEach((app, index) => {
      console.log(`${index + 1}. ID: ${app.id}`);
      console.log(`   Name: ${app.name}`);
      console.log(`   TenantId: ${app.tenantId}`);
      console.log('');
    });
    
    // For each app, try to understand what config would be resolved
    console.log('🎯 Configuration Resolution Test:');
    console.log('(Testing what the service would actually use)\n');
    
    for (const app of allApps) {
      console.log(`Testing appId: ${app.id} (${app.name})`);
      
      // Look for APP-level config first
      const appConfig = allConfigs.find(c => 
        c.scope === 'APP' && c.appId === app.id
      );
      
      if (appConfig) {
        console.log(`  ✓ APP-level config found: ${appConfig.service}`);
        if (appConfig.service === 'smtp') {
          console.log(`    → SMTP: ${appConfig.host}:${appConfig.port}`);
        } else if (appConfig.service === 'ses') {
          console.log(`    → SES: ${appConfig.awsRegion}`);
        }
      } else {
        // Look for TENANT-level config
        const tenantConfig = allConfigs.find(c => 
          c.scope === 'TENANT' && c.tenantId === app.tenantId
        );
        
        if (tenantConfig) {
          console.log(`  ↗️  TENANT-level config inherited: ${tenantConfig.service}`);
          if (tenantConfig.service === 'smtp') {
            console.log(`    → SMTP: ${tenantConfig.host}:${tenantConfig.port}`);
          } else if (tenantConfig.service === 'ses') {
            console.log(`    → SES: ${tenantConfig.awsRegion}`);
          }
        } else {
          // Look for GLOBAL-level config
          const globalConfig = allConfigs.find(c => c.scope === 'GLOBAL');
          
          if (globalConfig) {
            console.log(`  ↗️↗️  GLOBAL-level config inherited: ${globalConfig.service}`);
            if (globalConfig.service === 'smtp') {
              console.log(`    → SMTP: ${globalConfig.host}:${globalConfig.port}`);
            } else if (globalConfig.service === 'ses') {
              console.log(`    → SES: ${globalConfig.awsRegion}`);
            }
          } else {
            console.log(`  ❌ No configuration found!`);
          }
        }
      }
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    process.exit(1);
  }
}

// Run the debug
debugConfigResolution();