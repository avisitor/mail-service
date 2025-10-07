// UI client: tenant management + compose/send + quick ad-hoc send (DB path only now).

// Global type declarations
declare global {
    interface Window {
        tinymce: any;
    }
}

// Make this file a module
export {};

// Debug system for comprehensive view flow tracking
const DEBUG_VIEW_FLOW = true;

// Add a simple test to verify script is loading
console.log('🚀 Mail Service Frontend Script Loading...');
console.log('🔍 Debug: Script execution started at', new Date().toISOString());

function debugLog(category: string, message: string, data?: any): void {
  if (DEBUG_VIEW_FLOW) {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`${timestamp} [${category}] ${message}`, data);
    } else {
      console.log(`${timestamp} [${category}] ${message}`);
    }
  }
}

// Deterministic precondition system - NO polling or timeouts
class PreconditionManager {
  private static instance: PreconditionManager | null = null;
  private preconditions: Map<string, { promise: Promise<void>, resolve: () => void, completed: boolean }> = new Map();
  private allPreconditionsPromise: Promise<void> | null = null;
  private allPreconditionsResolve: (() => void) | null = null;

  static getInstance(): PreconditionManager {
    if (!PreconditionManager.instance) {
      PreconditionManager.instance = new PreconditionManager();
    }
    return PreconditionManager.instance;
  }

  registerPrecondition(name: string): void {
    if (this.preconditions.has(name)) {
      debugLog('PRECONDITIONS', `Precondition ${name} already registered`);
      return;
    }

    let resolveFunc: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveFunc = resolve;
    });

    this.preconditions.set(name, {
      promise,
      resolve: resolveFunc!,
      completed: false
    });

    debugLog('PRECONDITIONS', `Registered precondition: ${name}`);
    this.updateAllPreconditionsPromise();
  }

  completePrecondition(name: string): void {
    const precondition = this.preconditions.get(name);
    if (!precondition) {
      debugLog('PRECONDITIONS', `Warning: Precondition ${name} not found`);
      return;
    }

    if (precondition.completed) {
      debugLog('PRECONDITIONS', `Precondition ${name} already completed`);
      return;
    }

    precondition.completed = true;
    precondition.resolve();
    debugLog('PRECONDITIONS', `Completed precondition: ${name}`);
    
    this.checkAllPreconditionsComplete();
  }

  private updateAllPreconditionsPromise(): void {
    if (!this.allPreconditionsPromise) {
      this.allPreconditionsPromise = new Promise<void>((resolve) => {
        this.allPreconditionsResolve = resolve;
      });
    }
  }

  private checkAllPreconditionsComplete(): void {
    const allCompleted = Array.from(this.preconditions.values()).every(p => p.completed);
    if (allCompleted && this.allPreconditionsResolve) {
      debugLog('PRECONDITIONS', 'All preconditions completed!');
      this.allPreconditionsResolve();
      this.allPreconditionsResolve = null;
    }
  }

  async waitForAllPreconditions(): Promise<void> {
    if (!this.allPreconditionsPromise) {
      this.updateAllPreconditionsPromise();
    }
    
    debugLog('PRECONDITIONS', 'Waiting for all preconditions to complete...');
    await this.allPreconditionsPromise;
    debugLog('PRECONDITIONS', 'All preconditions completed - ready to proceed');
  }

  async waitForPrecondition(name: string): Promise<void> {
    const precondition = this.preconditions.get(name);
    if (!precondition) {
      throw new Error(`Precondition ${name} not registered`);
    }
    
    if (precondition.completed) {
      return;
    }

    debugLog('PRECONDITIONS', `Waiting for precondition: ${name}`);
    await precondition.promise;
  }

  getPreconditionStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    this.preconditions.forEach((precondition, name) => {
      status[name] = precondition.completed;
    });
    return status;
  }
}

// Comprehensive view visibility instrumentation
function setupViewVisibilityInstrumentation(): void {
  debugLog('VISIBILITY-DEBUG', 'Setting up comprehensive view visibility instrumentation');
  
  document.querySelectorAll('main.layout').forEach(element => {
    const htmlElement = element as HTMLElement;
    const originalStyleDisplay = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style')!;
    
    // Monitor style.display changes
    let currentDisplay = htmlElement.style.display;
    Object.defineProperty(htmlElement, 'style', {
      get() {
        return new Proxy(originalStyleDisplay.get!.call(this), {
          set(target, property, value) {
            if (property === 'display' && value !== currentDisplay) {
              const stack = new Error().stack;
              debugLog('VISIBILITY-DEBUG', `${htmlElement.id}: style.display changed from "${currentDisplay}" to "${value}"`, { stack });
              currentDisplay = value;
            }
            target[property] = value;
            return true;
          }
        });
      },
      set(value) {
        originalStyleDisplay.set!.call(this, value);
      }
    });
    
    // Monitor classList operations for 'visible' class
    const originalAdd = htmlElement.classList.add;
    const originalRemove = htmlElement.classList.remove;
    
    htmlElement.classList.add = function(...tokens) {
      if (tokens.includes('visible')) {
        const stack = new Error().stack;
        debugLog('VISIBILITY-DEBUG', `${htmlElement.id}: addClass 'visible'`, { stack });
      }
      return originalAdd.apply(this, tokens);
    };
    
    htmlElement.classList.remove = function(...tokens) {
      if (tokens.includes('visible')) {
        const stack = new Error().stack;
        debugLog('VISIBILITY-DEBUG', `${htmlElement.id}: removeClass 'visible'`, { stack });
      }
      return originalRemove.apply(this, tokens);
    };
  });
  
  debugLog('VISIBILITY-DEBUG', 'View visibility instrumentation complete');
}

interface TemplateRecord { 
  id: string; 
  appId: string; 
  title: string; 
  content: string;
  subject: string;
  version: number; 
  isActive: boolean;
  // Computed properties for backward compatibility
  name?: string;
  description?: string;
  bodyHtml?: string;
  bodyText?: string;
}
interface Tenant { id:string; name:string; status?:string; }
interface AppRec { id:string; tenantId:string; name:string; clientId:string; }

// App configuration interfaces
interface AppConfig {
  title?: string;
  description?: string;
  css_url?: string;
  banner?: {
    id?: string;
    className?: string;
    html?: string;
    afterBanner?: string;
  };
  embeddedMenu?: {
    url: string;
    targetSelector?: string;
    replaceTarget?: boolean;
  };
}

interface AppsConfig {
  [appId: string]: AppConfig;
}

// Custom CSS loading functions
async function loadAppsConfig(): Promise<AppsConfig> {
  try {
    const response = await fetch('/ui/keys/apps.json');
    if (!response.ok) {
      console.warn('[CustomCSS] Failed to load apps.json:', response.status);
      return {};
    }
    return await response.json();
  } catch (error) {
    console.warn('[CustomCSS] Error loading apps.json:', error);
    return {};
  }
}

async function loadCustomCSS(appId: string): Promise<void> {
  if (!appId) {
    console.debug('[CustomCSS] No appId provided, using default styling');
    return;
  }

  try {
    const appsConfig = await loadAppsConfig();
    const appConfig = appsConfig[appId];
    
    if (!appConfig?.css_url) {
      console.debug(`[CustomCSS] No custom CSS configured for app: ${appId}`);
      return;
    }

    console.log(`[CustomCSS] Loading custom CSS for ${appId}: ${appConfig.css_url}`);
    
    // Create and inject CSS link
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = appConfig.css_url;
    link.id = 'custom-app-css';
    
    // Add error handling
    link.onerror = () => {
      console.warn(`[CustomCSS] Failed to load custom CSS: ${appConfig.css_url}`);
    };
    
    link.onload = () => {
      console.log(`[CustomCSS] Successfully loaded custom CSS for ${appId}`);
    };
    
    // Remove any existing custom CSS
    const existingCSS = document.getElementById('custom-app-css');
    if (existingCSS) {
      existingCSS.remove();
    }
    
    // Inject custom CSS
    document.head.appendChild(link);
    
    // Update app title if configured
    if (appConfig.title) {
      const appTitleElement = document.getElementById('appTitle');
      if (appTitleElement) {
        appTitleElement.textContent = appConfig.title;
      }
    }
    
    // Add app-specific enhancements
    await addAppSpecificEnhancements(appId, appConfig);
    
  } catch (error) {
    console.error('[CustomCSS] Error loading custom CSS:', error);
  }
}

async function addAppSpecificEnhancements(appId: string, appConfig: AppConfig): Promise<void> {
  // Add banner if configured
  if (appConfig.banner) {
    addBanner(appConfig.banner);
  }
  
  // Load embedded menu if configured
  console.log('[DEBUG] Checking for embeddedMenu configuration:', !!appConfig.embeddedMenu);
  if (appConfig.embeddedMenu) {
    console.log('[DEBUG] embeddedMenu config:', appConfig.embeddedMenu);
    // Get current URL parameters to pass app-specific data back to menu endpoint
    const urlParams = new URLSearchParams(window.location.search);
    const appSpecificParams: Record<string, string> = {};
    
    // Extract parameters that might be app-specific (excluding mail service parameters)
    const mailServiceParams = new Set(['appId', 'token', 'recipients', 'to', 'subject', 'returnUrl', 'body', 'html']);
    
    console.log('[DEBUG] All URL params:', Object.fromEntries(Array.from(urlParams.entries())));
    
    urlParams.forEach((value, key) => {
      if (!mailServiceParams.has(key)) {
        appSpecificParams[key] = value;
      }
    });
    
    console.log('[DEBUG] App-specific params to pass to menu:', appSpecificParams);
    await loadEmbeddedMenu(appConfig.embeddedMenu, appSpecificParams);
  }
}

async function loadEmbeddedMenu(menuConfig: any, appParams: Record<string, string> = {}): Promise<void> {
  try {
    // Build URL with app-specific parameters
    const url = new URL(menuConfig.url);
    
    // Add all app-specific parameters to the URL
    for (const [key, value] of Object.entries(appParams)) {
      url.searchParams.set(key, value);
    }
    
    console.log('[EmbeddedMenu] Loading menu from:', url.toString());
    console.log('[EmbeddedMenu] App parameters:', appParams);
    
    // First try without credentials to avoid CORS issues with wildcard origin
    let response = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'omit', // Don't include cookies to avoid CORS conflict
      headers: {
        'Accept': 'text/html'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Menu fetch failed: ${response.status}`);
    }
    
    const menuHTML = await response.text();
    console.log('[EmbeddedMenu] Received menu HTML length:', menuHTML.length);
    
    // Find the target element to replace or insert the menu
    const targetSelector = menuConfig.targetSelector || '[data-embedded-menu]';
    const targetElement = document.querySelector(targetSelector);
    
    console.log('[EmbeddedMenu] Target selector:', targetSelector);
    console.log('[EmbeddedMenu] Target element found:', !!targetElement);
    
    if (targetElement) {
      if (menuConfig.replaceTarget) {
        // Replace the entire target element
        targetElement.outerHTML = menuHTML;
      } else {
        // Insert the menu content inside the target element
        targetElement.innerHTML = menuHTML;
      }
      
      // Add class to body to adjust layout for fixed positioned menu
      document.body.classList.add('has-embedded-menu');
      
      console.log('[EmbeddedMenu] Menu loaded successfully from:', menuConfig.url);
    } else {
      console.warn('[EmbeddedMenu] Target element not found:', targetSelector);
    }
    
  } catch (error) {
    console.error('[EmbeddedMenu] Failed to load menu:', error);
  }
}

function addBanner(bannerConfig: any): void {
  // Remove existing banner if present
  const existingBanner = document.querySelector('[id$="-banner"]');
  if (existingBanner) {
    existingBanner.remove();
  }
  
  // Remove existing after-banner content
  const existingAfterBanner = document.querySelector('.retree-nav-buttons, .outings-nav-buttons');
  if (existingAfterBanner) {
    existingAfterBanner.remove();
  }
  
  // Create banner HTML
  const banner = document.createElement('div');
  banner.id = bannerConfig.id || 'app-banner';
  banner.className = bannerConfig.className || 'app-banner';
  banner.innerHTML = bannerConfig.html || '';
  
  // Insert banner at the top of the app
  const app = document.getElementById('app');
  if (app && app.firstChild) {
    app.insertBefore(banner, app.firstChild);
    
    // Add after-banner content if provided
    if (bannerConfig.afterBanner) {
      const afterBannerDiv = document.createElement('div');
      afterBannerDiv.innerHTML = bannerConfig.afterBanner;
      const afterContent = afterBannerDiv.firstElementChild;
      if (afterContent) {
        app.insertBefore(afterContent, banner.nextSibling);
      }
    }
  }
  
  console.log('[CustomCSS] Added app banner');
}

// View Architecture
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
      debugLog('ViewRegistry', 'Created global instance');
    }
    return ViewRegistry.instance;
  }

  register(view: IView): void {
    this.views.set(view.name, view);
    debugLog('ViewRegistry', `Registered view: ${view.name}`);
  }

  areViewsInitialized(): boolean {
    return this.views.size > 0;
  }

  async showView(viewName: string, userRoles: string[] = []): Promise<void> {
    debugLog('ViewRegistry.showView', `ENTRY: viewName=${viewName}, roles=${userRoles.join(',')}`);
    
    // CRITICAL: Wait for ALL preconditions before showing any view
    const preconditionManager = PreconditionManager.getInstance();
    await preconditionManager.waitForAllPreconditions();
    
    console.log(`[ViewRegistry] Attempting to show view: ${viewName} with roles:`, userRoles);
    const view = this.views.get(viewName);
    if (!view) {
      console.warn(`[ViewRegistry] View not found: ${viewName}`);
      return;
    }

    const canAccess = view.canAccess(userRoles);
    console.log(`[ViewRegistry] Access check for ${viewName}: ${canAccess} (roles: ${userRoles.join(', ')})`);
    if (!canAccess) {
      console.warn(`[ViewRegistry] Access denied to view: ${viewName}`);
      return;
    }

    // Deactivate current view
    if (this.currentView) {
      this.currentView.deactivate();
      // Hide only the current view element (not all views)
      const currentElement = document.getElementById(this.currentView.elementId);
      if (currentElement) {
        currentElement.style.display = 'none';
        currentElement.style.visibility = 'hidden';
        currentElement.classList.remove('visible');
      }
    }

    // Show and activate new view
    const element = document.getElementById(view.elementId);
    debugLog('ViewRegistry.showView', `Got element for ${viewName}:`, element);
    debugLog('ViewRegistry.showView', `Element ID: ${view.elementId}`);
    
    if (element) {
      debugLog('ViewRegistry.showView', `Making view visible: ${viewName} (element ID: ${view.elementId})`);
      
      // Debug each style operation
      debugLog('ViewRegistry.showView', `About to call removeProperty on element style`);
      try {
        // Use style.display = '' instead of removeProperty to avoid illegal invocation error
        element.style.display = '';
        debugLog('ViewRegistry.showView', `Successfully cleared display property`);
      } catch (error) {
        console.error(`[ViewRegistry.showView] Error clearing display property:`, error);
        throw error;
      }
      
      debugLog('ViewRegistry.showView', `About to set display = 'block'`);
      element.style.display = 'block';
      element.style.visibility = 'visible';
      element.classList.add('visible');
      
      this.currentView = view;
      debugLog('ViewRegistry.showView', `About to call activate on view: ${viewName}, view object:`, view);
      debugLog('ViewRegistry.showView', `View activate method:`, view.activate);
      debugLog('ViewRegistry.showView', `View activate method type: ${typeof view.activate}`);
      debugLog('ViewRegistry.showView', `View constructor: ${view.constructor.name}`);
      try {
        await view.activate.call(view);
        debugLog('ViewRegistry.showView', `Successfully activated view: ${viewName}`);
      } catch (error) {
        console.error(`[ViewRegistry.showView] Error activating view ${viewName}:`, error);
        
        // Type-safe error logging
        if (error instanceof Error) {
          console.error(`[ViewRegistry.showView] Error name: ${error.name}`);
          console.error(`[ViewRegistry.showView] Error message: ${error.message}`);
          if (error.stack) {
            console.error(`[ViewRegistry.showView] Stack trace:`, error.stack);
          }
        } else {
          console.error(`[ViewRegistry.showView] Non-Error object thrown:`, error);
        }
        
        console.error(`[ViewRegistry.showView] Full error object:`, error);
        
        // Log the view object details for debugging
        console.error(`[ViewRegistry.showView] View object details:`, {
          name: view.name,
          elementId: view.elementId,
          constructor: view.constructor.name,
          activateMethod: view.activate,
          activateType: typeof view.activate
        });
        throw error;
      }
      
      // Update navigation
      document.querySelectorAll('.btn[data-view]').forEach(el => 
        el.classList.toggle('active', el.getAttribute('data-view') === viewName)
      );
      
      // Update logout/return button
      updateLogoutButton();
      
      // Update compose view titles if we're switching to a compose view
      if (viewName === 'compose' || viewName === 'sms-compose') {
        const urlParams = new URLSearchParams(window.location.search);
        const currentAppId = urlParams.get('appId');
        updateViewTitle(viewName, currentAppId || undefined);
      }
      
      console.debug(`[ViewRegistry] Switched to view: ${viewName}`);
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

// Global helper for dynamic view registration
function registerView(view: IView): void {
  ViewRegistry.getInstance().register(view);
}

class TemplateManager {
  private appId: string = '';
  private templates: TemplateRecord[] = [];
  private onTemplateSelectedCallback?: (template: TemplateRecord | null) => void;

  constructor(private selectElementId: string) {}

  setAppId(appId: string): void {
    this.appId = appId;
  }

  setOnTemplateSelected(callback: (template: TemplateRecord | null) => void): void {
    this.onTemplateSelectedCallback = callback;
  }

  async loadTemplates(): Promise<void> {
    if (!this.appId) {
      console.warn('[TemplateManager] No appId set');
      return;
    }

    try {
      this.templates = await api(`/templates?appId=${this.appId}`);
      this.populateDropdown();
      console.debug(`[TemplateManager] Loaded ${this.templates.length} templates`);
    } catch (error) {
      console.error('[TemplateManager] Failed to load templates:', error);
    }
  }

  private populateDropdown(): void {
    const select = document.getElementById(this.selectElementId) as HTMLSelectElement;
    if (!select) return;

    select.innerHTML = '<option value="">Select a template...</option>';
    this.templates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.title || 'Untitled';
      select.appendChild(option);
    });

    // Add change listener
    select.removeEventListener('change', this.handleTemplateChange);
    select.addEventListener('change', this.handleTemplateChange);
  }

  private handleTemplateChange = async (): Promise<void> => {
    const select = document.getElementById(this.selectElementId) as HTMLSelectElement;
    if (!select) return;

    const templateId = select.value;
    if (templateId) {
      const template = await this.loadTemplate(templateId);
      this.onTemplateSelectedCallback?.(template);
    } else {
      this.onTemplateSelectedCallback?.(null);
    }
  };

  async loadTemplate(templateId: string): Promise<TemplateRecord> {
    const template = await api(`/templates/${templateId}`);
    
    // Decode HTML entities in content
    if (template.content) {
      template.content = decodeHtmlEntities(template.content);
    }
    
    return template;
  }

  getSelectedTemplateId(): string {
    const select = document.getElementById(this.selectElementId) as HTMLSelectElement;
    return select?.value || '';
  }

  setSelectedTemplate(templateId: string): void {
    const select = document.getElementById(this.selectElementId) as HTMLSelectElement;
    if (select) {
      select.value = templateId;
      // Trigger the change event to call the onTemplateSelected callback
      select.dispatchEvent(new Event('change'));
    }
  }

  clearSelection(): void {
    const select = document.getElementById(this.selectElementId) as HTMLSelectElement;
    if (select) {
      select.value = '';
    }
  }

  getTemplates(): TemplateRecord[] {
    return [...this.templates];
  }
}

// Utility function to extract tenant ID from app ID
function extractTenantFromAppId(appId: string): string | null {
  // App-specific tenant mapping would go here if needed
  // For now, fallback to roleContext or URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  return roleContext.contextTenantId || urlParams.get('tenant');
}

class ComposeView implements IView {
  readonly name = 'compose';
  readonly elementId = 'view-compose';
  
  private templateManager = new TemplateManager('templateSelect');
  private currentAppId: string | null = null;
  private templates: any[] = [];
  private previousMessages: any[] = [];
  private recipientCount = 0;
  private eventListenersSetup = false;
  private recipientsData: any[] = [];
  private recipientEmails: string = '';
  private subjectFromUrl: string = '';
  private participantContextData: any[] = [];
  private isRestoringState = false;

  constructor() {
    registerView(this);
  }

  async initialize(): Promise<void> {
    console.log('[ComposeView] Initializing compose view');
    this.templateManager.setOnTemplateSelected(this.onTemplateSelected.bind(this));
  }

  async activate(): Promise<void> {
    console.log('[ComposeView] Activating compose view');
    
    // Get appId from URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const appIdFromUrl = urlParams.get('appId');
    const recipientsFromUrl = urlParams.get('recipients');
    const returnUrlFromUrl = urlParams.get('returnUrl');
    const subjectFromUrl = urlParams.get('subject');
    const participantDataFromUrl = urlParams.get('participantData');
    
    // Set currentAppId for this view
    if (appIdFromUrl) {
      this.currentAppId = appIdFromUrl;
    }
    
    // Update title with current app info
    const titleElement = document.getElementById('viewTitle');
    if (titleElement) {
      updateViewTitle('compose', this.currentAppId || undefined);
    }
    
    // Save returnUrl to localStorage for compose workflows from apps
    if (returnUrlFromUrl) {
      localStorage.setItem('editorReturnUrl', returnUrlFromUrl);
      console.log('[ComposeView] Saved returnUrl for compose workflow:', returnUrlFromUrl);
    }
    
    console.log('[ComposeView] URL params - appId:', appIdFromUrl, 'recipients:', recipientsFromUrl);
    
    // Handle recipients data if provided
    if (recipientsFromUrl) {
      try {
        // First try to parse as JSON (for complex recipient data)
        this.recipientsData = JSON.parse(decodeURIComponent(recipientsFromUrl));
        console.log('[ComposeView] Recipients data from URL (JSON):', this.recipientsData);
      } catch (error) {
        // If JSON parsing fails, treat as comma-separated email addresses
        console.log('[ComposeView] Recipients as comma-separated string:', recipientsFromUrl);
        const emailAddresses = decodeURIComponent(recipientsFromUrl).split(',').map(email => email.trim()).filter(email => email.length > 0);
        if (emailAddresses.length > 0) {
          // Store the recipient emails to populate later
          this.recipientEmails = emailAddresses.join('\n');
          console.log('[ComposeView] Parsed recipient emails:', this.recipientEmails);
        }
      }
    }

    // Handle subject if provided
    if (subjectFromUrl) {
      this.subjectFromUrl = decodeURIComponent(subjectFromUrl);
      console.log('[ComposeView] Subject from URL:', this.subjectFromUrl);
    }

    // Handle participant context data if provided
    if (participantDataFromUrl) {
      try {
        this.participantContextData = JSON.parse(decodeURIComponent(participantDataFromUrl));
        console.log('[ComposeView] Participant context data from URL:', this.participantContextData);
      } catch (error) {
        console.warn('[ComposeView] Failed to parse participant context data:', error);
      }
    }

    if (appIdFromUrl) {
      this.currentAppId = appIdFromUrl;
      this.templateManager.setAppId(appIdFromUrl);
      
      // Update title now that we have the appId
      updateViewTitle('compose', this.currentAppId);
      
      console.log('[ComposeView] Using appId from URL:', appIdFromUrl);
      
      // Update URL to clean up parameters while preserving appId
      const url = new URL(window.location.href);
      url.searchParams.set('appId', appIdFromUrl);
      url.searchParams.delete('recipients'); // Clean up after processing
      history.replaceState(null, '', url.toString());
      
      await this.loadComposeData();
      this.setupComposeEventListeners();
      
      // Initialize TinyMCE for rich text editing
      await this.initTinyMCE();
      
      // Show/hide buttons based on user role
      this.updateButtonVisibility();
      
      // If recipients were provided in URL, populate them
      if (this.recipientsData.length > 0) {
        this.populateRecipientsFromData();
      } else if (this.recipientEmails) {
        // Handle simple comma-separated email addresses
        this.populateRecipientsFromEmails();
      }
      
      // Populate subject if provided
      if (this.subjectFromUrl) {
        this.populateSubjectFromUrl();
      }
      
      // Populate global compose state with participant context data
      if (this.participantContextData.length > 0) {
        composeState.recipientsData = this.participantContextData;
        console.log('[ComposeView] Populated composeState.recipientsData with participant context:', this.participantContextData.length, 'recipients');
      }
    } else {
      // Check for saved state
      const savedPageState = localStorage.getItem('pageState');
      let savedAppId = null;
      
      console.log('[ComposeView] No appId in URL, checking saved page state');
      
      if (savedPageState) {
        try {
          const parsed = JSON.parse(savedPageState);
          savedAppId = parsed.appId;
          console.log('[ComposeView] Found appId in saved page state:', savedAppId);
        } catch (error) {
          console.warn('[ComposeView] Failed to parse saved page state:', error);
        }
      }
      
      if (savedAppId) {
        this.currentAppId = savedAppId;
        this.templateManager.setAppId(savedAppId);
        
        // Update URL to include the appId
        const url = new URL(window.location.href);
        url.searchParams.set('appId', savedAppId);
        history.replaceState(null, '', url.toString());
        
        console.log('[ComposeView] Loading data for saved appId:', savedAppId);
        await this.loadComposeData();
        this.setupComposeEventListeners();
        await this.initTinyMCE();
        this.updateButtonVisibility();
      } else {
        console.warn('[ComposeView] No appId found in URL or saved state');
      }
    }
  }

  private updateButtonVisibility(): void {
    const roles: string[] = state.user?.roles || [];
    const isEditorOnly = roles.includes('editor') && !roles.some((r: string)=> r==='tenant_admin' || r==='superadmin');
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');
    
    console.log('[ComposeView] updateButtonVisibility - returnUrl:', returnUrl);
    console.log('[ComposeView] Current URL:', window.location.href);
    
    // Show Cancel button when coming from an app (has returnUrl)
    const cancelBtn = document.getElementById('cancelEmailBtn') as HTMLElement;
    if (cancelBtn) {
      const shouldShow = !!returnUrl;
      cancelBtn.style.display = shouldShow ? 'inline-block' : 'none';
      console.log('[ComposeView] Cancel button visibility set to:', shouldShow ? 'visible' : 'hidden');
    } else {
      console.warn('[ComposeView] Cancel button element not found');
    }
  }

  deactivate(): void {
    console.log('[ComposeView] Deactivating compose view');
    this.saveState();
  }

  saveState(): any {
    if (!this.currentAppId) return null;
    
    try {
      const formData = this.getFormData();
      
      // Don't overwrite good state with empty state during page refresh/navigation
      // This prevents the ViewRegistry deactivation from destroying user's work
      const hasData = formData.recipients || formData.subject || formData.content || 
                     formData.selectedTemplateId || formData.selectedPreviousMessageId;
      
      if (!hasData) {
        // Check if we already have saved state - don't overwrite it with empty data
        const existingStateKey = `composeState_${this.currentAppId}`;
        const existingState = localStorage.getItem(existingStateKey);
        
        if (existingState) {
          console.log('[ComposeView] Skipping save of empty state to preserve existing data');
          try {
            return JSON.parse(existingState);
          } catch (error) {
            console.warn('[ComposeView] Failed to parse existing state:', error);
          }
        }
      }
      
      const state = {
        currentAppId: this.currentAppId,
        templates: this.templates,
        previousMessages: this.previousMessages,
        recipientCount: this.recipientCount,
        formData,
        lastSaved: Date.now()
      };
      
      localStorage.setItem(`composeState_${this.currentAppId}`, JSON.stringify(state));
      console.log('[ComposeView] State saved for app:', this.currentAppId, hasData ? '(with data)' : '(empty)');
      return state;
    } catch (error) {
      console.warn('[ComposeView] Failed to save state:', error);
      return null;
    }
  }

  async restoreState(state: any): Promise<void> {
    if (!this.currentAppId) return;
    
    // Prevent multiple simultaneous restorations
    if (this.isRestoringState) {
      console.log('[ComposeView] Already restoring state, skipping duplicate restoration');
      return;
    }
    
    this.isRestoringState = true;
    
    try {
      console.log('[ComposeView] Starting state restoration for app:', this.currentAppId);
      
      // Always use localStorage as the authoritative source for form state
      // ViewRegistry just signals us to restore, we manage our own state
      const savedState = this.loadSavedState(this.currentAppId);
      
      if (savedState) {
        console.log('[ComposeView] Using localStorage state:', savedState);
        
        this.currentAppId = savedState.currentAppId;
        this.templates = savedState.templates || [];
        this.previousMessages = savedState.previousMessages || [];
        this.recipientCount = savedState.recipientCount || 0;
        
        // Ensure data is loaded first
        if (!this.templates.length || !this.previousMessages.length) {
          console.log('[ComposeView] Loading fresh data before state restoration');
          await this.loadComposeData();
        }
        
        // Wait for DOM elements to be available
        await this.waitForElements();
        
        if (savedState.formData) {
          console.log('[ComposeView] Restoring form data:', savedState.formData);
          
          // Validate that formData has meaningful content before restoring
          const hasData = savedState.formData.recipients || savedState.formData.subject || 
                         savedState.formData.content || savedState.formData.selectedTemplateId || 
                         savedState.formData.selectedPreviousMessageId;
          
          if (hasData) {
            await this.setFormData(savedState.formData);
            this.updateRecipientCount();
            console.log('[ComposeView] Form data restored successfully');
          } else {
            console.log('[ComposeView] Saved form data is empty, skipping restoration');
          }
        }
        
        console.log('[ComposeView] State restored for app:', this.currentAppId);
      } else {
        console.log('[ComposeView] No saved state found in localStorage for app:', this.currentAppId);
      }
    } catch (error) {
      console.warn('[ComposeView] Failed to restore state:', error);
    } finally {
      this.isRestoringState = false;
    }
  }

  private async waitForElements(): Promise<void> {
    // Wait for essential form elements to be available
    const checkElements = () => {
      const recipients = document.querySelector('#recipients');
      const subject = document.querySelector('#subject');
      const fromAddress = document.querySelector('#fromAddress');
      const messageContent = document.querySelector('#messageContent');
      return recipients && subject && fromAddress && messageContent;
    };

    if (checkElements()) return;

    // Wait up to 2 seconds for elements to appear
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (checkElements()) return;
    }
    
    console.warn('[ComposeView] Timeout waiting for form elements');
  }

  canAccess(userRoles: string[]): boolean {
    // All authenticated users can access compose view
    return true;
  }

  private async initTinyMCE(): Promise<void> {
    await TinyMCEManager.initialize('#messageContent', {
      height: 400,
      onContentChange: () => this.saveState()
    });
  }

  private async onTemplateSelected(template: TemplateRecord | null): Promise<void> {
    console.log('[ComposeView] Template selected:', template);
    
    if (!template) {
      this.clearTemplateContent();
      return;
    }

    // Update form with template data
    const subjectInput = document.querySelector('#subject') as HTMLInputElement;
    const contentTextarea = document.querySelector('#messageContent') as HTMLTextAreaElement;
    
    if (subjectInput) {
      subjectInput.value = template.subject || '';
    }
    
    console.log('[ComposeView] About to set template content:', template.content);
    if (contentTextarea) {
      TinyMCEManager.setContent('#messageContent', template.content || '');
    }
    
    // Save state after setting template data
    this.saveState();
  }

  private async onPreviousMessageSelected(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const messageId = select.value;
    
    console.log('[ComposeView] Previous message selected, messageId:', messageId);
    
    if (!messageId) {
      return;
    }

    try {
      // Fetch the full message content by messageId
      const messageContent = await api(`/api/previous-message/${messageId}`);
      
      console.log('[ComposeView] Fetched previous message content:', messageContent);
      
      // Populate form with the previous message data
      const subjectInput = document.querySelector('#subject') as HTMLInputElement;
      const contentTextarea = document.querySelector('#messageContent') as HTMLTextAreaElement;
      
      if (subjectInput && messageContent.subject) {
        subjectInput.value = messageContent.subject;
      }
      
      console.log('[ComposeView] About to set previous message content:', messageContent.message);
      if (contentTextarea && messageContent.message) {
        TinyMCEManager.setContent('#messageContent', messageContent.message);
      }
      
      console.log('[ComposeView] Loaded previous message:', messageContent.subject);
      
      // Save state after setting previous message data
      this.saveState();
    } catch (error) {
      console.error('[ComposeView] Failed to load previous message:', error);
    }
  }

  private clearTemplateContent(): void {
    const subjectInput = document.querySelector('#subject') as HTMLInputElement;
    const contentTextarea = document.querySelector('#messageContent') as HTMLTextAreaElement;
    
    if (subjectInput) {
      subjectInput.value = '';
    }
    
    if (contentTextarea) {
      TinyMCEManager.setContent('#messageContent', '');
    }
  }

  private async loadComposeData(): Promise<void> {
    if (!this.currentAppId) {
      console.warn('[ComposeView] No appId available for loading data');
      return;
    }
    
    try {
      // Load templates using TemplateManager
      await this.templateManager.loadTemplates();
      this.templates = this.templateManager.getTemplates();
      
      // Load previous messages
      this.previousMessages = await api(`/api/previous-messages?appId=${this.currentAppId}`);
      this.populatePreviousMessagesDropdown();
      
      // Load SMTP from address with reliable tenant ID resolution
      const tenantId = extractTenantFromAppId(this.currentAppId);
      console.log('[ComposeView] Resolved tenant ID:', tenantId, 'for app:', this.currentAppId);
      const fromAddressInput = document.querySelector('#fromAddress') as HTMLInputElement;
      
      try {
        const smtpConfig = await api(`/smtp-configs/effective?scope=APP&tenantId=${tenantId}&appId=${this.currentAppId}`);
        
        if (fromAddressInput) {
          if (smtpConfig?.fromAddress) {
            fromAddressInput.value = smtpConfig.fromAddress;
          } else {
            fromAddressInput.value = '';
            fromAddressInput.placeholder = 'No SMTP config found - enter from address';
          }
        }
      } catch (error) {
        console.warn('[ComposeView] Failed to load SMTP config:', error);
        if (fromAddressInput) {
          fromAddressInput.value = '';
          fromAddressInput.placeholder = 'SMTP config unavailable - enter from address';
        }
      }
      
      console.log('[ComposeView] Data loaded successfully');
    } catch (error) {
      console.error('[ComposeView] Failed to load data:', error);
    }
  }

  private populatePreviousMessagesDropdown(): void {
    const select = document.querySelector('#previousMessageSelect') as HTMLSelectElement;
    if (!select) return;

    select.innerHTML = '<option value="">Select a previous message...</option>';
    this.previousMessages.forEach((message: any) => {
      const option = document.createElement('option');
      option.value = message.messageId; // Use messageId instead of id
      
      // Handle different date field names and formats
      let dateStr = '(Unknown Date)';
      const dateValue = message.sent || message.sentAt || message.createdAt || message.timestamp;
      if (dateValue) {
        try {
          const date = new Date(dateValue);
          if (!isNaN(date.getTime())) {
            dateStr = `(${date.toLocaleDateString()})`;
          }
        } catch (error) {
          console.warn('[ComposeView] Failed to parse date:', dateValue, error);
        }
      }
      
      option.textContent = `${message.subject || 'No Subject'} ${dateStr}`;
      select.appendChild(option);
    });
  }

  private setupComposeEventListeners(): void {
    if (this.eventListenersSetup) return;
    
    // Auto-save functionality with debouncing
    const debouncedSave = this.debounce(() => {
      this.saveState();
    }, 2000);

    // Form submission handler
    const composeForm = document.getElementById('composeForm') as HTMLFormElement;
    if (composeForm) {
      composeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await sendComposedMessage();
      });
    }

    // Add event listeners to form elements
    const recipients = document.querySelector('#recipients') as HTMLTextAreaElement;
    const subject = document.querySelector('#subject') as HTMLInputElement;
    const fromAddress = document.querySelector('#fromAddress') as HTMLInputElement;
    
    if (recipients) {
      recipients.addEventListener('input', () => {
        this.updateRecipientCount();
        debouncedSave();
      });
    }
    
    if (subject) {
      subject.addEventListener('input', debouncedSave);
    }
    
    if (fromAddress) {
      fromAddress.addEventListener('input', debouncedSave);
    }

    // Previous message selection handler
    const previousSelect = document.querySelector('#previousMessageSelect') as HTMLSelectElement;
    if (previousSelect) {
      previousSelect.addEventListener('change', this.onPreviousMessageSelected.bind(this));
    }

    this.eventListenersSetup = true;
    console.log('[ComposeView] Event listeners setup complete');
  }

  private debounce(func: Function, wait: number): () => void {
    let timeout: NodeJS.Timeout;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this), wait);
    };
  }

  private loadSavedState(appId: string): any {
    try {
      const saved = localStorage.getItem(`composeState_${appId}`);
      if (!saved) return null;
      
      const parsed = JSON.parse(saved);
      
      // Check if state is too old (older than 24 hours)
      const maxAge = 24 * 60 * 60 * 1000;
      if (Date.now() - parsed.lastSaved > maxAge) {
        localStorage.removeItem(`composeState_${appId}`);
        return null;
      }
      
      return parsed;
    } catch (error) {
      console.warn('[ComposeView] Failed to load saved state:', error);
      return null;
    }
  }

  private getFormData(): any {
    const recipients = document.querySelector('#recipients') as HTMLTextAreaElement;
    const subject = document.querySelector('#subject') as HTMLInputElement;
    const fromAddress = document.querySelector('#fromAddress') as HTMLInputElement;
    
    return {
      recipients: recipients?.value || '',
      subject: subject?.value || '',
      content: this.getTinyMCEContent(),
      fromAddress: fromAddress?.value || '',
      selectedTemplateId: this.templateManager.getSelectedTemplateId(),
      selectedPreviousMessageId: (document.querySelector('#previousMessageSelect') as HTMLSelectElement)?.value || ''
    };
  }

  private async setFormData(formData: any): Promise<void> {
    console.log('[ComposeView] Setting form data:', formData);
    
    const recipients = document.querySelector('#recipients') as HTMLTextAreaElement;
    const subject = document.querySelector('#subject') as HTMLInputElement;
    const fromAddress = document.querySelector('#fromAddress') as HTMLInputElement;
    
    if (recipients && formData.recipients) {
      recipients.value = formData.recipients;
      console.log('[ComposeView] Set recipients:', formData.recipients);
    }
    if (subject && formData.subject) {
      subject.value = formData.subject;
      console.log('[ComposeView] Set subject:', formData.subject);
    }
    if (formData.content) {
      console.log('[ComposeView] Setting content, waiting for TinyMCE readiness...');
      await this.waitForTinyMCE();
      TinyMCEManager.setContent('#messageContent', formData.content);
      console.log('[ComposeView] Content set');
    }
    if (fromAddress && formData.fromAddress) {
      fromAddress.value = formData.fromAddress;
      console.log('[ComposeView] Set fromAddress:', formData.fromAddress);
    }
    if (formData.selectedTemplateId) {
      console.log('[ComposeView] Restoring template selection:', formData.selectedTemplateId);
      // Set dropdown value directly without triggering change event that would reload content
      const templateSelect = document.getElementById('templateSelect') as HTMLSelectElement;
      if (templateSelect) {
        templateSelect.value = formData.selectedTemplateId;
      }
    }
    if (formData.selectedPreviousMessageId) {
      console.log('[ComposeView] Restoring previous message selection:', formData.selectedPreviousMessageId);
      // Set dropdown value directly without triggering change event
      const previousSelect = document.querySelector('#previousMessageSelect') as HTMLSelectElement;
      if (previousSelect) {
        previousSelect.value = formData.selectedPreviousMessageId;
      }
    }
  }

  private async waitForTinyMCE(): Promise<void> {
    const maxWaitTime = 5000; // 5 seconds max wait
    const checkInterval = 100; // Check every 100ms
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkReady = () => {
        if (TinyMCEManager.isReady('#messageContent')) {
          console.log('[ComposeView] TinyMCE is ready');
          resolve();
          return;
        }
        
        if (Date.now() - startTime > maxWaitTime) {
          console.warn('[ComposeView] TinyMCE readiness timeout, proceeding anyway');
          resolve();
          return;
        }
        
        setTimeout(checkReady, checkInterval);
      };
      
      checkReady();
    });
  }

  private getTinyMCEContent(): string {
    return TinyMCEManager.getContent('#messageContent');
  }

  private updateRecipientCount(): void {
    const recipients = document.querySelector('#recipients') as HTMLTextAreaElement;
    const countElement = document.querySelector('#addressCount') as HTMLElement;
    
    if (!recipients || !countElement) return;
    
    const addresses = recipients.value.split(/[,;\n]/).map(addr => addr.trim()).filter(addr => addr.length > 0);
    this.recipientCount = addresses.length;
    countElement.textContent = this.recipientCount.toString();
  }

  private populateRecipientsFromData(): void {
    if (this.recipientsData.length === 0) return;
    
    const recipients = document.querySelector('#recipients') as HTMLTextAreaElement;
    if (!recipients) return;
    
    // Format recipients as "Name <email>" on separate lines, as the label suggests
    const formattedRecipients = this.recipientsData.map(r => {
      if (r.name && r.email) {
        return `${r.name} <${r.email}>`;
      } else if (r.email) {
        return r.email;
      }
      return '';
    }).filter(recipient => recipient.length > 0);
    
    recipients.value = formattedRecipients.join('\n');
    this.updateRecipientCount();
    
    console.log('[ComposeView] Populated recipients from URL data');
  }

  private populateRecipientsFromEmails(): void {
    if (!this.recipientEmails) return;
    
    const recipients = document.querySelector('#recipients') as HTMLTextAreaElement;
    if (!recipients) return;
    
    recipients.value = this.recipientEmails;
    this.updateRecipientCount();
    
    console.log('[ComposeView] Populated recipients from email addresses:', this.recipientEmails);
  }

  private populateSubjectFromUrl(): void {
    if (!this.subjectFromUrl) return;
    
    const subject = document.querySelector('#subject') as HTMLInputElement;
    if (!subject) return;
    
    subject.value = this.subjectFromUrl;
    
    console.log('[ComposeView] Populated subject from URL:', this.subjectFromUrl);
  }
}

class TemplateEditorView implements IView {
  readonly name = 'template-editor';
  readonly elementId = 'view-template-editor';
  
  private templateManager = new TemplateManager('templateEditorSelect');
  private currentAppId = '';
  private returnUrl = '';
  private currentTemplate: TemplateRecord | null = null;
  private isEditMode = false;

  constructor() {
    registerView(this);
  }

  async initialize(): Promise<void> {
    console.log('[TemplateEditorView] Initializing template editor view');
    this.templateManager.setOnTemplateSelected(this.onTemplateSelected.bind(this));
  }

  async activate(): Promise<void> {
    console.log('[TemplateEditorView] Activating template editor view');
    
    // Update title
    const titleElement = document.getElementById('viewTitle');
    if (titleElement) {
      updateViewTitle('template-editor');
    }
    
    // Get parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.returnUrl = urlParams.get('returnUrl') || '';
    this.currentAppId = urlParams.get('appId') || appId;
    
    if (this.currentAppId) {
      this.templateManager.setAppId(this.currentAppId);
      await this.loadData();
      this.setupEventListeners();
      await this.initTinyMCE();
    }
  }

  deactivate(): void {
    console.log('[TemplateEditorView] Deactivating template editor view');
    this.saveState();
  }

  saveState(): any {
    console.log('[TemplateEditorView] saveState called, currentTemplate:', this.currentTemplate);
    console.log('[TemplateEditorView] saveState called, currentAppId:', this.currentAppId);
    
    const formData = this.getFormData();
    console.log('[TemplateEditorView] saveState formData:', formData);
    
    // Don't overwrite saved state if we have no meaningful data
    // This prevents empty state from overwriting good state during page refresh
    if (!this.currentTemplate && !formData.title && !formData.subject && !formData.content) {
      console.log('[TemplateEditorView] Skipping save of empty state to preserve existing saved state');
      return null;
    }
    
    const state = {
      currentAppId: this.currentAppId,
      returnUrl: this.returnUrl,
      currentTemplateId: this.currentTemplate?.id,
      isEditMode: this.isEditMode,
      formData: formData,
      lastSaved: Date.now()
    };
    
    console.log('[TemplateEditorView] saveState final state:', state);
    
    if (this.currentAppId) {
      localStorage.setItem(`templateEditorState_${this.currentAppId}`, JSON.stringify(state));
      console.log('[TemplateEditorView] State saved');
    }
    
    return state;
  }

  async restoreState(state: any): Promise<void> {
    if (!state) return;
    
    try {
      console.log('[TemplateEditorView] Restoring state:', state);
      
      this.currentAppId = state.currentAppId || '';
      this.returnUrl = state.returnUrl || '';
      this.isEditMode = state.isEditMode || false;
      
      if (state.currentTemplateId) {
        console.log('[TemplateEditorView] Restoring template:', state.currentTemplateId);
        // Set the dropdown selection (this will trigger template loading)
        this.templateManager.setSelectedTemplate(state.currentTemplateId);
        
        // Wait for template to load, then restore form data
        if (state.formData) {
          this.waitForTemplateAndRestore(state.formData);
        }
      } else if (state.formData) {
        console.log('[TemplateEditorView] Restoring form data:', state.formData);
        await this.setFormData(state.formData);
      }
      
      console.log('[TemplateEditorView] State restored');
    } catch (error) {
      console.warn('[TemplateEditorView] Failed to restore state:', error);
    }
  }

  private async waitForTemplateAndRestore(formData: any): Promise<void> {
    // Wait for both template to load and TinyMCE to be ready
    let attempts = 0;
    const maxAttempts = 20; // 2 seconds max
    
    const waitForReady = () => {
      return new Promise<void>((resolve) => {
        const checkReady = async () => {
          attempts++;
          
          // Check if template is loaded and TinyMCE is ready
          const isTemplateLoaded = this.currentTemplate !== null;
          const isTinyMCEReady = window.tinymce && window.tinymce.get('templateContent') && 
                                window.tinymce.get('templateContent').initialized;
          
          if ((isTemplateLoaded && isTinyMCEReady) || attempts >= maxAttempts) {
            console.log('[TemplateEditorView] Template ready, restoring form data:', formData);
            await this.setFormData(formData);
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        
        setTimeout(checkReady, 50); // Initial delay
      });
    };
    
    await waitForReady();
  }

  canAccess(userRoles: string[]): boolean {
    return userRoles.includes('tenant_admin') || userRoles.includes('superadmin');
  }

  private async onTemplateSelected(template: TemplateRecord | null): Promise<void> {
    if (template) {
      await this.loadTemplateForEditing(template.id);
    } else {
      this.clearForm();
    }
  }

  private async loadData(): Promise<void> {
    if (!this.currentAppId) {
      console.warn('[TemplateEditorView] No appId available');
      return;
    }
    
    try {
      await this.templateManager.loadTemplates();
      console.log('[TemplateEditorView] Data loaded successfully');
    } catch (error) {
      console.error('[TemplateEditorView] Failed to load data:', error);
      this.showStatus('Error loading templates: ' + (error as Error).message);
    }
  }

  private setupEventListeners(): void {
    const saveNewBtn = document.getElementById('saveNewTemplateBtn') as HTMLButtonElement;
    const updateBtn = document.getElementById('updateTemplateBtn') as HTMLButtonElement;
    const deleteBtn = document.getElementById('deleteTemplateBtn') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancelTemplateEditBtn') as HTMLButtonElement;
    
    // Remove existing event listeners to prevent duplicates
    if (saveNewBtn) {
      saveNewBtn.replaceWith(saveNewBtn.cloneNode(true));
      const newSaveNewBtn = document.getElementById('saveNewTemplateBtn') as HTMLButtonElement;
      newSaveNewBtn.addEventListener('click', () => this.saveNewTemplate());
    }
    
    if (updateBtn) {
      updateBtn.replaceWith(updateBtn.cloneNode(true));
      const newUpdateBtn = document.getElementById('updateTemplateBtn') as HTMLButtonElement;
      newUpdateBtn.addEventListener('click', () => this.updateExistingTemplate());
    }
    
    if (deleteBtn) {
      deleteBtn.replaceWith(deleteBtn.cloneNode(true));
      const newDeleteBtn = document.getElementById('deleteTemplateBtn') as HTMLButtonElement;
      newDeleteBtn.addEventListener('click', () => this.deleteTemplate());
    }
    
    if (cancelBtn) {
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      const newCancelBtn = document.getElementById('cancelTemplateEditBtn') as HTMLButtonElement;
      newCancelBtn.addEventListener('click', () => this.cancelEditing());
    }
    
    // Add listeners to save state when form changes
    const titleInput = document.getElementById('templateTitle') as HTMLInputElement;
    const subjectInput = document.getElementById('templateSubject') as HTMLInputElement;
    
    if (titleInput) {
      titleInput.addEventListener('input', () => this.saveState());
    }
    
    if (subjectInput) {
      subjectInput.addEventListener('input', () => this.saveState());
    }
    
    // Note: TinyMCE content changes will be handled through TinyMCE events in initTinyMCE
  }

  private async initTinyMCE(): Promise<void> {
    await TinyMCEManager.initialize('#templateContent', {
      height: 400,
      onContentChange: () => this.saveState()
    });
  }

  private async loadTemplateForEditing(templateId: string): Promise<void> {
    try {
      this.currentTemplate = await this.templateManager.loadTemplate(templateId);
      this.isEditMode = true;
      
      // Populate form fields
      const titleInput = document.getElementById('templateTitle') as HTMLInputElement;
      const subjectInput = document.getElementById('templateSubject') as HTMLInputElement;
      
      if (titleInput) titleInput.value = this.currentTemplate.title;
      if (subjectInput) subjectInput.value = this.currentTemplate.subject || '';
      
      // Set TinyMCE content (already decoded by TemplateManager)
      TinyMCEManager.setContent('#templateContent', this.currentTemplate.content || '', false);
      
      // Show/hide buttons
      this.updateButtonVisibility();
      
      // Save state immediately after loading template
      this.saveState();
      
      console.log('[TemplateEditorView] Loaded template for editing:', this.currentTemplate.title);
    } catch (error) {
      console.error('[TemplateEditorView] Failed to load template:', error);
      this.showStatus('Error loading template: ' + (error as Error).message);
    }
  }

  private clearForm(): void {
    this.currentTemplate = null;
    this.isEditMode = false;
    
    const titleInput = document.getElementById('templateTitle') as HTMLInputElement;
    const subjectInput = document.getElementById('templateSubject') as HTMLInputElement;
    
    if (titleInput) titleInput.value = '';
    if (subjectInput) subjectInput.value = '';
    
    // Clear TinyMCE content
    TinyMCEManager.setContent('#templateContent', '');
    
    this.updateButtonVisibility();
  }

  private updateButtonVisibility(): void {
    const saveNewBtn = document.getElementById('saveNewTemplateBtn') as HTMLButtonElement;
    const updateBtn = document.getElementById('updateTemplateBtn') as HTMLButtonElement;
    const deleteBtn = document.getElementById('deleteTemplateBtn') as HTMLButtonElement;
    
    if (saveNewBtn) saveNewBtn.style.display = 'inline-block';
    if (updateBtn) updateBtn.style.display = this.isEditMode ? 'inline-block' : 'none';
    if (deleteBtn) deleteBtn.style.display = this.isEditMode ? 'inline-block' : 'none';
  }

  private async saveNewTemplate(): Promise<void> {
    const formData = this.getFormData();
    
    if (!formData.title.trim()) {
      this.showStatus('Template title is required');
      return;
    }
    
    try {
      const newTemplate = await api('/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: this.currentAppId,
          title: formData.title,
          subject: formData.subject,
          content: formData.content
        })
      });
      
      this.showStatus('Template saved successfully');
      await this.loadData(); // Refresh dropdown
      
      if (this.returnUrl) {
        window.location.href = this.returnUrl;
      }
    } catch (error) {
      console.error('[TemplateEditorView] Failed to save template:', error);
      this.showStatus('Error saving template: ' + (error as Error).message);
    }
  }

  private async updateExistingTemplate(): Promise<void> {
    if (!this.currentTemplate) {
      this.showStatus('No template selected for update');
      return;
    }
    
    const formData = this.getFormData();
    
    if (!formData.title.trim()) {
      this.showStatus('Template title is required');
      return;
    }
    
    try {
      await api(`/templates/${this.currentTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          subject: formData.subject,
          content: formData.content
        })
      });
      
      this.showStatus('Template updated successfully');
      await this.loadData(); // Refresh dropdown
      
      if (this.returnUrl) {
        window.location.href = this.returnUrl;
      }
    } catch (error) {
      console.error('[TemplateEditorView] Failed to update template:', error);
      this.showStatus('Error updating template: ' + (error as Error).message);
    }
  }

  private async deleteTemplate(): Promise<void> {
    if (!this.currentTemplate) {
      this.showStatus('No template selected for deletion');
      return;
    }

    const confirmMessage = `Are you sure you want to delete the template "${this.currentTemplate.title}"? This action cannot be undone.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      await api(`/templates/${this.currentTemplate.id}/deactivate`, {
        method: 'PATCH',
        body: JSON.stringify({})
      });
      
      this.showStatus('Template deleted successfully');
      
      // Clear the form and reset state
      this.clearForm();
      this.currentTemplate = null;
      this.isEditMode = false;
      this.updateButtonVisibility();
      
      // Refresh the dropdown to remove the deleted template
      await this.loadData();
      
      // Reset dropdown to "Create New Template"
      const select = document.getElementById('templateEditorSelect') as HTMLSelectElement;
      if (select) {
        select.value = '';
      }
      
    } catch (error) {
      console.error('[TemplateEditorView] Failed to delete template:', error);
      this.showStatus('Error deleting template: ' + (error as Error).message);
    }
  }

  private cancelEditing(): void {
    if (this.returnUrl) {
      window.location.href = this.returnUrl;
    } else {
      // Clear form and show compose or apps view
      this.clearForm();
    }
  }

  private getFormData(): any {
    const titleInput = document.getElementById('templateTitle') as HTMLInputElement;
    const subjectInput = document.getElementById('templateSubject') as HTMLInputElement;
    
    let content = TinyMCEManager.getContent('#templateContent');
    
    return {
      title: titleInput?.value || '',
      subject: subjectInput?.value || '',
      content
    };
  }

  private async setFormData(formData: any): Promise<void> {
    const titleInput = document.getElementById('templateTitle') as HTMLInputElement;
    const subjectInput = document.getElementById('templateSubject') as HTMLInputElement;
    
    if (titleInput && formData.title) titleInput.value = formData.title;
    if (subjectInput && formData.subject) subjectInput.value = formData.subject;
    
    if (formData.content) {
      TinyMCEManager.setContent('#templateContent', formData.content, false);
    }
  }

  private showStatus(message: string): void {
    const statusElement = document.getElementById('templateEditorStatus') as HTMLElement;
    if (statusElement) {
      statusElement.textContent = message;
      setTimeout(() => {
        statusElement.textContent = '';
      }, 5000);
    }
  }
}

class SmsComposeView implements IView {
  readonly name = 'sms-compose';
  readonly elementId = 'view-sms-compose';
  
  private currentAppId: string | null = null;
  private phoneNumbersData: string[] = [];
  private isRestoringState = false;

  constructor() {
    registerView(this);
  }

  async initialize(): Promise<void> {
    console.log('[SmsComposeView] Initializing SMS compose view');
  }

  async activate(): Promise<void> {
    console.log('[SmsComposeView] Activating SMS compose view');
    
    // Get appId from URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const appIdFromUrl = urlParams.get('appId');
    const smsSessionKey = urlParams.get('smsSession');
    
    // Set currentAppId for this view
    if (appIdFromUrl) {
      this.currentAppId = appIdFromUrl;
    }
    
    // Update title with current app info
    const titleElement = document.getElementById('viewTitle');
    if (titleElement) {
      updateViewTitle('sms-compose', this.currentAppId || undefined);
    }
    
    // Check URL parameters for SMS data first
    let phoneNumbersFromUrl = urlParams.get('phoneNumbers');
    let messageFromUrl = urlParams.get('message');
    
    // If not found in URL params, check fragment
    if (!phoneNumbersFromUrl || !messageFromUrl) {
      const fragment = window.location.hash;
      if (fragment.startsWith('#sms-')) {
        const fragmentParams = new URLSearchParams(fragment.slice(5)); // Remove '#sms-'
        if (!phoneNumbersFromUrl) phoneNumbersFromUrl = fragmentParams.get('phoneNumbers');
        if (!messageFromUrl) messageFromUrl = fragmentParams.get('message');
        
        console.log('[SmsComposeView] Found SMS data in fragment - phoneNumbers:', phoneNumbersFromUrl, 'message:', messageFromUrl);
        
        // Clean up the fragment
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
    
    // If still not found and we have a session key, fetch from server
    if ((!phoneNumbersFromUrl || !messageFromUrl) && smsSessionKey) {
      try {
        const response = await fetch(`/api/sms/session/${smsSessionKey}`);
        if (response.ok) {
          const sessionData = await response.json();
          if (!phoneNumbersFromUrl) phoneNumbersFromUrl = sessionData.phoneNumbers;
          if (!messageFromUrl) messageFromUrl = sessionData.message;
          
          console.log('[SmsComposeView] Found SMS data in session - phoneNumbers:', phoneNumbersFromUrl, 'message:', messageFromUrl);
          
          // Clean up the session parameter from URL
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('smsSession');
          history.replaceState(null, '', cleanUrl.toString());
        }
      } catch (error) {
        console.warn('[SmsComposeView] Failed to fetch SMS session data:', error);
      }
    }
    
    console.log('[SmsComposeView] URL params - appId:', appIdFromUrl, 'phoneNumbers:', phoneNumbersFromUrl);
    
    // Handle phone numbers data if provided
    if (phoneNumbersFromUrl) {
      try {
        this.phoneNumbersData = JSON.parse(decodeURIComponent(phoneNumbersFromUrl));
        console.log('[SmsComposeView] Phone numbers data from URL:', this.phoneNumbersData);
      } catch (error) {
        console.warn('[SmsComposeView] Failed to parse phone numbers data:', error);
      }
    }

    if (appIdFromUrl) {
      this.currentAppId = appIdFromUrl;
      
      // Update title now that we have the appId
      updateViewTitle('sms-compose', this.currentAppId);
      
      // Update URL to clean up parameters while preserving appId
      const url = new URL(window.location.href);
      url.searchParams.set('appId', appIdFromUrl);
      url.searchParams.delete('phoneNumbers');
      url.searchParams.delete('message');
      history.replaceState(null, '', url.toString());
      
      this.setupEventListeners();
      
      // Update app context display
      this.updateAppContext();
      
      // If phone numbers were provided in URL, populate them
      if (this.phoneNumbersData.length > 0) {
        this.populatePhoneNumbersFromData();
      }
      
      // If message was provided in URL, populate it
      if (messageFromUrl) {
        const messageTextarea = document.getElementById('smsMessage') as HTMLTextAreaElement;
        if (messageTextarea) {
          messageTextarea.value = decodeURIComponent(messageFromUrl);
          this.updateCharCount();
        }
      }
      
      // Update button visibility based on context
      this.updateButtonVisibility();
    } else {
      // Check for saved state
      const savedPageState = localStorage.getItem('pageState');
      let savedAppId = null;
      
      console.log('[SmsComposeView] No appId in URL, checking saved page state');
      
      if (savedPageState) {
        try {
          const parsed = JSON.parse(savedPageState);
          if (parsed.currentAppId) {
            savedAppId = parsed.currentAppId;
            this.currentAppId = savedAppId;
            console.log('[SmsComposeView] Using saved appId:', savedAppId);
          }
        } catch (error) {
          console.warn('[SmsComposeView] Failed to parse saved page state:', error);
        }
      }
      
      if (savedAppId) {
        this.setupEventListeners();
        this.updateAppContext();
        this.updateButtonVisibility();
        await this.restoreState({});
      } else {
        console.warn('[SmsComposeView] No appId found in URL or saved state');
        // Still update button visibility even without appId
        this.updateButtonVisibility();
      }
    }
  }

  private updateButtonVisibility(): void {
    const roles: string[] = state.user?.roles || [];
    const isEditorOnly = roles.includes('editor') && !roles.some((r: string)=> r==='tenant_admin' || r==='superadmin');
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');
    
    // Show Cancel button when coming from an app (has returnUrl)
    const cancelBtn = document.getElementById('cancelSmsBtn') as HTMLElement;
    if (cancelBtn) {
      cancelBtn.style.display = returnUrl ? 'inline-block' : 'none';
    }
  }

  deactivate(): void {
    console.log('[SmsComposeView] Deactivating SMS compose view');
    this.saveState();
  }

  saveState(): any {
    if (!this.currentAppId) return null;
    
    try {
      const formData = this.getFormData();
      
      // Don't overwrite good state with empty state during page refresh/navigation
      const hasData = formData.phoneNumbers || formData.message;
      
      if (!hasData) {
        // Check if we already have saved state - don't overwrite it with empty data
        const existingStateKey = `smsComposeState_${this.currentAppId}`;
        const existingState = localStorage.getItem(existingStateKey);
        
        if (existingState) {
          console.log('[SmsComposeView] Skipping save of empty state to preserve existing data');
          try {
            return JSON.parse(existingState);
          } catch (error) {
            console.warn('[SmsComposeView] Failed to parse existing state:', error);
          }
        }
      }
      
      const state = {
        currentAppId: this.currentAppId,
        formData,
        lastSaved: Date.now()
      };
      
      localStorage.setItem(`smsComposeState_${this.currentAppId}`, JSON.stringify(state));
      console.log('[SmsComposeView] State saved for app:', this.currentAppId, hasData ? '(with data)' : '(empty)');
      return state;
    } catch (error) {
      console.warn('[SmsComposeView] Failed to save state:', error);
      return null;
    }
  }

  async restoreState(state: any): Promise<void> {
    if (!this.currentAppId) return;
    
    // Prevent multiple simultaneous restorations
    if (this.isRestoringState) {
      console.log('[SmsComposeView] Already restoring state, skipping duplicate restoration');
      return;
    }
    
    this.isRestoringState = true;
    
    try {
      console.log('[SmsComposeView] Starting state restoration for app:', this.currentAppId);
      
      // Always use localStorage as the authoritative source for form state
      const savedState = this.loadSavedState(this.currentAppId);
      
      if (savedState) {
        console.log('[SmsComposeView] Using localStorage state:', savedState);
        
        this.currentAppId = savedState.currentAppId;
        
        // Wait for DOM elements to be available
        await this.waitForElements();
        
        if (savedState.formData) {
          console.log('[SmsComposeView] Restoring form data:', savedState.formData);
          
          // Validate that formData has meaningful content before restoring
          const hasData = savedState.formData.phoneNumbers || savedState.formData.message;
          
          if (hasData) {
            await this.setFormData(savedState.formData);
            this.updatePhoneCount();
            this.updateCharCount();
            console.log('[SmsComposeView] Form data restored successfully');
          } else {
            console.log('[SmsComposeView] Saved form data is empty, skipping restoration');
          }
        }
        
        console.log('[SmsComposeView] State restored for app:', this.currentAppId);
      } else {
        console.log('[SmsComposeView] No saved state found in localStorage for app:', this.currentAppId);
      }
    } catch (error) {
      console.warn('[SmsComposeView] Failed to restore state:', error);
    } finally {
      this.isRestoringState = false;
    }
  }

  canAccess(userRoles: string[]): boolean {
    return true; // All authenticated users can send SMS
  }

  private async waitForElements(): Promise<void> {
    const maxWait = 5000; // 5 seconds max
    const checkInterval = 100; // Check every 100ms
    let elapsed = 0;
    
    while (elapsed < maxWait) {
      const phoneNumbers = document.getElementById('phoneNumbers');
      const smsMessage = document.getElementById('smsMessage');
      
      if (phoneNumbers && smsMessage) {
        console.log('[SmsComposeView] All required elements found');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }
    
    console.warn('[SmsComposeView] Timeout waiting for elements after', maxWait, 'ms');
  }

  private updateAppContext(): void {
    const contextElement = document.getElementById('smsAppContext');
    if (contextElement && this.currentAppId) {
      const app = state.apps.find(a => a.id === this.currentAppId);
      const appName = app?.name;
      
      // Check if user is editor-only
      const roles: string[] = state.user?.roles || [];
      const isEditorOnly = roles.includes('editor') && !roles.includes('tenant_admin') && !roles.includes('superadmin');
      
      if (isEditorOnly) {
        // For editors, either show the app name or hide the context entirely
        if (appName) {
          contextElement.textContent = appName;
        } else {
          // Hide the entire context section if we don't have a proper app name
          const contextSection = contextElement.closest('div[style*="background: #2a2a2a"]');
          if (contextSection) {
            (contextSection as HTMLElement).style.display = 'none';
          }
        }
      } else {
        // For admins, show technical details
        const displayName = appName || this.currentAppId;
        contextElement.textContent = `App: ${displayName}`;
      }
    }
  }

  private setupEventListeners(): void {
    // Prevent duplicate event listeners
    const form = document.getElementById('smsComposeForm');
    if (form) {
      // Use the clone/replace technique to remove existing listeners
      const newForm = form.cloneNode(true);
      if (form.parentNode) {
        form.parentNode.replaceChild(newForm, form);
      }
    }

    const smsForm = document.getElementById('smsComposeForm') as HTMLFormElement;
    const cancelBtn = document.getElementById('cancelSmsBtn') as HTMLButtonElement;
    const phoneNumbers = document.getElementById('phoneNumbers') as HTMLTextAreaElement;
    const smsMessage = document.getElementById('smsMessage') as HTMLTextAreaElement;

    if (smsForm) {
      smsForm.addEventListener('submit', this.onSubmit.bind(this));
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', this.onCancel.bind(this));
    }

    if (phoneNumbers) {
      phoneNumbers.addEventListener('input', this.debounce(() => {
        this.updatePhoneCount();
        this.saveState();
      }, 500));
    }

    if (smsMessage) {
      smsMessage.addEventListener('input', this.debounce(() => {
        this.updateCharCount();
        this.saveState();
      }, 500));
    }

    console.log('[SmsComposeView] Event listeners setup complete');
  }

  private async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    
    const formData = this.getFormData();
    
    if (!formData.phoneNumbers.trim()) {
      this.showStatus('Please enter at least one phone number');
      return;
    }
    
    if (!formData.message.trim()) {
      this.showStatus('Please enter a message');
      return;
    }

    try {
      this.showStatus('Sending SMS...');
      
      const response = await api('/api/sms/send', {
        method: 'POST',
        body: JSON.stringify({
          appId: this.currentAppId,
          phoneNumbers: formData.phoneNumbers.split('\n').filter((p: string) => p.trim()),
          message: formData.message
        })
      });

      this.showStatus('SMS sent successfully!');
      
      // Clear form after successful send
      this.clearForm();
      
      // Return to calling app after successful send (same as email compose)
      returnToCallingAppFromCompose();
      
    } catch (error) {
      console.error('[SmsComposeView] Failed to send SMS:', error);
      this.showStatus('Error sending SMS: ' + (error as Error).message);
    }
  }

  private onCancel(): void {
    // Return to caller if returnUrl is provided
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');
    
    if (returnUrl) {
      window.location.href = decodeURIComponent(returnUrl);
    } else {
      // Clear form and navigate to apps or default view
      this.clearForm();
      showView('apps');
    }
  }

  private getFormData(): any {
    const phoneNumbers = document.getElementById('phoneNumbers') as HTMLTextAreaElement;
    const smsMessage = document.getElementById('smsMessage') as HTMLTextAreaElement;
    
    return {
      phoneNumbers: phoneNumbers?.value || '',
      message: smsMessage?.value || ''
    };
  }

  private async setFormData(formData: any): Promise<void> {
    console.log('[SmsComposeView] Setting form data:', formData);
    
    const phoneNumbers = document.getElementById('phoneNumbers') as HTMLTextAreaElement;
    const smsMessage = document.getElementById('smsMessage') as HTMLTextAreaElement;
    
    if (phoneNumbers && formData.phoneNumbers) {
      phoneNumbers.value = formData.phoneNumbers;
      console.log('[SmsComposeView] Set phone numbers:', formData.phoneNumbers);
    }
    
    if (smsMessage && formData.message) {
      smsMessage.value = formData.message;
      console.log('[SmsComposeView] Set message:', formData.message);
    }
  }

  private populatePhoneNumbersFromData(): void {
    if (this.phoneNumbersData.length === 0) return;
    
    const phoneNumbers = document.getElementById('phoneNumbers') as HTMLTextAreaElement;
    if (phoneNumbers) {
      phoneNumbers.value = this.phoneNumbersData.join('\n');
      this.updatePhoneCount();
      console.log('[SmsComposeView] Populated phone numbers from data:', this.phoneNumbersData.length, 'numbers');
    }
  }

  private updatePhoneCount(): void {
    const phoneNumbers = document.getElementById('phoneNumbers') as HTMLTextAreaElement;
    const phoneCountElement = document.getElementById('phoneCount');
    
    if (phoneNumbers && phoneCountElement) {
      const numbers = phoneNumbers.value.split('\n').filter(p => p.trim());
      phoneCountElement.textContent = numbers.length.toString();
    }
  }

  private updateCharCount(): void {
    const smsMessage = document.getElementById('smsMessage') as HTMLTextAreaElement;
    const charCountElement = document.getElementById('smsCharCount');
    
    if (smsMessage && charCountElement) {
      const count = smsMessage.value.length;
      charCountElement.textContent = count.toString();
      
      // Change color based on character count
      if (count > 1200) {
        charCountElement.style.color = '#dc3545'; // Red
      } else if (count > 800) {
        charCountElement.style.color = '#ffc107'; // Yellow
      } else {
        charCountElement.style.color = '#6c757d'; // Default gray
      }
    }
  }

  private clearForm(): void {
    const phoneNumbers = document.getElementById('phoneNumbers') as HTMLTextAreaElement;
    const smsMessage = document.getElementById('smsMessage') as HTMLTextAreaElement;
    
    if (phoneNumbers) phoneNumbers.value = '';
    if (smsMessage) smsMessage.value = '';
    
    this.updatePhoneCount();
    this.updateCharCount();
    
    // Clear saved state
    if (this.currentAppId) {
      localStorage.removeItem(`smsComposeState_${this.currentAppId}`);
    }
    
    console.log('[SmsComposeView] Form cleared');
  }

  private showStatus(message: string): void {
    const statusElement = document.getElementById('smsComposeStatus');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.style.display = 'block';
      
      // Auto-hide status after 5 seconds unless it's an error
      if (!message.toLowerCase().includes('error')) {
        setTimeout(() => {
          statusElement.style.display = 'none';
        }, 5000);
      }
    }
  }

  private debounce(func: Function, wait: number): () => void {
    let timeout: NodeJS.Timeout;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this), wait);
    };
  }

  private loadSavedState(appId: string): any {
    try {
      const saved = localStorage.getItem(`smsComposeState_${appId}`);
      if (!saved) return null;
      
      const parsed = JSON.parse(saved);
      
      // Check if state is too old (older than 24 hours)
      const maxAge = 24 * 60 * 60 * 1000;
      if (Date.now() - parsed.lastSaved > maxAge) {
        localStorage.removeItem(`smsComposeState_${appId}`);
        return null;
      }
      
      return parsed;
    } catch (error) {
      console.warn('[SmsComposeView] Failed to load saved state:', error);
      return null;
    }
  }
}

// Simple View classes for remaining views
class AppsView implements IView {
  readonly name = 'apps';
  readonly elementId = 'view-apps';

  constructor() {
    registerView(this);
  }

  async initialize(): Promise<void> {
    console.log('[AppsView] Initializing apps view');
  }

  async activate(): Promise<void> {
    console.log('[AppsView] Activating apps view');
    
    // Update title
    const titleElement = document.getElementById('viewTitle');
    if (titleElement) {
      updateViewTitle('apps');
    }
    
    // Load apps for current context
    loadAppsForCurrentContext();
  }

  deactivate(): void {
    console.log('[AppsView] Deactivating apps view');
  }

  saveState(): any {
    return {}; // Apps view doesn't need state persistence
  }

  async restoreState(state: any): Promise<void> {
    // No state to restore for apps view
  }

  canAccess(userRoles: string[]): boolean {
    return true; // All authenticated users can see apps
  }
}

class TenantsView implements IView {
  readonly name = 'tenants';
  readonly elementId = 'view-tenants';

  constructor() {
    registerView(this);
  }

  async initialize(): Promise<void> {
    console.log('[TenantsView] Initializing tenants view');
  }

  async activate(): Promise<void> {
    console.log('[TenantsView] Activating tenants view');
    
    // Update title
    const titleElement = document.getElementById('viewTitle');
    if (titleElement) {
      updateViewTitle('tenants');
    }
    
    // Load tenants
    await loadTenants();
  }

  deactivate(): void {
    console.log('[TenantsView] Deactivating tenants view');
  }

  saveState(): any {
    return {}; // Tenants view doesn't need state persistence
  }

  async restoreState(state: any): Promise<void> {
    // No state to restore for tenants view
  }

  canAccess(userRoles: string[]): boolean {
    return userRoles.includes('superadmin');
  }
}

class SmtpConfigView implements IView {
  readonly name = 'smtp-config';
  readonly elementId = 'view-smtp-config';

  constructor() {
    registerView(this);
  }

  async initialize(): Promise<void> {
    console.log('[SmtpConfigView] Initializing SMTP config view');
  }

  async activate(): Promise<void> {
    console.log('[SmtpConfigView] Activating SMTP config view');
    
    // Update title
    const titleElement = document.getElementById('viewTitle');
    if (titleElement) {
      updateViewTitle('smtp-config');
    }
    
    // Load and display configs
    console.log('SMTP Config view shown, loading configurations...');
    loadAndDisplayConfigs();
  }

  deactivate(): void {
    console.log('[SmtpConfigView] Deactivating SMTP config view');
  }

  saveState(): any {
    return {}; // SMTP config view doesn't need state persistence
  }

  async restoreState(state: any): Promise<void> {
    // No state to restore for SMTP config view
  }

  canAccess(userRoles: string[]): boolean {
    return userRoles.includes('superadmin') || userRoles.includes('tenant_admin');
  }
}

class SmsConfigView implements IView {
  readonly name = 'sms-config';
  readonly elementId = 'view-sms-config';

  constructor() {
    registerView(this);
  }

  async initialize(): Promise<void> {
    console.log('[SmsConfigView] Initializing SMS config view');
  }

  async activate(): Promise<void> {
    console.log('[SmsConfigView] Activating SMS config view');
    
    // Update title
    const titleElement = document.getElementById('viewTitle');
    if (titleElement) {
      updateViewTitle('sms-config');
    }
    
    // Load and display configs
    console.log('SMS Config view shown, loading configurations...');
    loadAndDisplaySmsConfigs();
  }

  deactivate(): void {
    console.log('[SmsConfigView] Deactivating SMS config view');
  }

  saveState(): any {
    return {}; // SMS config view doesn't need state persistence
  }

  async restoreState(state: any): Promise<void> {
    // No state to restore for SMS config view
  }

  canAccess(userRoles: string[]): boolean {
    return userRoles.includes('superadmin') || userRoles.includes('tenant_admin');
  }
}

class EmailLogsView implements IView {
  readonly name = 'email-logs';
  readonly elementId = 'view-email-logs';
  private currentPage = 0;
  private pageSize = 50;
  private totalLogs = 0;
  private currentAppFilter = '';
  private currentSearch = '';
  private sortField = 'sent';
  private sortOrder: 'asc' | 'desc' = 'desc';

  constructor() {
    registerView(this);
  }

  async initialize(): Promise<void> {
    console.log('[EmailLogsView] Initializing email logs view');
    
    // Set up event listeners
    const refreshBtn = document.getElementById('refreshEmailLogs');
    const searchInput = document.getElementById('emailLogSearch') as HTMLInputElement;
    const appFilter = document.getElementById('emailLogAppFilter') as HTMLSelectElement;
    const prevBtn = document.getElementById('emailLogsPrevBtn');
    const nextBtn = document.getElementById('emailLogsNextBtn');
    
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadLogs());
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.currentSearch = searchInput.value;
        this.currentPage = 0;
        this.loadLogs();
      });
    }
    if (appFilter) {
      appFilter.addEventListener('change', () => {
        this.currentAppFilter = appFilter.value;
        this.currentPage = 0;
        this.loadLogs();
      });
    }
    if (prevBtn) prevBtn.addEventListener('click', () => this.prevPage());
    if (nextBtn) nextBtn.addEventListener('click', () => this.nextPage());
    
    // Add column header click listeners for sorting
    const sortableHeaders = ['emailLogsSortDate', 'emailLogsSortSender', 'emailLogsSortRecipients', 'emailLogsSortSubject'];
    const sortFields = ['sent', 'senderEmail', 'recipients', 'subject'];
    
    sortableHeaders.forEach((headerId, index) => {
      const header = document.getElementById(headerId);
      if (header) {
        header.addEventListener('click', () => this.setSortField(sortFields[index]));
        console.log(`[EmailLogsView] Added click listener to ${headerId}`);
      } else {
        console.warn(`[EmailLogsView] Header element not found: ${headerId}`);
      }
    });
  }

  async activate(): Promise<void> {
    console.log('[EmailLogsView] Activating email logs view');
    
    // Get app ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const currentAppId = urlParams.get('appId');
    this.currentAppFilter = currentAppId || '';
    
    debugLog('EmailLogsView', `activate: currentAppId=${currentAppId}, currentAppFilter=${this.currentAppFilter}`);
    
    // Update title with app context
    updateViewTitle('email-logs', currentAppId || undefined);
    
    // Load apps for filter
    debugLog('EmailLogsView', 'activate: Loading apps filter...');
    await this.loadAppsFilter();
    debugLog('EmailLogsView', 'activate: Apps filter loaded');
    
    // Initialize sort indicators
    debugLog('EmailLogsView', 'activate: Updating sort indicators...');
    this.updateSortIndicators();
    debugLog('EmailLogsView', 'activate: Sort indicators updated');
    
    // Load logs
    debugLog('EmailLogsView', 'activate: Loading logs...');
    await this.loadLogs();
    debugLog('EmailLogsView', 'activate: Logs loaded successfully');
  }

  deactivate(): void {
    console.log('[EmailLogsView] Deactivating email logs view');
  }

  saveState(): any {
    return {
      currentPage: this.currentPage,
      currentAppFilter: this.currentAppFilter,
      currentSearch: this.currentSearch
    };
  }

  async restoreState(state: any): Promise<void> {
    if (state) {
      this.currentPage = state.currentPage || 0;
      this.currentAppFilter = state.currentAppFilter || '';
      this.currentSearch = state.currentSearch || '';
      
      const searchInput = document.getElementById('emailLogSearch') as HTMLInputElement;
      const appFilter = document.getElementById('emailLogAppFilter') as HTMLSelectElement;
      
      if (searchInput) searchInput.value = this.currentSearch;
      if (appFilter) appFilter.value = this.currentAppFilter;
    }
  }

  canAccess(userRoles: string[]): boolean {
    return userRoles.includes('superadmin') || userRoles.includes('tenant_admin');
  }

  private async loadAppsFilter(): Promise<void> {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const currentAppId = urlParams.get('appId');
      
      // If we have a specific appId from URL, hide the filter
      const appFilterContainer = document.getElementById('emailLogAppFilter')?.parentElement;
      if (currentAppId && appFilterContainer) {
        appFilterContainer.style.display = 'none';
        return;
      }
      
      const token = authToken;
      if (!token) return;

      const response = await fetch('/apps', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const apps = await response.json();
        const appFilter = document.getElementById('emailLogAppFilter') as HTMLSelectElement;
        if (appFilter) {
          appFilter.innerHTML = '<option value="">All Apps</option>';
          apps.forEach((app: any) => {
            const option = document.createElement('option');
            option.value = app.id;
            option.textContent = app.name;
            appFilter.appendChild(option);
          });
        }
      }
    } catch (error) {
      console.error('Error loading apps for filter:', error);
    }
  }

  private async loadLogs(): Promise<void> {
    debugLog('EmailLogsView', 'loadLogs: ENTRY - Starting log loading process');
    
    const loadingEl = document.getElementById('emailLogsLoading');
    const tableEl = document.getElementById('emailLogsTable');
    const emptyEl = document.getElementById('emailLogsEmpty');
    
    debugLog('EmailLogsView', 'loadLogs: DOM elements found', {
      loadingEl: !!loadingEl,
      tableEl: !!tableEl,
      emptyEl: !!emptyEl
    });
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';

    try {
      const token = authToken;
      debugLog('EmailLogsView', 'loadLogs: Auth token check', { hasToken: !!token });
      if (!token) {
        debugLog('EmailLogsView', 'loadLogs: No auth token - returning early');
        return;
      }

      const params = new URLSearchParams({
        limit: this.pageSize.toString(),
        offset: (this.currentPage * this.pageSize).toString()
      });

      if (this.currentAppFilter) params.append('appId', this.currentAppFilter);
      if (this.currentSearch) params.append('search', this.currentSearch);
      
      // Add sorting parameter
      if (this.sortField) {
        params.append('sortBy', this.sortField);
        params.append('sortOrder', this.sortOrder);
      }

      const url = `/api/logs/email?${params}`;
      debugLog('EmailLogsView', 'loadLogs: Making API request', {
        url,
        params: Object.fromEntries(params),
        currentAppFilter: this.currentAppFilter,
        pageSize: this.pageSize,
        currentPage: this.currentPage
      });

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      debugLog('EmailLogsView', 'loadLogs: API response received', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (response.ok) {
        const data = await response.json();
        debugLog('EmailLogsView', 'loadLogs: Response data parsed', {
          dataKeys: Object.keys(data),
          logsCount: data.logs?.length || 0,
          totalLogs: data.pagination?.total || 0,
          pagination: data.pagination
        });
        
        // Fix: Use pagination.total instead of data.total
        this.totalLogs = data.pagination?.total || 0;
        debugLog('EmailLogsView', 'loadLogs: About to render logs', { logsToRender: data.logs?.length || 0 });
        this.renderLogs(data.logs || []);
        this.updatePagination();
        debugLog('EmailLogsView', 'loadLogs: Rendering and pagination complete');
      } else {
        console.error('Failed to load email logs:', response.statusText);
        debugLog('EmailLogsView', 'loadLogs: API request failed', { status: response.status, statusText: response.statusText });
        this.showError('Failed to load email logs');
      }
    } catch (error) {
      console.error('Error loading email logs:', error);
      debugLog('EmailLogsView', 'loadLogs: Exception caught', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      this.showError('Error loading email logs');
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      debugLog('EmailLogsView', 'loadLogs: Finally block - hiding loading indicator');
    }
  }

  private renderLogs(logs: any[]): void {
    debugLog('EmailLogsView', 'renderLogs: ENTRY', { logsCount: logs.length });
    
    const tableEl = document.getElementById('emailLogsTable');
    const emptyEl = document.getElementById('emailLogsEmpty');
    const rowsEl = document.getElementById('emailLogsRows');

    debugLog('EmailLogsView', 'renderLogs: DOM elements found', {
      tableEl: !!tableEl,
      emptyEl: !!emptyEl,
      rowsEl: !!rowsEl
    });

    if (!logs.length) {
      debugLog('EmailLogsView', 'renderLogs: No logs to display - showing empty state');
      if (tableEl) tableEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    debugLog('EmailLogsView', 'renderLogs: Showing table and rendering rows');
    if (tableEl) tableEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';

    if (rowsEl) {
      debugLog('EmailLogsView', 'renderLogs: About to generate HTML for rows');
      rowsEl.innerHTML = logs.map(log => {
        // Fix date/time formatting - use 'sent' field from database
        const dateTime = log.sent ? new Date(log.sent).toLocaleString() : 'N/A';
        
        // Fix sender formatting - show both name and email
        const senderName = log.senderName || 'Unknown';
        const senderEmail = log.senderEmail || 'unknown@example.com';
        const sender = `${escapeHtml(senderName)} &lt;${escapeHtml(senderEmail)}&gt;`;
        
        // Fix recipients - handle both email lists and count formats gracefully
        let recipients = 'N/A';
        if (log.recipients) {
          const recipientsStr = log.recipients.trim();
          
          // Check if it's a count format like "8 recipients"
          if (/^\d+\s+recipients?$/i.test(recipientsStr)) {
            recipients = recipientsStr;
          } else {
            // Handle email lists (JSON, comma-separated, or single email)
            try {
              const recipientData = JSON.parse(recipientsStr);
              if (Array.isArray(recipientData)) {
                recipients = recipientData.map(r => {
                  if (typeof r === 'object' && r.email) {
                    return r.name ? `${escapeHtml(r.name)} &lt;${escapeHtml(r.email)}&gt;` : escapeHtml(r.email);
                  } else if (typeof r === 'string') {
                    return escapeHtml(r);
                  }
                  return escapeHtml(String(r));
                }).join(', ');
              } else if (typeof recipientData === 'string') {
                recipients = escapeHtml(recipientData);
              } else {
                recipients = escapeHtml(String(recipientData));
              }
            } catch {
              // Not JSON, treat as comma-separated emails or plain text
              if (recipientsStr.includes(',')) {
                // Split by comma and clean each email
                recipients = recipientsStr.split(',')
                  .map((email: string) => escapeHtml(email.trim()))
                  .filter((email: string) => email.length > 0)
                  .join(', ');
              } else {
                recipients = escapeHtml(recipientsStr);
              }
            }
          }
        }
        recipients = this.truncateText(recipients, 50);
        
        // Fix subject - don't truncate too much, add title for full text
        const fullSubject = log.subject || '(No subject)';
        const subject = this.truncateText(escapeHtml(fullSubject), 60);
        
        // Fix message preview - extract text from HTML if needed
        let messagePreview = 'N/A';
        if (log.message && log.message.trim()) {
          try {
            // Strip HTML tags for preview
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = log.message;
            const textContent = (tempDiv.textContent || tempDiv.innerText || '').trim();
            if (textContent) {
              messagePreview = this.truncateText(escapeHtml(textContent), 100);
            } else {
              messagePreview = 'HTML content (no text)';
            }
          } catch (e) {
            messagePreview = 'Message parsing error';
          }
        } else {
          messagePreview = log.message === null ? 'No message content' : 'Empty message';
        }

        return `
          <tr>
            <td title="${escapeHtml(dateTime)}">${dateTime}</td>
            <td title="${escapeHtml(senderName + ' <' + senderEmail + '>')}">${sender}</td>
            <td title="${escapeHtml(log.recipients || '')}">${recipients}</td>
            <td title="${escapeHtml(fullSubject)}">${subject}</td>
            <td style="cursor: pointer;" 
                 onclick="emailLogsView.showLogDetails('${escapeHtml(log.id)}')"
                 title="Click to view full message">${messagePreview}</td>
          </tr>
        `;
      }).join('');
      debugLog('EmailLogsView', 'renderLogs: HTML generated and inserted into DOM', { 
        htmlLength: rowsEl.innerHTML.length,
        firstRowPreview: rowsEl.innerHTML.substring(0, 100) + '...'
      });
    } else {
      debugLog('EmailLogsView', 'renderLogs: ERROR - rowsEl not found in DOM');
    }
    debugLog('EmailLogsView', 'renderLogs: Complete');
  }

  private updatePagination(): void {
    const infoEl = document.getElementById('emailLogsInfo');
    const pageInfoEl = document.getElementById('emailLogsPageInfo');
    const prevBtn = document.getElementById('emailLogsPrevBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('emailLogsNextBtn') as HTMLButtonElement;

    const start = this.currentPage * this.pageSize + 1;
    const end = Math.min((this.currentPage + 1) * this.pageSize, this.totalLogs);
    const totalPages = Math.max(1, Math.ceil(this.totalLogs / this.pageSize));
    const currentPageDisplay = this.currentPage + 1;

    if (infoEl) {
      infoEl.textContent = `Showing ${start}-${end} of ${this.totalLogs} email logs`;
    }

    if (pageInfoEl) {
      pageInfoEl.textContent = `Page ${currentPageDisplay} of ${totalPages}`;
    }

    if (prevBtn) {
      prevBtn.disabled = this.currentPage === 0;
    }

    if (nextBtn) {
      nextBtn.disabled = this.currentPage >= totalPages - 1;
    }
  }

  private prevPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadLogs();
    }
  }

  private nextPage(): void {
    if ((this.currentPage + 1) * this.pageSize < this.totalLogs) {
      this.currentPage++;
      this.loadLogs();
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private showError(message: string): void {
    const container = document.getElementById('emailLogsContainer');
    if (container) {
      container.innerHTML = `<div style="padding: 40px; text-align: center; color: #f44336;">${message}</div>`;
    }
  }

  async showLogDetails(logId: string): Promise<void> {
    try {
      const token = authToken;
      if (!token) return;

      const response = await fetch(`/api/logs/email/${logId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const log = await response.json();
        this.showLogModal(log, 'email');
      } else {
        console.error('Failed to load email log details');
      }
    } catch (error) {
      console.error('Error loading email log details:', error);
    }
  }

  public showLogModal(log: any, type: 'email' | 'sms'): void {
    const modal = document.getElementById('logMessageModal');
    const titleEl = document.getElementById('logMessageModalTitle');
    const messageIdEl = document.getElementById('logModalMessageId');
    const dateTimeEl = document.getElementById('logModalDateTime');
    const senderEl = document.getElementById('logModalSender');
    const recipientsEl = document.getElementById('logModalRecipients');
    const subjectContainer = document.getElementById('logModalSubjectContainer');
    const subjectEl = document.getElementById('logModalSubject');
    const statusContainer = document.getElementById('logModalStatusContainer');
    const statusEl = document.getElementById('logModalStatus');
    const messageEl = document.getElementById('logModalMessage');

    if (titleEl) titleEl.textContent = type === 'email' ? 'Email Details' : 'SMS Details';
    
    // Fix: Use correct field names from database
    if (messageIdEl) messageIdEl.textContent = log.messageId || 'N/A';
    if (dateTimeEl) dateTimeEl.textContent = log.sent ? new Date(log.sent).toLocaleString() : 'N/A';
    
    // Fix: Format recipients properly - handle both email lists and count formats
    if (recipientsEl) {
      let recipients = 'N/A';
      if (log.recipients) {
        const recipientsStr = log.recipients.trim();
        
        // Check if it's a count format like "8 recipients"
        if (/^\d+\s+recipients?$/i.test(recipientsStr)) {
          recipients = recipientsStr;
        } else {
          // Handle email lists (JSON, comma-separated, or single email)
          try {
            const recipientData = JSON.parse(recipientsStr);
            if (Array.isArray(recipientData)) {
              recipients = recipientData.map(r => {
                if (typeof r === 'object' && r.email) {
                  return r.name ? `${escapeHtml(r.name)} &lt;${escapeHtml(r.email)}&gt;` : escapeHtml(r.email);
                } else if (typeof r === 'string') {
                  return escapeHtml(r);
                }
                return escapeHtml(String(r));
              }).join('<br>');
            } else if (typeof recipientData === 'string') {
              recipients = escapeHtml(recipientData);
            } else {
              recipients = escapeHtml(String(recipientData));
            }
          } catch {
            // Not JSON, treat as comma-separated emails or plain text
            if (recipientsStr.includes(',')) {
              // Split by comma and clean each email, show each on new line
              recipients = recipientsStr.split(',')
                .map((email: string) => escapeHtml(email.trim()))
                .filter((email: string) => email.length > 0)
                .join('<br>');
            } else {
              recipients = escapeHtml(recipientsStr);
            }
          }
        }
      }
      recipientsEl.innerHTML = recipients;
    }
    
    // Fix: Format message properly without N/A fallback
    if (messageEl) {
      if (log.message) {
        // Keep HTML formatting if it's HTML, otherwise treat as plain text
        if (log.message.includes('<')) {
          messageEl.innerHTML = log.message;
        } else {
          messageEl.textContent = log.message;
        }
      } else {
        messageEl.textContent = 'No message content available';
      }
    }

    if (type === 'email') {
      if (senderEl) senderEl.innerHTML = `${escapeHtml(log.senderName || 'Unknown')} &lt;${escapeHtml(log.senderEmail || 'unknown@example.com')}&gt;`;
      if (subjectContainer) subjectContainer.style.display = 'block';
      if (subjectEl) subjectEl.textContent = log.subject || '(No subject)';
      if (statusContainer) statusContainer.style.display = 'none';
    } else {
      if (senderEl) senderEl.innerHTML = `${escapeHtml(log.senderName || 'Unknown')} (${escapeHtml(log.senderPhone || 'N/A')})`;
      if (subjectContainer) subjectContainer.style.display = 'none';
      if (statusContainer) statusContainer.style.display = 'block';
      if (statusEl) {
        let status = '';
        if (log.delivered) status = '<span style="color: #4caf50;">✓ Delivered</span>';
        else if (log.failed) status = `<span style="color: #f44336;">✗ Failed: ${escapeHtml(log.errorMessage || log.errorCode || 'Unknown error')}</span>`;
        else status = '<span style="color: #ff9800;">⏳ Pending</span>';
        statusEl.innerHTML = status;
      }
    }

    if (modal) {
      // Use Bootstrap's modal show method instead of direct style manipulation
      const bootstrapModal = new (window as any).bootstrap.Modal(modal);
      bootstrapModal.show();
    }
  }

  private setSortField(field: string): void {
    if (this.sortField === field) {
      // Toggle sort order if same field
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      // New field, default to descending
      this.sortField = field;
      this.sortOrder = 'desc';
    }
    this.updateSortIndicators();
    this.currentPage = 0;
    this.loadLogs();
  }

  private updateSortIndicators(): void {
    // Clear all indicators
    ['emailLogsSortDate', 'emailLogsSortSender', 'emailLogsSortRecipients', 'emailLogsSortSubject'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = el.innerHTML.replace(/ [↑↓]/g, '');
      }
    });
    
    // Add indicator to current sort field
    const fieldMap: {[key: string]: string} = {
      'sent': 'emailLogsSortDate',
      'senderEmail': 'emailLogsSortSender', 
      'recipients': 'emailLogsSortRecipients',
      'subject': 'emailLogsSortSubject'
    };
    
    const currentEl = document.getElementById(fieldMap[this.sortField]);
    if (currentEl) {
      const indicator = this.sortOrder === 'asc' ? ' ↑' : ' ↓';
      currentEl.innerHTML = currentEl.innerHTML.replace(/ [↑↓]/g, '') + indicator;
    }
  }
}

class SmsLogsView implements IView {
  readonly name = 'sms-logs';
  readonly elementId = 'view-sms-logs';
  private currentPage = 0;
  private pageSize = 50;
  private totalLogs = 0;
  private currentAppFilter = '';
  private currentSearch = '';
  private sortField = 'sent';
  private sortOrder: 'asc' | 'desc' = 'desc';

  constructor() {
    registerView(this);
  }

  async initialize(): Promise<void> {
    console.log('[SmsLogsView] Initializing SMS logs view');
    
    // Set up event listeners
    const refreshBtn = document.getElementById('refreshSmsLogs');
    const searchInput = document.getElementById('smsLogSearch') as HTMLInputElement;
    const appFilter = document.getElementById('smsLogAppFilter') as HTMLSelectElement;
    const prevBtn = document.getElementById('smsLogsPrevBtn');
    const nextBtn = document.getElementById('smsLogsNextBtn');
    
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadLogs());
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.currentSearch = searchInput.value;
        this.currentPage = 0;
        this.loadLogs();
      });
    }
    if (appFilter) {
      appFilter.addEventListener('change', () => {
        this.currentAppFilter = appFilter.value;
        this.currentPage = 0;
        this.loadLogs();
      });
    }
    if (prevBtn) prevBtn.addEventListener('click', () => this.prevPage());
    if (nextBtn) nextBtn.addEventListener('click', () => this.nextPage());
    
    // Add column header click listeners for sorting
    const sortableHeaders = ['smsLogsSortDate', 'smsLogsSortSender', 'smsLogsSortRecipient', 'smsLogsSortStatus'];
    const sortFields = ['sent', 'senderPhone', 'recipients', 'delivered'];
    
    sortableHeaders.forEach((headerId, index) => {
      const header = document.getElementById(headerId);
      if (header) {
        header.addEventListener('click', () => this.setSortField(sortFields[index]));
        console.log(`[SmsLogsView] Added click listener to ${headerId}`);
      } else {
        console.warn(`[SmsLogsView] Header element not found: ${headerId}`);
      }
    });
  }

  async activate(): Promise<void> {
    console.log('[SmsLogsView] Activating SMS logs view');
    
    // Get app ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const currentAppId = urlParams.get('appId');
    this.currentAppFilter = currentAppId || '';
    
    // Update title with app context
    updateViewTitle('sms-logs', currentAppId || undefined);
    
    // Load apps for filter
    await this.loadAppsFilter();
    
    // Initialize sort indicators
    this.updateSortIndicators();
    
    // Load logs
    await this.loadLogs();
  }

  deactivate(): void {
    console.log('[SmsLogsView] Deactivating SMS logs view');
  }

  saveState(): any {
    return {
      currentPage: this.currentPage,
      currentAppFilter: this.currentAppFilter,
      currentSearch: this.currentSearch
    };
  }

  async restoreState(state: any): Promise<void> {
    if (state) {
      this.currentPage = state.currentPage || 0;
      this.currentAppFilter = state.currentAppFilter || '';
      this.currentSearch = state.currentSearch || '';
      
      const searchInput = document.getElementById('smsLogSearch') as HTMLInputElement;
      const appFilter = document.getElementById('smsLogAppFilter') as HTMLSelectElement;
      
      if (searchInput) searchInput.value = this.currentSearch;
      if (appFilter) appFilter.value = this.currentAppFilter;
    }
  }

  canAccess(userRoles: string[]): boolean {
    return userRoles.includes('superadmin') || userRoles.includes('tenant_admin');
  }

  private async loadAppsFilter(): Promise<void> {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const currentAppId = urlParams.get('appId');
      
      // If we have a specific appId from URL, hide the filter
      const appFilterContainer = document.getElementById('smsLogAppFilter')?.parentElement;
      if (currentAppId && appFilterContainer) {
        appFilterContainer.style.display = 'none';
        return;
      }
      
      const token = authToken;
      if (!token) return;

      const response = await fetch('/apps', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const apps = await response.json();
        const appFilter = document.getElementById('smsLogAppFilter') as HTMLSelectElement;
        if (appFilter) {
          appFilter.innerHTML = '<option value="">All Apps</option>';
          apps.forEach((app: any) => {
            const option = document.createElement('option');
            option.value = app.id;
            option.textContent = app.name;
            appFilter.appendChild(option);
          });
        }
      }
    } catch (error) {
      console.error('Error loading apps for filter:', error);
    }
  }

  private async loadLogs(): Promise<void> {
    const loadingEl = document.getElementById('smsLogsLoading');
    const tableEl = document.getElementById('smsLogsTable');
    const emptyEl = document.getElementById('smsLogsEmpty');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';

    try {
      const token = authToken;
      if (!token) return;

      const params = new URLSearchParams({
        limit: this.pageSize.toString(),
        offset: (this.currentPage * this.pageSize).toString()
      });

      if (this.currentAppFilter) params.append('appId', this.currentAppFilter);
      if (this.currentSearch) params.append('search', this.currentSearch);
      
      // Add sorting parameters
      if (this.sortField) {
        params.append('sortBy', this.sortField);
        params.append('sortOrder', this.sortOrder);
      }

      const response = await fetch(`/api/logs/sms?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        // Fix: Use pagination.total instead of data.total
        this.totalLogs = data.pagination?.total || 0;
        this.renderLogs(data.logs || []);
        this.updatePagination();
      } else {
        console.error('Failed to load SMS logs:', response.statusText);
        this.showError('Failed to load SMS logs');
      }
    } catch (error) {
      console.error('Error loading SMS logs:', error);
      this.showError('Error loading SMS logs');
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  private renderLogs(logs: any[]): void {
    const tableEl = document.getElementById('smsLogsTable');
    const emptyEl = document.getElementById('smsLogsEmpty');
    const rowsEl = document.getElementById('smsLogsRows');

    if (!logs.length) {
      if (tableEl) tableEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (tableEl) tableEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';

    if (rowsEl) {
      rowsEl.innerHTML = logs.map(log => {
        // Fix date/time formatting - use 'sent' field from database
        const dateTime = log.sent ? new Date(log.sent).toLocaleString() : 'N/A';
        
        // Fix sender formatting - show both name and phone
        const senderName = log.senderName || 'Unknown';
        const senderPhone = log.senderPhone || 'N/A';
        const sender = `${escapeHtml(senderName)} (${escapeHtml(senderPhone)})`;
        
        // Fix recipient display - use recipients field from SMS (may contain multiple recipients)
        const recipients = log.recipients ? formatRecipients(log.recipients) : 'N/A';
        const recipient = this.truncateText(recipients, 50);
        
        // Fix message preview - extract text content properly
        let messagePreview = 'N/A';
        if (log.message && log.message.trim()) {
          const textContent = (log.message || '').trim();
          if (textContent) {
            messagePreview = this.truncateText(escapeHtml(textContent), 100);
          } else {
            messagePreview = 'Empty message';
          }
        } else {
          messagePreview = log.message === null ? 'No message content' : 'Empty message';
        }
        
        // Add status indicator with Bootstrap classes
        let statusClass = 'text-secondary';
        let statusText = 'Sent';
        if (log.delivered) {
          statusClass = 'text-success';
          statusText = '✓ Delivered';
        } else if (log.failed) {
          statusClass = 'text-danger';
          statusText = '✗ Failed';
        }

        return `
            <tr class="align-middle">
              <td title="${escapeHtml(dateTime)}">${dateTime}</td>
              <td title="${escapeHtml(senderName + ' (' + senderPhone + ')')}">${sender}</td>
              <td title="${escapeHtml(log.recipients || '')}">${recipient}</td>
              <td class="${statusClass} fw-bold" title="Message status">${statusText}</td>
              <td class="cursor-pointer" 
                  onclick="smsLogsView.showLogDetails('${escapeHtml(log.id)}')"
                  title="Click to view full message">${messagePreview}</td>
            </tr>
        `;
      }).join('');
    }
  }

  private updatePagination(): void {
    const infoEl = document.getElementById('smsLogsInfo');
    const pageInfoEl = document.getElementById('smsLogsPageInfo');
    const prevBtn = document.getElementById('smsLogsPrevBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('smsLogsNextBtn') as HTMLButtonElement;

    const start = this.currentPage * this.pageSize + 1;
    const end = Math.min((this.currentPage + 1) * this.pageSize, this.totalLogs);

    if (infoEl) {
      infoEl.textContent = `Showing ${start}-${end} of ${this.totalLogs} SMS logs`;
    }

    if (pageInfoEl) {
      const totalPages = Math.ceil(this.totalLogs / this.pageSize);
      pageInfoEl.textContent = `Page ${this.currentPage + 1} of ${totalPages}`;
    }

    if (prevBtn) prevBtn.disabled = this.currentPage === 0;
    if (nextBtn) nextBtn.disabled = (this.currentPage + 1) * this.pageSize >= this.totalLogs;
  }

  private prevPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadLogs();
    }
  }

  private nextPage(): void {
    if ((this.currentPage + 1) * this.pageSize < this.totalLogs) {
      this.currentPage++;
      this.loadLogs();
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private showError(message: string): void {
    const container = document.getElementById('smsLogsContainer');
    if (container) {
      container.innerHTML = `<div style="padding: 40px; text-align: center; color: #f44336;">${message}</div>`;
    }
  }

  private setSortField(field: string): void {
    if (this.sortField === field) {
      // Toggle sort order if same field
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      // New field, default to descending
      this.sortField = field;
      this.sortOrder = 'desc';
    }
    this.updateSortIndicators();
    this.currentPage = 0;
    this.loadLogs();
  }

  private updateSortIndicators(): void {
    // Clear all indicators
    ['smsLogsSortDate', 'smsLogsSortSender', 'smsLogsSortRecipient', 'smsLogsSortStatus'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = el.innerHTML.replace(/ [↑↓]/g, '');
      }
    });
    
    // Add indicator to current sort field
    const fieldMap: {[key: string]: string} = {
      'sent': 'smsLogsSortDate',
      'senderPhone': 'smsLogsSortSender', 
      'recipients': 'smsLogsSortRecipient',
      'delivered': 'smsLogsSortStatus'
    };
    
    const currentEl = document.getElementById(fieldMap[this.sortField]);
    if (currentEl) {
      const indicator = this.sortOrder === 'asc' ? ' ↑' : ' ↓';
      currentEl.innerHTML = currentEl.innerHTML.replace(/ [↑↓]/g, '') + indicator;
    }
  }

  async showLogDetails(logId: string): Promise<void> {
    try {
      const token = authToken;
      if (!token) return;

      const response = await fetch(`/api/logs/sms/${logId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const log = await response.json();
        // Find the emailLogsView instance to reuse its modal method
        const emailLogsViewInstance = ViewRegistry.getInstance()['views'].get('email-logs') as EmailLogsView;
        if (emailLogsViewInstance) {
          emailLogsViewInstance.showLogModal(log, 'sms');
        }
      } else {
        console.error('Failed to load SMS log details');
      }
    } catch (error) {
      console.error('Error loading SMS log details:', error);
    }
  }
}

// Check if we're returning from IDP (has token parameter)
const url = new URL(window.location.href);
const hasTokenFromIdp = !!url.searchParams.get('token');

let tenantId = (!hasTokenFromIdp && localStorage.getItem('tenantId')) || '';
let appId = localStorage.getItem('appId') || '';
let authToken: string | null = localStorage.getItem('authToken');
let uiConfig: any = (window as any).__MAIL_UI_CONFIG__ || {};

// Role context management for superadmin tenant switching
let roleContext = {
  isSuperadmin: false,
  isInTenantContext: !!localStorage.getItem('contextTenantId'),
  contextTenantId: localStorage.getItem('contextTenantId') || '',
  contextTenantName: localStorage.getItem('contextTenantName') || ''
};

const state = {
  currentTemplate: undefined as TemplateRecord|undefined,
  tenants: [] as Tenant[],
  apps: [] as AppRec[],
  smtpConfigs: [] as SmtpConfig[],
  smsConfigs: [] as SmsConfig[],
  dbMode: true,
  user: null as any,
};

// Helper function to get current app ID
function getCurrentAppId(): string {
  // Try URL params first, then fall back to global appId
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('appId') || appId;
}

function $(sel: string) { return document.querySelector(sel)!; }

function showStatusMessage(el: HTMLElement, msg: string) { el.textContent = msg; setTimeout(()=> { if (el.textContent === msg) el.textContent=''; }, 6000); }
function flashInvalid(el: HTMLElement) { el.classList.add('invalid'); setTimeout(()=> el.classList.remove('invalid'), 1500); }

// Utility function to decode HTML entities
function decodeHtmlEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

class TinyMCEManager {
  private static instances: Map<string, boolean> = new Map();

  static async initialize(selector: string, options: {
    height?: number;
    onContentChange?: () => void;
  } = {}): Promise<void> {
    const elementId = selector.replace('#', '');
    console.log(`[TinyMCEManager] Initializing TinyMCE for ${elementId}`);
    
    if (!window.tinymce) {
      console.warn(`[TinyMCEManager] TinyMCE not available in window object`);
      return;
    }

    if (this.instances.get(elementId)) {
      console.log(`[TinyMCEManager] TinyMCE already initialized for ${elementId}`);
      return;
    }

    await window.tinymce.init({
      selector,
      height: options.height || 400,
      menubar: false,
      plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount',
      toolbar: 'undo redo | formatselect | bold italic underline | \
               alignleft aligncenter alignright alignjustify | \
               bullist numlist outdent indent | removeformat | help',
      content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, San Francisco, Segoe UI, Roboto, Helvetica Neue, sans-serif; font-size: 14px; }',
      setup: (editor: any) => {
        console.log(`[TinyMCEManager] Editor setup complete for: ${editor.id}`);
        editor.on('change input', () => {
          if (options.onContentChange) {
            options.onContentChange();
          }
        });
      }
    });
    
    this.instances.set(elementId, true);
    console.log(`[TinyMCEManager] TinyMCE initialization complete for ${elementId}`);
  }

  static setContent(selector: string, content: string, decode: boolean = true): void {
    const elementId = selector.replace('#', '');
    const processedContent = decode ? decodeHtmlEntities(content) : content;
    
    console.log(`[TinyMCEManager] Setting content for ${elementId} - original:`, content);
    console.log(`[TinyMCEManager] Setting content for ${elementId} - processed:`, processedContent);
    
    // Try to use TinyMCE API if available
    if (window.tinymce && window.tinymce.get(elementId)) {
      console.log(`[TinyMCEManager] TinyMCE available for ${elementId}, setting content`);
      window.tinymce.get(elementId).setContent(processedContent);
      console.log(`[TinyMCEManager] Content set via TinyMCE for ${elementId}`);
      
      // Verify what TinyMCE actually has after setting
      setTimeout(() => {
        const actualContent = window.tinymce.get(elementId).getContent();
        console.log(`[TinyMCEManager] TinyMCE content after setting for ${elementId}:`, actualContent);
      }, 100);
    } else {
      console.log(`[TinyMCEManager] TinyMCE not available for ${elementId}, using textarea fallback`);
      const textarea = document.querySelector(selector) as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = processedContent;
        console.log(`[TinyMCEManager] Content set via textarea for ${elementId}`);
        
        // If TinyMCE becomes available later, update it
        setTimeout(() => {
          if (window.tinymce && window.tinymce.get(elementId)) {
            console.log(`[TinyMCEManager] TinyMCE became available for ${elementId}, updating with content`);
            window.tinymce.get(elementId).setContent(processedContent);
          }
        }, 1000);
      }
    }
  }

  static getContent(selector: string): string {
    const elementId = selector.replace('#', '');
    
    if (window.tinymce && window.tinymce.get(elementId)) {
      return window.tinymce.get(elementId).getContent();
    } else {
      const textarea = document.querySelector(selector) as HTMLTextAreaElement;
      return textarea?.value || '';
    }
  }

  static isReady(selector: string): boolean {
    const elementId = selector.replace('#', '');
    const isInitialized = this.instances.get(elementId) || false;
    const hasEditor = window.tinymce && window.tinymce.get(elementId);
    const editorReady = hasEditor && window.tinymce.get(elementId).initialized;
    return isInitialized && hasEditor && editorReady;
  }

  static isInitialized(selector: string): boolean {
    const elementId = selector.replace('#', '');
    return this.instances.get(elementId) || false;
  }

  static destroy(selector: string): void {
    const elementId = selector.replace('#', '');
    if (window.tinymce && window.tinymce.get(elementId)) {
      window.tinymce.get(elementId).destroy();
      this.instances.delete(elementId);
      console.log(`[TinyMCEManager] Destroyed TinyMCE instance for ${elementId}`);
    }
  }
}

/**
 * Token refresh utilities
 */
interface TokenRefreshResponse {
  token: string;
  action: string;
  claims_added: string[];
}

/**
 * Extracts the user email from a JWT token payload (even if expired)
 */
function extractUserEmailFromToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub || payload.email || null;
  } catch (error) {
    console.debug('[token-refresh] Could not extract email from token:', error);
    return null;
  }
}

/**
 * Extracts the appId from a JWT token payload (even if expired)
 */
function extractAppIdFromToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.appId || null;
  } catch (error) {
    console.debug('[token-refresh] Could not extract appId from token:', error);
    return null;
  }
}

/**
 * Attempts to refresh a token silently using the IDP refresh endpoint
 */
async function refreshToken(currentToken: string, userEmail?: string): Promise<string | null> {
  console.log('[token-refresh] ===== REFRESH TOKEN FUNCTION CALLED =====');
  console.log('[token-refresh] Input parameters:', {
    hasCurrentToken: !!currentToken,
    currentTokenPreview: currentToken ? currentToken.substring(0, 50) + '...' : 'none',
    userEmail: userEmail || 'not provided'
  });
  
  try {
    console.log('[token-refresh] Starting token refresh process');
    
    // Extract the original appId from the current token
    const originalAppId = extractAppIdFromToken(currentToken);
    console.log('[token-refresh] Extracted app ID from token:', originalAppId);
    
    if (!originalAppId) {
      console.warn('[token-refresh] Could not extract appId from token');
      return null;
    }
    
    // Get stored roles from localStorage
    let storedRoles = localStorage.getItem('userRoles');
    const originalRoles = storedRoles ? JSON.parse(storedRoles) : [];
    
    console.log('[token-refresh] Retrieved stored roles:', originalRoles);
    console.log('[token-refresh] Refreshing token for appId:', originalAppId, 'with roles:', originalRoles);
    
    const idpBaseUrl = 'https://idp.worldspot.org';
    const refreshUrl = `${idpBaseUrl}/refresh-or-enhance-token.php`;
    
    // Send refresh request with roles
    const requestData: any = {
      appId: originalAppId,
      token: currentToken,
      email: userEmail,
      claims: {
        roles: originalRoles // Nest roles under claims as expected by IDP
      }
    };

    console.log('[token-refresh] Sending refresh request to:', refreshUrl);
    console.log('[token-refresh] Request data:', {
      appId: requestData.appId,
      hasToken: !!requestData.token,
      email: requestData.email,
      rolesCount: requestData.claims?.roles?.length || 0,
      roles: requestData.claims?.roles
    });
    
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestData),
      credentials: 'include'
    });

    console.log('[token-refresh] Refresh response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[token-refresh] Failed to refresh token:', response.status, response.statusText, errorText);
      return null;
    }

    const result: TokenRefreshResponse = await response.json();
    console.log('[token-refresh] Refresh response received:', {
      hasToken: !!result.token,
      action: result.action,
      claimsAdded: result.claims_added
    });
    
    if (result.token) {
      console.log('[token-refresh] ✅ Token successfully refreshed');
      console.log('[token-refresh] New token preview:', result.token.substring(0, 50) + '...');
      return result.token;
    } else {
      console.warn('[token-refresh] ❌ No token in refresh response');
      return null;
    }
  } catch (error) {
    console.error('[token-refresh] ❌ Error during token refresh:', error);
    return null;
  }
}

async function api(path: string, opts: RequestInit = {}) {
  console.log(`[api] MAIN API FUNCTION CALLED: ${path}`);
  return apiWithRetry(path, opts, true);
}

async function apiWithRetry(path: string, opts: RequestInit = {}, allowRetry: boolean = true): Promise<any> {
  console.log(`[api] ===== APIWITRETRY CALLED: ${path} =====`);
  console.log(`[api] Starting request to ${path}, allowRetry=${allowRetry}, authToken exists=${!!authToken}`);
  
  const headers: Record<string,string> = { 'Content-Type':'application/json', ...(opts.headers as any || {}) };
  
  // Add authorization header if we have a token
  if (authToken) {
    headers['Authorization'] = 'Bearer ' + authToken;
    // Debug token usage
    try {
      const tokenPayload = JSON.parse(atob(authToken.split('.')[1]));
      console.debug(`[api] Using token for ${path}:`, {
        iat: tokenPayload.iat,
        hasRoles: !!tokenPayload.roles,
        rolesCount: tokenPayload.roles?.length || 0,
        sub: tokenPayload.sub,
        tokenStart: authToken.substring(0, 20) + '...'
      });
    } catch (e) {
      console.debug(`[api] Using token for ${path} (parse failed):`, { tokenStart: authToken.substring(0, 20) + '...' });
    }
  } else {
    console.log(`[api] NO AUTH TOKEN available for ${path}`);
  }
  
  // Also add token as URL parameter to support enhanced authentication
  let finalPath = path;
  if (authToken) {
    const separator = path.includes('?') ? '&' : '?';
    finalPath = `${path}${separator}token=${encodeURIComponent(authToken)}`;
  }
  
  let res;
  try {
    console.log(`[api] Making fetch request to: ${finalPath}`);
    res = await fetch(finalPath, { ...opts, headers });
    console.log(`[api] Fetch completed with status: ${res.status}`);
  } catch (fetchError) {
    console.error(`[api] Fetch error for ${path}:`, fetchError);
    throw fetchError;
  }
  
  if (!res.ok) {
    console.log(`[api] Request failed with status ${res.status} for path: ${path}`);
    console.log(`[api] Response details:`, { status: res.status, statusText: res.statusText });
    
    // Handle 401 Unauthorized by attempting silent token refresh first
    if (res.status === 401) {
      console.log('🔒 API returned 401 Unauthorized');
      console.log(`[api] Refresh conditions - allowRetry: ${allowRetry}, authToken exists: ${!!authToken}`);
      
      if (allowRetry && authToken) {
        console.log('🔄 Attempting silent token refresh...');
        
        try {
          // Try to extract user email from current token
          const userEmail = extractUserEmailFromToken(authToken);
          console.log(`[api] Extracted user email: ${userEmail}`);
          
          // Store original token for debugging
          const originalToken = authToken;
          console.log(`[api] Original token preview: ${originalToken.substring(0, 50)}...`);
          
          // Attempt silent token refresh
          console.log('🔄 Calling refreshToken function...');
          const newToken = await refreshToken(authToken, userEmail || undefined);
          console.log(`[api] refreshToken returned: ${!!newToken}`);
          
          if (newToken) {
            console.log('✅ Token successfully refreshed, retrying original request');
            console.log(`[api] New token preview: ${newToken.substring(0, 50)}...`);
            
            // Update stored token
            authToken = newToken;
            localStorage.setItem('authToken', authToken);
            
            // Retry the original request with the new token
            console.log(`[api] Retrying original request to ${path}...`);
            return apiWithRetry(path, opts, false); // Prevent infinite retry loop
          } else {
            console.log('❌ Silent token refresh failed, will redirect to IDP');
          }
        } catch (refreshError) {
          console.error('❌ Error during token refresh:', refreshError);
        }
      } else {
        console.log(`[api] Not attempting refresh - allowRetry: ${allowRetry}, hasToken: ${!!authToken}`);
      }
    }
    
    // If we reach here, either not a 401 or refresh failed
    if (res.status === 401) {
      console.log('🔒 Final 401 handling - redirecting to IDP for re-authentication...');
      
      // Clear expired token
      authToken = null;
      localStorage.removeItem('authToken');
      
      // Redirect to IDP
      const idp = uiConfig.idpLoginUrl as string | null;
      if (idp) {
        // Preserve current URL for return after re-authentication, but remove the old token
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('token'); // Remove expired token
        const ret = currentUrl.toString();
        
        const redirect = new URL(idp);
        redirect.searchParams.set('return', ret);
        
        // Extract appId from the expired token if available
        if (authToken) {
          const appId = extractAppIdFromToken(authToken);
          if (appId) {
            redirect.searchParams.set('appId', appId);
          }
        }
        
        window.location.href = redirect.toString();
        return; // Don't throw error, redirect instead
      }
    }
    
    const tx = await res.text();
    throw new Error(tx || res.statusText);
  }
  
  console.log(`[api] Request to ${path} succeeded`);
  return res.json();
}

async function listTemplates() {
  // Only load for legacy tenant-based views that have templateList element
  const wrap = $('#templateList');
  if (!wrap) return; // Skip if templateList element doesn't exist (like in compose view)
  
  try {
    if (tenantId) {
      // Legacy tenant-based system only
      const list = await api(`/tenants/${tenantId}/templates`);
      wrap.innerHTML = list.map((t:TemplateRecord)=>`<div class="tplRow"><button data-id="${t.id}" class="loadTpl">Load</button> ${t.name} v${t.version}</div>`).join('') || '<em>No templates yet</em>';
      wrap.querySelectorAll<HTMLButtonElement>('button.loadTpl').forEach(btn => btn.addEventListener('click', () => loadTemplate(btn.dataset.id!)));
    } else {
      wrap.innerHTML = '<em>Select or create a tenant first</em>';
    }
  } catch (e:any) { 
    console.error(e); 
    if (wrap) wrap.innerHTML = '<em>Error loading templates</em>';
  }
}

let selectedGroupId: string | null = null;

async function listGroups() {
  // Only load for legacy tenant-based views that have groupsList element
  const wrap = document.getElementById('groupsList');
  if (!wrap) return; // Skip if groupsList element doesn't exist (like in compose view)
  
  if (!state.dbMode || !tenantId) { 
    wrap.innerHTML = state.dbMode ? '<em>Select tenant</em>' : '<em>In-memory: groups not tracked</em>'; 
    return; 
  }
  try {
    const groups = await api(`/tenants/${tenantId}/groups`);
    wrap.innerHTML = groups.map((g:any)=>`<div class="grpRow"><button data-g="${g.id}" class="loadGroup">#</button> ${g.subject||g.id} <span style='opacity:.6'>${g.status}</span> <span style='opacity:.6'>S:${g.sentCount} F:${g.failedCount}</span></div>`).join('') || '<em>No groups</em>';
    wrap.querySelectorAll<HTMLButtonElement>('button.loadGroup').forEach(btn => btn.addEventListener('click', () => { selectedGroupId = btn.dataset.g!; (document.getElementById('cancelGroupBtn') as HTMLButtonElement).disabled = false; loadGroupEvents(selectedGroupId); }));
  } catch (e:any) {
    wrap.innerHTML = '<em>Error loading groups</em>';
  }
}

async function loadGroupEvents(groupId: string) {
  if (!state.dbMode) return;
  try {
    const events = await api(`/groups/${groupId}/events`);
    const wrap = document.getElementById('eventsList')!;
    wrap.innerHTML = events.map((ev:any)=>`<div class="evtRow">${new Date(ev.occurredAt).toLocaleTimeString()} <strong>${ev.type}</strong>${ev.recipientId? ' r:'+ev.recipientId.slice(0,6):''}</div>`).join('') || '<em>No events</em>';
  } catch { document.getElementById('eventsList')!.innerHTML = '<em>Error</em>'; }
}

async function loadTemplate(id: string) {
  const tpl = await api(`/templates/${id}`);
  state.currentTemplate = tpl;
  (document.querySelector('#templateForm [name=name]') as HTMLInputElement).value = tpl.name;
  (document.querySelector('#templateForm [name=version]') as HTMLInputElement).value = String(tpl.version);
  (document.querySelector('#templateForm [name=subject]') as HTMLInputElement).value = tpl.subject;
  (document.querySelector('#templateForm [name=title]') as HTMLInputElement).value = tpl.title;
  (document.querySelector('#templateForm [name=subject]') as HTMLInputElement).value = tpl.subject;
  (document.querySelector('#templateForm [name=content]') as HTMLTextAreaElement).value = tpl.content;
  // Computed fields for display only
  const name = tpl.title; // name is just the title
  const description = `Template: ${tpl.title}`; // description is computed
  updateEnvInfo();
}

// Template creation
const templateForm = $('#templateForm');
if (templateForm) {
  templateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const extractedAppId = authToken ? extractAppIdFromToken(authToken) : null;
    const appIdValue = state.user?.appId || extractedAppId || 'unknown';
    const payload: any = {
      appId: appIdValue,
      title: fd.get('title') as string,
      version: Number(fd.get('version')),
      subject: fd.get('subject'),
      content: fd.get('content'),
      isActive: fd.get('isActive') !== 'off'
    };
  const btn = form.querySelector('button[type=submit]') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const tpl = await api('/templates', { method:'POST', body: JSON.stringify(payload) });
    state.currentTemplate = tpl;
    showStatusMessage($('#templateStatus') as HTMLElement, 'Saved ✔');
    await listTemplates();
  } catch (err:any) {
    showStatusMessage($('#templateStatus') as HTMLElement, 'Error: '+ err.message);
  } finally { btn.disabled = false; updateEnvInfo(); }
});
}

// Render preview
const renderForm = $('#renderForm');
if (renderForm) {
  renderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.currentTemplate) { showStatusMessage($('#renderStatus') as HTMLElement, 'No template loaded'); return; }
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);
  let ctx: any = {};
  const raw = fd.get('context') as string;
  if (raw?.trim()) { try { ctx = JSON.parse(raw); } catch { showStatusMessage($('#renderStatus') as HTMLElement, 'Invalid context JSON'); flashInvalid(document.querySelector('#renderForm [name=context]') as HTMLElement); return; } }
  const btn = form.querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  try {
    const rendered = await api(`/templates/${state.currentTemplate.id}/render`, { method:'POST', body: JSON.stringify({ context: ctx }) });
    $('#previewSubject').textContent = rendered.subject;
    const iframe = document.querySelector('#previewHtml') as HTMLIFrameElement;
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(rendered.html);
    iframe.contentDocument!.close();
    $('#previewText').textContent = rendered.text || '';
    showStatusMessage($('#renderStatus') as HTMLElement, 'Rendered ✔');
  } catch (err:any) { showStatusMessage($('#renderStatus') as HTMLElement, 'Error: '+ err.message); } finally { btn.disabled = false; }
  });
}

// Group send (draft simplified)
const groupForm = $('#groupForm');
if (groupForm) {
  groupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.currentTemplate) { showStatusMessage($('#groupStatus') as HTMLElement, 'No template'); return; }
  const fd = new FormData(e.target as HTMLFormElement);
  const groupSubject = fd.get('groupSubject') as string;
  const recipientsRaw = (fd.get('recipients') as string || '').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const btn = (e.target as HTMLFormElement).querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  try {
    const useAppId = state.dbMode ? appId : 'app1';
    if (state.dbMode && (!tenantId || !useAppId)) { showStatusMessage($('#groupStatus') as HTMLElement, 'Select tenant/app'); return; }
    const group = await api('/groups', { method:'POST', body: JSON.stringify({ tenantId, appId: useAppId, templateId: state.currentTemplate.id, subject: groupSubject }) });
    if (recipientsRaw.length) {
      await api(`/groups/${group.id}/recipients`, { method:'POST', body: JSON.stringify({ recipients: recipientsRaw.map(email => ({ email, context:{} })), dedupe:true, renderNow:false }) });
    }
    await api(`/groups/${group.id}/schedule`, { method:'POST', body: JSON.stringify({}) });
    await api('/internal/worker/tick', { method:'POST', body: JSON.stringify({}) });
    showStatusMessage($('#groupStatus') as HTMLElement, 'Sent (dry-run) ✔');
    await listGroups();
  } catch (err:any) { showStatusMessage($('#groupStatus') as HTMLElement, 'Error: '+ err.message); } finally { btn.disabled = false; }
  });
}

// Deactivate template
(document.getElementById('deactivateTemplateBtn') as HTMLButtonElement | null)?.addEventListener('click', async () => {
  if (!state.currentTemplate) return;
  try {
    await api(`/templates/${state.currentTemplate.id}/deactivate`, { method:'PATCH' });
    showStatusMessage(document.getElementById('templateStatus') as HTMLElement, 'Template deactivated');
  } catch (e:any) { showStatusMessage(document.getElementById('templateStatus') as HTMLElement, 'Error: '+ e.message); }
});

// Cancel group
(document.getElementById('cancelGroupBtn') as HTMLButtonElement | null)?.addEventListener('click', async () => {
  if (!selectedGroupId) return;
  try {
    await api(`/groups/${selectedGroupId}/cancel`, { method:'POST' });
    showStatusMessage(document.getElementById('groupStatus') as HTMLElement, 'Group canceled');
    await listGroups();
    if (selectedGroupId) await loadGroupEvents(selectedGroupId);
  } catch (e:any) { showStatusMessage(document.getElementById('groupStatus') as HTMLElement, 'Error: '+ e.message); }
});

async function loadTenants() {
  try {
    const list: Tenant[] = await api('/tenants');
    state.tenants = list;
    const sel = document.getElementById('tenantSelect') as HTMLSelectElement | null;
    if (sel) {
      sel.innerHTML = '<option value="">-- select --</option>' + list.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
      if (tenantId && list.some(t=>t.id===tenantId)) sel.value = tenantId; else sel.value = '';
    }
    const tList = document.getElementById('tenantList');
    if (tList) {
      tList.innerHTML = list.map(t=>`
        <div class='tplRow' style="display: flex; align-items: center; justify-content: space-between; padding: 8px; margin: 4px 0; border: 1px solid #444; border-radius: 4px;">
          <div style="flex: 1;">
            <div style="font-weight: bold; margin-bottom: 2px; cursor: pointer; color: #4CAF50;" data-tenant-click='${t.id}' title="Click to view apps for this tenant">${escapeHtml(t.name)}</div>
            <div style="font-size: 0.8em; color: #888; font-family: monospace;">ID: ${escapeHtml(t.id)}</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button data-e='${t.id}' class='editTenant smallBtn'>Edit</button> 
            <button data-d='${t.id}' class='delTenant smallBtn' style="background: #dc3545; border-color: #dc3545;">Delete</button>
          </div>
        </div>
      `).join('') || '<em>No tenants</em>';
      tList.querySelectorAll<HTMLButtonElement>('button.editTenant').forEach(b=>b.addEventListener('click', ()=> editTenantPrompt(b.dataset.e!)));
      tList.querySelectorAll<HTMLButtonElement>('button.delTenant').forEach(b=>b.addEventListener('click', ()=> deleteTenant(b.dataset.d!)));
      // Add click handlers for tenant names to view their apps
      tList.querySelectorAll<HTMLElement>('[data-tenant-click]').forEach(el => {
        el.addEventListener('click', () => {
          const tenantId = el.dataset.tenantClick!;
          const tenant = list.find(t => t.id === tenantId);
          if (tenant) {
            switchToTenantContext(tenantId, tenant.name);
          }
        });
      });
    }
  } catch (e:any) {
    // Likely 403 for non-superadmin; ignore gracefully
    state.tenants = [];
    const tList = document.getElementById('tenantList');
    if (tList) tList.innerHTML = '<em>Not authorized</em>';
  }
}

async function editTenantPrompt(id: string) {
  const t = state.tenants.find(x=>x.id===id); 
  if (!t) return;
  
  // Show a more informative prompt with tenant ID
  const promptMessage = `Change tenant name\n\nTenant ID: ${t.id}\nCurrent name: ${t.name}\n\nNew name:`;
  const name = prompt(promptMessage, t.name); 
  
  if (!name || name.trim() === '' || name === t.name) return;
  
  try { 
    await api(`/tenants/${id}`, { method:'PATCH', body: JSON.stringify({ name: name.trim() }) }); 
    await loadTenants(); 
  } catch (e:any){ 
    alert('Update failed: '+e.message); 
  }
}

async function deleteTenant(id: string) {
  const t = state.tenants.find(x=>x.id===id);
  const tenantInfo = t ? `"${t.name}" (ID: ${t.id})` : id;
  
  // Load apps for this tenant to show what will be affected
  let appsInfo = '';
  try {
    const apps: AppRec[] = await api(`/apps?tenantId=${encodeURIComponent(id)}`);
    if (apps.length > 0) {
      const appNames = apps.map(app => `• ${app.name} (${app.id})`).join('\n');
      appsInfo = `\n\nThis will also delete ${apps.length} app${apps.length === 1 ? '' : 's'}:\n${appNames}`;
    }
  } catch (e) {
    console.warn('Could not load apps for tenant deletion confirmation:', e);
  }
  
  const confirmMessage = `Delete tenant ${tenantInfo}?${appsInfo}\n\nThis will be a soft delete and can potentially be reversed by technical support.`;
  
  if (!confirm(confirmMessage)) return;
  
  try { 
    await api(`/tenants/${id}`, { method:'DELETE' }); 
    await loadTenants(); 
  } catch (e:any){ 
    alert('Delete failed: '+e.message); 
  }
}

async function loadApps() {
  if (!tenantId) { (document.getElementById('appSelect') as HTMLSelectElement).innerHTML = '<option value="">-- none --</option>'; return; }
  try {
    const list: AppRec[] = await api(`/apps?tenantId=${encodeURIComponent(tenantId)}`);
    state.apps = list;
    const sel = document.getElementById('appSelect') as HTMLSelectElement;
    sel.innerHTML = '<option value="">-- select --</option>' + list.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
    if (appId && list.some(a=>a.id===appId)) sel.value = appId; else sel.value = '';
    
    // Update titles if we're in a compose view
    refreshComposeViewTitles();
  } catch {/* ignore */}
}

async function loadAllApps() {
  try {
    console.log('Loading all apps for SMTP config...');
    const list: AppRec[] = await api('/apps');
    state.apps = list;
    console.log('Loaded apps:', list);
    
    // Update titles if we're in a compose view
    refreshComposeViewTitles();
  } catch (e) {
    console.error('Failed to load all apps:', e);
  }
}

async function loadAppForEditor() {
  try {
    // Get the appId from URL parameters for editor contexts
    const urlParams = new URLSearchParams(window.location.search);
    const currentAppId = urlParams.get('appId');
    
    if (!currentAppId) {
      console.log('[loadAppForEditor] No appId in URL parameters');
      return;
    }
    
    console.log('[loadAppForEditor] Loading app for editor:', currentAppId);
    
    // Load the specific app info - this should work for editors since they have access to their own app
    const appInfo = await api(`/apps/${encodeURIComponent(currentAppId)}`);
    
    // Initialize state.apps with just this one app
    state.apps = [appInfo];
    
    console.log('[loadAppForEditor] Loaded app for editor:', appInfo);
    
    // Update titles if we're in a compose view
    refreshComposeViewTitles();
  } catch (e) {
    console.error('[loadAppForEditor] Failed to load app for editor:', e);
    // If we can't load the app info, at least initialize an empty array
    state.apps = [];
  }
}

function showLogin() {
  const overlay = document.getElementById('loginOverlay')!;
  overlay.style.display = 'flex';
  (document.getElementById('userPane') as HTMLElement).style.display = 'none';
}

function hideLogin() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'none';
}

function applyRoleVisibility() {
  const roles: string[] = state.user?.roles || [];
  const isEditorOnly = roles.includes('editor') && !roles.some((r: string)=> r==='tenant_admin' || r==='superadmin');
  
  // Hide SMTP Config for Editor-only users
  const smtpConfigBtn = document.querySelector('[data-view="smtp-config"]') as HTMLElement;
  if (smtpConfigBtn) {
    smtpConfigBtn.style.display = isEditorOnly ? 'none' : 'block';
    // Rename SMTP Config to just "Config" for non-editor users
    if (!isEditorOnly) {
      smtpConfigBtn.textContent = 'Config';
    }
  }
  
  // Hide Context pane for Editor-only users
  const contextPanel = document.getElementById('tenantAppPanel') as HTMLElement;
  if (contextPanel) {
    contextPanel.style.display = isEditorOnly ? 'none' : 'block';
  }
  
  // Hide role context for Editor-only users (they don't need context switching)
  const roleContextDiv = document.getElementById('roleContext') as HTMLElement;
  if (roleContextDiv && isEditorOnly) {
    roleContextDiv.style.display = 'none';
  }
}

function onAuthenticated(cameFromIdp: boolean = false) {
  debugLog('VIEW-FLOW', `onAuthenticated: ENTRY: cameFromIdp=${cameFromIdp}`);
  console.log('[DEBUG] onAuthenticated called with cameFromIdp:', cameFromIdp);
  
  // Complete authentication precondition
  const preconditionManager = PreconditionManager.getInstance();
  preconditionManager.completePrecondition('authentication');
  
  // Only restore URL parameters if we actually have saved ones from a real IDP redirect
  // If someone comes directly with a token and URL parameters, preserve those instead
  if (cameFromIdp) {
    try {
      const savedParams = localStorage.getItem('preIdpUrlParams');
      if (savedParams) {
        const urlParams = JSON.parse(savedParams);
        console.log('[DEBUG] Restoring URL parameters after IDP return:', urlParams);
        
        // Restore parameters to current URL
        const currentUrl = new URL(window.location.href);
        Object.entries(urlParams).forEach(([key, value]) => {
          if (value && key !== 'token') { // Don't restore token parameter
            currentUrl.searchParams.set(key, value as string);
          }
        });
        
        // Update the URL without reloading the page
        window.history.replaceState({}, document.title, currentUrl.toString());
        
        // Clean up the saved parameters
        localStorage.removeItem('preIdpUrlParams');
        
        console.log('[DEBUG] URL restored to:', currentUrl.toString());
      } else {
        console.log('[DEBUG] No saved parameters found - user came directly with token and URL parameters');
      }
    } catch (e) {
      console.warn('[DEBUG] Failed to restore URL parameters:', e);
    }
  }
  
  hideLogin();
  const roles = state.user?.roles || [];
  const userSummary = document.getElementById('userSummary');
  if (userSummary) {
    const appLabel = state.user?.appName || state.user?.appClientId || state.apps.find(a=>a.id===state.user?.appId)?.name || '';
    const tenantLabel = state.user?.tenantName || '';
    const roleLabel = roles.join(',')||'no-roles';
    // Prominently show application; include tenant if known
    userSummary.textContent = `${appLabel ? '['+appLabel+'] ' : ''}${tenantLabel ? tenantLabel+' · ' : ''}${state.user.sub || 'user'} [${roleLabel}]`;
  }
  (document.getElementById('userPane') as HTMLElement).style.display = 'flex';
  applyRoleVisibility();
  
  // Initialize role context
  updateRoleContext();
  
  // Load tenants for superadmin
  const isSuperadmin = roles.includes('superadmin');
  const loadTenantsPromise = isSuperadmin ? loadTenants().catch(()=>{}) : Promise.resolve();
  loadTenantsPromise.then(async () => {
    debugLog('VIEW-FLOW', 'onAuthenticated: ENTRY into loadTenantsPromise.then() callback');
    try {
      // Use the roles and isSuperadmin variables already declared above
      
      // For superadmin, only load tenantId from localStorage if they specifically chose a tenant context
    // For non-superadmin, prefer tenantId from token
    if (isSuperadmin) {
      console.log('[DEBUG] Superadmin context logic - cameFromIdp:', cameFromIdp, 'isInTenantContext:', roleContext.isInTenantContext);
      // If returning from IDP, superadmin should start in global context (clear tenant context)
      if (cameFromIdp) {
        console.log('[DEBUG] Clearing tenant context for superadmin returning from IDP');
        tenantId = '';
        localStorage.removeItem('tenantId');
        // Clear tenant context flags
        roleContext.isInTenantContext = false;
        roleContext.contextTenantId = '';
        roleContext.contextTenantName = '';
        localStorage.removeItem('contextTenantId');
        localStorage.removeItem('contextTenantName');
      } else {
        // On normal page refresh, restore tenant context if they were in one
        if (roleContext.isInTenantContext && roleContext.contextTenantId) {
          tenantId = roleContext.contextTenantId;
        }
        // Clear any legacy tenantId from localStorage for superadmins not in tenant context
        if (!roleContext.isInTenantContext) {
          tenantId = '';
          localStorage.removeItem('tenantId');
        }
      }
    } else if (!isSuperadmin && state.user?.tenantId && !tenantId) {
      tenantId = state.user.tenantId;
      localStorage.setItem('tenantId', tenantId);
    }
    
    // Skip loading apps for editor-only users to avoid 403 errors
    const roleList: string[] = state.user?.roles || [];
    const isEditorOnly = roleList.includes('editor') && !roleList.some(r=> r==='tenant_admin' || r==='superadmin');
    if (tenantId && !isEditorOnly) {
      await loadApps();
    } else if (isEditorOnly) {
      // For editor-only users, try to load the specific app they're working with
      await loadAppForEditor();
    }
    updateEnvInfo();
    
    // Skip legacy template/group loading when on compose view
    const urlParams = new URLSearchParams(window.location.search);
    const currentView = urlParams.get('view');
    if (currentView !== 'compose') {
      if (tenantId) await listTemplates();
      if (tenantId) await listGroups();
    }
    
    await initializeViews();
    debugLog('VIEW-FLOW', 'onAuthenticated: Views initialized, setting up modals');
    
    // Set up log message modal close handler
    const closeLogMessageModal = document.getElementById('closeLogMessageModal');
    const logMessageModal = document.getElementById('logMessageModal');
    if (closeLogMessageModal && logMessageModal) {
      closeLogMessageModal.addEventListener('click', () => {
        const bootstrapModal = (window as any).bootstrap.Modal.getInstance(logMessageModal);
        if (bootstrapModal) {
          bootstrapModal.hide();
        }
      });
      // Bootstrap handles backdrop clicks automatically, so we don't need manual handling
    }
    
    await wireNav();
    wireAppManagement();
    debugLog('VIEW-FLOW', 'onAuthenticated: Navigation wired, completing config-loading precondition');
    
    // Complete config loading precondition - all setup is now complete
    const preconditionManager = PreconditionManager.getInstance();
    preconditionManager.completePrecondition('config-loading');
    debugLog('VIEW-FLOW', 'All preconditions completed, now wiring navigation and rendering views');
    
    // Remove loading class from body - app is now ready
    document.body.classList.remove('loading');
    debugLog('VIEW-FLOW', 'Removed loading class from body - app is ready');
    
    // Now that all preconditions are complete, handle URL-based view routing
    const urlParams2 = new URLSearchParams(window.location.search);
    const requestedView = urlParams2.get('view');
    
    let defaultView = 'compose'; // Default for tenant admins and editors
    if (isSuperadmin && !roleContext.isInTenantContext) {
      // Superadmin in global context should see Config view
      defaultView = 'smtp-config';
    }
    
    const viewToShow = requestedView || defaultView;
    debugLog('VIEW-FLOW', `Showing initial view: ${viewToShow} (requested: ${requestedView}, default: ${defaultView})`);
    
    // Show the view - all preconditions are now met
    await viewRegistry.showView(viewToShow, roles);
    } catch (error) {
      console.error('[VIEW-FLOW] Error in onAuthenticated callback:', error);
      // Still complete the precondition even if there's an error, so the view can show
      const preconditionManager = PreconditionManager.getInstance();
      preconditionManager.completePrecondition('config-loading');
      debugLog('VIEW-FLOW', 'Config-loading precondition completed despite error');
    }
  });
}

// Tenant creation (exists only in Tenants view now)
const tenantFormEl = document.getElementById('tenantForm') as HTMLFormElement | null;
if (tenantFormEl) {
  tenantFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const name = fd.get('tenantName') as string;
    const btn = (e.target as HTMLFormElement).querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
    try {
      const t = await api('/tenants', { method:'POST', body: JSON.stringify({ name }) });
      tenantId = t.id; localStorage.setItem('tenantId', tenantId);
      showStatusMessage(document.getElementById('tenantStatus') as HTMLElement, 'Created ✔');
      await loadTenants(); await loadApps(); await listTemplates(); await listGroups();
      updateEnvInfo();
    } catch (err:any) { showStatusMessage(document.getElementById('tenantStatus') as HTMLElement, 'Error: '+err.message); } finally { btn.disabled = false; }
  });
}

// Login form handling
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target as HTMLFormElement);
  const token = (fd.get('token') as string || '').trim();
  const statusEl = document.getElementById('loginStatus')!;
  if (!token) { statusEl.textContent = 'Token required'; return; }
  statusEl.textContent = 'Verifying...';
  authToken = token; localStorage.setItem('authToken', authToken);
  try {
    state.user = await api('/me'); 
    if (!state.user) throw new Error('No user context');
    
    // Store user roles for token refresh
    if (state.user.roles) {
      localStorage.setItem('userRoles', JSON.stringify(state.user.roles));
      console.log('[auth] Stored user roles for refresh:', state.user.roles);
    }
    
    // Store user roles for token refresh
    if (state.user.roles) {
      localStorage.setItem('userRoles', JSON.stringify(state.user.roles));
      console.log('[auth] Stored user roles for refresh:', state.user.roles);
    }    statusEl.textContent = 'OK';
    setTimeout(()=> { statusEl.textContent=''; }, 800);
    onAuthenticated(false); // Manual login form - not from IDP
  } catch (err:any) {
    statusEl.textContent = 'Invalid token';
    authToken = null; localStorage.removeItem('authToken');
  }
});

function updateLogoutButton() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (!logoutBtn) return;
  
  const urlParams = new URLSearchParams(window.location.search);
  const returnUrl = urlParams.get('returnUrl') || localStorage.getItem('editorReturnUrl');
  const currentView = urlParams.get('view');
  const urlAppId = urlParams.get('appId');
  
  // Check if this is opened as a popup/new window from another app
  const isPopupWindow = window.opener && window.opener !== window;
  
  // Show Dismiss button if:
  // 1. This is a popup window (opened via window.open)
  // 2. External log viewing (view=email-logs/sms-logs with appId)
  const isExternalLogViewing = urlAppId && (currentView === 'email-logs' || currentView === 'sms-logs');
  const isFromApp = returnUrl && !isExternalLogViewing; // Coming from app for compose/other views
  
  if (isPopupWindow || isExternalLogViewing) {
    // Show as "Dismiss" button for popup windows
    logoutBtn.innerHTML = '✖️ Dismiss';
    logoutBtn.title = 'Close this window';
    logoutBtn.style.background = '#6c757d';
    logoutBtn.style.borderColor = '#6c757d';
  } else if (isFromApp) {
    // Show as "Return" button for app integration
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

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const returnUrl = urlParams.get('returnUrl') || localStorage.getItem('editorReturnUrl');
  const currentView = urlParams.get('view');
  const urlAppId = urlParams.get('appId');
  
  // Check if this is a popup window or external log viewing
  const isPopupWindow = window.opener && window.opener !== window;
  const isExternalLogViewing = urlAppId && (currentView === 'email-logs' || currentView === 'sms-logs');
  
  if (isPopupWindow || isExternalLogViewing) {
    // This is a popup window - just close it
    console.log('✖️ Dismissing popup window');
    window.close();
    return;
  }
  
  if (returnUrl) {
    // This is a return to the calling app
    console.log('🔄 Returning to calling app:', returnUrl);
    localStorage.removeItem('editorReturnUrl'); // Clean up
    window.location.href = returnUrl;
    return;
  }
  
  // Confirm logout action
  if (!confirm('Are you sure you want to logout? This will clear your session and return you to the login screen.')) {
    return;
  }
  
  console.log('🚪 Logging out user...');
  
  // Clear authentication and user state
  authToken = null; 
  localStorage.removeItem('authToken');
  state.user = null;
  
  // Clear role context
  roleContext.isSuperadmin = false;
  roleContext.isInTenantContext = false;
  roleContext.contextTenantId = '';
  roleContext.contextTenantName = '';
  localStorage.removeItem('contextTenantId');
  localStorage.removeItem('contextTenantName');
  
  // Clear tenant/app selection state
  tenantId = '';
  appId = '';
  localStorage.removeItem('tenantId');
  localStorage.removeItem('appId');
  
  // Clear any app hints
  localStorage.removeItem('appClientIdHint');
  localStorage.removeItem('appIdHint');
  
  // Clear IDP redirect flags to allow fresh redirect
  try {
    sessionStorage.removeItem('idpRedirected');
    sessionStorage.removeItem('idpRedirectedHints');
  } catch {}
  
  // Hide user pane
  (document.getElementById('userPane') as HTMLElement).style.display = 'none';
  
  // Optional: Redirect to clean URL
  if (window.location.search) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  
  console.log('✅ Logout complete');
  
  // Instead of showing manual login, trigger IDP redirect flow
  const idp = uiConfig.idpLoginUrl as string | null;
  if (idp) {
    console.log('🔄 Redirecting to IDP for fresh authentication...');
    const ret = (uiConfig.returnUrl as string) || (window.location.origin + '/ui/');
    const redirect = new URL(idp);
    redirect.searchParams.set('return', ret);
    // Always include the default ReTree Hawaii appId for tenant admin context
    // Extract appId from current token if available
    if (authToken) {
      const appId = extractAppIdFromToken(authToken);
      if (appId) {
        redirect.searchParams.set('appId', appId);
      }
    }
    console.log('🔄 Logout redirect URL:', redirect.toString());
    window.location.href = redirect.toString();
  } else {
    // Fallback to manual login if no IDP configured
    showLogin();
  }
});

// App creation (only in Tenants view)
const appFormEl = document.getElementById('appForm') as HTMLFormElement | null;
if (appFormEl) {
  appFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!tenantId) { showStatusMessage(document.getElementById('appStatus') as HTMLElement, 'Select tenant first'); return; }
    const fd = new FormData(e.target as HTMLFormElement);
    const payload = { tenantId, name: fd.get('appName'), clientId: fd.get('clientId') };
    const btn = (e.target as HTMLFormElement).querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
    try {
      const rec = await api('/apps', { method:'POST', body: JSON.stringify(payload) });
      appId = rec.id; localStorage.setItem('appId', appId);
      showStatusMessage(document.getElementById('appStatus') as HTMLElement, 'Created ✔');
      await loadApps();
      updateEnvInfo();
    } catch (err:any) { showStatusMessage(document.getElementById('appStatus') as HTMLElement, 'Error: '+err.message); } finally { btn.disabled = false; }
  });
}

// Select handlers
(document.getElementById('tenantSelect') as HTMLSelectElement | null)?.addEventListener('change', async (e) => {
  tenantId = (e.target as HTMLSelectElement).value;
  localStorage.setItem('tenantId', tenantId);
  appId = '';
  localStorage.removeItem('appId');
  await loadApps();
  await listTemplates(); // Will only run if templateList element exists
  await listGroups(); // Will only run if groupsList element exists
  updateEnvInfo();
});

(document.getElementById('appSelect') as HTMLSelectElement | null)?.addEventListener('change', (e) => {
  appId = (e.target as HTMLSelectElement).value;
  if (appId) localStorage.setItem('appId', appId); else localStorage.removeItem('appId');
  updateEnvInfo();
});

function updateEnvInfo() {
  const parts = [] as string[];
  parts.push(`Tenant: ${tenantId || '—'}`);
  const appBadge = state.user?.appName || state.user?.appClientId || appId || '—';
  parts.push(`App: ${appBadge}`);
  parts.push(state.dbMode ? 'DB' : 'In-Memory');
  if (state.user) {
    const roles = (state.user.roles||[]).join(',') || 'no-roles';
    parts.push(`User: ${state.user.sub||'unknown'} [${roles}]`);
  }
  (document.getElementById('envInfo')!).textContent = parts.join(' | ');
  const deactivateBtn = document.getElementById('deactivateTemplateBtn') as HTMLButtonElement | null;
  if (deactivateBtn) deactivateBtn.disabled = !state.currentTemplate;
}

async function detectMode() { state.dbMode = true; }

function getViewTitle(viewName: string, currentAppId?: string): { appTitle: string; viewFunction: string } {
  // Get app name from various sources, including the passed currentAppId
  const targetAppId = currentAppId || 
                      new URLSearchParams(window.location.search).get('appId') || 
                      appId || '';
  
  const appLabel = state.user?.appName || state.user?.appClientId || 
                   state.apps.find(a=>a.id===state.user?.appId)?.name || 
                   state.apps.find(a=>a.id===targetAppId)?.name || '';
  
  // Determine view function name
  let viewFunction = '';
  switch (viewName) {
    case 'compose':
      viewFunction = 'Compose Email';
      break;
    case 'sms-compose':
      viewFunction = 'Send SMS';
      break;
    case 'apps':
      return { appTitle: getAppsViewTitle(), viewFunction: '' };
    case 'tenants':
      viewFunction = 'Tenant Management';
      break;
    case 'smtp-config':
      viewFunction = 'Email Configuration';
      break;
    case 'sms-config':
      viewFunction = 'SMS Configuration';
      break;
    case 'email-logs':
      viewFunction = 'Email Logs';
      break;
    case 'sms-logs':
      viewFunction = 'SMS Logs';
      break;
    case 'template-editor':
      viewFunction = 'Template Editor';
      break;
    default:
      viewFunction = 'Mail Service';
  }
  
  // For app-specific contexts (compose, logs, etc.), show app name prominently
  if (appLabel && (viewName === 'compose' || viewName === 'sms-compose' || viewName === 'email-logs' || viewName === 'sms-logs')) {
    // Set document title to include both app and function
    document.title = `${appLabel} - ${viewFunction}`;
    return { appTitle: appLabel, viewFunction: viewFunction };
  }
  
  // For non-app specific views, show function as title
  document.title = `Mail Service - ${viewFunction}`;
  return { appTitle: viewFunction, viewFunction: '' };
}

function refreshComposeViewTitles() {
  // Check if we're in a compose view and update the title
  const currentPath = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  const view = urlParams.get('view');
  const currentAppId = urlParams.get('appId');
  
  if (view === 'compose') {
    updateViewTitle('compose', currentAppId || undefined);
  } else if (view === 'sms-compose') {
    updateViewTitle('sms-compose', currentAppId || undefined);
  }
}

function updateViewTitle(viewName: string, currentAppId?: string) {
  const titleInfo = getViewTitle(viewName, currentAppId);
  const appTitleElement = document.getElementById('appTitle');
  const viewFunctionElement = document.getElementById('viewFunction');
  
  if (appTitleElement) {
    appTitleElement.textContent = titleInfo.appTitle;
  }
  if (viewFunctionElement) {
    viewFunctionElement.textContent = titleInfo.viewFunction;
    viewFunctionElement.style.display = titleInfo.viewFunction ? 'block' : 'none';
  }
}

function getAppsViewTitle() {
  if (roleContext.isInTenantContext) {
    return `Apps - Tenant: ${roleContext.contextTenantName}`;
  }
  const roles: string[] = state.user?.roles || [];
  if (roles.includes('superadmin')) {
    return 'Apps Management (Superadmin)';
  }
  if (roles.includes('tenant_admin')) {
    const tenantName = state.user?.tenantName || 'Current Tenant';
    return `Apps Management - ${tenantName}`;
  }
  return 'Apps Management';
}

async function loadAppsForCurrentContext() {
  const roles: string[] = state.user?.roles || [];
  const targetTenantId = roleContext.isInTenantContext ? roleContext.contextTenantId : 
                         (roles.includes('tenant_admin') ? state.user?.tenantId : null);
                         
  // Update the app context display
  const appTenantContext = document.getElementById('appTenantContext');
  if (appTenantContext) {
    if (roleContext.isInTenantContext) {
      appTenantContext.textContent = `Managing apps for: ${roleContext.contextTenantName} (${roleContext.contextTenantId})`;
    } else if (targetTenantId) {
      const tenantName = state.user?.tenantName || 'Current Tenant';
      appTenantContext.textContent = `Managing apps for: ${tenantName}`;
    } else {
      appTenantContext.textContent = 'No tenant context selected';
    }
  }
                         
  if (targetTenantId) {
    await loadAppsForTenant(targetTenantId);
    await updateAppsUI();
  } else if (roles.includes('superadmin') && !roleContext.isInTenantContext) {
    // Superadmin outside tenant context - show message to select tenant
    const appsList = document.getElementById('appsList');
    if (appsList) {
      appsList.innerHTML = '<div class="empty-state">Select a tenant context to manage apps</div>';
    }
  }
}

async function loadAppsForTenant(tenantId: string) {
  try {
    const list: AppRec[] = await api(`/apps?tenantId=${encodeURIComponent(tenantId)}`);
    state.apps = list;
    
    // Update titles if we're in a compose view
    refreshComposeViewTitles();
    
    return list;
  } catch (e) {
    console.error('Failed to load apps for tenant:', e);
    return [];
  }
}

async function updateAppsUI() {
  const appsList = document.getElementById('appsList');
  if (!appsList) return;
  
  if (state.apps.length === 0) {
    appsList.innerHTML = '<div class="empty-state">No apps found for this tenant</div>';
    return;
  }
  
  const appsHtml = state.apps.map(app => {
    // Check if this app has its own SMTP config
    const appConfig = state.smtpConfigs.find(c => c.scope === 'APP' && c.appId === app.id);
    const hasConfig = !!appConfig;
    
    return `
    <div class="app-item">
      <div class="app-info">
        <h4>${escapeHtml(app.name)} ${hasConfig ? '[📧]' : ''}</h4>
        <div class="app-details">
          <span class="app-id">ID: ${escapeHtml(app.id)}</span>
          <span class="app-client-id">Client ID: ${escapeHtml(app.clientId)}</span>
        </div>
      </div>
      <div class="app-actions">
        <button type="button" class="configureSmtp" data-id="${app.id}" data-name="${escapeHtml(app.name)}">${hasConfig ? 'Edit SMTP' : 'Configure SMTP'}</button>
        <button type="button" class="editApp" data-id="${app.id}">Edit App</button>
        <button type="button" class="deleteApp" data-id="${app.id}">Delete</button>
      </div>
    </div>
  `;
  }).join('');
  
  appsList.innerHTML = appsHtml;
  
  // Wire up SMTP configuration buttons
  appsList.querySelectorAll('.configureSmtp').forEach(btn => 
    btn.addEventListener('click', () => {
      const appId = (btn as HTMLElement).dataset.id!;
      const appName = (btn as HTMLElement).dataset.name!;
      openAppSmtpConfigModal(appId, appName);
    })
  );
  
  // Wire up edit and delete buttons
  appsList.querySelectorAll('.editApp').forEach(btn => 
    btn.addEventListener('click', () => editApp((btn as HTMLElement).dataset.id!))
  );
  appsList.querySelectorAll('.deleteApp').forEach(btn => 
    btn.addEventListener('click', () => deleteApp((btn as HTMLElement).dataset.id!))
  );
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatRecipients(recipientsStr: string): string {
  if (!recipientsStr || recipientsStr === 'N/A') return 'N/A';
  
  try {
    const recipients = JSON.parse(recipientsStr);
    if (Array.isArray(recipients)) {
      return recipients.map((recipient: any) => {
        if (typeof recipient === 'string') {
          return escapeHtml(recipient);
        } else if (recipient && typeof recipient === 'object') {
          if (recipient.name && recipient.email) {
            return `${escapeHtml(recipient.name)} <${escapeHtml(recipient.email)}>`;
          } else if (recipient.email) {
            return escapeHtml(recipient.email);
          } else if (recipient.phone) {
            return escapeHtml(recipient.phone);
          }
        }
        return escapeHtml(String(recipient));
      }).join(', ');
    }
  } catch (e) {
    // If it's not valid JSON, treat as plain text
  }
  
  return escapeHtml(recipientsStr);
}

function formatMessage(messageStr: string): string {
  if (!messageStr || messageStr === 'N/A') return 'N/A';
  
  // First try to parse as JSON
  try {
    if (messageStr.trim().startsWith('{') || messageStr.trim().startsWith('[')) {
      const parsed = JSON.parse(messageStr);
      if (typeof parsed === 'object') {
        // If it's an object, try to extract meaningful text
        if (parsed.text) return escapeHtml(stripHtml(parsed.text));
        if (parsed.content) return escapeHtml(stripHtml(parsed.content));
        if (parsed.body) return escapeHtml(stripHtml(parsed.body));
        if (parsed.message) return escapeHtml(stripHtml(parsed.message));
        if (parsed.html) return escapeHtml(stripHtml(parsed.html));
        if (parsed.subject) return escapeHtml(stripHtml(parsed.subject));
        
        // If it's an array, try to join meaningful parts
        if (Array.isArray(parsed)) {
          const textParts = parsed.map(item => {
            if (typeof item === 'string') return stripHtml(item);
            if (item && typeof item === 'object') {
              return item.text || item.content || item.message || JSON.stringify(item);
            }
            return String(item);
          }).filter(Boolean);
          
          if (textParts.length > 0) {
            return escapeHtml(textParts.join(', '));
          }
        }
        
        // Last resort: show it's JSON data
        return '[JSON Data]';
      }
    }
  } catch (e) {
    // Not valid JSON, continue with regular processing
  }
  
  // For non-JSON content, strip HTML tags to get plain text
  return escapeHtml(stripHtml(messageStr));
}

function stripHtml(html: string): string {
  if (!html) return '';
  
  // Create a temporary div element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Extract text content and clean up whitespace
  return temp.textContent || temp.innerText || '';
}

function formatMessageForModal(messageStr: string): string {
  if (!messageStr || messageStr === 'N/A') return 'N/A';
  
  try {
    // Check if it looks like JSON
    if (messageStr.trim().startsWith('{') || messageStr.trim().startsWith('[')) {
      const parsed = JSON.parse(messageStr);
      if (typeof parsed === 'object') {
        // If it's an object, try to extract meaningful content
        if (parsed.html) {
          // For HTML content in modal, show it rendered (but sanitized)
          return sanitizeHtml(parsed.html);
        }
        if (parsed.text) return escapeHtml(parsed.text);
        if (parsed.content) return escapeHtml(parsed.content);
        if (parsed.body) return escapeHtml(parsed.body);
        if (parsed.message) return escapeHtml(parsed.message);
        
        // If no obvious content field, return formatted JSON
        return `<pre style="white-space: pre-wrap; word-wrap: break-word; background: #2a2a2a; padding: 10px; border-radius: 4px; font-size: 0.9em;">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
      }
    }
  } catch (e) {
    // If it's not valid JSON, treat as content
  }
  
  // For modal, if it looks like HTML, render it (but sanitized)
  if (messageStr.includes('<') && messageStr.includes('>')) {
    return sanitizeHtml(messageStr);
  }
  
  return escapeHtml(messageStr);
}

function sanitizeHtml(html: string): string {
  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Remove dangerous elements and attributes
  const scripts = temp.querySelectorAll('script');
  scripts.forEach(script => script.remove());
  
  const dangerous = temp.querySelectorAll('[onclick], [onload], [onerror]');
  dangerous.forEach(elem => {
    elem.removeAttribute('onclick');
    elem.removeAttribute('onload');
    elem.removeAttribute('onerror');
  });
  
  return temp.innerHTML;
}

async function editApp(appId: string) {
  const app = state.apps.find(a => a.id === appId);
  if (!app) return;
  
  const newName = prompt('Enter new app name:', app.name);
  if (newName === null || newName.trim() === '') return;
  
  try {
    await api(`/apps/${appId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: newName.trim() })
    });
    
    // Refresh the apps list
    await loadAppsForCurrentContext();
  } catch (e: any) {
    alert('Error updating app: ' + e.message);
  }
}

async function deleteApp(appId: string) {
  const app = state.apps.find(a => a.id === appId);
  if (!app) return;
  
  if (!confirm(`Are you sure you want to delete app "${app.name}"? This cannot be undone.`)) return;
  
  try {
    await api(`/apps/${appId}`, { method: 'DELETE' });
    
    // Refresh the apps list
    await loadAppsForCurrentContext();
  } catch (e: any) {
    alert('Error deleting app: ' + e.message);
  }
}

// Role context switching for superadmin
function updateRoleContext() {
  const roles: string[] = state.user?.roles || [];
  roleContext.isSuperadmin = roles.includes('superadmin');
  
  // Update role context display
  const roleContextDisplay = document.getElementById('roleContextDisplay');
  if (roleContextDisplay) {
    if (roleContext.isSuperadmin && roleContext.isInTenantContext) {
      roleContextDisplay.innerHTML = `
        <span class="context-indicator">🏢 Tenant Context: ${escapeHtml(roleContext.contextTenantName)}</span>
        <button type="button" id="exitTenantContextBtn" title="Exit tenant context">×</button>
      `;
      document.getElementById('exitTenantContextBtn')?.addEventListener('click', exitTenantContext);
    } else if (roleContext.isSuperadmin) {
      roleContextDisplay.innerHTML = `
        <span class="context-indicator">👑 Superadmin</span>
        <button type="button" id="switchTenantContextBtn" title="Switch to tenant context">🏢</button>
      `;
      document.getElementById('switchTenantContextBtn')?.addEventListener('click', showTenantContextSwitcher);
    } else {
      const tenantName = state.user?.tenantName || 'Current Tenant';
      const roleName = roles.includes('tenant_admin') ? 'Tenant Admin' : 'Editor';
      roleContextDisplay.innerHTML = `<span class="context-indicator">${roleName}: ${escapeHtml(tenantName)}</span>`;
    }
  }
  
  // Update navigation visibility based on role and context
  setRoleBasedVisibility();
}



// Role-based UI element visibility configuration
const ROLE_CAPABILITIES: Record<string, string[]> = {
  superadmin: [
    'tenantsBtn',
    'appsBtn', 
    'templateEditorBtn',
    'emailLogsBtn',
    'smsLogsBtn',
    'smtpConfigBtn',
    'smsConfigBtn',
    'composeNavBtn',
    'smsComposeNavBtn',
    'goToTenantsBtn',
    'envInfo',
    'roleContext',
    'userPane'
    // Note: topnav removed - always visible, just buttons inside are controlled
  ],
  tenant_admin: [
    'appsBtn',
    'templateEditorBtn', 
    'emailLogsBtn',
    'smsLogsBtn',
    'smtpConfigBtn',
    'smsConfigBtn',
    'composeNavBtn',
    'smsComposeNavBtn',
    'envInfo',
    'roleContext',
    'userPane'
    // Note: tenantsBtn and goToTenantsBtn explicitly NOT included
  ],
  editor: [
    'userPane'
    // Very minimal - just enough to function
  ]
};

function setRoleBasedVisibility() {
  const roles: string[] = state.user?.roles || [];
  const isSuperadmin = roles.includes('superadmin');
  const isTenantAdmin = roles.includes('tenant_admin');
  const isEditor = roles.includes('editor');
  
  // Determine primary role (highest privilege wins)
  let currentRole = 'unknown';
  if (isSuperadmin) currentRole = 'superadmin';
  else if (isTenantAdmin) currentRole = 'tenant_admin';
  else if (isEditor) currentRole = 'editor';
  
  // Get allowed capabilities for this role
  const allowedCapabilities = ROLE_CAPABILITIES[currentRole] || [];
  
  // Define all UI elements that can be controlled
  const allUIElements: Record<string, HTMLElement | null> = {
    tenantsBtn: document.querySelector('.navBtn[data-view="tenants"]'),
    appsBtn: document.querySelector('.navBtn[data-view="apps"]'),
    templateEditorBtn: document.getElementById('templateEditorNavBtn'),
    emailLogsBtn: document.getElementById('emailLogsNavBtn'),
    smsLogsBtn: document.getElementById('smsLogsNavBtn'),
    smtpConfigBtn: document.querySelector('[data-view="smtp-config"]'),
    smsConfigBtn: document.querySelector('[data-view="sms-config"]'),
    composeNavBtn: document.querySelector('[data-view="compose"]'),
    smsComposeNavBtn: document.querySelector('[data-view="sms-compose"]'),
    goToTenantsBtn: document.getElementById('goToTenantsBtn'),
    envInfo: document.getElementById('envInfo'),
    roleContext: document.getElementById('roleContext'),
    userPane: document.getElementById('userPane')
    // Note: topnav removed - always visible, just buttons inside are controlled
  };
  
  // Apply visibility: show only what's explicitly allowed for this role
  Object.entries(allUIElements).forEach(([elementName, element]) => {
    if (!element) return; // Element doesn't exist in DOM
    
    const isAllowed = allowedCapabilities.includes(elementName);
    
    if (isAllowed) {
      // Show element (use appropriate display style with !important to override CSS)
      if (elementName.includes('Btn') || elementName.includes('Nav')) {
        const displayValue = elementName === 'topnav' ? 'flex' : 
                            elementName === 'userPane' ? 'flex' :
                            elementName.includes('Config') ? 'block' : 'inline-block';
        element.style.setProperty('display', displayValue, 'important');
      } else {
        const displayValue = elementName === 'userPane' ? 'flex' : 'block';
        element.style.setProperty('display', displayValue, 'important');
      }
    } else {
      // Hide or remove element
      if (elementName === 'goToTenantsBtn' || elementName === 'tenantsBtn') {
        // Remove these completely from DOM for non-superadmins
        element.remove();
      } else {
        element.style.setProperty('display', 'none', 'important');
      }
    }
  });
  
  // Handle app integration contexts - override normal visibility
  const urlParams = new URLSearchParams(window.location.search);
  const returnUrl = urlParams.get('returnUrl') || localStorage.getItem('editorReturnUrl');
  const currentView = urlParams.get('view');
  
  // External log viewing: hide most UI except userPane for return button  
  const isExternalLogViewing = returnUrl && (currentView === 'email-logs' || currentView === 'sms-logs');
  
  // App integration compose: hide navigation when coming from app for compose
  const isAppIntegratedCompose = returnUrl && !isExternalLogViewing;
  
  if (isExternalLogViewing) {
    // For external log viewing, hide most UI except userPane for return button
    ['envInfo', 'roleContext', 'composeNavBtn', 'smsComposeNavBtn'].forEach(elementName => {
      const element = allUIElements[elementName];
      if (element) element.style.setProperty('display', 'none', 'important');
    });
    // Hide the entire topnav for external navigation
    const topnav = document.querySelector('.topnav') as HTMLElement;
    if (topnav) topnav.style.setProperty('display', 'none', 'important');
    
    // Keep userPane visible for return functionality
    if (allUIElements.userPane) allUIElements.userPane.style.setProperty('display', 'flex', 'important');
    
  } else if (isAppIntegratedCompose) {
    // For compose views from apps, hide navigation and header return button
    ['envInfo', 'roleContext', 'userPane'].forEach(elementName => {
      const element = allUIElements[elementName];
      if (element) element.style.setProperty('display', 'none', 'important');
    });
    // Hide the entire topnav for app-integrated compose
    const topnav = document.querySelector('.topnav') as HTMLElement;
    if (topnav) topnav.style.setProperty('display', 'none', 'important');
    
    // The compose forms will handle their own Cancel buttons for returning to apps
  }
}

function showTenantContextSwitcher() {
  const modal = document.getElementById('contextSwitchModal');
  if (modal) {
    modal.style.display = 'flex';
    loadTenantsForContextSwitch();
  }
}

async function loadTenantsForContextSwitch() {
  const tenantsList = document.getElementById('contextTenantsList');
  if (!tenantsList) return;
  
  try {
    const tenants: Tenant[] = await api('/tenants');
    const tenantsHtml = tenants.map(tenant => `
      <div class="tenant-context-option" data-tenant-id="${tenant.id}">
        <span class="tenant-name">${escapeHtml(tenant.name)}</span>
        <button type="button" class="switchToTenant" data-tenant-id="${tenant.id}" data-tenant-name="${tenant.name}">
          Switch
        </button>
      </div>
    `).join('');
    
    tenantsList.innerHTML = tenantsHtml;
    
    // Wire up switch buttons
    tenantsList.querySelectorAll('.switchToTenant').forEach(btn => {
      btn.addEventListener('click', () => {
        const tenantId = (btn as HTMLElement).dataset.tenantId!;
        const tenantName = (btn as HTMLElement).dataset.tenantName!;
        switchToTenantContext(tenantId, tenantName);
      });
    });
  } catch (e) {
    tenantsList.innerHTML = '<div class="error">Failed to load tenants</div>';
  }
}

// App creation functionality
async function createApp(event: Event) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  
  const name = formData.get('appName') as string;
  const clientId = formData.get('clientId') as string;
  
  if (!name?.trim()) {
    alert('App name is required');
    return;
  }
  
  if (!clientId?.trim()) {
    alert('Client ID is required');
    return;
  }
  
  const targetTenantId = roleContext.isInTenantContext ? roleContext.contextTenantId : 
                         (state.user?.tenantId || '');
  
  if (!targetTenantId) {
    alert('No tenant context available for app creation');
    return;
  }
  
  try {
    await api('/apps', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        clientId: clientId.trim(),
        tenantId: targetTenantId
      })
    });
    
    // Clear form and refresh apps list
    form.reset();
    await loadAppsForCurrentContext();
  } catch (e: any) {
    alert('Error creating app: ' + e.message);
  }
}

// Wire up forms and context switching
function wireAppManagement() {
  // App creation form
  const appForm = document.getElementById('appForm') as HTMLFormElement;
  if (appForm) {
    appForm.addEventListener('submit', createApp);
  }
  
  // Context switch modal close
  const closeModalBtn = document.getElementById('closeContextModal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      const modal = document.getElementById('contextSwitchModal');
      if (modal) modal.style.display = 'none';
    });
  }
  
  // Close modal when clicking outside
  const modal = document.getElementById('contextSwitchModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }
}

function showView(view: string) {
  const roles: string[] = state.user?.roles || [];
  const isEditorOnly = roles.includes('editor') && !roles.some((r: string)=> r==='tenant_admin' || r==='superadmin');
  const isTenantAdmin = roles.includes('tenant_admin') || roles.includes('superadmin');
  
  // Restrict editor-only users to compose views only (email or SMS)
  if (isEditorOnly && view !== 'compose' && view !== 'sms-compose') {
    console.log(`[ui-auth] Editor-only user attempted to access ${view}, redirecting to compose`);
    view = 'compose';
  }
  
  // Restrict template editor to tenant admins only
  if (view === 'template-editor' && !isTenantAdmin) {
    console.log(`[ui-auth] Non-tenant_admin user attempted to access template editor, redirecting to compose`);
    view = 'compose';
  }
  
  // All views are now managed by ViewRegistry - delegate everything
  viewRegistry.showView(view, roles);
}

// Global view registry instance
const viewRegistry = ViewRegistry.getInstance();

async function initializeViews(): Promise<void> {
  debugLog('ViewRegistry', 'Initializing views...');
  console.log('[ViewRegistry] Initializing views...');
  
  // Create view instances (they auto-register themselves in their constructors)
  const composeView = new ComposeView();
  const smsComposeView = new SmsComposeView();
  const templateEditorView = new TemplateEditorView();
  const appsView = new AppsView();
  const tenantsView = new TenantsView();
  const smtpConfigView = new SmtpConfigView();
  const smsConfigView = new SmsConfigView();
  const emailLogsView = new EmailLogsView();
  const smsLogsView = new SmsLogsView();
  
  // Make log views globally accessible for onclick handlers
  (window as any).emailLogsView = emailLogsView;
  (window as any).smsLogsView = smsLogsView;
  
  // Initialize all views
  await composeView.initialize();
  await smsComposeView.initialize();
  await templateEditorView.initialize();
  await appsView.initialize();
  await tenantsView.initialize();
  await smtpConfigView.initialize();
  await smsConfigView.initialize();
  await emailLogsView.initialize();
  await smsLogsView.initialize();
  
  debugLog('ViewRegistry', 'Views initialized and registered');
  console.log('[ViewRegistry] Views initialized and registered');
  
  // Complete view initialization precondition
  const preconditionManager = PreconditionManager.getInstance();
  preconditionManager.completePrecondition('view-initialization');
  
  // Ensure navigation visibility is correct after all views are initialized
  setRoleBasedVisibility();
}

async function wireNav() {
  const roles: string[] = state.user?.roles || [];
  
  document.querySelectorAll<HTMLButtonElement>('button.btn[data-view]').forEach(btn => 
    btn.addEventListener('click', async () => {
      await viewRegistry.showView(btn.dataset.view!, roles);
      savePageState();
    })
  );
  
  // Check for view parameter in URL first
  const urlParams = new URLSearchParams(window.location.search);
  const requestedView = urlParams.get('view');
  
  // Determine the appropriate default view
  const isSuperadmin = roles.includes('superadmin');
  
  let defaultView = 'compose'; // Default for tenant admins and editors
  
  if (isSuperadmin && !roleContext.isInTenantContext) {
    // Superadmin in global context should see Config view
    defaultView = 'smtp-config';
  }
  
  // Use URL parameter if provided, otherwise use default
  const viewToShow = requestedView || defaultView;
  
  // DON'T call showView here - it creates race conditions with preconditions
  // The view will be shown by the URL routing system after all preconditions complete
  debugLog('VIEW-FLOW', `wireNav: Will show view ${viewToShow} after preconditions complete`);
}

// Manage Tenants button (in compose context panel)
document.getElementById('goToTenantsBtn')?.addEventListener('click', () => showView('tenants'));

// Note: Removed old title override to allow proper HTML structure with appTitle/viewFunction elements

document.getElementById('quickSendForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!tenantId || !appId) { showStatusMessage(document.getElementById('quickSendStatus') as HTMLElement, 'Select tenant/app first'); return; }
  const fd = new FormData(e.target as HTMLFormElement);
  const subject = fd.get('qsSubject') as string;
  const html = fd.get('qsHtml') as string;
  const text = fd.get('qsText') as string;
  const recipients = (fd.get('qsRecipients') as string || '').split(/\n+/).map(s=>s.trim()).filter(Boolean).map(e=>({ email: e }));
  if (!recipients.length) { showStatusMessage(document.getElementById('quickSendStatus') as HTMLElement, 'Recipients required'); return; }
  const btn = (e.target as HTMLFormElement).querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  try { await api('/send-now', { method:'POST', body: JSON.stringify({ appId, subject, html, text, recipients }) }); showStatusMessage(document.getElementById('quickSendStatus') as HTMLElement, 'Queued ✔'); await listGroups(); }
  catch (err:any) { showStatusMessage(document.getElementById('quickSendStatus') as HTMLElement, 'Error: '+err.message); }
  finally { btn.disabled = false; }
});

async function init() {
  debugLog('VIEW-FLOW', 'main: Calling init() for authentication and setup');
  
  // Set up precondition system
  const preconditionManager = PreconditionManager.getInstance();
  preconditionManager.registerPrecondition('authentication');
  preconditionManager.registerPrecondition('config-loading');
  preconditionManager.registerPrecondition('view-initialization');
  
  // Set up view visibility instrumentation early
  setupViewVisibilityInstrumentation();
  
  debugLog('VIEW-FLOW', 'init: ENTRY: init() function called');
  
  await detectMode();
  debugLog('VIEW-FLOW', 'init: detectMode() completed');
  
  debugLog('VIEW-FLOW', 'init: Starting config loading');
  
  // Load dynamic UI config
  try {
    // If not already injected, fetch config.js and evaluate (simple pattern)
    if (!uiConfig.returnUrl) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script'); s.src = '/ui/config.js'; s.onload = ()=> resolve(); s.onerror = ()=> reject(new Error('config load failed')); document.head.appendChild(s);
      });
      uiConfig = (window as any).__MAIL_UI_CONFIG__ || {};
    }
    try { console.debug('[ui-auth] config loaded', { returnUrl: uiConfig.returnUrl, idp: uiConfig.idpLoginUrl }); } catch {}
  } catch {
    // non-fatal; fallback to current origin
  }

  // Initial debug of page state
  try {
    console.debug('[ui-auth] init', {
      href: window.location.href,
      lsToken: !!authToken,
      configReturn: uiConfig?.returnUrl,
      idp: uiConfig?.idpLoginUrl
    });
  } catch {}

  // Accept token passed via URL strictly as a query parameter: ?token=JWT
  const url = new URL(window.location.href);
  // Capture multi-tenant/app hints from URL if provided by the referring app
  const tenantHint = url.searchParams.get('tenantId');
  const clientIdHint = url.searchParams.get('clientId');
  const appIdHint = url.searchParams.get('appId') || url.searchParams.get('app');
  // Only apply hints if not returning from IDP (to avoid overriding superadmin global context)
  const hasTokenParam = !!url.searchParams.get('token');
  if (tenantHint && !hasTokenParam) { try { localStorage.setItem('tenantId', tenantHint); tenantId = tenantHint; } catch {} }
  if (clientIdHint) { try { localStorage.setItem('appClientIdHint', clientIdHint); } catch {} }
  if (appIdHint) { try { localStorage.setItem('appIdHint', appIdHint); } catch {} }
  
  // Load custom CSS for the application
  if (appIdHint) {
    await loadCustomCSS(appIdHint);
  }
  
  const tokenFromUrl = url.searchParams.get('token');
  // Distinguish between coming from IDP vs being called directly from another app
  // If there are specific view parameters like view=email-logs, this is likely a direct call
  const hasViewParam = url.searchParams.has('view');
  const cameFromIdp = !!tokenFromUrl && !hasViewParam;
  console.log('[DEBUG] Token detection - tokenFromUrl:', !!tokenFromUrl, 'hasViewParam:', hasViewParam, 'cameFromIdp:', cameFromIdp);
  console.log('[DEBUG] URL token preview:', tokenFromUrl ? tokenFromUrl.substring(0, 50) + '...' : 'none');
  console.log('[DEBUG] Full token details:', {
    hasUrlToken: !!tokenFromUrl,
    tokenLength: tokenFromUrl?.length || 0,
    existingStoredToken: !!localStorage.getItem('authToken'),
    existingTokenLength: localStorage.getItem('authToken')?.length || 0
  });
  
  if (tokenFromUrl) {
    console.log('[DEBUG] Processing URL token - length:', tokenFromUrl.length);
    authToken = tokenFromUrl;
    // Force clear any old tokens first
    try { localStorage.removeItem('authToken'); } catch {}
    // Set the new token with immediate verification
    try { 
      localStorage.setItem('authToken', authToken);
      const verifyToken = localStorage.getItem('authToken');
      console.debug('[ui-auth] token accepted from URL', { 
        len: tokenFromUrl.length,
        stored: !!verifyToken,
        match: verifyToken === tokenFromUrl
      });
    } catch (e) {
      console.error('[ui-auth] Failed to store token:', e);
    }
    url.searchParams.delete('token');
    history.replaceState({}, '', url.toString());
    // Clear the one-time redirect flag after arriving back from IDP
    try { sessionStorage.removeItem('idpRedirected'); } catch {}
  } else {
    // Check if we have a stored token
    const storedToken = localStorage.getItem('authToken');
    if (storedToken) {
      authToken = storedToken;
      console.log('[DEBUG] Using stored token:', { length: storedToken.length });
    } else {
      console.log('[DEBUG] No token found in URL or localStorage');
    }
  }

  // load user context if auth enabled (ignore errors if auth disabled)
  let authDisabled = false;
  try { 
    console.debug('[ui-auth] Calling /me with token:', authToken ? `${authToken.substring(0, 20)}...` : 'none');
    state.user = await api('/me'); 
    console.debug('[ui-auth] /me response:', state.user ? 'user found' : 'null response');
    console.log('[DEBUG] Full /me response:', JSON.stringify(state.user, null, 2));
    
    // If /me returns null but succeeds, auth is disabled
    if (state.user === null) {
      authDisabled = true;
      console.debug('[ui-auth] Authentication disabled, proceeding without user context');
    }
  } catch (e:any) { 
    console.debug('[ui-auth] /me failed with token from IDP:', cameFromIdp, 'error:', e?.message||e); 
    if (cameFromIdp) {
      console.error('[ui-auth] Token from IDP failed validation - this suggests an auth configuration issue');
    } else if (authToken) {
      // If we have a stored token that failed validation, it's likely expired
      console.debug('[ui-auth] Stored token failed validation (likely expired), clearing idpRedirected flag for fresh redirect');
      try { sessionStorage.removeItem('idpRedirected'); } catch {}
      try { sessionStorage.removeItem('idpRedirectedHints'); } catch {}
      // Also clear the expired token
      authToken = null;
      localStorage.removeItem('authToken');
    }
    state.user = null; 
  }
  
  if (!state.user && !authDisabled) {
    console.debug('[ui-auth] No user found and auth enabled, checking IDP redirect...');
    
    // Special case: if we came from IDP but token validation failed, show error
    if (cameFromIdp) {
      console.error('[ui-auth] Came from IDP but token validation failed');
      const statusEl = document.getElementById('loginStatus');
      if (statusEl) {
        statusEl.textContent = 'Token from IDP failed validation. Please check auth configuration.';
        statusEl.style.color = 'red';
      }
      showLogin();
      return;
    }
    
    // If an IDP login URL is configured, redirect to it with a returnUrl
    const idp = uiConfig.idpLoginUrl as string | null;
    console.debug('[ui-auth] IDP URL:', idp);
    if (idp) {
      // Prevent infinite redirect loop: only auto-redirect once per page load/session
      const alreadyRedirected = (() => { try { return sessionStorage.getItem('idpRedirected') === '1'; } catch { return false; } })();
      console.debug('[ui-auth] Already redirected?', alreadyRedirected, 'Came from IDP?', cameFromIdp);
      if (!cameFromIdp && !alreadyRedirected) {
        // Save current URL parameters before redirecting to IDP
        const currentUrl = new URL(window.location.href);
        const urlParams = Object.fromEntries(currentUrl.searchParams.entries());
        console.debug('[ui-auth] Saving URL parameters before IDP redirect:', urlParams);
        
        try {
          localStorage.setItem('preIdpUrlParams', JSON.stringify(urlParams));
        } catch (e) {
          console.warn('[ui-auth] Failed to save URL parameters:', e);
        }
        
        const ret = (uiConfig.returnUrl as string) || (window.location.origin + '/ui/');
        const redirect = new URL(idp);
        redirect.searchParams.set('return', ret);
        // Forward multi-tenant/app hints to IDP so they are embedded in the token
        const fTenant = tenantId || tenantHint || '';
        const fClient = (clientIdHint || localStorage.getItem('appClientIdHint') || '') as string;
        const extractedAppId = authToken ? extractAppIdFromToken(authToken) : null;
        const fAppId = (appId || appIdHint || localStorage.getItem('appIdHint') || extractedAppId || 'unknown') as string;
        
        console.log('[IDP-DEBUG] Redirect params:', { 
          tenantId, tenantHint, appId, appIdHint,
          fTenant, fClient, fAppId,
          localStorage_appIdHint: localStorage.getItem('appIdHint'),
          localStorage_appClientIdHint: localStorage.getItem('appClientIdHint')
        });
        
        if (fTenant) redirect.searchParams.set('tenantId', fTenant);
        if (fClient) redirect.searchParams.set('clientId', fClient);
        if (fAppId) redirect.searchParams.set('appId', fAppId); // Always send appId if we have one
        console.debug('[ui-auth] Setting idpRedirected flag and redirecting to:', redirect.toString());
        try { console.debug('[ui-auth] redirecting to IDP', { ret, to: redirect.toString() }); } catch {}
        try { sessionStorage.setItem('idpRedirected', '1'); } catch {}
        window.location.href = redirect.toString();
        return;
      } else {
        console.debug('[ui-auth] Skipping redirect - cameFromIdp:', cameFromIdp, 'alreadyRedirected:', alreadyRedirected);
      }
    } else {
      console.debug('[ui-auth] No IDP URL configured');
    }
    // Otherwise, show manual token login overlay and stop initialization
    showLogin();
    return;
  }
  // If already authenticated but arrived with app/tenant hints, refresh token via IDP once
  if (state.user && (clientIdHint || appIdHint || tenantHint) && uiConfig.idpLoginUrl) {
    const mismatch = (
      (clientIdHint && clientIdHint !== (state.user.appClientId||'')) ||
      (appIdHint && appIdHint !== (state.user.appId||'')) ||
      (tenantHint && tenantHint !== (state.user.tenantId||'')) ||
      (!state.user.appClientId && clientIdHint) || (!state.user.appId && appIdHint)
    );
    const already = (()=>{ try { return sessionStorage.getItem('idpRedirectedHints')==='1'; } catch { return false; } })();
    if (mismatch && !cameFromIdp && !already) {
      try { sessionStorage.setItem('idpRedirectedHints','1'); } catch {}
      const ret = (uiConfig.returnUrl as string) || (window.location.origin + '/ui/');
      const redirect = new URL(uiConfig.idpLoginUrl);
      redirect.searchParams.set('return', ret);
      if (tenantHint) redirect.searchParams.set('tenantId', tenantHint);
      if (clientIdHint) redirect.searchParams.set('clientId', clientIdHint);
      if (appIdHint && !clientIdHint) redirect.searchParams.set('appId', appIdHint);
      window.location.href = redirect.toString();
      return;
    }
  }
  // If we arrived with a fresh token, immediately reflect authenticated UI
  if (cameFromIdp && state.user) {
    onAuthenticated(true); // Fresh authentication from IDP
    return;
  }

  // If we have a user (whether from IDP or pre-existing token), show authenticated UI
  if (state.user) {
    onAuthenticated(false); // Pre-existing session - restore state
  }

  // Role based UI adjustments for editor-only users
  const roleList: string[] = state.user?.roles || [];
  const isEditorOnly = roleList.includes('editor') && !roleList.some(r=> r==='tenant_admin' || r==='superadmin');
  
  if (isEditorOnly) {
    // Hide tenant creation & app creation panels if present (compose context should only allow selecting existing)
    const tenantPanel = document.getElementById('tenantAppPanel');
    // editors should not see Manage Tenants button
    document.getElementById('goToTenantsBtn')?.remove();
  }
  
  // Update navigation visibility based on roles
  setRoleBasedVisibility();
  // Load tenants if superadmin or if auth is disabled (for SMTP config to work)
  if (roleList.includes('superadmin') || authDisabled) { await loadTenants(); }
  // Load apps if we have a tenantId or if auth is disabled - but skip for editor-only users
  if (!isEditorOnly) {
    if (tenantId) {
      await loadApps(); // Load apps for specific tenant
    } else if (authDisabled) {
      await loadAllApps(); // Load all apps for SMTP config dropdowns
    }
  }
  // If appId from token is present, prefer it for initial context
  if (state.user?.appId && (!appId || appId !== state.user.appId)) {
    appId = state.user.appId; try { localStorage.setItem('appId', appId); } catch {}
  }
  updateEnvInfo();
  
  // Skip legacy template/group loading when on compose view
  const urlParams = new URLSearchParams(window.location.search);
  const currentView = urlParams.get('view');
  if (currentView !== 'compose') {
    if (tenantId) await listTemplates();
    if (tenantId) await listGroups();
  }
  // wireNav() is already called in onAuthenticated() - no need to call again
  wireAppManagement();
  
  // Skip admin-only configuration setup for editor-only users
  if (!isEditorOnly) {
    setupSmtpConfig();
    setupSmsConfig();
  }
  
  // Set up browser history handling
  setupHistoryHandling();
}

// ============= Page State Preservation =============

interface PageState {
  currentView?: string;
  tenantId?: string;
  tenantName?: string;
  smtpConfigView?: boolean;
  inTenantContext?: boolean;
  contextType?: 'global' | 'tenant' | 'app';
  appId?: string;
  viewState?: any; // View-specific state from ViewRegistry
}

function savePageState() {
  try {
    const currentView = getCurrentView();
    const inTenantContext = roleContext.isInTenantContext;
    
    // Get view-specific state from ViewRegistry
    const viewState = viewRegistry.saveCurrentViewState();
    
    const state: PageState = {
      currentView: currentView,
      tenantId: tenantId || undefined,
      tenantName: roleContext.contextTenantName || undefined,
      smtpConfigView: document.getElementById('view-smtp-config')?.style.display !== 'none',
      inTenantContext: inTenantContext,
      contextType: inTenantContext ? 'tenant' : 'global',
      appId: getAppIdFromViewState(currentView, viewState) || undefined,
      viewState: viewState
    };
    
    console.debug('[page-state] Saving state:', state);
    localStorage.setItem('pageState', JSON.stringify(state));
    
    // Also save to browser history
    saveToHistory(state);
  } catch (error) {
    console.debug('Failed to save page state:', error);
  }
}

function getAppIdFromViewState(currentView: string, viewState: any): string | null {
  if (viewState && viewState.currentAppId) {
    return viewState.currentAppId;
  }
  
  // Fallback for legacy state
  if (currentView === 'compose' && composeState?.currentAppId) {
    return composeState.currentAppId;
  }
  
  return null;
}

function saveToHistory(state: PageState) {
  try {
    // Create a URL that represents the current state
    const url = new URL(window.location.href);
    url.pathname = '/ui/';
    url.search = ''; // Clear any existing query params
    
    if (state.tenantId) {
      url.searchParams.set('tenant', state.tenantId);
    }
    
    // Set view parameter based on current state
    if (state.currentView) {
      url.searchParams.set('view', state.currentView);
    }
    
    // Add appId for compose view
    if (state.appId && state.currentView === 'compose') {
      url.searchParams.set('appId', state.appId);
    }
    
    // Add context type for better restoration
    if (state.contextType && state.contextType !== 'global') {
      url.searchParams.set('context', state.contextType);
    }
    
    const newUrl = url.toString();
    console.debug('[page-state] Saving to history:', { state, url: newUrl });
    
    // Push to history if different from current URL
    if (newUrl !== window.location.href) {
      history.pushState(state, '', newUrl);
      console.debug('[page-state] Pushed new history state');
    } else {
      // Just replace the current state with updated data
      history.replaceState(state, '', newUrl);
      console.debug('[page-state] Replaced current history state');
    }
  } catch (error) {
    console.error('Failed to save to history:', error);
  }
}

async function restorePageState() {
  try {
    debugLog('page-state', 'Starting page state restoration');
    
    // CRITICAL: This function now assumes all preconditions are met
    // because it should only be called after ViewRegistry.showView waits for them
    
    // First try to restore from URL parameters
    const url = new URL(window.location.href);
    const urlTenantId = url.searchParams.get('tenant');
    const urlView = url.searchParams.get('view');
    const urlContext = url.searchParams.get('context');
    
    debugLog('page-state', 'URL params:', { urlTenantId, urlView, urlContext });
    
    if (urlTenantId || urlView) {
      // Restore tenant context first if needed
      if (urlTenantId && urlTenantId !== tenantId) {
        console.debug('[page-state] Switching to tenant from URL:', urlTenantId);
        
        // Find tenant name from loaded tenants
        const tenant = (window as any).state?.tenants?.find((t: any) => t.id === urlTenantId);
        console.debug('[page-state] Found tenant:', tenant);
        
        if (tenant) {
          // Use the original function directly to avoid circular calls
          // ALWAYS skip view switch during page restoration - ViewRegistry will handle the view
          if (originalSwitchToTenantContext) {
            originalSwitchToTenantContext(urlTenantId, tenant.name, true);
          } else {
            // Fallback to global function
            (window as any).switchToTenantContext(urlTenantId, tenant.name, true);
          }
          
          // If this is a tenant-apps view, the switchToTenantContext already set the view
          if (urlView === 'tenant-apps') {
            console.debug('[page-state] Tenant apps view set by switchToTenantContext');
            return;
          }
        } else {
          console.warn('[page-state] Tenant not found:', urlTenantId);
        }
      }
      
      // Then restore the view
      if (urlView) {
        debugLog('page-state', `Switching to view from URL: ${urlView}`);
        
        // Handle different view types
        switch (urlView) {
          case 'tenant-apps':
            // This is the tenant's apps view - the switchToTenantContext above should have set this up
            // No need to call showView again as switchToTenantContext calls showView('apps')
            debugLog('page-state', 'Tenant apps view - context already set by switchToTenantContext');
            break;
          case 'smtp-config':
            // This is the global SMTP config view
            showView('smtp-config');
            break;
          case 'apps':
            showView('apps');
            break;
          case 'tenants':
            showView('tenants');
            break;
          case 'compose':
          case 'template-editor':
          case 'email-logs':
          case 'sms-logs':
          case 'sms-compose':
            // Use ViewRegistry for managed views
            const roles: string[] = state.user?.roles || [];
            await viewRegistry.showView(urlView, roles);
            
            // Restore saved state for compose and template-editor views after activation
            if (urlView === 'template-editor' && tenantId) {
              // Get the current app ID from the global state
              const currentAppId = getCurrentAppId();
              if (currentAppId) {
                const savedState = localStorage.getItem(`templateEditorState_${currentAppId}`);
                if (savedState) {
                  try {
                    const state = JSON.parse(savedState);
                    await viewRegistry.restoreViewState('template-editor', state);
                    console.debug('[page-state] Restored template editor state');
                  } catch (error) {
                    console.warn('[page-state] Failed to restore template editor state:', error);
                  }
                }
              }
            } else if (urlView === 'compose' && tenantId) {
              // Get the current app ID from the global state
              const currentAppId = getCurrentAppId();
              if (currentAppId) {
                const savedState = localStorage.getItem(`composeState_${currentAppId}`);
                if (savedState) {
                  try {
                    const state = JSON.parse(savedState);
                    await viewRegistry.restoreViewState('compose', state);
                    console.debug('[page-state] Restored compose state');
                  } catch (error) {
                    console.warn('[page-state] Failed to restore compose state:', error);
                  }
                }
              }
            }
            break;
          default:
            debugLog('page-state', `Unknown view type: ${urlView}`);
            showView(urlView); // Try anyway
        }
      }
      debugLog('page-state', 'Page state restoration completed');
      return;
    }
    
    // Fallback to localStorage
    const savedState = localStorage.getItem('pageState');
    if (!savedState) {
      console.debug('[page-state] No saved state found');
      return;
    }
    
    console.debug('[page-state] Restoring from localStorage');
    const savedPageState: PageState = JSON.parse(savedState);
    console.debug('[page-state] Saved state:', savedPageState);
    
    // Restore tenant context if it was saved
    if (savedPageState.tenantId && savedPageState.tenantId !== tenantId) {
      console.debug('[page-state] Switching to saved tenant:', savedPageState.tenantId);
      
      // Use the original function to avoid recursive calls, and skip view switch since we'll restore the saved view
      if (originalSwitchToTenantContext) {
        originalSwitchToTenantContext(savedPageState.tenantId, savedPageState.tenantName || '', true);
      } else {
        // Fallback to global function
        (window as any).switchToTenantContext(savedPageState.tenantId, savedPageState.tenantName || '', true);
      }
      
      // If this was a tenant-apps view, switchToTenantContext already set the view
      if (savedPageState.currentView === 'tenant-apps') {
        console.debug('[page-state] Tenant apps view set by switchToTenantContext');
        return;
      }
    }
    
    // Restore view based on saved state
    if (savedPageState.currentView) {
      console.debug('[page-state] Restoring saved view:', savedPageState.currentView);
      
      // Handle view restoration based on context
      if (savedPageState.currentView === 'tenant-apps') {
        // Tenant apps view - if we switched tenant context above, the view is already set
        console.debug('[page-state] Tenant apps view - context should be set by switchToTenantContext');
      } else if (savedPageState.currentView === 'smtp-config') {
        showView('smtp-config');
      } else {
        // Use ViewRegistry for managed views
        const roles: string[] = state.user?.roles || [];
        await viewRegistry.showView(savedPageState.currentView, roles);
        
        // Restore view-specific state if available
        if (savedPageState.viewState) {
          await viewRegistry.restoreViewState(savedPageState.currentView, savedPageState.viewState);
        }
      }
    }
    
  } catch (error) {
    console.error('Failed to restore page state:', error);
  }
}

function getCurrentView(): string {
  // Use ViewRegistry if available
  const currentViewName = viewRegistry.getCurrentViewName();
  if (currentViewName) {
    return currentViewName;
  }
  
  // Fallback to DOM inspection for views not yet in registry
  const isSmtpConfigVisible = document.getElementById('view-smtp-config')?.style.display !== 'none';
  const isTenantsVisible = document.getElementById('view-tenants')?.style.display !== 'none';
  const isAppsVisible = document.getElementById('view-apps')?.style.display !== 'none';
  
  // If apps view is visible and we're in tenant context, it's the tenant apps view
  if (isAppsVisible && roleContext.isInTenantContext) {
    return 'tenant-apps';
  }
  
  // If SMTP config is visible (global tree view)
  if (isSmtpConfigVisible) {
    return 'smtp-config';
  }
  
  // If apps view is visible but not in tenant context, it's general apps management
  if (isAppsVisible && !roleContext.isInTenantContext) {
    return 'apps';
  }
  
  // If tenants view is visible, it's the tenants management view
  if (isTenantsVisible) {
    return 'tenants';
  }
  
  // Default to compose
  return 'compose';
}

// Enhanced navigation functions
function enhancedShowView(viewName: string) {
  showView(viewName);
  savePageState();
}

// Override navigation functions to save state
const originalSwitchToTenantContext = (window as any).switchToTenantContext;
function enhancedSwitchToTenantContext(newTenantId: string, tenantName: string, skipViewSwitch?: boolean) {
  if (originalSwitchToTenantContext) {
    originalSwitchToTenantContext(newTenantId, tenantName, skipViewSwitch);
  }
  savePageState();
}

// Handle browser back/forward buttons
function setupHistoryHandling() {
  window.addEventListener('popstate', (event) => {
    console.debug('[page-state] Popstate event:', event.state);
    
    if (event.state) {
      // Restore from history state
      const historyState: PageState = event.state;
      
      if (historyState.tenantId && historyState.tenantId !== tenantId) {
        console.debug('[page-state] Restoring tenant from history:', historyState.tenantId);
        
        // Switch to the tenant context without saving to history again
        if (originalSwitchToTenantContext) {
          originalSwitchToTenantContext(historyState.tenantId, historyState.tenantName || '');
        }
      }
      
      if (historyState.currentView) {
        console.debug('[page-state] Restoring view from history:', historyState.currentView);
        
        // Handle different view types during popstate
        switch (historyState.currentView) {
          case 'tenant-apps':
            // Tenant context should already be set above, and switchToTenantContext calls showView('apps')
            console.debug('[page-state] Tenant apps view - should be set by tenant context switch');
            break;
          case 'smtp-config':
            showView('smtp-config');
            break;
          default:
            showView(historyState.currentView);
        }
      }
    } else {
      // Fallback: try to restore from URL
      console.debug('[page-state] No history state, trying URL restoration');
      
      const url = new URL(window.location.href);
      const urlTenantId = url.searchParams.get('tenant');
      const urlView = url.searchParams.get('view');
      
      if (urlTenantId && urlTenantId !== tenantId) {
        const tenant = (window as any).state?.tenants?.find((t: any) => t.id === urlTenantId);
        if (tenant && originalSwitchToTenantContext) {
          originalSwitchToTenantContext(urlTenantId, tenant.name);
        }
      }
      
      if (urlView) {
        switch (urlView) {
          case 'tenant-apps':
            // Tenant context switching should handle the view
            console.debug('[page-state] Tenant apps fallback - context should be set');
            break;
          default:
            showView(urlView);
        }
      }
    }
  });
  
  // Replace the initial history entry to prevent going back to IDP
  if (window.location.search.includes('token=')) {
    console.debug('[page-state] Replacing IDP history entry');
    // We came from IDP, replace this history entry
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = '';
    history.replaceState({ currentView: 'compose' }, '', cleanUrl.toString());
  }
}

// Replace the global function
(window as any).switchToTenantContext = enhancedSwitchToTenantContext;

// ============= SMTP Configuration =============

interface SmtpConfig {
  id: string;
  scope: 'GLOBAL' | 'TENANT' | 'APP';
  tenantId?: string;
  appId?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromAddress?: string;
  fromName?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  awsRegion?: string;
  service?: 'smtp' | 'ses';
  provider?: 'smtp' | 'ses'; // for backwards compatibility
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  tenantName?: string;
  appName?: string;
  // Legacy field names for backwards compatibility
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFromAddress?: string;
  smtpFromName?: string;
}

interface SmsConfig {
  id: string;
  scope: 'GLOBAL' | 'TENANT' | 'APP';
  tenantId?: string;
  appId?: string;
  sid: string;
  token: string;
  fromNumber: string;
  fallbackTo?: string;
  serviceSid?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  tenantName?: string;
  appName?: string;
}

function exitTenantContext() {
  roleContext.isInTenantContext = false;
  roleContext.contextTenantId = '';
  roleContext.contextTenantName = '';
  
  // Clear context from localStorage
  localStorage.removeItem('contextTenantId');
  localStorage.removeItem('contextTenantName');
  
  // Update UI
  updateRoleContext();
  
  // Switch to tenants view
  showView('tenants');
}

let currentSmtpConfig: SmtpConfig | null = null;
let selectedTreeNode: {scope: string, tenantId?: string, appId?: string, configId?: string} | null = null;

function setupSmtpConfig() {
  console.log('Setting up enhanced SMTP configuration UI');
  
  // Set up global config modal
  setupGlobalConfigModal();
  
  // Set up global config management
  setupGlobalConfigManagement();
  
  // Set up tenant context handling
  setupTenantContextHandling();
  
  // Initial load
  loadAndDisplayConfigs();
}

function setupGlobalConfigModal() {
  console.log('Setting up global config modal...');
  
  // Add Global Config button
  const addBtn = document.getElementById('addGlobalConfigBtn');
  console.log('Add button found:', !!addBtn);
  
  addBtn?.addEventListener('click', () => {
    console.log('Add Global Config button clicked!');
    openGlobalConfigModal();
  });
  
  // Global config form
  const globalForm = document.getElementById('globalConfigForm') as HTMLFormElement;
  globalForm?.addEventListener('submit', handleGlobalConfigSubmit);
  
  // Close modal button
  const closeBtn = document.getElementById('closeGlobalConfigModal');
  closeBtn?.addEventListener('click', closeGlobalConfigModal);
  
  // Cancel button
  const cancelBtn = document.getElementById('cancelGlobalConfigBtn');
  cancelBtn?.addEventListener('click', closeGlobalConfigModal);
  
  // Service selector for global config
  const serviceSelect = document.getElementById('globalServiceSelect') as HTMLSelectElement;
  serviceSelect?.addEventListener('change', () => {
    const service = serviceSelect.value;
    const smtpFields = document.getElementById('globalSmtpFields');
    const sesFields = document.getElementById('globalSesFields');
    
    if (smtpFields && sesFields) {
      smtpFields.style.display = service === 'smtp' ? 'block' : 'none';
      sesFields.style.display = service === 'ses' ? 'block' : 'none';
    }
  });
  
  // Test configuration button
  const testBtn = document.getElementById('testGlobalConfigBtn');
  testBtn?.addEventListener('click', testGlobalConfig);
  
  // Delete configuration button
  const deleteBtn = document.getElementById('deleteGlobalConfigBtn');
  deleteBtn?.addEventListener('click', handleGlobalConfigDelete);
  
  // Close modal when clicking outside
  const modal = document.getElementById('globalConfigModal');
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeGlobalConfigModal();
    }
  });

  // App config modal event handlers
  const appConfigModal = document.getElementById('appConfigModal');
  
  // Close app config modal when clicking outside
  appConfigModal?.addEventListener('click', (e) => {
    if (e.target === appConfigModal) {
      appConfigModal.style.display = 'none';
    }
  });
  
  // App config form submission
  const appConfigForm = document.getElementById('appConfigForm') as HTMLFormElement;
  appConfigForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveAppConfig();
  });
  
  // Close app config modal button
  const closeAppBtn = document.getElementById('closeAppConfigModal');
  closeAppBtn?.addEventListener('click', () => {
    const modal = document.getElementById('appConfigModal');
    if (modal) modal.style.display = 'none';
  });
  
  // Cancel app config button
  const cancelAppBtn = document.getElementById('cancelAppConfigBtn');
  cancelAppBtn?.addEventListener('click', () => {
    const modal = document.getElementById('appConfigModal');
    if (modal) modal.style.display = 'none';
  });
  
  // App service selector
  const appServiceSelect = document.getElementById('appServiceSelect') as HTMLSelectElement;
  appServiceSelect?.addEventListener('change', updateAppConfigFieldVisibility);
  
  // Test app config button
  const testAppBtn = document.getElementById('testAppConfigBtn');
  testAppBtn?.addEventListener('click', testAppConfig);
  
  // Delete app config button
  const deleteAppBtn = document.getElementById('deleteAppConfigBtn');
  deleteAppBtn?.addEventListener('click', deleteAppConfig);
}

function setupGlobalConfigManagement() {
  // This will be called when displaying global config cards
  console.log('Global config management setup complete');
}

function setupTenantContextHandling() {
  // Exit context button
  const exitBtn = document.getElementById('exitContextBtn');
  exitBtn?.addEventListener('click', () => {
    // Clear tenant context
    localStorage.removeItem('contextTenantId');
    localStorage.removeItem('contextTenantName');
    roleContext.isInTenantContext = false;
    roleContext.contextTenantId = '';
    roleContext.contextTenantName = '';
    
    // Hide context indicator
    const indicator = document.getElementById('roleContextIndicator');
    if (indicator) indicator.style.display = 'none';
    
    // Reload configurations
    loadAndDisplayConfigs();
  });
}

async function loadAndDisplayConfigs() {
  try {
    // Load all necessary data
    await loadSmtpConfigs();
    
    // Check user role to determine what to display
    const roles = state.user?.roles || [];
    const isSuperadmin = roles.includes('superadmin');
    const isTenantAdmin = roles.includes('tenant_admin');
    
    if (isSuperadmin) {
      // Superadmin: full tenant management view
      await loadTenants();
      await loadAllApps(); // Load ALL apps for proper tree display
      await displayGlobalConfigs();
      await displayTenantOverview();
    } else if (isTenantAdmin) {
      // Tenant admin: use the EXACT same view as superadmin impersonating their tenant
      const tenantId = state.user?.tenantId;
      const tenantName = state.user?.tenantName || tenantId || 'Your Tenant';
      
      if (tenantId) {
        // Load apps first (backend will filter to tenant's apps)
        await loadAllApps();
        
        // Use the same switchToTenantContext that superadmin uses when impersonating
        // This gives us the exact same polished UI
        // Check if we're currently in compose view to avoid overriding it
        const currentView = getCurrentView();
        const skipViewSwitch = currentView === 'compose';
        
        if ((window as any).switchToTenantContext) {
          (window as any).switchToTenantContext(tenantId, tenantName, skipViewSwitch);
        } else {
          console.warn('switchToTenantContext not available, falling back to basic view');
          await displayTenantAdminView();
        }
      } else {
        console.error('Tenant admin has no tenantId context');
        await displayTenantAdminView();
      }
    } else {
      // Regular user: basic view
      await loadAllApps();
      await displayGlobalConfigs();
      await displayTenantAdminView();
    }
    
    // Update context indicator
    updateContextIndicator();
    
  } catch (error) {
    console.error('Failed to load configurations:', error);
  }
}

async function displayGlobalConfigs() {
  const cardsContainer = document.getElementById('globalConfigCards');
  const noConfigsMessage = document.getElementById('noGlobalConfigs');
  
  if (!cardsContainer || !noConfigsMessage) return;
  
  const globalConfigs = state.smtpConfigs.filter(c => c.scope === 'GLOBAL');
  
  if (globalConfigs.length === 0) {
    cardsContainer.style.display = 'none';
    noConfigsMessage.style.display = 'block';
    return;
  }
  
  cardsContainer.style.display = 'flex';
  noConfigsMessage.style.display = 'none';
  
  // Create header with radio selection info
  const hasActiveConfig = globalConfigs.some(c => c.isActive);
  let cardsHtml = '';
  
  if (globalConfigs.length > 1) {
    cardsHtml += `
      <div class="global-config-header">
        <h3>Global SMTP Configurations</h3>
        <p>Select which configuration should be active for global email sending:</p>
      </div>
    `;
  }
  
  cardsHtml += globalConfigs.map(config => createGlobalConfigCard(config)).join('');
  cardsContainer.innerHTML = cardsHtml;
}

function createGlobalConfigCard(config: SmtpConfig): string {
  const isActive = config.isActive;
  const configName = config.fromName || config.host || `${config.service || 'SMTP'} Config`;
  const serviceName = config.service || 'smtp';
  const hostInfo = config.host || 'Not configured';
  const fromAddress = config.fromAddress || 'Not set';
  
  return `
    <div class="global-config-card ${isActive ? 'active' : ''}" data-config-id="${config.id}">
      <div class="global-config-card-header">
        <div class="global-config-card-selector">
          <input type="radio" 
                 name="activeGlobalConfig" 
                 id="radio-${config.id}" 
                 value="${config.id}" 
                 ${isActive ? 'checked' : ''} 
                 onchange="activateGlobalConfig('${config.id}')" />
          <label for="radio-${config.id}" class="radio-label">
            <h3 class="global-config-card-title">${configName}</h3>
          </label>
        </div>
        <div class="global-config-card-status">
          <span class="service-icon ${serviceName}">${serviceName.toUpperCase()}</span>
          ${isActive ? '<span class="active-badge">ACTIVE</span>' : ''}
        </div>
      </div>
      
      <div class="global-config-card-details">
        <div class="global-config-card-detail">
          <span>Host:</span>
          <span>${hostInfo}</span>
        </div>
        <div class="global-config-card-detail">
          <span>Port:</span>
          <span>${config.port || '587'}</span>
        </div>
        <div class="global-config-card-detail">
          <span>From:</span>
          <span>${fromAddress}</span>
        </div>
      </div>
      
      <div class="global-config-card-actions">
        <button class="global-config-card-btn primary" onclick="editGlobalConfig('${config.id}')">Edit</button>
        <button class="global-config-card-btn" onclick="testGlobalConfigById('${config.id}')">Test</button>
        <button class="global-config-card-btn danger" onclick="deleteGlobalConfigById('${config.id}')">Delete</button>
      </div>
    </div>
  `;
}

async function displayTenantOverview() {
  const treeContainer = document.getElementById('smtpTree');
  if (!treeContainer) return;
  
  // Show loading
  treeContainer.innerHTML = 'Loading configuration overview...';
  
  try {
    const roles = state.user?.roles || [];
    const isSuperadmin = roles.includes('superadmin');
    
    if (isSuperadmin) {
      // Superadmin view: show all tenants and their apps
      if (state.tenants.length === 0) {
        await loadTenants();
      }
      if (state.apps.length === 0) {
        await loadApps();
      }
      
      let treeHtml = '';
      
      if (state.tenants.length === 0) {
        treeHtml = 'No tenants configured yet.';
      } else {
        treeHtml = buildTenantTree();
      }
      
      treeContainer.innerHTML = treeHtml;
    } else {
      // Tenant admin view: show only their tenant's apps
      await displayTenantAdminView();
    }
    
  } catch (error) {
    console.error('Failed to display overview:', error);
    treeContainer.innerHTML = 'Failed to load configuration overview.';
  }
}

async function displayTenantAdminView() {
  const treeContainer = document.getElementById('smtpTree');
  if (!treeContainer) return;
  
  // Get current tenant context
  const tenantId = state.user?.tenantId;
  const tenantName = state.user?.tenantName || tenantId || 'Your Tenant';
  
  if (!tenantId) {
    treeContainer.innerHTML = 'No tenant context available.';
    return;
  }
  
  // Load apps if not already loaded
  if (state.apps.length === 0) {
    await loadApps();
  }
  
  // Filter apps for this tenant
  const tenantApps = state.apps.filter(app => app.tenantId === tenantId);
  
  let treeHtml = `
    <div class="tenant_admin-header" style="margin-bottom: 20px; padding: 15px; background: #2d3748; border-radius: 8px; border-left: 4px solid #4CAF50;">
      <h3 style="margin: 0 0 5px 0; color: #fff;">Tenant: ${escapeHtml(tenantName)}</h3>
      <p style="margin: 0; color: #a0aec0; font-size: 0.9em;">Managing ${tenantApps.length} application(s)</p>
    </div>
  `;
  
  if (tenantApps.length === 0) {
    treeHtml += '<div style="text-align: center; color: #888; padding: 40px;">No applications found for this tenant.</div>';
  } else {
    treeHtml += '<div class="tenant-apps-list">';
    
    for (const app of tenantApps) {
      const appConfigs = state.smtpConfigs.filter(c => c.scope === 'APP' && c.appId === app.id);
      const hasConfig = appConfigs.length > 0;
      
      treeHtml += `
        <div class="app-item" style="margin-bottom: 15px; padding: 12px; background: #1a202c; border-radius: 6px; border: 1px solid #2d3748;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <h4 style="margin: 0 0 5px 0; color: #fff;">${escapeHtml(app.name)}</h4>
              <p style="margin: 0; font-size: 0.8em; color: #a0aec0; font-family: monospace;">ID: ${escapeHtml(app.id)}</p>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span style="font-size: 0.8em; color: ${hasConfig ? '#4CAF50' : '#ffa500'};">
                ${hasConfig ? '✓ Configured' : '⚠ No SMTP Config'}
              </span>
              <button onclick="editAppConfig('${app.id}', '${escapeHtml(app.name)}')" class="smallBtn" style="background: #4CAF50; border-color: #4CAF50;">
                ${hasConfig ? 'Edit Config' : 'Add Config'}
              </button>
            </div>
          </div>
        </div>
      `;
    }
    
    treeHtml += '</div>';
  }
  
  treeContainer.innerHTML = treeHtml;
}

function buildTenantTree(): string {
  let tree = '';
  
  for (const tenant of state.tenants) {
    const tenantConfigs = state.smtpConfigs.filter(c => c.scope === 'TENANT' && c.tenantId === tenant.id);
    const tenantApps = state.apps.filter(app => app.tenantId === tenant.id);
    
    tree += `📁 <span class="tenant-link" onclick="switchToTenantContext('${tenant.id}', '${tenant.name}')">${tenant.name}</span>`;
    tree += tenantConfigs.length > 0 ? ' [📧]' : ' [no config]';
    tree += '\n';
    
    // Show apps under tenant
    for (const app of tenantApps) {
      const appConfigs = state.smtpConfigs.filter(c => c.scope === 'APP' && c.appId === app.id);
      tree += `  └─ 📱 ${app.name}`;
      tree += appConfigs.length > 0 ? ' [📧]' : ' [no config]';
      tree += '\n';
    }
    
    if (tenantApps.length === 0) {
      tree += '  └─ (no apps)\n';
    }
    
    tree += '\n';
  }
  
  return tree;
}

function updateContextIndicator() {
  const indicator = document.getElementById('roleContextIndicator');
  const tenantNameSpan = document.getElementById('contextTenantName');
  
  if (!indicator || !tenantNameSpan) return;
  
  if (roleContext.isInTenantContext && roleContext.contextTenantName) {
    indicator.style.display = 'block';
    tenantNameSpan.textContent = roleContext.contextTenantName;
  } else {
    indicator.style.display = 'none';
  }
}

// App SMTP Configuration Modal
function openAppSmtpConfigModal(appId: string, appName: string) {
  const modal = document.getElementById('appConfigModal');
  if (!modal) {
    console.error('App config modal not found!');
    return;
  }
  
  // Set app information in modal
  const appNameEl = document.getElementById('appConfigAppName');
  const appIdEl = document.getElementById('appConfigAppId');
  if (appNameEl) appNameEl.textContent = appName;
  if (appIdEl) appIdEl.textContent = `App ID: ${appId}`;
  
  // Find existing config for this app
  const existingConfig = state.smtpConfigs.find(c => c.scope === 'APP' && c.appId === appId);
  
  const form = document.getElementById('appConfigForm') as HTMLFormElement;
  const deleteBtn = document.getElementById('deleteAppConfigBtn');
  
  if (existingConfig) {
    // Populate form with existing config
    populateAppConfigForm(existingConfig);
    if (deleteBtn) deleteBtn.style.display = 'block';
    document.getElementById('appConfigModalTitle')!.textContent = `Edit SMTP Configuration - ${appName}`;
  } else {
    // Clear form for new config
    if (form) form.reset();
    if (deleteBtn) deleteBtn.style.display = 'none';
    document.getElementById('appConfigModalTitle')!.textContent = `Configure SMTP - ${appName}`;
  }
  
  // Store current app info for form submission
  (window as any).currentAppConfig = { appId, appName, existingConfig };
  
  modal.style.display = 'flex';
}

function populateAppConfigForm(config: SmtpConfig) {
  const form = document.getElementById('appConfigForm') as HTMLFormElement;
  if (!form) return;
  
  // Set service type
  const serviceSelect = form.querySelector('[name="service"]') as HTMLSelectElement;
  if (serviceSelect) serviceSelect.value = config.service || config.provider || 'smtp';
  
  // Set SMTP fields
  const hostInput = form.querySelector('[name="host"]') as HTMLInputElement;
  const portInput = form.querySelector('[name="port"]') as HTMLInputElement;
  const secureInput = form.querySelector('[name="secure"]') as HTMLInputElement;
  const userInput = form.querySelector('[name="user"]') as HTMLInputElement;
  const passInput = form.querySelector('[name="pass"]') as HTMLInputElement;
  
  if (hostInput) hostInput.value = config.host || config.smtpHost || '';
  if (portInput) portInput.value = String(config.port || config.smtpPort || '');
  if (secureInput) secureInput.checked = config.secure || config.smtpSecure || false;
  if (userInput) userInput.value = config.user || config.smtpUser || '';
  if (passInput) passInput.value = config.pass || config.smtpPass || '';
  
  // Set SES fields
  const awsAccessKeyInput = form.querySelector('[name="awsAccessKey"]') as HTMLInputElement;
  const awsSecretKeyInput = form.querySelector('[name="awsSecretKey"]') as HTMLInputElement;
  const awsRegionInput = form.querySelector('[name="awsRegion"]') as HTMLInputElement;
  
  if (awsAccessKeyInput) awsAccessKeyInput.value = config.awsAccessKey || '';
  if (awsSecretKeyInput) awsSecretKeyInput.value = config.awsSecretKey || '';
  if (awsRegionInput) awsRegionInput.value = config.awsRegion || 'us-east-1';
  
  // Set common fields
  const fromAddressInput = form.querySelector('[name="fromAddress"]') as HTMLInputElement;
  const fromNameInput = form.querySelector('[name="fromName"]') as HTMLInputElement;
  
  if (fromAddressInput) fromAddressInput.value = config.fromAddress || config.smtpFromAddress || '';
  if (fromNameInput) fromNameInput.value = config.fromName || config.smtpFromName || '';
  
  // Update field visibility
  updateAppConfigFieldVisibility();
}

function updateAppConfigFieldVisibility() {
  const serviceSelect = document.getElementById('appServiceSelect') as HTMLSelectElement;
  const smtpFields = document.getElementById('appSmtpFields');
  const sesFields = document.getElementById('appSesFields');
  
  if (serviceSelect && smtpFields && sesFields) {
    const service = serviceSelect.value;
    smtpFields.style.display = service === 'smtp' ? 'block' : 'none';
    sesFields.style.display = service === 'ses' ? 'block' : 'none';
  }
}

async function saveAppConfig() {
  const appConfig = (window as any).currentAppConfig;
  if (!appConfig) {
    console.error('No app config context');
    return;
  }
  
  const form = document.getElementById('appConfigForm') as HTMLFormElement;
  if (!form) return;
  
  const formData = new FormData(form);
  const service = formData.get('service') as string;
  
  const config: any = {
    scope: 'APP',
    appId: appConfig.appId,
    service: service,
    fromAddress: formData.get('fromAddress') as string,
    fromName: formData.get('fromName') as string
  };
  
  // Add service-specific fields
  if (service === 'smtp') {
    config.host = formData.get('host') as string;
    config.port = parseInt(formData.get('port') as string);
    config.secure = formData.get('secure') === 'on';
    config.user = formData.get('user') as string;
    config.pass = formData.get('pass') as string;
  } else if (service === 'ses') {
    config.awsAccessKey = formData.get('awsAccessKey') as string;
    config.awsSecretKey = formData.get('awsSecretKey') as string;
    config.awsRegion = formData.get('awsRegion') as string;
  }
  
  try {
    let response;
    if (appConfig.existingConfig) {
      // Update existing config
      response = await api(`/smtp-configs/${appConfig.existingConfig.id}`, {
        method: 'PUT',
        body: JSON.stringify(config)
      });
    } else {
      // Create new config
      response = await api('/smtp-configs', {
        method: 'POST',
        body: JSON.stringify(config)
      });
    }
    
    showStatus(null, 'App SMTP configuration saved successfully!', 'success');
    
    // Close modal
    const modal = document.getElementById('appConfigModal');
    if (modal) modal.style.display = 'none';
    
    // Refresh data while preserving current context
    await loadSmtpConfigs(); // Only reload SMTP configs
    
    // Update UI based on current context
    if (tenantId) {
      // We're in tenant context, reload only the current tenant's apps
      await loadAppsForCurrentContext();
      updateAppsUI();
    } else {
      // We're in global context, refresh everything
      await loadAndDisplayConfigs();
    }
  } catch (error) {
    console.error('Error saving app config:', error);
    showStatus(null, `Failed to save app configuration: ${error}`, 'error');
  }
}

async function testAppConfig() {
  const appConfig = (window as any).currentAppConfig;
  if (!appConfig) {
    console.error('No app config context');
    return;
  }
  
  const form = document.getElementById('appConfigForm') as HTMLFormElement;
  if (!form) return;
  
  const formData = new FormData(form);
  const service = formData.get('service') as string;
  
  const config: any = {
    scope: 'APP',
    appId: appConfig.appId,
    service: service,
    fromAddress: formData.get('fromAddress') as string,
    fromName: formData.get('fromName') as string
  };
  
  // Add service-specific fields
  if (service === 'smtp') {
    config.host = formData.get('host') as string;
    config.port = parseInt(formData.get('port') as string);
    config.secure = formData.get('secure') === 'on';
    config.user = formData.get('user') as string;
    config.pass = formData.get('pass') as string;
  } else if (service === 'ses') {
    config.awsAccessKey = formData.get('awsAccessKey') as string;
    config.awsSecretKey = formData.get('awsSecretKey') as string;
    config.awsRegion = formData.get('awsRegion') as string;
  }
  
  try {
    const response = await api('/smtp-configs/test', {
      method: 'POST',
      body: JSON.stringify(config)
    });
    
    showStatus(null, 'Test email sent successfully!', 'success');
  } catch (error) {
    console.error('Error testing app config:', error);
    showStatus(null, `Test failed: ${error}`, 'error');
  }
}

async function deleteAppConfig() {
  const appConfig = (window as any).currentAppConfig;
  if (!appConfig || !appConfig.existingConfig) {
    console.error('No existing app config to delete');
    return;
  }
  
  if (!confirm(`Are you sure you want to delete the SMTP configuration for ${appConfig.appName}?`)) {
    return;
  }
  
  try {
    await api(`/smtp-configs/${appConfig.existingConfig.id}`, {
      method: 'DELETE'
    });
    
    showStatus(null, 'App SMTP configuration deleted successfully!', 'success');
    
    // Close modal
    const modal = document.getElementById('appConfigModal');
    if (modal) modal.style.display = 'none';
    
    // Refresh data while preserving current context
    await loadSmtpConfigs(); // Only reload SMTP configs
    
    // Update UI based on current context
    if (tenantId) {
      // We're in tenant context, reload only the current tenant's apps
      await loadAppsForCurrentContext();
      updateAppsUI();
    } else {
      // We're in global context, refresh everything
      await loadAndDisplayConfigs();
    }
  } catch (error) {
    console.error('Error deleting app config:', error);
    showStatus(null, `Failed to delete app configuration: ${error}`, 'error');
  }
}

// Global Configuration Modal Functions
function openGlobalConfigModal(configId?: string) {
  console.log('openGlobalConfigModal called with configId:', configId);
  
  const modal = document.getElementById('globalConfigModal');
  console.log('Modal element:', modal);
  console.log('Modal exists:', !!modal);
  console.log('Modal parent:', modal?.parentElement);
  console.log('Modal connected to document:', document.contains(modal));
  console.log('Modal innerHTML length:', modal?.innerHTML?.length);
  
  if (!modal) {
    console.error('Modal element not found!');
    return;
  }
  
  const titleEl = document.getElementById('globalConfigModalTitle');
  const form = document.getElementById('globalConfigForm') as HTMLFormElement;
  const deleteBtn = document.getElementById('deleteGlobalConfigBtn');
  
  console.log('Modal elements found:', {
    modal: !!modal,
    titleEl: !!titleEl, 
    form: !!form,
    deleteBtn: !!deleteBtn
  });
  
  if (!modal || !titleEl || !form) {
    console.log('Missing required modal elements, returning early');
    return;
  }
  
  // Reset form
  form.reset();
  console.log('Form reset complete');
  
  // Debug form content
  console.log('Form element:', form);
  console.log('Form innerHTML length:', form.innerHTML.length);
  console.log('Form children count:', form.children.length);
  console.log('Form innerHTML preview:', form.innerHTML.substring(0, 200));
  
  // Force all form children to be visible
  for (let i = 0; i < form.children.length; i++) {
    const child = form.children[i] as HTMLElement;
    child.style.display = 'block';
    child.style.visibility = 'visible';
    child.style.opacity = '1';
    console.log('Form child', i, ':', child.tagName, child.id || child.className);
  }
  
  if (configId) {
    // Editing existing config
    console.log('Editing existing config with ID:', configId);
    const config = state.smtpConfigs.find(c => c.id === configId);
    if (config) {
      titleEl.textContent = 'Edit Global SMTP Configuration';
      populateGlobalConfigForm(config);
      if (deleteBtn) deleteBtn.style.display = 'block';
    }
  } else {
    // Creating new config
    console.log('Creating new config');
    titleEl.textContent = 'Add Global SMTP Configuration';
    if (deleteBtn) deleteBtn.style.display = 'none';
  }
  
  console.log('About to show modal...');
  modal.style.display = 'flex';
}

function closeGlobalConfigModal() {
  const modal = document.getElementById('globalConfigModal');
  if (modal) {
    modal.style.display = 'none';
  }
  
  // Clear form
  const form = document.getElementById('globalConfigForm') as HTMLFormElement;
  if (form) {
    form.reset();
  }
  
  // Clear any status messages
  const statusEl = document.getElementById('globalConfigStatus');
  if (statusEl) {
    statusEl.textContent = '';
  }
}

function populateGlobalConfigForm(config: SmtpConfig) {
  const form = document.getElementById('globalConfigForm') as HTMLFormElement;
  if (!form) return;
  
  // Set hidden config ID
  (form.querySelector('#globalConfigId') as HTMLInputElement).value = config.id;
  
  // Set form fields
  (form.querySelector('[name="service"]') as HTMLSelectElement).value = config.service || 'smtp';
  (form.querySelector('[name="host"]') as HTMLInputElement).value = config.host || '';
  (form.querySelector('[name="port"]') as HTMLInputElement).value = (config.port || 587).toString();
  (form.querySelector('[name="secure"]') as HTMLInputElement).checked = config.secure || false;
  (form.querySelector('[name="user"]') as HTMLInputElement).value = config.user || '';
  
  // Handle password field (sensitive)
  const passField = form.querySelector('[name="pass"]') as HTMLInputElement;
  if (config.pass && !config.pass.includes('*')) {
    passField.value = config.pass;
  } else {
    passField.value = '';
    passField.placeholder = 'Enter password (leave blank to keep current)';
  }
  
  (form.querySelector('[name="fromAddress"]') as HTMLInputElement).value = config.fromAddress || '';
  (form.querySelector('[name="fromName"]') as HTMLInputElement).value = config.fromName || '';
  
    // Handle SES fields if applicable
    if (config.service === 'ses') {
        (form.querySelector('[name="awsRegion"]') as HTMLInputElement).value = config.awsRegion || '';
        
        // Handle AWS Access Key (may be masked)
        const accessKeyField = form.querySelector('[name="awsAccessKey"]') as HTMLInputElement;
        if (config.awsAccessKey && !config.awsAccessKey.includes('*')) {
            accessKeyField.value = config.awsAccessKey;
        } else {
            accessKeyField.value = '';
            accessKeyField.placeholder = 'Enter access key (leave blank to keep current)';
        }
        
        // For sensitive fields, only populate if not masked
        const secretField = form.querySelector('[name="awsSecretKey"]') as HTMLInputElement;
        if (config.awsSecretKey && !config.awsSecretKey.includes('*')) {
            secretField.value = config.awsSecretKey;
        } else {
            // Clear the field for security, user must re-enter if they want to change it
            secretField.value = '';
            secretField.placeholder = 'Enter secret key (leave blank to keep current)';
        }
    }  // Trigger service change to show/hide fields
  const serviceSelect = form.querySelector('[name="service"]') as HTMLSelectElement;
  serviceSelect.dispatchEvent(new Event('change'));
}

async function handleGlobalConfigSubmit(e: Event) {
  e.preventDefault();
  
  const form = e.target as HTMLFormElement;
  const statusEl = document.getElementById('globalConfigStatus');
  const saveBtn = document.getElementById('saveGlobalConfigBtn') as HTMLButtonElement;
  
  if (!statusEl) return;
  
  try {
    saveBtn.disabled = true;
    statusEl.textContent = 'Saving configuration...';
    
    const formData = new FormData(form);
    const configId = (form.querySelector('#globalConfigId') as HTMLInputElement).value;
    
    const payload: any = {
      scope: 'GLOBAL',
      service: formData.get('service'),
      host: formData.get('host'),
      port: parseInt(formData.get('port') as string) || 587,
      secure: formData.has('secure'),
      user: formData.get('user') || undefined,
      fromAddress: formData.get('fromAddress')
      // fromName removed - no longer using Provider Name field
    };
    
    // Handle SMTP password (sensitive field)
    const password = formData.get('pass') as string;
    if (password && password.trim()) {
      payload.pass = password;
    }
    // If editing and password is empty, backend will keep existing password
    
        // Handle SES fields
        if (payload.service === 'ses') {
            payload.awsRegion = formData.get('awsRegion');
            
            // Only include access key if it has been provided (not empty)
            const accessKey = formData.get('awsAccessKey') as string;
            if (accessKey && accessKey.trim()) {
                payload.awsAccessKey = accessKey;
            }
            
            // Only include secret key if it has been provided (not empty)
            const secretKey = formData.get('awsSecretKey') as string;
            if (secretKey && secretKey.trim()) {
                payload.awsSecretKey = secretKey;
            }
            // If editing and credentials are empty, backend will keep existing credentials
        }
        
        let response;
    if (configId) {
      // Update existing config
      response = await api(`/smtp-configs/${configId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      // Create new config
      response = await api('/smtp-configs', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
    
    statusEl.textContent = configId ? 'Configuration updated successfully!' : 'Configuration created successfully!';
    statusEl.className = 'status success';
    
    // Reload configs and refresh display
    await loadSmtpConfigs();
    await displayGlobalConfigs();
    
    // Close modal after short delay
    setTimeout(() => {
      closeGlobalConfigModal();
    }, 1500);
    
  } catch (error: any) {
    console.error('Failed to save global config:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status error';
  } finally {
    saveBtn.disabled = false;
  }
}

async function testGlobalConfig() {
  const form = document.getElementById('globalConfigForm') as HTMLFormElement;
  const statusEl = document.getElementById('globalConfigStatus');
  const testBtn = document.getElementById('testGlobalConfigBtn') as HTMLButtonElement;
  
  if (!form || !statusEl) return;
  
  try {
    testBtn.disabled = true;
    statusEl.textContent = 'Testing configuration...';
    statusEl.className = 'status';
    
    // Get the config ID for testing existing configs
    const configId = (form.querySelector('#globalConfigId') as HTMLInputElement).value;
    
    if (!configId) {
      statusEl.textContent = 'Cannot test unsaved configuration. Please save first.';
      statusEl.className = 'status error';
      return;
    }
    
    const formData = new FormData(form);
    const payload: any = {
      to: 'test@example.com', // Required by test endpoint
      subject: 'Test Email from Mail Service',
      text: 'This is a test email to verify SMTP configuration.'
    };
    
    const response = await api(`/smtp-configs/${configId}/test`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    if (response.success) {
      statusEl.textContent = 'Test successful! Configuration is working.';
      statusEl.className = 'status success';
    } else {
      statusEl.textContent = `Test failed: ${response.message || 'Unknown error'}`;
      statusEl.className = 'status error';
    }
    
  } catch (error: any) {
    console.error('Test failed:', error);
    statusEl.textContent = `Test failed: ${error.message}`;
    statusEl.className = 'status error';
  } finally {
    testBtn.disabled = false;
  }
}

async function handleGlobalConfigDelete() {
  const configId = (document.getElementById('globalConfigId') as HTMLInputElement).value;
  
  if (!configId) {
    alert('No configuration to delete');
    return;
  }
  
  const config = state.smtpConfigs.find(c => c.id === configId);
  
  // Enhanced warning for active configs
  let confirmMessage = 'Are you sure you want to delete this global SMTP configuration?';
  if (config?.isActive) {
    try {
      // Query backend for what would be activated next
      const nextConfig = await api(`/smtp-configs/${configId}/next-active`);
      if (nextConfig) {
        const nextConfigName = nextConfig.fromName || nextConfig.host || 'another configuration';
        confirmMessage = `This is the ACTIVE global configuration. Deleting it will automatically activate "${nextConfigName}". Continue?`;
      } else {
        confirmMessage = 'This is the ACTIVE global configuration and the ONLY global configuration. Deleting it will leave no global fallback for email services. Are you absolutely sure?';
      }
    } catch (error) {
      console.warn('Failed to get next active config, falling back to basic warning:', error);
      confirmMessage = 'This is the ACTIVE global configuration. Deleting it may activate another configuration or leave no global fallback. Continue?';
    }
  }
  
  if (!confirm(confirmMessage)) return;
  
  try {
    const statusEl = document.getElementById('globalConfigStatus');
    if (statusEl) {
      statusEl.textContent = 'Deleting configuration...';
      statusEl.className = 'status';
    }
    
    await api(`/smtp-configs/${configId}`, { method: 'DELETE' });
    
    // Show success message based on what was deleted
    if (statusEl) {
      if (config?.isActive) {
        const otherGlobalConfigs = state.smtpConfigs.filter(c => c.scope === 'GLOBAL' && c.id !== configId);
        if (otherGlobalConfigs.length > 0) {
          statusEl.textContent = 'Configuration deleted successfully. Another configuration has been automatically activated.';
        } else {
          statusEl.textContent = 'Configuration deleted successfully. Warning: No global configuration is now active.';
        }
      } else {
        statusEl.textContent = 'Configuration deleted successfully.';
      }
      statusEl.className = 'status success';
    }
    
    // Reload configs and refresh display
    await loadSmtpConfigs();
    await displayGlobalConfigs();
    
    // Close modal after showing success message for a moment
    setTimeout(() => {
      closeGlobalConfigModal();
    }, 2000);
    
  } catch (error: any) {
    console.error('Failed to delete config:', error);
    const statusEl = document.getElementById('globalConfigStatus');
    if (statusEl) {
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = 'status error';
    }
  }
}

// Global Configuration Card Action Functions
async function activateGlobalConfig(configId: string) {
  const currentActive = state.smtpConfigs.find(c => c.scope === 'GLOBAL' && c.isActive);
  
  // Don't activate if already active
  if (currentActive && currentActive.id === configId) {
    return;
  }
  
  try {
    const response = await api(`/smtp-configs/${configId}/activate`, {
      method: 'POST',
      body: JSON.stringify({}) // Provide empty JSON body
    });
    
    if (response.success) {
      // Reload configs and refresh display
      await loadSmtpConfigs();
      await displayGlobalConfigs();
      
      // Show success message in console for now
      const config = state.smtpConfigs.find(c => c.id === configId);
      const configName = config?.fromName || config?.host || 'Configuration';
      console.log(`Successfully activated: ${configName}`);
    } else {
      console.error('Failed to activate configuration');
    }
  } catch (error: any) {
    console.error('Failed to activate global config:', error);
    
    // Reset radio button to previous state
    await loadSmtpConfigs();
    await displayGlobalConfigs();
  }
}

function editGlobalConfig(configId: string) {
  openGlobalConfigModal(configId);
}

async function testGlobalConfigById(configId: string) {
  const config = state.smtpConfigs.find(c => c.id === configId);
  if (!config) {
    alert('Configuration not found');
    return;
  }
  
  // Get user's email for test or use a default
  const userEmail = state.user?.sub || 'test@example.com';
  
  try {
    const response = await api(`/smtp-configs/${configId}/test`, {
      method: 'POST',
      body: JSON.stringify({
        to: userEmail,
        subject: 'SMTP Configuration Test',
        text: 'This is a test email to verify the SMTP configuration is working correctly.',
        html: '<p>This is a test email to verify the SMTP configuration is working correctly.</p>'
      })
    });
    
    if (response.success) {
      alert('Test successful! Configuration is working.');
    } else {
      alert(`Test failed: ${response.message || 'Unknown error'}`);
    }
  } catch (error: any) {
    console.error('Test failed:', error);
    alert(`Test failed: ${error.message}`);
  }
}

async function deleteGlobalConfigById(configId: string) {
  const config = state.smtpConfigs.find(c => c.id === configId);
  if (!config) {
    alert('Configuration not found');
    return;
  }
  
  // Enhanced warning for active configs
  let confirmMessage = 'Are you sure you want to delete this global SMTP configuration?';
  if (config.isActive) {
    try {
      // Query backend for what would be activated next
      const nextConfig = await api(`/smtp-configs/${configId}/next-active`);
      if (nextConfig) {
        confirmMessage = `This is the ACTIVE global configuration. Deleting it will automatically activate another global configuration (${nextConfig.fromName || nextConfig.host}). Continue?`;
      } else {
        confirmMessage = 'This is the ACTIVE global configuration and the ONLY global configuration. Deleting it will leave no global fallback for email services. Are you absolutely sure?';
      }
    } catch (error) {
      console.warn('Failed to get next active config, falling back to basic warning:', error);
      confirmMessage = 'This is the ACTIVE global configuration. Deleting it may activate another configuration or leave no global fallback. Continue?';
    }
  }
  
  if (!confirm(confirmMessage)) return;
  
  try {
    // DELETE returns 204 with no content, so handle it specially
    const headers: Record<string,string> = { 'Content-Type':'application/json' };
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    
    const res = await fetch(`/smtp-configs/${configId}`, { 
      method: 'DELETE', 
      headers 
    });
    
    if (!res.ok) {
      const tx = await res.text();
      throw new Error(tx || res.statusText);
    }
    
    // Success - reload configs and refresh display
    await loadSmtpConfigs();
    await displayGlobalConfigs();
    
  } catch (error: any) {
    console.error('Failed to delete config:', error);
    alert(`Error: ${error.message}`);
  }
}

function switchToTenantContext(tenantId: string, tenantName: string, skipViewSwitch?: boolean) {
  // Store tenant context
  localStorage.setItem('contextTenantId', tenantId);
  localStorage.setItem('contextTenantName', tenantName);
  roleContext.isInTenantContext = true;
  roleContext.contextTenantId = tenantId;
  roleContext.contextTenantName = tenantName;
  
  // Update the display
  updateContextIndicator();
  updateRoleContext();
  
  // DO NOT switch views - let ViewRegistry handle all view management
  // Only switch to apps if explicitly requested AND we're not in a specific view context
  // This should rarely happen since ViewRegistry manages all views now
  
  console.log(`Switched to tenant context: ${tenantName} (${tenantId})`);
}

// Legacy functions removed - replaced with new card-based UI
// The old buildSmtpTree, selectTreeNode, etc. functions have been replaced

function selectTreeNode(scope: string, tenantId?: string, appId?: string, configId?: string) {
  console.log('Selecting tree node:', scope, tenantId, appId, configId);
  
  selectedTreeNode = { scope, tenantId, appId, configId };
  
  // Update visual selection
  document.querySelectorAll('.tree-node').forEach(node => {
    node.classList.remove('selected');
  });
  
  // Find and select the clicked node
  const clickedElement = (event?.target as HTMLElement)?.closest('.tree-node');
  if (clickedElement) {
    clickedElement.classList.add('selected');
  }
  
  // Update hidden form fields
  const formScope = document.getElementById('formScope') as HTMLInputElement;
  const formTenantId = document.getElementById('formTenantId') as HTMLInputElement;
  const formAppId = document.getElementById('formAppId') as HTMLInputElement;
  
  if (formScope) formScope.value = scope;
  if (formTenantId) formTenantId.value = tenantId || '';
  if (formAppId) formAppId.value = appId || '';
  
  // Load configuration for this node
  loadConfigForNode();
  
  // Update action buttons
  updateActionButtons();
}

function loadConfigForNode() {
  if (!selectedTreeNode) return;
  
  // Find existing config for this node
  const config = state.smtpConfigs.find((c: SmtpConfig) => {
    if (c.scope !== selectedTreeNode!.scope) return false;
    if (selectedTreeNode!.scope === 'TENANT') return c.tenantId === selectedTreeNode!.tenantId;
    if (selectedTreeNode!.scope === 'APP') return c.appId === selectedTreeNode!.appId;
    if (selectedTreeNode!.scope === 'GLOBAL') {
      // For global configs, if configId is specified, match by ID, otherwise find active one
      if (selectedTreeNode!.configId) {
        return c.id === selectedTreeNode!.configId;
      } else {
        return c.isActive; // Show active global config when no specific ID selected
      }
    }
    return false;
  });
  
  currentSmtpConfig = config || null;
  
  if (config) {
    populateForm(config);
    showConfigEditor();
  } else {
    clearForm();
    showConfigEditor();
  }
}

function updateActionButtons() {
  const actionButtons = document.getElementById('configActionButtons');
  if (!actionButtons || !selectedTreeNode) return;
  
  const hasConfig = currentSmtpConfig !== null;
  const scope = selectedTreeNode.scope;
  const scopeLabel = scope === 'GLOBAL' ? 'Global' : 
                   scope === 'TENANT' ? 'Tenant' : 'App';
  
  let buttonsHtml = '';
  
  if (hasConfig) {
    buttonsHtml += `<button type="submit" class="btn btn-primary">Update ${scopeLabel} Config</button>`;
    
    // Add activation button for inactive global configs
    if (scope === 'GLOBAL' && currentSmtpConfig && !currentSmtpConfig.isActive) {
      buttonsHtml += `<button type="button" class="btn btn-success" onclick="activateGlobalConfig('${currentSmtpConfig.id}')">Activate This Config</button>`;
    }
    
    buttonsHtml += `<button type="button" class="btn btn-danger" onclick="deleteSmtpConfig()">Delete Config</button>`;
  } else {
    buttonsHtml += `<button type="submit" class="btn btn-primary">Create ${scopeLabel} Config</button>`;
  }
  
  buttonsHtml += `<button type="button" class="btn btn-secondary" onclick="refreshSmtpTree()">Refresh</button>`;
  
  actionButtons.innerHTML = buttonsHtml;
}

function showConfigEditor() {
  const editor = document.getElementById('smtpConfigEditor');
  if (editor) editor.style.display = 'block';
}

function refreshSmtpTree() {
  loadAndDisplayConfigs();
}

async function deleteSmtpConfig() {
  if (!currentSmtpConfig) {
    alert('No configuration selected to delete');
    return;
  }
  
  if (!confirm('Are you sure you want to delete this SMTP configuration?')) return;
  
  try {
    await api(`/smtp-configs/${currentSmtpConfig.id}`, { method: 'DELETE' });
    await loadSmtpConfigs();
    currentSmtpConfig = null;
    clearForm();
    loadAndDisplayConfigs(); // Refresh the display
  } catch (error: any) {
    console.error('Failed to delete config:', error);
    alert('Failed to delete configuration: ' + error.message);
  }
}

function populateFormAppSelect(selectedTenantId: string) {
  console.log('populateFormAppSelect called with tenantId:', selectedTenantId);
  console.log('state.apps:', state.apps);
  
  const formAppSelect = document.getElementById('formAppSelect') as HTMLSelectElement;
  if (!formAppSelect) {
    console.log('formAppSelect element not found');
    return;
  }
  
  formAppSelect.innerHTML = '<option value="">Select App</option>';
  
  if (selectedTenantId && state.apps) {
    const tenantApps = state.apps.filter(app => app.tenantId === selectedTenantId);
    console.log('Filtered apps for tenant:', tenantApps);
    
    tenantApps.forEach(app => {
      const option = document.createElement('option');
      option.value = app.id;
      option.textContent = app.name;
      formAppSelect.appendChild(option);
      console.log('Added app option:', app.name);
    });
  } else {
    console.log('No selectedTenantId or state.apps is empty/null');
  }
}

function handleScopeChange() {
  // Legacy function - no longer needed with tree-based UI
  // This function is kept for compatibility but does nothing
  console.log('handleScopeChange called (legacy function - tree UI is used instead)');
  return;
}

function handleTenantChange() {
  const selectedTenantId = (document.getElementById('smtpTenantSelect') as HTMLSelectElement).value;
  const appSelect = document.getElementById('smtpAppSelect') as HTMLSelectElement;
  const scope = (document.getElementById('smtpScope') as HTMLSelectElement).value;
  
  if (scope === 'APP' && selectedTenantId && appSelect) {
    // Load apps for selected tenant
    const tenantApps = state.apps.filter(app => app.tenantId === selectedTenantId);
    appSelect.innerHTML = '<option value="">Select App</option>' + 
      tenantApps.map(app => `<option value="${app.id}">${app.name}</option>`).join('');
    
    // Auto-select current app if available
    if (appId && tenantApps.some(app => app.id === appId)) {
      appSelect.value = appId;
    }
  }
}

function handleServiceChange() {
  const service = (document.querySelector('select[name="service"]') as HTMLSelectElement)?.value;
  const sesSettings = document.getElementById('sesSettings') as HTMLElement;
  
  if (sesSettings) {
    sesSettings.style.display = service === 'ses' ? 'block' : 'none';
  }
}

function populateFormSelects() {
  // Populate tenant selects
  const tenantSelects = [
    document.getElementById('smtpTenantSelect'),
    document.getElementById('formTenantSelect')
  ] as HTMLSelectElement[];
  
  tenantSelects.forEach(select => {
    if (select) {
      select.innerHTML = '<option value="">Select Tenant</option>' + 
        (state.tenants || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      
      // Auto-select current tenant if available
      if (tenantId && (state.tenants || []).some(t => t.id === tenantId)) {
        select.value = tenantId;
      }
    }
  });
  
  // Populate app selects
  const appSelects = [
    document.getElementById('smtpAppSelect'),
    document.getElementById('formAppSelect')
  ] as HTMLSelectElement[];
  
  appSelects.forEach(select => {
    if (select) {
      select.innerHTML = '<option value="">Select App</option>';
      if (tenantId) {
        const tenantApps = (state.apps || []).filter(app => app.tenantId === tenantId);
        select.innerHTML += tenantApps.map(app => `<option value="${app.id}">${app.name}</option>`).join('');
        
        // Auto-select current app if available
        if (appId && tenantApps.some(app => app.id === appId)) {
          select.value = appId;
        }
      }
    }
  });
}

async function updateEffectiveConfigDisplay() {
  const effectiveConfigDiv = document.getElementById('effectiveConfig') as HTMLElement;
  const statusDiv = document.getElementById('smtpContextStatus') as HTMLElement;
  const refreshBtn = document.getElementById('refreshConfigBtn') as HTMLButtonElement;
  
  if (!effectiveConfigDiv) return;
  
  const scope = (document.getElementById('smtpScope') as HTMLSelectElement).value;
  const tenantId = (document.getElementById('smtpTenantSelect') as HTMLSelectElement).value;
  const appId = (document.getElementById('smtpAppSelect') as HTMLSelectElement).value;
  
  if (!scope) {
    effectiveConfigDiv.innerHTML = '<p class="sub">Select a scope to view effective configuration...</p>';
    statusDiv.innerHTML = '';
    refreshBtn.style.display = 'none';
    return;
  }

  // Check if required selections are made
  if (scope === 'TENANT' && !tenantId) {
    effectiveConfigDiv.innerHTML = '<p class="sub">Please select a tenant to view configuration...</p>';
    statusDiv.innerHTML = '';
    refreshBtn.style.display = 'none';
    return;
  }
  
  if (scope === 'APP' && (!tenantId || !appId)) {
    effectiveConfigDiv.innerHTML = '<p class="sub">Please select both tenant and app to view configuration...</p>';
    statusDiv.innerHTML = '';
    refreshBtn.style.display = 'none';
    return;
  }
  
  try {
    let url = '/smtp-configs/effective?scope=' + scope;
    if (scope !== 'GLOBAL' && tenantId) {
      url += '&tenantId=' + tenantId;
    }
    if (scope === 'APP' && appId) {
      url += '&appId=' + appId;
    }
    
    const response = await api(url);
    const config = response;
    
    if (config) {
      effectiveConfigDiv.innerHTML = `
        <div class="code" style="font-size:0.85rem">
          <div><strong>Scope:</strong> ${config.scope}</div>
          ${config.tenantId ? `<div><strong>Tenant:</strong> ${config.tenantId}</div>` : ''}
          ${config.appId ? `<div><strong>App:</strong> ${config.appId}</div>` : ''}
          <div><strong>Provider:</strong> ${config.provider || 'smtp'}</div>
          <div><strong>Host:</strong> ${config.host || 'Not configured'}</div>
          <div><strong>Port:</strong> ${config.port || 'Not configured'}</div>
          <div><strong>From:</strong> ${config.fromAddress || 'Not configured'}</div>
          <div><strong>Created:</strong> ${new Date(config.createdAt).toLocaleString()}</div>
        </div>
      `;
      statusDiv.innerHTML = '';
    } else {
      effectiveConfigDiv.innerHTML = '<p class="sub">No configuration found for this scope.</p>';
      statusDiv.innerHTML = '';
    }
    
    refreshBtn.style.display = 'block';
  } catch (error: any) {
    effectiveConfigDiv.innerHTML = '<p class="sub error">Error loading configuration</p>';
    statusDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    refreshBtn.style.display = 'none';
  }
}

function handleProviderChange() {
  const provider = (document.querySelector('input[name="provider"]:checked') as HTMLInputElement)?.value;
  const smtpFieldset = document.getElementById('smtp-fieldset') as HTMLFieldSetElement;
  const sesFieldset = document.getElementById('ses-fieldset') as HTMLFieldSetElement;
  
  smtpFieldset.style.display = provider === 'smtp' ? 'block' : 'none';
  sesFieldset.style.display = provider === 'ses' ? 'block' : 'none';
}

async function handleConfigSubmit(e: Event) {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);
  const statusEl = document.getElementById('smtpConfigStatus') as HTMLElement;
  
  const config: any = {
    scope: formData.get('scope'),
    service: formData.get('service'),
  };
  
  // Add tenant/app based on scope
  if (config.scope !== 'GLOBAL') {
    config.tenantId = formData.get('tenantId');
  }
  if (config.scope === 'APP') {
    config.appId = formData.get('appId');
  }
  
  // Add service-specific fields
  if (config.service === 'smtp' || !config.service) {
    config.host = formData.get('host');
    config.port = parseInt(formData.get('port') as string) || 587;
    config.secure = formData.has('secure');
    config.user = formData.get('user');
    config.pass = formData.get('pass');
    config.fromAddress = formData.get('fromAddress');
    config.fromName = formData.get('fromName');
  } else if (config.service === 'ses') {
    config.awsAccessKey = formData.get('awsAccessKey');
    config.awsSecretKey = formData.get('awsSecretKey');
    config.awsRegion = formData.get('awsRegion');
    config.fromAddress = formData.get('fromAddress');
    config.fromName = formData.get('fromName');
  }
  
  const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
  submitBtn.disabled = true;
  
  try {
    if (currentSmtpConfig) {
      // Update existing config
      await api(`/smtp-configs/${currentSmtpConfig.id}`, {
        method: 'PUT',
        body: JSON.stringify(config)
      });
      showStatus(statusEl, 'Configuration updated successfully', 'success');
    } else {
      // Create new config
      await api('/smtp-configs', {
        method: 'POST',
        body: JSON.stringify(config)
      });
      showStatus(statusEl, 'Configuration created successfully', 'success');
    }
    
    await loadSmtpConfigs();
    clearForm();
  } catch (error: any) {
    showStatus(statusEl, `Error: ${error.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

async function handleConfigDelete() {
  if (!currentSmtpConfig) return;
  
  if (!confirm('Are you sure you want to delete this SMTP configuration?')) return;
  
  const statusEl = document.getElementById('config-status') as HTMLElement;
  const deleteBtn = document.getElementById('delete-config-btn') as HTMLButtonElement;
  deleteBtn.disabled = true;
  
  try {
    await api(`/smtp-configs/${currentSmtpConfig.id}`, { method: 'DELETE' });
    showStatus(statusEl, 'Configuration deleted successfully', 'success');
    await loadSmtpConfigs();
    clearForm();
  } catch (error: any) {
    showStatus(statusEl, `Error: ${error.message}`, 'error');
  } finally {
    deleteBtn.disabled = false;
  }
}

async function handleTestConnection() {
  const statusEl = document.getElementById('config-status') as HTMLElement;
  const testBtn = document.getElementById('test-connection-btn') as HTMLButtonElement;
  testBtn.disabled = true;
  
  try {
    const scope = (document.getElementById('smtp-scope') as HTMLSelectElement).value;
    const tenantId = scope !== 'GLOBAL' ? (document.getElementById('smtp-tenant-id') as HTMLSelectElement).value : undefined;
    const appId = scope === 'APP' ? (document.getElementById('smtp-app-id') as HTMLSelectElement).value : undefined;
    
    await api('/smtp-configs/test', {
      method: 'POST',
      body: JSON.stringify({ tenantId, appId })
    });
    
    showStatus(statusEl, 'Connection test successful', 'success');
  } catch (error: any) {
    showStatus(statusEl, `Connection test failed: ${error.message}`, 'error');
  } finally {
    testBtn.disabled = false;
  }
}

async function loadSmtpConfigs() {
  try {
    const configs = await api('/smtp-configs');
    state.smtpConfigs = configs; // Store in state for tree building
    displayConfigList(configs);
  } catch (error: any) {
    console.error('Failed to load SMTP configs:', error);
    state.smtpConfigs = []; // Clear on error
  }
}

function displayConfigList(configs: SmtpConfig[]) {
  // No longer needed - using tree-based UI instead
  console.log('displayConfigList called with', configs.length, 'configs (tree UI is used instead)');
}

async function editConfig(configId: string) {
  console.log('Edit button clicked for config:', configId);
  try {
    const config = await api(`/smtp-configs/${configId}`);
    console.log('Loaded config for editing:', config);
    currentSmtpConfig = config;
    populateForm(config);
  } catch (error: any) {
    console.error('Failed to load config:', error);
  }
}

async function deleteConfig(configId: string) {
  if (!confirm('Are you sure you want to delete this SMTP configuration?')) return;
  
  try {
    await api(`/smtp-configs/${configId}`, { method: 'DELETE' });
    await loadSmtpConfigs();
    if (currentSmtpConfig?.id === configId) {
      clearForm();
    }
  } catch (error: any) {
    console.error('Failed to delete config:', error);
  }
}

function populateForm(config: SmtpConfig) {
  // Expand the form details element so user can see the form
  const detailsElement = document.querySelector('details') as HTMLDetailsElement;
  if (detailsElement) {
    detailsElement.open = true;
  }

  // Set scope and trigger change
  const scopeSelect = document.getElementById('smtpScope') as HTMLSelectElement;
  if (scopeSelect) {
    scopeSelect.value = config.scope;
    // Trigger scope change event
    scopeSelect.dispatchEvent(new Event('change'));
  }
  
  // Set tenant/app if applicable
  if (config.tenantId) {
    const tenantSelect = document.getElementById('formTenantSelect') as HTMLSelectElement;
    if (tenantSelect) {
      tenantSelect.value = config.tenantId;
      tenantSelect.dispatchEvent(new Event('change'));
    }
  }
  if (config.appId) {
    const appSelect = document.getElementById('formAppSelect') as HTMLSelectElement;
    if (appSelect) {
      appSelect.value = config.appId;
    }
  }
  
  // Set provider/service
  const serviceSelect = document.querySelector('select[name="service"]') as HTMLSelectElement;
  if (serviceSelect) {
    serviceSelect.value = config.service || config.provider || 'smtp';
  }
  
  // Set SMTP fields using name attributes
  const form = document.getElementById('smtpConfigForm') as HTMLFormElement;
  if (form) {
    (form.querySelector('input[name="host"]') as HTMLInputElement).value = config.host || config.smtpHost || '';
    (form.querySelector('input[name="port"]') as HTMLInputElement).value = (config.port || config.smtpPort || 587).toString();
    (form.querySelector('input[name="secure"]') as HTMLInputElement).checked = config.secure || config.smtpSecure || false;
    (form.querySelector('input[name="user"]') as HTMLInputElement).value = config.user || config.smtpUser || '';
    (form.querySelector('input[name="pass"]') as HTMLInputElement).value = ''; // Don't populate password for security
    (form.querySelector('input[name="fromAddress"]') as HTMLInputElement).value = config.fromAddress || config.smtpFromAddress || '';
    (form.querySelector('input[name="fromName"]') as HTMLInputElement).value = config.fromName || config.smtpFromName || '';
  }
}

function clearForm() {
  currentSmtpConfig = null;
  const form = document.getElementById('smtpConfigForm') as HTMLFormElement;
  if (form) {
    form.reset();
  }
  const deleteBtn = document.getElementById('delete-config-btn') as HTMLButtonElement;
  if (deleteBtn) {
    deleteBtn.style.display = 'none';
  }
  // handleScopeChange(); // Removed - not needed with tree-based UI
}

async function loadEffectiveConfig() {
  const statusEl = document.getElementById('config-status') as HTMLElement;
  const effectiveEl = document.getElementById('effective-config') as HTMLElement;
  
  try {
    const scope = (document.getElementById('smtp-scope') as HTMLSelectElement).value;
    const tenantId = scope !== 'GLOBAL' ? (document.getElementById('smtp-tenant-id') as HTMLSelectElement).value : undefined;
    const appId = scope === 'APP' ? (document.getElementById('smtp-app-id') as HTMLSelectElement).value : undefined;
    
    const config = await api('/smtp-configs/effective', {
      method: 'POST',
      body: JSON.stringify({ tenantId, appId })
    });
    
    if (!config) {
      effectiveEl.innerHTML = '<div class="effective-config-item">No configuration found</div>';
      return;
    }
    
    effectiveEl.innerHTML = Object.entries(config)
      .filter(([key, value]) => value !== null && value !== undefined && key !== 'id')
      .map(([key, value]) => `
        <div class="effective-config-item">
          <span class="effective-config-key">${key}:</span>
          <span class="effective-config-value">${key.includes('pass') || key.includes('secret') ? '***' : value}</span>
        </div>
      `).join('');
    
    showStatus(statusEl, 'Effective configuration loaded', 'info');
  } catch (error: any) {
    showStatus(statusEl, `Error: ${error.message}`, 'error');
  }
}

function showStatus(element: HTMLElement | null, message: string, type: 'success' | 'error' | 'info') {
  if (!element) {
    console.error('showStatus called with null element, message:', message);
    return;
  }
  
  element.textContent = message;
  element.className = `config-status ${type}`;
  element.style.display = 'block';
  
  setTimeout(() => {
    element.style.display = 'none';
  }, 5000);
}

// ===============================================
// SMS SETUP AND MODAL MANAGEMENT
// ===============================================

function setupSmsConfig() {
  console.log('Setting up SMS configuration UI');
  
  // Set up SMS modals
  setupSmsConfigModal();
  setupAppSmsConfigModal();
  
  // Initial load if we're in SMS config view
  const currentView = getCurrentView();
  if (currentView === 'sms-config') {
    loadAndDisplaySmsConfigs();
  }
}

function setupSmsConfigModal() {
  console.log('Setting up SMS config modal...');
  
  // Close modal buttons
  const closeBtn = document.getElementById('closeSmsModalBtn');
  const cancelBtn = document.getElementById('cancelSmsModalBtn');
  
  closeBtn?.addEventListener('click', closeSmsConfigModal);
  cancelBtn?.addEventListener('click', closeSmsConfigModal);
  
  // Delete button
  const deleteBtn = document.getElementById('deleteSmsModalBtn');
  deleteBtn?.addEventListener('click', async () => {
    if (currentSmsConfig?.id) {
      await deleteSmsConfig(currentSmsConfig.id);
      closeSmsConfigModal();
    }
  });
  
  // SMS config form submission
  const smsForm = document.getElementById('smsGlobalConfigForm') as HTMLFormElement;
  smsForm?.addEventListener('submit', handleSmsConfigSubmit);
  
  // Click outside to close
  const modal = document.getElementById('smsConfigModal');
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeSmsConfigModal();
    }
  });
}

function setupAppSmsConfigModal() {
  console.log('Setting up app SMS config modal...');
  
  // Close modal buttons
  const closeBtn = document.getElementById('closeAppSmsModalBtn');
  const cancelBtn = document.getElementById('cancelAppSmsModalBtn');
  
  closeBtn?.addEventListener('click', closeAppSmsConfigModal);
  cancelBtn?.addEventListener('click', closeAppSmsConfigModal);
  
  // Delete button
  const deleteBtn = document.getElementById('deleteAppSmsModalBtn');
  deleteBtn?.addEventListener('click', async () => {
    if (currentSmsConfig?.id) {
      await deleteSmsConfig(currentSmsConfig.id);
      closeAppSmsConfigModal();
    }
  });
  
  // App SMS config form submission
  const appSmsForm = document.getElementById('appSmsConfigForm') as HTMLFormElement;
  appSmsForm?.addEventListener('submit', handleAppSmsConfigSubmit);
  
  // Click outside to close
  const modal = document.getElementById('appSmsConfigModal');
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeAppSmsConfigModal();
    }
  });
}

function closeSmsConfigModal() {
  const modal = document.getElementById('smsConfigModal');
  if (modal) {
    modal.style.display = 'none';
  }
  clearSmsForm();
}

function closeAppSmsConfigModal() {
  const modal = document.getElementById('appSmsConfigModal');
  if (modal) {
    modal.style.display = 'none';
  }
  clearSmsForm();
}

function openSmsConfigModal(configId?: string) {
  console.log('openSmsConfigModal called with configId:', configId);
  
  const modal = document.getElementById('smsConfigModal');
  if (!modal) {
    console.error('SMS config modal not found');
    return;
  }
  
  // Clear previous state
  clearSmsForm();
  
  if (configId) {
    // Editing existing config
    editSmsConfig(configId);
  } else {
    // Creating new config
    modal.style.display = 'flex';
    const titleEl = document.getElementById('smsModalTitle');
    if (titleEl) {
      titleEl.textContent = 'New SMS Configuration';
    }
  }
}

function openAppSmsConfigModal(tenantId: string, appId: string, configId?: string) {
  console.log('openAppSmsConfigModal called', { tenantId, appId, configId });
  
  const modal = document.getElementById('appSmsConfigModal');
  if (!modal) {
    console.error('App SMS config modal not found');
    return;
  }
  
  // Clear previous state
  clearSmsForm();
  
  // Set tenant and app context
  const tenantIdInput = document.getElementById('appSmsConfigTenantId') as HTMLInputElement;
  const appIdInput = document.getElementById('appSmsConfigAppId') as HTMLInputElement;
  
  if (tenantIdInput) tenantIdInput.value = tenantId;
  if (appIdInput) appIdInput.value = appId;
  
  if (configId) {
    // Editing existing config
    editSmsConfig(configId);
  } else {
    // Creating new config
    modal.style.display = 'flex';
    const titleEl = document.getElementById('appSmsModalTitle');
    if (titleEl) {
      titleEl.textContent = 'New App SMS Configuration';
    }
  }
}

async function handleSmsConfigSubmit(e: Event) {
  e.preventDefault();
  
  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);
  
  try {
    const smsConfig = {
      scope: 'GLOBAL' as const,
      accountSid: (document.getElementById('modalSmsSid') as HTMLInputElement)?.value,
      authToken: (document.getElementById('modalSmsToken') as HTMLInputElement)?.value,
      fromNumber: (document.getElementById('modalSmsFromNumber') as HTMLInputElement)?.value,
      fallbackToNumber: (document.getElementById('modalSmsFallbackTo') as HTMLInputElement)?.value || undefined,
      messagingServiceSid: (document.getElementById('modalSmsServiceSid') as HTMLInputElement)?.value || undefined,
      isActive: (document.getElementById('modalSmsIsActive') as HTMLInputElement)?.checked || false,
    };
    
    const editConfigId = (document.getElementById('smsEditConfigId') as HTMLInputElement)?.value;
    
    let result;
    if (editConfigId) {
      // Update existing config
      result = await api(`/sms-configs/${editConfigId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smsConfig),
      });
    } else {
      // Create new config
      result = await api('/sms-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smsConfig),
      });
    }
    
    console.log('SMS config saved:', result);
    closeSmsConfigModal();
    await loadAndDisplaySmsConfigs();
    
  } catch (error: any) {
    console.error('Failed to save SMS config:', error);
    alert(`Failed to save SMS configuration: ${error.message}`);
  }
}

async function handleAppSmsConfigSubmit(e: Event) {
  e.preventDefault();
  
  const form = e.target as HTMLFormElement;
  
  try {
    const tenantId = (document.getElementById('appSmsConfigTenantId') as HTMLInputElement)?.value;
    const appId = (document.getElementById('appSmsConfigAppId') as HTMLInputElement)?.value;
    
    const smsConfig = {
      scope: 'APP' as const,
      tenantId,
      appId,
      accountSid: (document.getElementById('appModalSmsSid') as HTMLInputElement)?.value,
      authToken: (document.getElementById('appModalSmsToken') as HTMLInputElement)?.value,
      fromNumber: (document.getElementById('appModalSmsFromNumber') as HTMLInputElement)?.value,
      fallbackToNumber: (document.getElementById('appModalSmsFallbackTo') as HTMLInputElement)?.value || undefined,
      messagingServiceSid: (document.getElementById('appModalSmsServiceSid') as HTMLInputElement)?.value || undefined,
      isActive: (document.getElementById('appModalSmsIsActive') as HTMLInputElement)?.checked || false,
    };
    
    const editConfigId = (document.getElementById('appSmsEditConfigId') as HTMLInputElement)?.value;
    
    let result;
    if (editConfigId) {
      // Update existing config
      result = await api(`/sms-configs/${editConfigId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smsConfig),
      });
    } else {
      // Create new config
      result = await api('/sms-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smsConfig),
      });
    }
    
    console.log('App SMS config saved:', result);
    closeAppSmsConfigModal();
    await loadAndDisplaySmsConfigs();
    
  } catch (error: any) {
    console.error('Failed to save app SMS config:', error);
    alert(`Failed to save SMS configuration: ${error.message}`);
  }
}

// ===============================================
// SMS CONFIGURATION FUNCTIONALITY
// ===============================================

let currentSmsConfig: SmsConfig | null = null;

async function loadAndDisplaySmsConfigs() {
  try {
    // Load all necessary data
    await loadSmsConfigs();
    
    // Check user role to determine what to display
    const roles = state.user?.roles || [];
    const isSuperadmin = roles.includes('superadmin');
    const isTenantAdmin = roles.includes('tenant_admin');
    
    if (isSuperadmin) {
      // Superadmin: full tenant management view
      await loadTenants();
      await loadAllApps(); // Load ALL apps for proper tree display
      await displayGlobalSmsConfigs();
      await displayTenantSmsOverview();
    }
    else if (isTenantAdmin) {
      // Tenant admin: use the EXACT same view as superadmin impersonating their tenant
      const tenantId = state.user?.tenantId;
      const tenantName = state.user?.tenantName || tenantId || 'Your Tenant';
      
      if (tenantId) {
        // Load apps first (backend will filter to tenant's apps)
        await loadAllApps();
        
        // Use the same switchToTenantContext that superadmin uses when impersonating
        // This gives us the exact same polished UI
        // Check if we're currently in compose view to avoid overriding it
        const currentView = getCurrentView();
        const skipViewSwitch = currentView === 'compose';
        
        if ((window as any).switchToSmsConfigTenantContext) {
          (window as any).switchToSmsConfigTenantContext(tenantId, tenantName, skipViewSwitch);
        }
        else {
          console.warn('switchToSmsConfigTenantContext not available, falling back to basic view');
          await displayTenantSmsAdminView();
        }
      }
      else {
        console.error('Tenant admin has no tenantId context');
        await displayTenantSmsAdminView();
      }
    }
    else {
      // Regular user: basic view
      await loadAllApps();
      await displayGlobalSmsConfigs();
      await displayTenantSmsAdminView();
    }
    
    // Update context indicator
    updateContextIndicator();
  }
  catch (error: any) {
    console.error('Failed to load and display SMS configs:', error);
  }
}

async function loadSmsConfigs() {
  try {
    const configs = await api('/sms-configs');
    state.smsConfigs = configs; // Store in state for tree building
    displaySmsConfigList(configs);
  } catch (error: any) {
    console.error('Failed to load SMS configs:', error);
    state.smsConfigs = []; // Clear on error
  }
}

function displaySmsConfigList(configs: SmsConfig[]) {
  // No longer needed - using tree-based UI instead
  console.log('displaySmsConfigList called with', configs.length, 'configs (tree UI is used instead)');
}

async function editSmsConfig(configId: string) {
  console.log('Edit button clicked for SMS config:', configId);
  try {
    const config = await api(`/sms-configs/${configId}`);
    console.log('Loaded SMS config for editing:', config);
    currentSmsConfig = config;
    populateSmsForm(config);
  } catch (error: any) {
    console.error('Failed to load SMS config:', error);
  }
}

async function deleteSmsConfig(configId: string) {
  if (!confirm('Are you sure you want to delete this SMS configuration?')) return;
  
  try {
    await api(`/sms-configs/${configId}`, { method: 'DELETE' });
    await loadSmsConfigs();
    if (currentSmsConfig?.id === configId) {
      clearSmsForm();
    }
  } catch (error: any) {
    console.error('Failed to delete SMS config:', error);
  }
}

function populateSmsForm(config: SmsConfig) {
  // Determine if this is a global/tenant config or app config
  const isAppConfig = config.scope === 'APP';
  const modalId = isAppConfig ? 'appSmsConfigModal' : 'smsConfigModal';
  const formId = isAppConfig ? 'appSmsConfigForm' : 'smsGlobalConfigForm';
  const prefix = isAppConfig ? 'appModal' : 'modal';
  
  // Show the appropriate modal
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
  }
  
  // Set form values
  const form = document.getElementById(formId) as HTMLFormElement;
  if (form) {
    // Set hidden ID for editing
    const editIdInput = document.getElementById(isAppConfig ? 'appSmsEditConfigId' : 'smsEditConfigId') as HTMLInputElement;
    if (editIdInput) {
      editIdInput.value = config.id;
    }
    
    // If app config, set tenant and app IDs
    if (isAppConfig) {
      const tenantIdInput = document.getElementById('appSmsConfigTenantId') as HTMLInputElement;
      const appIdInput = document.getElementById('appSmsConfigAppId') as HTMLInputElement;
      if (tenantIdInput) tenantIdInput.value = config.tenantId || '';
      if (appIdInput) appIdInput.value = config.appId || '';
    }
    
    // Set SMS fields
    const setSmsField = (fieldName: string, value: string | boolean | undefined) => {
      const element = document.getElementById(`${prefix}Sms${fieldName}`) as HTMLInputElement;
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = !!value;
        } else {
          element.value = value?.toString() || '';
        }
      }
    };
    
    setSmsField('Sid', config.sid);
    setSmsField('Token', config.token);
    setSmsField('FromNumber', config.fromNumber);
    setSmsField('FallbackTo', config.fallbackTo);
    setSmsField('ServiceSid', config.serviceSid);
    setSmsField('IsActive', config.isActive);
    
    // Show delete button for existing configs
    const deleteBtn = document.getElementById(isAppConfig ? 'deleteAppSmsModalBtn' : 'deleteSmsModalBtn');
    if (deleteBtn) {
      deleteBtn.style.display = 'block';
    }
    
    // Update modal title
    const titleElement = document.getElementById(isAppConfig ? 'appSmsModalTitle' : 'smsModalTitle');
    if (titleElement) {
      titleElement.textContent = `Edit ${isAppConfig ? 'App ' : ''}SMS Configuration`;
    }
  }
}

function clearSmsForm() {
  // Clear both global and app forms
  const globalForm = document.getElementById('smsGlobalConfigForm') as HTMLFormElement;
  const appForm = document.getElementById('appSmsConfigForm') as HTMLFormElement;
  
  if (globalForm) globalForm.reset();
  if (appForm) appForm.reset();
  
  // Hide delete buttons
  const deleteBtn = document.getElementById('deleteSmsModalBtn');
  const deleteAppBtn = document.getElementById('deleteAppSmsModalBtn');
  if (deleteBtn) deleteBtn.style.display = 'none';
  if (deleteAppBtn) deleteAppBtn.style.display = 'none';
  
  // Reset titles
  const titleElement = document.getElementById('smsModalTitle');
  const appTitleElement = document.getElementById('appSmsModalTitle');
  if (titleElement) titleElement.textContent = 'SMS Configuration';
  if (appTitleElement) appTitleElement.textContent = 'App SMS Configuration';
  
  currentSmsConfig = null;
}

async function displayGlobalSmsConfigs() {
  const cardsContainer = document.getElementById('globalSmsConfigCards');
  const noConfigsMessage = document.getElementById('noGlobalSmsConfigs');
  
  if (!cardsContainer || !noConfigsMessage) return;
  
  const globalConfigs = state.smsConfigs.filter(c => c.scope === 'GLOBAL');
  
  if (globalConfigs.length === 0) {
    cardsContainer.style.display = 'none';
    noConfigsMessage.style.display = 'block';
    return;
  }
  
  cardsContainer.style.display = 'flex';
  noConfigsMessage.style.display = 'none';
  
  // Create header with radio selection info
  const hasActiveConfig = globalConfigs.some(c => c.isActive);
  let cardsHtml = '';
  
  if (globalConfigs.length > 1) {
    cardsHtml += `
      <div class="global-config-header">
        <h3>Global SMS Configurations</h3>
        <p>Select which configuration should be active for global SMS sending:</p>
      </div>
    `;
  }
  
  cardsHtml += globalConfigs.map(config => createGlobalSmsConfigCard(config)).join('');
  cardsContainer.innerHTML = cardsHtml;
}

function createGlobalSmsConfigCard(config: SmsConfig): string {
  const isActive = config.isActive;
  const configName = config.fromNumber || `SMS Config ${config.id.slice(-4)}`;
  const serviceName = 'twilio';
  const fromNumber = config.fromNumber || 'Not set';
  const accountSid = config.sid || 'Not set';
  
  return `
    <div class="global-config-card ${isActive ? 'active' : ''}" data-config-id="${config.id}">
      <div class="global-config-card-header">
        <div class="global-config-card-selector">
          <input type="radio" 
                 name="activeGlobalSmsConfig" 
                 id="sms-radio-${config.id}" 
                 value="${config.id}" 
                 ${isActive ? 'checked' : ''} 
                 onchange="activateGlobalSmsConfig('${config.id}')" />
          <label for="sms-radio-${config.id}" class="radio-label">
            <h3 class="global-config-card-title">${configName}</h3>
          </label>
        </div>
        <div class="global-config-card-status">
          <span class="service-icon ${serviceName}">${serviceName.toUpperCase()}</span>
          ${isActive ? '<span class="active-badge">ACTIVE</span>' : ''}
        </div>
      </div>
      
      <div class="global-config-card-details">
        <div class="global-config-card-detail">
          <span>Account SID:</span>
          <span>${accountSid.length > 10 ? accountSid.substring(0, 10) + '...' : accountSid}</span>
        </div>
        <div class="global-config-card-detail">
          <span>From Number:</span>
          <span>${fromNumber}</span>
        </div>
        <div class="global-config-card-detail">
          <span>Service SID:</span>
          <span>${config.serviceSid || 'None'}</span>
        </div>
      </div>
      
      <div class="global-config-card-actions">
        <button class="global-config-card-btn primary" onclick="editSmsConfig('${config.id}')">Edit</button>
        <button class="global-config-card-btn" onclick="testGlobalSmsConfigById('${config.id}')">Test</button>
        <button class="global-config-card-btn danger" onclick="deleteSmsConfig('${config.id}')">Delete</button>
      </div>
    </div>
  `;
}

async function displayTenantSmsOverview() {
  // Implementation similar to displayTenantOverview but for SMS
  console.log('displayTenantSmsOverview called');
}

async function displayTenantSmsAdminView() {
  // Implementation similar to displayTenantAdminView but for SMS
  console.log('displayTenantSmsAdminView called');
}

async function activateGlobalSmsConfig(configId: string) {
  try {
    await api(`/sms-configs/${configId}/activate`, { method: 'POST' });
    showStatusMessage(document.getElementById('smsConfigStatus') as HTMLElement, 'SMS configuration activated');
    await loadAndDisplaySmsConfigs();
  } catch (error: any) {
    showStatusMessage(document.getElementById('smsConfigStatus') as HTMLElement, 'Error activating SMS config: ' + error.message);
  }
}

async function testGlobalSmsConfigById(configId: string) {
  const testNumber = prompt('Enter a phone number to send a test SMS (include country code, e.g., +1234567890):');
  if (!testNumber) return;
  
  try {
    await api(`/sms-configs/${configId}/test`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: testNumber })
    });
    showStatusMessage(document.getElementById('smsConfigStatus') as HTMLElement, 'Test SMS sent successfully');
  } catch (error: any) {
    showStatusMessage(document.getElementById('smsConfigStatus') as HTMLElement, 'Error sending test SMS: ' + error.message);
  }
}

// Make functions available globally for onclick handlers
(window as any).activateGlobalConfig = activateGlobalConfig;
(window as any).editGlobalConfig = editGlobalConfig;
(window as any).testGlobalConfigById = testGlobalConfigById;
(window as any).deleteGlobalConfigById = deleteGlobalConfigById;
(window as any).switchToTenantContext = switchToTenantContext;
(window as any).clearDraft = clearDraft;
(window as any).returnToCallingAppFromCompose = returnToCallingAppFromCompose;

// SMS functions
(window as any).editSmsConfig = editSmsConfig;
(window as any).deleteSmsConfig = deleteSmsConfig;
(window as any).clearSmsForm = clearSmsForm;
(window as any).openSmsConfigModal = openSmsConfigModal;
(window as any).openAppSmsConfigModal = openAppSmsConfigModal;
(window as any).activateGlobalSmsConfig = activateGlobalSmsConfig;
(window as any).testGlobalSmsConfigById = testGlobalSmsConfigById;

// ===============================================
// COMPOSE INTERFACE FUNCTIONALITY
// ===============================================

interface ComposeFormData {
    recipients: string;
    subject: string;
    content: string;
    fromAddress: string;
    selectedTemplateId: string;
    selectedPreviousMessageId: string;
}

interface ComposeStateData {
    currentAppId: string | null;
    templates: any[];
    previousMessages: any[];
    recipientCount: number;
    formData: ComposeFormData;
    lastSaved: number;
}

// Centralized element management for compose interface
class ComposeElements {
    private static readonly ELEMENT_IDS = {
        recipients: '#recipients',
        subject: '#subject', 
        content: '#messageContent',
        fromAddress: '#fromAddress',
        templateSelect: '#templateSelect',
        previousMessageSelect: '#previousMessageSelect',
        recipientCount: '#addressCount',
        contentHidden: '#messageContentHidden'
    } as const;

    static get recipients(): HTMLTextAreaElement | null {
        return document.querySelector(this.ELEMENT_IDS.recipients);
    }

    static get subject(): HTMLInputElement | null {
        return document.querySelector(this.ELEMENT_IDS.subject);
    }

    static get content(): HTMLElement | null {
        return document.querySelector(this.ELEMENT_IDS.content);
    }

    static get fromAddress(): HTMLInputElement | null {
        return document.querySelector(this.ELEMENT_IDS.fromAddress);
    }

    static get templateSelect(): HTMLSelectElement | null {
        return document.querySelector(this.ELEMENT_IDS.templateSelect);
    }

    static get previousMessageSelect(): HTMLSelectElement | null {
        return document.querySelector(this.ELEMENT_IDS.previousMessageSelect);
    }

    static get recipientCount(): HTMLElement | null {
        return document.querySelector(this.ELEMENT_IDS.recipientCount);
    }

    static get contentHidden(): HTMLTextAreaElement | null {
        return document.querySelector(this.ELEMENT_IDS.contentHidden);
    }

    static getFormData(): ComposeFormData {
        return {
            recipients: this.recipients?.value || '',
            subject: this.subject?.value || '',
            content: this.getTinyMCEContent() || '',
            fromAddress: this.fromAddress?.value || '',
            selectedTemplateId: this.templateSelect?.value || '',
            selectedPreviousMessageId: this.previousMessageSelect?.value || ''
        };
    }

    static setFormData(formData: ComposeFormData): void {
        if (this.recipients && formData.recipients) {
            this.recipients.value = formData.recipients;
        }
        if (this.subject && formData.subject) {
            this.subject.value = formData.subject;
        }
        if (formData.content) {
            this.setContent(formData.content);
        }
        if (this.fromAddress && formData.fromAddress) {
            this.fromAddress.value = formData.fromAddress;
        }
        if (this.templateSelect && formData.selectedTemplateId) {
            this.templateSelect.value = formData.selectedTemplateId;
        }
        if (this.previousMessageSelect && formData.selectedPreviousMessageId) {
            this.previousMessageSelect.value = formData.selectedPreviousMessageId;
        }
    }

    static clearForm(): void {
        if (this.recipients) this.recipients.value = '';
        if (this.subject) this.subject.value = '';
        this.setContent('');
        if (this.fromAddress) this.fromAddress.value = '';
        if (this.templateSelect) this.templateSelect.value = '';
        if (this.previousMessageSelect) this.previousMessageSelect.value = '';
    }

    static setContent(content: string): void {
        const decodedContent = decodeHtmlEntities(content);
        
        // Try to use TinyMCE API if available
        if (window.tinymce && window.tinymce.get('messageContent')) {
            window.tinymce.get('messageContent').setContent(decodedContent);
        } else if (this.content) {
            // Fallback to direct manipulation for textarea before TinyMCE initializes
            (this.content as HTMLTextAreaElement).value = decodedContent;
        }
        
        // Sync to hidden textarea
        if (this.contentHidden) {
            this.contentHidden.value = decodedContent;
        }
    }

    static getTinyMCEContent(): string {
        // Try to get content from TinyMCE first
        if (window.tinymce && window.tinymce.get('messageContent')) {
            return window.tinymce.get('messageContent').getContent();
        } else if (this.content) {
            // Fallback to textarea value
            return (this.content as HTMLTextAreaElement).value || '';
        }
        return '';
    }

    static updateRecipientCount(count: number): void {
        if (this.recipientCount) {
            this.recipientCount.textContent = count.toString();
        }
    }

    static setupEventListeners(debouncedSave: () => void): void {
        // Recipients textarea
        this.recipients?.addEventListener('input', () => {
            updateRecipientCount();
            debouncedSave();
        });

        // Subject field
        this.subject?.addEventListener('input', debouncedSave);

        // From address field
        this.fromAddress?.addEventListener('input', debouncedSave);

        // Content editor
        if (this.content) {
            ['input', 'paste', 'keyup', 'focus', 'blur'].forEach(eventType => {
                this.content!.addEventListener(eventType, debouncedSave);
            });

            // Mutation observer for content changes
            const observer = new MutationObserver(debouncedSave);
            observer.observe(this.content, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }
    }
}

let composeState = {
    currentAppId: null as string | null,
    templates: [] as any[],
    previousMessages: [] as any[],
    recipientCount: 0,
    eventListenersSetup: false,
    recipientsData: [] as any[]
};

// State persistence utilities
function saveComposeState() {
    if (!composeState.currentAppId) return;
    
    try {
        const formData = ComposeElements.getFormData();

        const stateToSave: ComposeStateData = {
            currentAppId: composeState.currentAppId,
            templates: composeState.templates,
            previousMessages: composeState.previousMessages,
            recipientCount: composeState.recipientCount,
            formData,
            lastSaved: Date.now()
        };

        localStorage.setItem(`composeState_${composeState.currentAppId}`, JSON.stringify(stateToSave));
        console.log('[Compose] State saved for app:', composeState.currentAppId);
    } catch (error) {
        console.warn('[Compose] Failed to save state:', error);
    }
}

function loadComposeState(appId: string): ComposeStateData | null {
    try {
        const saved = localStorage.getItem(`composeState_${appId}`);
        if (!saved) return null;
        
        const parsed: ComposeStateData = JSON.parse(saved);
        
        // Validate the saved state
        if (!parsed.currentAppId || parsed.currentAppId !== appId) {
            console.warn('[Compose] Invalid saved state for app:', appId);
            return null;
        }
        
        // Check if state is too old (older than 24 hours)
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (Date.now() - parsed.lastSaved > maxAge) {
            console.log('[Compose] Saved state is too old, ignoring');
            clearComposeState(appId);
            return null;
        }
        
        console.log('[Compose] Loaded saved state for app:', appId);
        return parsed;
    } catch (error) {
        console.warn('[Compose] Failed to load saved state:', error);
        return null;
    }
}

function clearComposeState(appId?: string) {
    try {
        if (appId) {
            localStorage.removeItem(`composeState_${appId}`);
            console.log('[Compose] Cleared state for app:', appId);
        } else if (composeState.currentAppId) {
            localStorage.removeItem(`composeState_${composeState.currentAppId}`);
            console.log('[Compose] Cleared current state');
        }
    } catch (error) {
        console.warn('[Compose] Failed to clear state:', error);
    }
}

function restoreFormData(formData: ComposeFormData) {
    try {
        ComposeElements.setFormData(formData);
        
        // Update recipient count
        updateRecipientCount();
        
        console.log('[Compose] Form data restored');
    } catch (error) {
        console.warn('[Compose] Failed to restore form data:', error);
    }
}

function clearComposeForm() {
    try {
        ComposeElements.clearForm();
        updateRecipientCount();
        
        console.log('[Compose] Form cleared');
    } catch (error) {
        console.warn('[Compose] Failed to clear form:', error);
    }
}

// Clear draft function for user-initiated clearing
function clearDraft() {
    if (confirm('Are you sure you want to clear the current draft? This will remove all content and cannot be undone.')) {
        clearComposeForm();
        if (composeState.currentAppId) {
            clearComposeState(composeState.currentAppId);
        }
        showStatusMessage($('#composeStatus') as HTMLElement, 'Draft cleared');
    }
}

// Initialize compose interface
async function initComposeInterface() {
    console.log('[Compose] Initializing compose interface');
    
    // Get appId and recipients from URL parameters (passed from /compose redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const appIdFromUrl = urlParams.get('appId');
    const recipientsFromUrl = urlParams.get('recipients');
    
    // Handle recipients data if provided
    let recipientsData: any[] = [];
    if (recipientsFromUrl) {
        try {
            recipientsData = JSON.parse(decodeURIComponent(recipientsFromUrl));
            console.log('[Compose] Recipients data loaded from URL:', recipientsData.length, 'recipients');
            
            // Store recipients data for template processing
            composeState.recipientsData = recipientsData;
        } catch (error) {
            console.error('[Compose] Failed to parse recipients data:', error);
        }
    }
    
    if (appIdFromUrl) {
        composeState.currentAppId = appIdFromUrl;
        
        // Save page state to preserve the appId for future refreshes
        savePageState();
        
        // Try to restore saved state first
        const savedState = loadComposeState(appIdFromUrl);
        if (savedState && !recipientsFromUrl) {
            console.log('[Compose] Restoring from saved state');
            
            // Restore compose state
            composeState.templates = savedState.templates;
            composeState.previousMessages = savedState.previousMessages;
            composeState.recipientCount = savedState.recipientCount;
            
            // Populate dropdowns from saved data
            populateTemplateDropdown(savedState.templates);
            populatePreviousMessagesDropdown(savedState.previousMessages);
            
            // Setup event listeners first
            setupComposeEventListeners();
            
            // Restore form data after a brief delay to ensure DOM is ready
            setTimeout(() => {
                restoreFormData(savedState.formData);
            }, 100);
            
            console.log('[Compose] State restored from cache');
        } else {
            console.log('[Compose] No saved state or recipients provided, loading fresh data');
            await loadComposeData();
            setupComposeEventListeners();
            
            // If recipients data provided, populate the recipients field
            if (recipientsData.length > 0) {
                populateRecipientsFromData(recipientsData);
            }
        }
    } else {
        console.log('[Compose] No appId in URL, checking for saved state');
        // No appId in URL - this might be a refresh after auth redirect
        // Try to get appId from saved page state
        const savedPageState = localStorage.getItem('pageState');
        let savedAppId = null;
        
        if (savedPageState) {
            try {
                const parsed = JSON.parse(savedPageState);
                savedAppId = parsed.appId;
                console.log('[Compose] Found appId in saved page state:', savedAppId);
            } catch (error) {
                console.warn('[Compose] Failed to parse saved page state:', error);
            }
        }
        
        if (savedAppId) {
            composeState.currentAppId = savedAppId;
            console.log('[Compose] Using appId from saved state:', savedAppId);
            
            // Update URL to include the appId
            const url = new URL(window.location.href);
            url.searchParams.set('appId', savedAppId);
            history.replaceState(null, '', url.toString());
            
            // Load data and setup
            await loadComposeData();
            setupComposeEventListeners();
            
            // Try to restore form state
            const savedState = loadComposeState(savedAppId);
            if (savedState) {
                setTimeout(() => {
                    restoreFormData(savedState.formData);
                }, 100);
                console.log('[Compose] Form state restored from cache');
            }
        } else {
            console.warn('[Compose] No appId available - user may need to be redirected to an app');
            setupComposeEventListeners();
        }
    }
    
    updateRecipientCount();
}

// Initialize template editor interface
async function initTemplateEditorInterface() {
    console.log('[Template Editor] Initializing template editor interface');
    
    // Get returnUrl and appId from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    templateEditorState.returnUrl = urlParams.get('returnUrl') || '';
    templateEditorState.currentAppId = urlParams.get('appId') || appId;
    
    // Load templates for the current app
    await loadTemplateEditorData();
    
    // Setup event listeners
    setupTemplateEditorEventListeners();
    
    // Initialize TinyMCE for template content
    initTemplateEditorTinyMCE();
    
    console.log('[Template Editor] Initialization complete');
}

// Template editor state
const templateEditorState = {
    currentAppId: '',
    returnUrl: '',
    templates: [] as TemplateRecord[],
    currentTemplate: null as TemplateRecord | null,
    isEditMode: false
};

// Load templates for template editor
async function loadTemplateEditorData() {
    if (!templateEditorState.currentAppId) {
        console.warn('[Template Editor] No appId available for loading templates');
        return;
    }
    
    try {
        const templates = await api(`/templates?appId=${templateEditorState.currentAppId}`);
        templateEditorState.templates = templates;
        populateTemplateEditorDropdown(templates);
        
        console.log('[Template Editor] Loaded templates:', templates.length);
    } catch (error) {
        console.error('[Template Editor] Failed to load templates', error);
        showStatusMessage($('#templateEditorStatus') as HTMLElement, 'Error loading templates: ' + (error as Error).message);
    }
}

// Populate template editor dropdown
function populateTemplateEditorDropdown(templates: TemplateRecord[]) {
    const select = $('#templateEditorSelect') as HTMLSelectElement;
    select.innerHTML = '<option value="">-- Create New Template --</option>';
    
    templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = `${template.title} (v${template.version})`;
        select.appendChild(option);
    });
}

// Setup template editor event listeners
function setupTemplateEditorEventListeners() {
    const templateSelect = $('#templateEditorSelect') as HTMLSelectElement;
    const titleInput = $('#templateTitle') as HTMLInputElement;
    const subjectInput = $('#templateSubject') as HTMLInputElement;
    const saveNewBtn = $('#saveNewTemplateBtn') as HTMLButtonElement;
    const updateBtn = $('#updateTemplateBtn') as HTMLButtonElement;
    const cancelBtn = $('#cancelTemplateEditBtn') as HTMLButtonElement;
    
    // Template selection change
    templateSelect.addEventListener('change', async () => {
        const templateId = templateSelect.value;
        if (templateId) {
            await loadTemplateForEditing(templateId);
        } else {
            clearTemplateEditor();
        }
    });
    
    // Save as new template
    saveNewBtn.addEventListener('click', async () => {
        await saveNewTemplate();
    });
    
    // Update existing template
    updateBtn.addEventListener('click', async () => {
        await updateExistingTemplate();
    });
    
    // Cancel editing
    cancelBtn.addEventListener('click', () => {
        cancelTemplateEditing();
    });
}

// Load template for editing
async function loadTemplateForEditing(templateId: string) {
    try {
        const template = await api(`/templates/${templateId}`);
        templateEditorState.currentTemplate = template;
        templateEditorState.isEditMode = true;
        
        // Populate form fields
        ($('#templateTitle') as HTMLInputElement).value = template.title;
        ($('#templateSubject') as HTMLInputElement).value = template.subject || '';
        
        // Set TinyMCE content with HTML decoding
        if (window.tinymce && window.tinymce.get('templateContent')) {
            const decodedContent = decodeHtmlEntities(template.content || '');
            window.tinymce.get('templateContent').setContent(decodedContent);
        }
        
        // Show/hide buttons
        ($('#saveNewTemplateBtn') as HTMLButtonElement).style.display = 'inline-block';
        ($('#updateTemplateBtn') as HTMLButtonElement).style.display = 'inline-block';
        
        console.log('[Template Editor] Loaded template for editing:', template.title);
    } catch (error) {
        console.error('[Template Editor] Failed to load template:', error);
        showStatusMessage($('#templateEditorStatus') as HTMLElement, 'Error loading template: ' + (error as Error).message);
    }
}

// Clear template editor form
function clearTemplateEditor() {
    templateEditorState.currentTemplate = null;
    templateEditorState.isEditMode = false;
    
    ($('#templateTitle') as HTMLInputElement).value = '';
    ($('#templateSubject') as HTMLInputElement).value = '';
    
    // Clear TinyMCE content
    if (window.tinymce && window.tinymce.get('templateContent')) {
        window.tinymce.get('templateContent').setContent('');
    }
    
    // Show/hide buttons
    ($('#saveNewTemplateBtn') as HTMLButtonElement).style.display = 'inline-block';
    ($('#updateTemplateBtn') as HTMLButtonElement).style.display = 'none';
}

// Save new template
async function saveNewTemplate() {
    const title = ($('#templateTitle') as HTMLInputElement).value.trim();
    const subject = ($('#templateSubject') as HTMLInputElement).value.trim();
    
    if (!title) {
        showStatusMessage($('#templateEditorStatus') as HTMLElement, 'Template title is required');
        return;
    }
    
    // Get content from TinyMCE
    let content = '';
    if (window.tinymce && window.tinymce.get('templateContent')) {
        content = window.tinymce.get('templateContent').getContent();
    }
    
    try {
        const newTemplate = await api('/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                appId: templateEditorState.currentAppId,
                title,
                subject,
                content,
                version: 1
            })
        });
        
        showStatusMessage($('#templateEditorStatus') as HTMLElement, 'Template saved successfully!');
        
        // Reload template list
        await loadTemplateEditorData();
        
        // Return to calling app if returnUrl provided
        if (templateEditorState.returnUrl) {
            setTimeout(() => {
                returnToCallingApp('saved', newTemplate);
            }, 1000);
        }
        
    } catch (error) {
        console.error('[Template Editor] Failed to save template:', error);
        showStatusMessage($('#templateEditorStatus') as HTMLElement, 'Error saving template: ' + (error as Error).message);
    }
}

// Update existing template
async function updateExistingTemplate() {
    if (!templateEditorState.currentTemplate) {
        showStatusMessage($('#templateEditorStatus') as HTMLElement, 'No template selected for updating');
        return;
    }
    
    const title = ($('#templateTitle') as HTMLInputElement).value.trim();
    const subject = ($('#templateSubject') as HTMLInputElement).value.trim();
    
    if (!title) {
        showStatusMessage($('#templateEditorStatus') as HTMLElement, 'Template title is required');
        return;
    }
    
    // Get content from TinyMCE
    let content = '';
    if (window.tinymce && window.tinymce.get('templateContent')) {
        content = window.tinymce.get('templateContent').getContent();
    }
    
    try {
        const updatedTemplate = await api(`/templates/${templateEditorState.currentTemplate.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                subject,
                content
            })
        });
        
        showStatusMessage($('#templateEditorStatus') as HTMLElement, 'Template updated successfully!');
        
        // Reload template list
        await loadTemplateEditorData();
        
        // Return to calling app if returnUrl provided
        if (templateEditorState.returnUrl) {
            setTimeout(() => {
                returnToCallingApp('updated', updatedTemplate);
            }, 1000);
        }
        
    } catch (error) {
        console.error('[Template Editor] Failed to update template:', error);
        showStatusMessage($('#templateEditorStatus') as HTMLElement, 'Error updating template: ' + (error as Error).message);
    }
}

// Cancel template editing and return to calling app
function cancelTemplateEditing() {
    if (templateEditorState.returnUrl) {
        returnToCallingApp('cancelled', null);
    } else {
        // Clear form if no return URL
        clearTemplateEditor();
        showStatusMessage($('#templateEditorStatus') as HTMLElement, 'Editing cancelled');
    }
}

// Return to calling app with result
function returnToCallingApp(action: string, template: TemplateRecord | null) {
    if (templateEditorState.returnUrl) {
        const returnUrl = new URL(templateEditorState.returnUrl);
        returnUrl.searchParams.set('action', action);
        if (template) {
            returnUrl.searchParams.set('templateId', template.id);
            returnUrl.searchParams.set('templateTitle', template.title);
        }
        
        console.log('[Template Editor] Returning to calling app:', returnUrl.toString());
        window.location.href = returnUrl.toString();
    }
}

// Initialize TinyMCE for template editor
function initTemplateEditorTinyMCE() {
    if (window.tinymce) {
        window.tinymce.init({
            selector: '#templateContent',
            height: 400,
            menubar: false,
            plugins: 'advlist autolink lists link image charmap print preview anchor searchreplace visualblocks code fullscreen insertdatetime media table paste code help wordcount',
            toolbar: 'undo redo | formatselect | bold italic underline | \
                     alignleft aligncenter alignright alignjustify | \
                     bullist numlist outdent indent | removeformat | help',
            content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, San Francisco, Segoe UI, Roboto, Helvetica Neue, sans-serif; font-size: 14px; }'
        });
    }
}

// Load templates, previous messages, and SMTP config
async function loadComposeData() {
    if (!composeState.currentAppId) {
        console.warn('[Compose] No appId available for loading data');
        return;
    }
    
    try {
        // Load templates
        const templates = await api(`/api/templates?appId=${composeState.currentAppId}`);
        composeState.templates = templates;
        populateTemplateDropdown(templates);
        
        // Load previous messages 
        const previousMessages = await api(`/api/previous-messages?appId=${composeState.currentAppId}`);
        composeState.previousMessages = previousMessages;
        populatePreviousMessagesDropdown(previousMessages);
        
        // Load SMTP from address
        const smtpFrom = await api(`/api/smtp-from?appId=${composeState.currentAppId}`);
        ($('#fromAddress') as HTMLInputElement).value = smtpFrom.formatted;
        
        console.log('[Compose] Loaded compose data', { 
            templates: templates.length, 
            messages: previousMessages.length 
        });
        
    } catch (error) {
        console.error('[Compose] Failed to load compose data', error);
        showStatusMessage($('#composeStatus') as HTMLElement, 'Error loading compose data: ' + (error as Error).message);
    }
}

// Populate template dropdown
function populateTemplateDropdown(templates: any[]) {
    const select = $('#templateSelect') as HTMLSelectElement;
    select.innerHTML = '<option value="">-- Select a template --</option>';
    
    templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.title || 'Untitled Template';
        // Add version info as description
        if (template.version) {
            option.textContent += ` (v${template.version})`;
        }
        select.appendChild(option);
    });
}

// Populate previous messages dropdown  
function populatePreviousMessagesDropdown(messages: any[]) {
    const select = $('#previousMessageSelect') as HTMLSelectElement;
    select.innerHTML = '<option value="">-- Select previous message --</option>';
    
    messages.forEach(message => {
        const option = document.createElement('option');
        option.value = message.messageId;
        const date = new Date(message.sent).toISOString().substring(0, 19).replace('T', ' ');
        option.textContent = `${date} - ${message.subject || 'No Subject'}`;
        select.appendChild(option);
    });
}

// Populate recipients field from recipients data array
function populateRecipientsFromData(recipientsData: any[]) {
    const recipientsTextarea = ComposeElements.recipients;
    if (!recipientsTextarea || !recipientsData.length) return;
    
    // Extract name and email from each recipient
    const recipientStrings = recipientsData.map(recipient => {
        const email = recipient.email || '';
        const name = recipient.name || recipient['full name'] || recipient['first name'] + ' ' + recipient['last name'] || '';
        
        if (name && name.trim()) {
            return `${name.trim()} <${email}>`;
        } else {
            return email;
        }
    }).filter(r => r); // Remove empty entries
    
    // Set the recipients textarea
    recipientsTextarea.value = recipientStrings.join('\n');
    
    // Update recipient count
    updateRecipientCount();
    
    console.log('[Compose] Populated recipients from data:', recipientStrings.length, 'recipients');
}

// Setup event listeners for compose form
function setupComposeEventListeners() {
    // Prevent duplicate event listener setup
    if (composeState.eventListenersSetup) {
        console.log('[Compose] Event listeners already setup, skipping');
        return;
    }
    
    console.log('[Compose] Setting up event listeners');
    composeState.eventListenersSetup = true;
    
    // Create a debounced save function to avoid too frequent saves
    let saveTimeout: number | null = null;
    const debouncedSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = window.setTimeout(() => {
            saveComposeState();
        }, 1000); // Save 1 second after user stops typing
    };
    
    // Setup all element event listeners through the centralized class
    ComposeElements.setupEventListeners(debouncedSave);
    
    // Initialize rich text editor
    initializeRichTextEditor();
    
    // Template selection - save state on change
    const templateSelect = ComposeElements.templateSelect;
    if (templateSelect) {
        templateSelect.addEventListener('change', async function() {
            if (this.value) {
                await loadTemplateContent(this.value);
            }
            saveComposeState(); // Save immediately when template is selected
        });
    }
    
    // Previous message selection - save state on change
    const previousMessageSelect = ComposeElements.previousMessageSelect;
    if (previousMessageSelect) {
        previousMessageSelect.addEventListener('change', async function() {
            if (this.value) {
                await loadPreviousMessageContent(this.value);
            }
            saveComposeState(); // Save immediately when message is selected
        });
    }
    
    // Compose form submission
    const composeForm = $('#composeForm') as HTMLFormElement;
    if (composeForm) {
        composeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await sendComposedMessage();
        });
    }
    
    // Save state when page is about to unload
    window.addEventListener('beforeunload', () => {
        saveComposeState();
    });
}

// Update recipient count display
function updateRecipientCount() {
    const recipientsText = ComposeElements.recipients?.value || '';
    const lines = recipientsText.trim().split('\n').filter(line => line.trim() !== '');
    composeState.recipientCount = lines.length;
    
    ComposeElements.updateRecipientCount(composeState.recipientCount);
}

// Shared function for loading content into the rich text editor
function loadContentIntoEditor(content: string, contentType: string) {
    console.log(`[Debug] ${contentType} content:`, content);
    
    ComposeElements.setContent(content);
    console.log(`[Debug] Content loaded via ComposeElements.setContent`);
}

// Load template content
async function loadTemplateContent(templateId: string) {
    try {
        const template = await api(`/api/template/${templateId}`);
        
        // Clear previous message selection
        ($('#previousMessageSelect') as HTMLSelectElement).value = '';
        
        // Populate form fields
        ($('#subject') as HTMLInputElement).value = template.subject || '';
        
        // Load content into the rich text editor
        const content = template.content || '';
        loadContentIntoEditor(content, 'Template');
        
        console.log('[Compose] Loaded template content', templateId);
    } catch (error) {
        console.error('[Compose] Failed to load template', error);
        showStatusMessage($('#composeStatus') as HTMLElement, 'Error loading template: ' + (error as Error).message);
    }
}

// Load previous message content  
async function loadPreviousMessageContent(messageId: string) {
    try {
        const message = await api(`/api/previous-message/${messageId}`);
        
        // Clear template selection
        ($('#templateSelect') as HTMLSelectElement).value = '';
        
        // Populate form fields
        ($('#subject') as HTMLInputElement).value = message.subject || '';
        
        // Load content into the rich text editor
        const content = message.message || '';
        loadContentIntoEditor(content, 'Previous message');
        
        console.log('[Compose] Loaded previous message content', messageId);
    } catch (error) {
        console.error('[Compose] Failed to load previous message', error);
        showStatusMessage($('#composeStatus') as HTMLElement, 'Error loading previous message: ' + (error as Error).message);
    }
}

// Initialize rich text editor functionality
// Initialize TinyMCE rich text editor
function initializeRichTextEditor() {
    if (typeof window.tinymce === 'undefined') {
        console.error('[TinyMCE] TinyMCE not loaded');
        return;
    }
    
    window.tinymce.init({
        selector: '#messageContent',
        plugins: 'lists table image link preview wordcount code autolink autosave',
        toolbar: [
            'bold italic underline strikethrough | alignleft aligncenter alignright alignjustify',
            'bullist numlist | outdent indent | blockquote | link image table | code preview | wordcount'
        ],
        menubar: false,
        height: 300,
        resize: 'both',
        relative_urls: false,
        remove_script_host: false,
        content_style: 'body { font-family: Arial, sans-serif; font-size: 14px; }',
        setup: function(editor: any) {
            editor.on('change input', function() {
                // Sync content to hidden textarea for form submission
                const hiddenTextarea = ComposeElements.contentHidden;
                if (hiddenTextarea) {
                    hiddenTextarea.value = editor.getContent();
                }
            });
        },
        init_instance_callback: function(editor: any) {
            console.log('[TinyMCE] Editor initialized:', editor.id);
        }
    });
}

// Send composed message
async function sendComposedMessage() {
    try {
        // Debug token state at send time
        console.log('[sendComposedMessage] Token state:', {
            hasToken: !!authToken,
            tokenLength: authToken?.length || 0,
            tokenPreview: authToken ? authToken.substring(0, 20) + '...' : 'none'
        });
        
        // Get content from TinyMCE before reading form data
        const messageContent = TinyMCEManager.getContent('#messageContent');
        
        // Update the hidden field with TinyMCE content
        const hiddenField = document.getElementById('messageContentHidden') as HTMLTextAreaElement;
        if (hiddenField) {
            hiddenField.value = messageContent;
        }
        
        const form = $('#composeForm') as HTMLFormElement;
        const formData = new FormData(form);
        
        const recipients = (formData.get('recipients') as string || '').trim();
        const subject = (formData.get('subject') as string || '').trim();
        const sendMode = ($('#sendMode') as HTMLSelectElement).value || 'individual';
        
        // Debug form values
        console.log('[sendComposedMessage] Form values:', {
            recipients: recipients.substring(0, 50) + '...',
            subject,
            messageContentLength: messageContent.length,
            sendMode
        });
        
        if (!recipients) {
            showStatusMessage($('#composeStatus') as HTMLElement, 'Please enter at least one recipient');
            return;
        }
        
        if (!subject) {
            showStatusMessage($('#composeStatus') as HTMLElement, 'Please enter a subject');
            return;
        }
        
        if (!messageContent || messageContent.trim() === '') {
            showStatusMessage($('#composeStatus') as HTMLElement, 'Please enter message content');
            return;
        }
        
        // Show sending status
        showStatusMessage($('#composeStatus') as HTMLElement, 'Processing message...');
        
        // Parse recipients into array of email strings
        const recipientEmails = recipients.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                // Extract email from "Name <email>" format
                const match = line.match(/<([^>]+)>/);
                return match ? match[1] : line;
            });
        
        // Get appId from URL parameters (for view-based system) or fallback to global state
        const urlParams = new URLSearchParams(window.location.search);
        const currentAppId = urlParams.get('appId') || composeState.currentAppId;
        
        console.log('[Compose] Processing message:', {
            appId: currentAppId,
            subject,
            recipientCount: recipientEmails.length,
            sendMode,
            hasRecipientsData: composeState.recipientsData.length > 0
        });
        
        if (!currentAppId) {
            showStatusMessage($('#composeStatus') as HTMLElement, 'Error: No app ID found. Please refresh and try again.');
            return;
        }
        
        // Check if we have recipient data for template variable substitution
        const hasRecipientsData = composeState.recipientsData.length > 0;
        const shouldProcessTemplates = hasRecipientsData && (
            sendMode === 'individual' || 
            (sendMode !== 'individual' && recipientEmails.length === 1)
        );
        
        // Prepare recipients data for backend processing
        let recipientsData;
        if (shouldProcessTemplates) {
            console.log('[Template] Preparing template data for backend processing');
            
            // Send recipients with their context data for backend template processing
            recipientsData = recipientEmails.map(email => {
                const recipientData = composeState.recipientsData.find(r => r.email === email);
                if (recipientData) {
                    return recipientData; // Full context for template substitution
                } else {
                    console.warn('[Template] No recipient data found for:', email, '- sending basic recipient info');
                    return { email: email }; // Basic recipient without template context
                }
            });
        } else {
            console.log('[Template] No template processing needed');
            recipientsData = recipientEmails.map(email => ({ email }));
        }
        
        showStatusMessage($('#composeStatus') as HTMLElement, 'Sending message...');
        
        // Handle attachments if any are selected
        const attachmentInput = $('#attachments') as HTMLInputElement;
        const attachments = attachmentInput?.files;
        
        if (attachments && attachments.length > 0) {
            // For now, show a warning that attachments aren't yet supported
            showStatusMessage($('#composeStatus') as HTMLElement, 'Warning: Attachments are not yet supported and will be ignored.');
            console.warn('[Compose] Attachments selected but not yet supported:', attachments.length, 'files');
        }
        
        let result: any;
        
        console.log('[Template] Sending to backend for processing:', {
            hasTemplateData: shouldProcessTemplates,
            recipientCount: recipientsData.length,
            sendMode: sendMode
        });
        
        // Send to backend - let backend handle all template processing
        result = await api('/send-now', {
            method: 'POST',
            body: JSON.stringify({
                appId: currentAppId,
                subject: subject, // Raw template subject (may contain ${variable} placeholders)
                html: messageContent, // Raw template HTML (may contain ${variable} placeholders)
                recipients: recipientsData, // Recipients with full context data for template processing
                sendMode: sendMode
            })
        });
        
        console.log('[Compose] Send result:', result);
        
        // Clear saved state after successful send
        if (composeState.currentAppId) {
            clearComposeState(composeState.currentAppId);
            console.log('[Compose] Cleared saved state after successful send');
        }
        
        // Show success dialog with results
        showSendSummaryDialog(result, recipientEmails.length);
        
    } catch (error) {
        console.error('[Compose] Send failed:', error);
        showStatusMessage($('#composeStatus') as HTMLElement, 'Send failed: ' + (error as Error).message);
    }
}

// Show send summary dialog
function showSendSummaryDialog(result: any, recipientCount: number) {
    const status = result.scheduled ? 'Scheduled' : 'Queued for delivery';
    const details = result.scheduled 
        ? `Your message has been scheduled and will be sent at the specified time.`
        : `Your message has been queued and should be delivered shortly. Check your email server logs for delivery confirmation.`;
    
    let message = `✅ Message ${status.toLowerCase()}!\n\n` +
                  `Recipients: ${recipientCount}\n` +
                  `Group ID: ${result.groupId || 'N/A'}\n` +
                  `Jobs Created: ${result.jobCount || recipientCount}\n` +
                  `Status: ${status}\n\n`;
    
    // Add template processing info if applicable
    if (result.successCount !== undefined) {
        message += `✅ Successful sends: ${result.successCount}\n`;
        if (result.errorCount > 0) {
            message += `❌ Failed sends: ${result.errorCount}\n`;
        }
        message += `📧 Template variables processed for individual recipients\n\n`;
    }
    
    message += details;
    
    alert(message);
    
    // For editors, return to calling app after successful send
    returnToCallingAppFromCompose();
}

// Return to calling application from compose view (for editors)
function returnToCallingAppFromCompose() {
    const urlParams = new URLSearchParams(window.location.search);
    let returnUrl = urlParams.get('returnUrl');
    
    // If no returnUrl in current URL, try to get it from localStorage (for post-refresh scenarios)
    if (!returnUrl) {
        returnUrl = localStorage.getItem('editorReturnUrl');
    }
    
    // If there's a returnUrl, this means we were opened from an external app in a new window
    // The window should close itself (popup behavior)
    if (returnUrl) {
        console.log('[UI] Closing compose window (opened from external app)');
        
        // Clear the saved returnUrl
        localStorage.removeItem('editorReturnUrl');
        
        // Close the window
        try {
            window.close();
            // If window.close() doesn't work immediately, show a message
            setTimeout(() => {
                if (!window.closed) {
                    alert('Action completed! You can now close this window.');
                }
            }, 100);
        } catch (error) {
            console.warn('[UI] Could not close window:', error);
            alert('Action completed! Please close this window.');
        }
        return;
    }
    
    // No returnUrl - this is internal mail-service usage, stay in the app
    console.log('[UI] No returnUrl found, staying in mail service');
    const roles: string[] = state.user?.roles || [];
    const isEditorOnly = roles.includes('editor') && !roles.some((r: string)=> r==='tenant_admin' || r==='superadmin');
    
    if (!isEditorOnly) {
        // Default redirect to apps view for admins
        showView('apps');
    }
}

init();
