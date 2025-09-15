#!/usr/bin/env node

import puppeteer from 'puppeteer';

async function testRedirect() {
  const browser = await puppeteer.launch({ 
    headless: false,  // Show browser to see what happens
    devtools: true    // Open devtools to see console
  });
  
  try {
    const page = await browser.newPage();
    
    // Listen for console messages
    page.on('console', msg => {
      console.log(`[Browser Console ${msg.type()}]:`, msg.text());
    });
    
    // Clear any existing sessionStorage
    await page.evaluateOnNewDocument(() => {
      try {
        sessionStorage.clear();
        console.log('[Test] Cleared sessionStorage');
      } catch (e) {
        console.log('[Test] Could not clear sessionStorage:', e);
      }
    });
    
    console.log('[Test] Navigating to UI...');
    await page.goto('http://localhost:3100/ui/', { waitUntil: 'networkidle0' });
    
    // Wait a bit to see what happens
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const currentUrl = page.url();
    console.log('[Test] Final URL:', currentUrl);
    
    if (currentUrl.includes('idp.worldspot.org')) {
      console.log('[Test] SUCCESS: Redirected to IDP');
    } else {
      console.log('[Test] ISSUE: Did not redirect to IDP');
    }
    
  } catch (error) {
    console.error('[Test] Error:', error);
  } finally {
    await browser.close();
  }
}

testRedirect().catch(console.error);