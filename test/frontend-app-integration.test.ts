import { describe, it, expect, beforeEach, vi } from 'vitest';

// App Integration Test Suite
// Tests scenarios where the mail service is used as an embedded component in other applications

describe('App Integration System', () => {
  beforeEach(() => {
    // Reset location and localStorage
    delete (window as any).location;
    (window as any).location = {
      href: 'http://localhost:3100',
      search: '',
      pathname: '/'
    };
    localStorage.clear();
    
    // Create base DOM structure
    document.body.innerHTML = `
      <div class="topnav">
        <button id="logoutBtn">🚪 Logout</button>
        <button class="navBtn" data-view="compose">Compose</button>
        <button class="navBtn" data-view="email-logs">Email Logs</button>
        <button class="navBtn" data-view="sms-logs">SMS Logs</button>
      </div>
      <div id="view-compose" style="display: none;">
        <button id="composeCancel" style="display: none;">Cancel</button>
        <div id="viewTitle">Compose Email</div>
      </div>
      <div id="view-email-logs" style="display: none;">Email Logs View</div>
      <div id="view-sms-logs" style="display: none;">SMS Logs View</div>
    `;
  });

  describe('Return URL Handling', () => {
    it('should save returnUrl to localStorage for compose workflows', () => {
      const returnUrl = 'https://app.example.com/dashboard';
      
      // Simulate URL with returnUrl parameter
      (window as any).location.search = `?returnUrl=${encodeURIComponent(returnUrl)}&view=compose`;
      
      const urlParams = new URLSearchParams(window.location.search);
      const returnUrlFromUrl = urlParams.get('returnUrl');
      
      if (returnUrlFromUrl) {
        localStorage.setItem('editorReturnUrl', returnUrlFromUrl);
      }
      
      expect(localStorage.getItem('editorReturnUrl')).toBe(returnUrl);
    });

    it('should handle multiple URL parameters including recipients', () => {
      const returnUrl = 'https://app.example.com/dashboard';
      const appId = 'test-app-123';
      const recipients = JSON.stringify([
        { email: 'test1@example.com', name: 'Test User 1' },
        { email: 'test2@example.com', name: 'Test User 2' }
      ]);
      
      const params = new URLSearchParams({
        returnUrl,
        appId,
        recipients: encodeURIComponent(recipients),
        view: 'compose'
      });
      
      (window as any).location.search = `?${params.toString()}`;
      
      const urlParams = new URLSearchParams(window.location.search);
      expect(urlParams.get('returnUrl')).toBe(returnUrl);
      expect(urlParams.get('appId')).toBe(appId);
      
      const parsedRecipients = JSON.parse(decodeURIComponent(urlParams.get('recipients') || '[]'));
      expect(parsedRecipients).toHaveLength(2);
      expect(parsedRecipients[0].email).toBe('test1@example.com');
    });
  });

  describe('Logout Button Context-Aware Behavior', () => {
    function updateLogoutButton() {
      const logoutBtn = document.getElementById('logoutBtn');
      if (!logoutBtn) return;
      
      const urlParams = new URLSearchParams(window.location.search);
      const returnUrl = urlParams.get('returnUrl') || localStorage.getItem('editorReturnUrl');
      const currentView = urlParams.get('view');
      
      // Show Return button if:
      // 1. External log viewing (returnUrl + view=email-logs/sms-logs)
      // 2. Coming from app (returnUrl exists, indicating app integration)
      const isExternalLogViewing = returnUrl && (currentView === 'email-logs' || currentView === 'sms-logs');
      const isFromApp = returnUrl && !isExternalLogViewing;
      
      if (isExternalLogViewing || isFromApp) {
        // Show as "Return" button
        logoutBtn.innerHTML = '↩️ Return';
        logoutBtn.title = 'Return to calling application';
        logoutBtn.style.background = '#28a745';
        logoutBtn.style.borderColor = '#28a745';
      } else {
        // Show as "Logout" button for normal mail service usage
        logoutBtn.innerHTML = '🚪 Logout';
        logoutBtn.title = 'Logout and clear session';
        logoutBtn.style.background = '#dc3545';
        logoutBtn.style.borderColor = '#dc3545';
      }
    }

    it('should show Return button for external log viewing', () => {
      (window as any).location.search = '?returnUrl=https://app.example.com&view=email-logs';
      
      updateLogoutButton();
      
      const logoutBtn = document.getElementById('logoutBtn') as HTMLElement;
      expect(logoutBtn.innerHTML).toBe('↩️ Return');
      expect(logoutBtn.title).toBe('Return to calling application');
      expect(logoutBtn.style.background).toBe('rgb(40, 167, 69)'); // #28a745
    });

    it('should show Return button for app integration compose', () => {
      (window as any).location.search = '?returnUrl=https://app.example.com&view=compose';
      
      updateLogoutButton();
      
      const logoutBtn = document.getElementById('logoutBtn') as HTMLElement;
      expect(logoutBtn.innerHTML).toBe('↩️ Return');
      expect(logoutBtn.title).toBe('Return to calling application');
      expect(logoutBtn.style.background).toBe('rgb(40, 167, 69)');
    });

    it('should show Logout button for normal mail service usage', () => {
      (window as any).location.search = ''; // No returnUrl
      
      updateLogoutButton();
      
      const logoutBtn = document.getElementById('logoutBtn') as HTMLElement;
      expect(logoutBtn.innerHTML).toBe('🚪 Logout');
      expect(logoutBtn.title).toBe('Logout and clear session');
      expect(logoutBtn.style.background).toBe('rgb(220, 53, 69)'); // #dc3545
    });

    it('should use localStorage returnUrl if URL param is missing', () => {
      localStorage.setItem('editorReturnUrl', 'https://stored.example.com');
      (window as any).location.search = '?view=compose'; // No returnUrl in URL
      
      updateLogoutButton();
      
      const logoutBtn = document.getElementById('logoutBtn') as HTMLElement;
      expect(logoutBtn.innerHTML).toBe('↩️ Return');
    });
  });

  describe('Cancel Button Visibility', () => {
    function updateCancelButtonVisibility() {
      const urlParams = new URLSearchParams(window.location.search);
      const returnUrl = urlParams.get('returnUrl');
      const cancelBtn = document.getElementById('composeCancel') as HTMLElement;
      
      if (cancelBtn) {
        // Show Cancel button when coming from an app (has returnUrl)
        cancelBtn.style.display = returnUrl ? 'inline-block' : 'none';
      }
    }

    it('should show Cancel button when returnUrl is present', () => {
      (window as any).location.search = '?returnUrl=https://app.example.com&view=compose';
      
      updateCancelButtonVisibility();
      
      const cancelBtn = document.getElementById('composeCancel') as HTMLElement;
      expect(cancelBtn.style.display).toBe('inline-block');
    });

    it('should hide Cancel button when no returnUrl', () => {
      (window as any).location.search = '?view=compose'; // No returnUrl
      
      updateCancelButtonVisibility();
      
      const cancelBtn = document.getElementById('composeCancel') as HTMLElement;
      expect(cancelBtn.style.display).toBe('none');
    });
  });

  describe('View Title Updates for App Context', () => {
    function updateViewTitle(viewName: string, appId?: string) {
      const titleElement = document.getElementById('viewTitle');
      if (!titleElement) return;
      
      if (viewName === 'compose') {
        if (appId) {
          titleElement.textContent = `Compose Email - ${appId}`;
        } else {
          titleElement.textContent = 'Compose Email';
        }
      }
    }

    it('should update compose view title with app context', () => {
      const appId = 'retree-hawaii-app';
      
      updateViewTitle('compose', appId);
      
      const titleElement = document.getElementById('viewTitle') as HTMLElement;
      expect(titleElement.textContent).toBe('Compose Email - retree-hawaii-app');
    });

    it('should show default title when no app context', () => {
      updateViewTitle('compose');
      
      const titleElement = document.getElementById('viewTitle') as HTMLElement;
      expect(titleElement.textContent).toBe('Compose Email');
    });
  });

  describe('Return Navigation Behavior', () => {
    function handleReturnClick() {
      const urlParams = new URLSearchParams(window.location.search);
      const returnUrl = urlParams.get('returnUrl') || localStorage.getItem('editorReturnUrl');
      
      if (returnUrl) {
        localStorage.removeItem('editorReturnUrl');
        window.location.href = returnUrl;
        return true; // Indicates return navigation occurred
      }
      return false; // No return navigation
    }

    it('should navigate to returnUrl and clear localStorage', () => {
      const returnUrl = 'https://app.example.com/dashboard';
      (window as any).location.search = `?returnUrl=${encodeURIComponent(returnUrl)}`;
      
      // Mock window.location.href setter
      const hrefSetter = vi.fn();
      Object.defineProperty(window.location, 'href', {
        set: hrefSetter,
        configurable: true
      });
      
      const didReturn = handleReturnClick();
      
      expect(didReturn).toBe(true);
      expect(hrefSetter).toHaveBeenCalledWith(returnUrl);
      expect(localStorage.getItem('editorReturnUrl')).toBeNull();
    });

    it('should use localStorage returnUrl if URL param is missing', () => {
      const returnUrl = 'https://stored.example.com/return';
      localStorage.setItem('editorReturnUrl', returnUrl);
      (window as any).location.search = ''; // No URL params
      
      const hrefSetter = vi.fn();
      Object.defineProperty(window.location, 'href', {
        set: hrefSetter,
        configurable: true
      });
      
      const didReturn = handleReturnClick();
      
      expect(didReturn).toBe(true);
      expect(hrefSetter).toHaveBeenCalledWith(returnUrl);
      expect(localStorage.getItem('editorReturnUrl')).toBeNull();
    });

    it('should return false when no returnUrl available', () => {
      (window as any).location.search = '';
      localStorage.clear();
      
      const didReturn = handleReturnClick();
      
      expect(didReturn).toBe(false);
    });
  });

  describe('Role-Based Visibility with App Integration Override', () => {
    function setRoleBasedVisibilityWithAppOverride(userRoles: string[]) {
      const urlParams = new URLSearchParams(window.location.search);
      const returnUrl = urlParams.get('returnUrl') || localStorage.getItem('editorReturnUrl');
      const currentView = urlParams.get('view');
      
      // App integration compose: hide navigation when coming from app for compose
      const isAppIntegrationCompose = returnUrl && currentView === 'compose';
      
      if (isAppIntegrationCompose) {
        // Hide main navigation for app integration
        const navButtons = document.querySelectorAll('.navBtn');
        navButtons.forEach(btn => {
          if (btn.getAttribute('data-view') !== 'compose') {
            (btn as HTMLElement).style.display = 'none';
          }
        });
        return 'app-integration-compose';
      }
      
      // Normal role-based visibility would apply here
      return 'normal';
    }

    it('should hide navigation for app integration compose', () => {
      (window as any).location.search = '?returnUrl=https://app.example.com&view=compose';
      
      const mode = setRoleBasedVisibilityWithAppOverride(['tenant_admin']);
      
      expect(mode).toBe('app-integration-compose');
      
      const emailLogsBtn = document.querySelector('[data-view="email-logs"]') as HTMLElement;
      const smsLogsBtn = document.querySelector('[data-view="sms-logs"]') as HTMLElement;
      const composeBtn = document.querySelector('[data-view="compose"]') as HTMLElement;
      
      expect(emailLogsBtn.style.display).toBe('none');
      expect(smsLogsBtn.style.display).toBe('none');
      // Compose button should remain visible
      expect(composeBtn.style.display).not.toBe('none');
    });

    it('should not override navigation for external log viewing', () => {
      (window as any).location.search = '?returnUrl=https://app.example.com&view=email-logs';
      
      const mode = setRoleBasedVisibilityWithAppOverride(['tenant_admin']);
      
      expect(mode).toBe('normal'); // Should not trigger app integration override
    });
  });

  describe('Recipient Data Handling', () => {
    function parseRecipientsFromUrl(): any[] {
      const urlParams = new URLSearchParams(window.location.search);
      const recipientsParam = urlParams.get('recipients');
      
      if (recipientsParam) {
        try {
          return JSON.parse(decodeURIComponent(recipientsParam));
        } catch (error) {
          console.error('Failed to parse recipients:', error);
          return [];
        }
      }
      
      return [];
    }

    it('should parse recipient data from URL parameters', () => {
      const recipients = [
        { email: 'user1@example.com', name: 'User One' },
        { email: 'user2@example.com', name: 'User Two' }
      ];
      
      const encodedRecipients = encodeURIComponent(JSON.stringify(recipients));
      (window as any).location.search = `?recipients=${encodedRecipients}`;
      
      const parsedRecipients = parseRecipientsFromUrl();
      
      expect(parsedRecipients).toHaveLength(2);
      expect(parsedRecipients[0].email).toBe('user1@example.com');
      expect(parsedRecipients[1].name).toBe('User Two');
    });

    it('should return empty array for invalid recipient data', () => {
      (window as any).location.search = '?recipients=invalid-json';
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const parsedRecipients = parseRecipientsFromUrl();
      
      expect(parsedRecipients).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should return empty array when no recipients parameter', () => {
      (window as any).location.search = '?view=compose';
      
      const parsedRecipients = parseRecipientsFromUrl();
      
      expect(parsedRecipients).toEqual([]);
    });
  });

  describe('App ID Context Extraction', () => {
    function extractAppContext() {
      const urlParams = new URLSearchParams(window.location.search);
      const appId = urlParams.get('appId');
      const tenantId = urlParams.get('tenant');
      
      // Extract tenant from known app mappings
      let extractedTenant = null;
      if (appId === 'cmfka688r0001b77ofpgm57ix') {
        extractedTenant = 'robs-world-tenant';
      }
      
      return {
        appId,
        tenantId: tenantId || extractedTenant,
        context: appId ? 'app-integration' : 'standalone'
      };
    }

    it('should extract app context from URL parameters', () => {
      (window as any).location.search = '?appId=test-app-123&tenant=test-tenant';
      
      const context = extractAppContext();
      
      expect(context.appId).toBe('test-app-123');
      expect(context.tenantId).toBe('test-tenant');
      expect(context.context).toBe('app-integration');
    });

    it('should map known app IDs to tenants', () => {
      (window as any).location.search = '?appId=cmfka688r0001b77ofpgm57ix';
      
      const context = extractAppContext();
      
      expect(context.appId).toBe('cmfka688r0001b77ofpgm57ix');
      expect(context.tenantId).toBe('robs-world-tenant');
      expect(context.context).toBe('app-integration');
    });

    it('should handle standalone usage', () => {
      (window as any).location.search = '';
      
      const context = extractAppContext();
      
      expect(context.appId).toBeNull();
      expect(context.tenantId).toBeNull();
      expect(context.context).toBe('standalone');
    });
  });
});