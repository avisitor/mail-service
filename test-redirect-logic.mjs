#!/usr/bin/env node

// Simulate browser environment
global.window = {
  location: {
    href: 'http://localhost:3100/ui/',
    origin: 'http://localhost:3100'
  },
  localStorage: {
    data: {},
    getItem(key) { return this.data[key] || null; },
    setItem(key, value) { this.data[key] = value; },
    removeItem(key) { delete this.data[key]; }
  },
  sessionStorage: {
    data: {},
    getItem(key) { return this.data[key] || null; },
    setItem(key, value) { this.data[key] = value; },
    removeItem(key) { delete this.data[key]; }
  },
  history: {
    replaceState() {}
  }
};

global.document = {
  head: { appendChild() {} },
  createElement(tag) { 
    return { 
      src: '', 
      onload: null, 
      onerror: null,
      addEventListener() {}
    }; 
  },
  getElementById() { return null; }
};

global.console = console;

// Mock UI config
global.__MAIL_UI_CONFIG__ = {
  returnUrl: "http://localhost:3100/ui/",
  idpLoginUrl: "https://idp.worldspot.org/"
};

// Mock fetch to simulate failed /me request
global.fetch = async (url) => {
  if (url.includes('/me')) {
    const response = { 
      ok: false, 
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    };
    throw new Error('Unauthorized');
  }
  return { ok: true, json: async () => ({}) };
};

// Test the redirect logic
async function testRedirectLogic() {
  console.log('=== Testing Redirect Logic ===');
  
  // Clear any existing session flags
  window.sessionStorage.removeItem('idpRedirected');
  
  const url = new URL(window.location.href);
  const tokenFromUrl = url.searchParams.get('token');
  const cameFromIdp = !!tokenFromUrl;
  
  console.log('Initial state:');
  console.log('- URL:', window.location.href);
  console.log('- Token from URL:', tokenFromUrl);
  console.log('- Came from IDP:', cameFromIdp);
  console.log('- Already redirected:', window.sessionStorage.getItem('idpRedirected'));
  
  // Simulate the auth check
  let authDisabled = false;
  let user = null;
  
  try {
    // This should fail
    await fetch('/me');
  } catch (e) {
    console.log('- /me failed (expected):', e.message);
    user = null;
  }
  
  if (!user && !authDisabled) {
    console.log('No user found and auth enabled, checking IDP redirect...');
    
    const idp = __MAIL_UI_CONFIG__.idpLoginUrl;
    console.log('IDP URL:', idp);
    
    if (idp) {
      const alreadyRedirected = window.sessionStorage.getItem('idpRedirected') === '1';
      console.log('Already redirected?', alreadyRedirected, 'Came from IDP?', cameFromIdp);
      
      if (!cameFromIdp && !alreadyRedirected) {
        const ret = __MAIL_UI_CONFIG__.returnUrl || (window.location.origin + '/ui/');
        const redirect = new URL(idp);
        redirect.searchParams.set('return', ret);
        
        console.log('Setting idpRedirected flag and redirecting to:', redirect.toString());
        window.sessionStorage.setItem('idpRedirected', '1');
        
        console.log('SUCCESS: Would redirect to:', redirect.toString());
        return true;
      } else {
        console.log('Skipping redirect - cameFromIdp:', cameFromIdp, 'alreadyRedirected:', alreadyRedirected);
        return false;
      }
    } else {
      console.log('No IDP URL configured');
      return false;
    }
  } else {
    console.log('Not redirecting - user:', !!user, 'authDisabled:', authDisabled);
    return false;
  }
}

testRedirectLogic().then(result => {
  console.log('\n=== Test Result ===');
  console.log('Should redirect:', result);
}).catch(console.error);