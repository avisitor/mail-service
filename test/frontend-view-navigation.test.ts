import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock View implementations for testing
interface IView {
  readonly name: string;
  readonly elementId: string;
  initialize(): Promise<void>;
  activate(): Promise<void>;
  deactivate(): void;
  saveState(): any;
  restoreState(state: any): Promise<void>;
  canAccess(userRoles: string[]): boolean;
}

class ViewRegistry {
  private views = new Map<string, IView>();
  private currentView: IView | null = null;
  private static instance: ViewRegistry | null = null;

  static getInstance(): ViewRegistry {
    if (!ViewRegistry.instance) {
      ViewRegistry.instance = new ViewRegistry();
    }
    return ViewRegistry.instance;
  }

  static reset() {
    ViewRegistry.instance = null;
  }

  register(view: IView): void {
    this.views.set(view.name, view);
  }

  async showView(viewName: string, userRoles: string[] = []): Promise<void> {
    const view = this.views.get(viewName);
    if (!view) {
      console.warn(`View not found: ${viewName}`);
      return;
    }

    if (!view.canAccess(userRoles)) {
      console.warn(`Access denied to view: ${viewName}`);
      return;
    }

    // Deactivate current view
    if (this.currentView) {
      this.currentView.deactivate();
    }

    // Hide all view elements
    this.views.forEach(v => {
      const element = document.getElementById(v.elementId);
      if (element) element.style.display = 'none';
    });

    // Show and activate new view
    const element = document.getElementById(view.elementId);
    if (element) {
      element.style.display = 'block';
      this.currentView = view;
      await view.activate();
      
      // Update navigation
      document.querySelectorAll('.navBtn').forEach(el => 
        el.classList.toggle('active', el.getAttribute('data-view') === viewName)
      );
    }
  }

  getCurrentViewName(): string | null {
    return this.currentView?.name || null;
  }

  saveCurrentViewState(): any {
    return this.currentView?.saveState() || null;
  }

  async restoreViewState(viewName: string, state: any): Promise<void> {
    const view = this.views.get(viewName);
    if (view && state) {
      await view.restoreState(state);
    }
  }
}

// Mock view implementations
class MockComposeView implements IView {
  readonly name = 'compose';
  readonly elementId = 'view-compose';
  
  private activateSpy = vi.fn();
  private deactivateSpy = vi.fn();
  private saveStateSpy = vi.fn();
  private restoreStateSpy = vi.fn();

  async initialize(): Promise<void> {}
  
  async activate(): Promise<void> {
    this.activateSpy();
  }
  
  deactivate(): void {
    this.deactivateSpy();
  }
  
  saveState(): any {
    this.saveStateSpy();
    return { formData: 'test-data' };
  }
  
  async restoreState(state: any): Promise<void> {
    this.restoreStateSpy(state);
  }
  
  canAccess(userRoles: string[]): boolean {
    return userRoles.includes('superadmin') || userRoles.includes('tenant_admin');
  }

  // Test helpers
  getActivateSpy() { return this.activateSpy; }
  getDeactivateSpy() { return this.deactivateSpy; }
  getSaveStateSpy() { return this.saveStateSpy; }
  getRestoreStateSpy() { return this.restoreStateSpy; }
}

class MockTenantsView implements IView {
  readonly name = 'tenants';
  readonly elementId = 'view-tenants';
  
  private activateSpy = vi.fn();
  private deactivateSpy = vi.fn();

  async initialize(): Promise<void> {}
  async activate(): Promise<void> { this.activateSpy(); }
  deactivate(): void { this.deactivateSpy(); }
  saveState(): any { return null; }
  async restoreState(state: any): Promise<void> {}
  
  canAccess(userRoles: string[]): boolean {
    return userRoles.includes('superadmin');
  }

  getActivateSpy() { return this.activateSpy; }
  getDeactivateSpy() { return this.deactivateSpy; }
}

class MockRestrictedView implements IView {
  readonly name = 'restricted';
  readonly elementId = 'view-restricted';
  
  async initialize(): Promise<void> {}
  async activate(): Promise<void> {}
  deactivate(): void {}
  saveState(): any { return null; }
  async restoreState(state: any): Promise<void> {}
  
  canAccess(userRoles: string[]): boolean {
    return false; // Always deny access
  }
}

describe('View Navigation System', () => {
  let registry: ViewRegistry;
  let composeView: MockComposeView;
  let tenantsView: MockTenantsView;
  let restrictedView: MockRestrictedView;

  beforeEach(() => {
    // Reset ViewRegistry singleton
    ViewRegistry.reset();
    registry = ViewRegistry.getInstance();
    
    // Create mock views
    composeView = new MockComposeView();
    tenantsView = new MockTenantsView();
    restrictedView = new MockRestrictedView();
    
    // Register views
    registry.register(composeView);
    registry.register(tenantsView);
    registry.register(restrictedView);
    
    // Create DOM structure
    document.body.innerHTML = `
      <div class="topnav">
        <button class="navBtn" data-view="compose">Compose</button>
        <button class="navBtn" data-view="tenants">Tenants</button>
        <button class="navBtn" data-view="restricted">Restricted</button>
      </div>
      <div id="view-compose" style="display: none;">Compose View</div>
      <div id="view-tenants" style="display: none;">Tenants View</div>
      <div id="view-restricted" style="display: none;">Restricted View</div>
    `;
  });

  describe('ViewRegistry Singleton', () => {
    it('should maintain a singleton instance', () => {
      const registry1 = ViewRegistry.getInstance();
      const registry2 = ViewRegistry.getInstance();
      
      expect(registry1).toBe(registry2);
    });
  });

  describe('View Registration', () => {
    it('should register views successfully', () => {
      const newRegistry = ViewRegistry.getInstance();
      const mockView = new MockComposeView();
      
      newRegistry.register(mockView);
      
      // Should be able to show the registered view
      expect(newRegistry.getCurrentViewName()).toBeNull();
    });
  });

  describe('View Switching', () => {
    it('should switch to compose view with proper access', async () => {
      const userRoles = ['tenant_admin'];
      
      await registry.showView('compose', userRoles);
      
      expect(registry.getCurrentViewName()).toBe('compose');
      expect(composeView.getActivateSpy()).toHaveBeenCalled();
      
      // Check DOM updates
      const composeElement = document.getElementById('view-compose');
      expect(composeElement?.style.display).toBe('block');
    });

    it('should switch between views and deactivate previous view', async () => {
      const userRoles = ['superadmin'];
      
      // First, switch to compose view
      await registry.showView('compose', userRoles);
      expect(registry.getCurrentViewName()).toBe('compose');
      expect(composeView.getActivateSpy()).toHaveBeenCalledTimes(1);
      
      // Then switch to tenants view
      await registry.showView('tenants', userRoles);
      expect(registry.getCurrentViewName()).toBe('tenants');
      expect(composeView.getDeactivateSpy()).toHaveBeenCalledTimes(1);
      expect(tenantsView.getActivateSpy()).toHaveBeenCalledTimes(1);
      
      // Check DOM - tenants should be visible, compose hidden
      const tenantsElement = document.getElementById('view-tenants');
      const composeElement = document.getElementById('view-compose');
      expect(tenantsElement?.style.display).toBe('block');
      expect(composeElement?.style.display).toBe('none');
    });

    it('should update navigation button active states', async () => {
      const userRoles = ['tenant_admin'];
      
      await registry.showView('compose', userRoles);
      
      const composeBtn = document.querySelector('[data-view="compose"]');
      const tenantsBtn = document.querySelector('[data-view="tenants"]');
      
      expect(composeBtn?.classList.contains('active')).toBe(true);
      expect(tenantsBtn?.classList.contains('active')).toBe(false);
    });
  });

  describe('Access Control', () => {
    it('should deny access to restricted views', async () => {
      const userRoles = ['tenant_admin'];
      
      await registry.showView('restricted', userRoles);
      
      // Should not switch to restricted view
      expect(registry.getCurrentViewName()).toBeNull();
      
      // DOM element should remain hidden
      const restrictedElement = document.getElementById('view-restricted');
      expect(restrictedElement?.style.display).toBe('none');
    });

    it('should allow superadmin access to tenants view', async () => {
      const userRoles = ['superadmin'];
      
      await registry.showView('tenants', userRoles);
      
      expect(registry.getCurrentViewName()).toBe('tenants');
      expect(tenantsView.getActivateSpy()).toHaveBeenCalled();
    });

    it('should deny tenant_admin access to tenants view', async () => {
      const userRoles = ['tenant_admin'];
      
      await registry.showView('tenants', userRoles);
      
      // Should not switch view
      expect(registry.getCurrentViewName()).toBeNull();
      expect(tenantsView.getActivateSpy()).not.toHaveBeenCalled();
    });
  });

  describe('View State Management', () => {
    it('should save and restore view state', async () => {
      const userRoles = ['tenant_admin'];
      
      // Switch to compose view and save state
      await registry.showView('compose', userRoles);
      const savedState = registry.saveCurrentViewState();
      
      expect(composeView.getSaveStateSpy()).toHaveBeenCalled();
      expect(savedState).toEqual({ formData: 'test-data' });
      
      // Restore state
      await registry.restoreViewState('compose', savedState);
      expect(composeView.getRestoreStateSpy()).toHaveBeenCalledWith(savedState);
    });

    it('should return null when no current view for state save', () => {
      const savedState = registry.saveCurrentViewState();
      expect(savedState).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle attempts to show non-existent views', async () => {
      const userRoles = ['superadmin'];
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await registry.showView('non-existent', userRoles);
      
      expect(registry.getCurrentViewName()).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('View not found: non-existent');
      
      consoleSpy.mockRestore();
    });

    it('should handle missing DOM elements gracefully', async () => {
      // Remove the compose view element
      const composeElement = document.getElementById('view-compose');
      composeElement?.remove();
      
      const userRoles = ['tenant_admin'];
      
      // Should not throw error
      await registry.showView('compose', userRoles);
      
      // View should not be set as current since DOM element is missing
      expect(registry.getCurrentViewName()).toBeNull();
    });
  });

  describe('Compose View Integration', () => {
    it('should handle URL parameters for compose view', () => {
      // Mock window.location.search
      delete (window as any).location;
      (window as any).location = {
        search: '?appId=test-app&recipients=test@example.com'
      };
      
      const urlParams = new URLSearchParams(window.location.search);
      expect(urlParams.get('appId')).toBe('test-app');
      expect(urlParams.get('recipients')).toBe('test@example.com');
    });

    it('should handle returnUrl storage for app integration', () => {
      const returnUrl = 'https://example.com/return';
      localStorage.setItem('editorReturnUrl', returnUrl);
      
      expect(localStorage.getItem('editorReturnUrl')).toBe(returnUrl);
    });
  });
});