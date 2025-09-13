console.log('SMTP Tree UI loaded');

let selectedNode = null;
let smtpConfigs = [];
let tenants = [];
let apps = [];

// Authentication and role-based access control state
let isAuthenticated = false;
let currentRole = 'super-admin';
let currentTenantId = null;
let currentAppId = null;

// Initialize user role from authentication
async function initializeUserRole() {
    try {
        console.log('Checking for authenticated user...');
        // Get current user info from backend (includes token data + app context)
        const userInfo = await apiCall('/auth/user-info');
        
        if (userInfo && userInfo.role) {
            console.log('Authenticated user found:', userInfo);
            isAuthenticated = true;
            currentRole = userInfo.role; // from token
            currentAppId = userInfo.appId; // from URL param/token context
            
            // Look up tenant from app if appId is provided
            if (currentAppId) {
                const app = apps.find(a => a.id === currentAppId);
                if (app) {
                    currentTenantId = app.tenantId;
                    console.log(`App context: ${app.name} (${currentAppId}) in tenant ${currentTenantId}`);
                }
            }
            
            // Hide role simulator for authenticated users
            const roleSimulator = document.getElementById('roleSimulator');
            if (roleSimulator) {
                roleSimulator.style.display = 'none';
            }
            
            // Show authentication status
            displayAuthenticatedRole(userInfo);
            
            // Apply role-based restrictions immediately
            applyAuthenticatedRole();
            
            return true;
        }
    } catch (error) {
        console.log('No authenticated user or auth disabled, using role simulator');
    }
    
    isAuthenticated = false;
    // Keep role simulator visible for testing
    const roleSimulator = document.getElementById('roleSimulator');
    if (roleSimulator) {
        roleSimulator.style.display = 'block';
    }
    
    return false;
}

// Display authenticated role status
function displayAuthenticatedRole(userInfo) {
    const roleStatus = document.getElementById('roleStatus');
    if (!roleStatus) return;
    
    let statusMessage = '';
    
    if (currentRole === 'super-admin') {
        statusMessage = '🔧 Super Admin (Authenticated): Can view and edit all SMTP configurations';
    } else if (currentRole === 'tenant-admin') {
        const tenant = tenants.find(t => t.id === currentTenantId);
        const tenantName = tenant ? tenant.name : currentTenantId;
        statusMessage = `🏢 Tenant Admin (Authenticated) for "${tenantName}": Can view and edit tenant and app configs within this tenant only`;
    } else if (currentRole === 'app-user') {
        const app = apps.find(a => a.id === currentAppId);
        const tenant = tenants.find(t => t.id === currentTenantId);
        const appName = app ? app.name : currentAppId;
        const tenantName = tenant ? tenant.name : currentTenantId;
        statusMessage = `📱 App User (Authenticated) for "${appName}" (${tenantName}): Can only compose and send emails - no configuration access`;
    }
    
    roleStatus.textContent = statusMessage;
    roleStatus.style.color = '#4CAF50'; // Green to indicate authenticated status
}

// Apply role restrictions for authenticated users
function applyAuthenticatedRole() {
    if (currentRole === 'app-user') {
        // Force app users to the compose view and hide SMTP config navigation
        showView('compose');
        const smtpConfigBtn = document.querySelector('[data-view="smtp-config"]');
        if (smtpConfigBtn) {
            smtpConfigBtn.style.display = 'none';
        }
    } else {
        // Show SMTP Config navigation for non-app users
        const smtpConfigBtn = document.querySelector('[data-view="smtp-config"]');
        if (smtpConfigBtn) {
            smtpConfigBtn.style.display = '';
        }
    }
}

async function apiCall(path, options = {}) {
    const response = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!response.ok) throw new Error('API Error: ' + response.status);
    return response.json();
}

// Role-based access control functions
function populateRoleSelectors() {
    const tenantSelect = document.getElementById('roleTenantSelect');
    const appSelect = document.getElementById('roleAppSelect');
    
    console.log('Populating role selectors with:', tenants.length, 'tenants,', apps.length, 'apps');
    console.log('tenantSelect element found:', !!tenantSelect, tenantSelect);
    console.log('appSelect element found:', !!appSelect, appSelect);
    
    if (!tenantSelect || !appSelect) {
        console.error('Role selector elements not found!');
        return;
    }
    
    // Clear and populate tenant dropdown using DOM methods instead of innerHTML
    tenantSelect.innerHTML = '';
    const defaultTenantOption = document.createElement('option');
    defaultTenantOption.value = '';
    defaultTenantOption.textContent = 'Select Tenant...';
    tenantSelect.appendChild(defaultTenantOption);
    
    tenants.forEach(tenant => {
        console.log('Adding tenant:', tenant.name, tenant.id);
        const option = document.createElement('option');
        option.value = tenant.id;
        option.textContent = tenant.name;
        tenantSelect.appendChild(option);
    });
    
    // Clear and populate app dropdown - initially empty, will be populated when tenant is selected
    appSelect.innerHTML = '';
    const defaultAppOption = document.createElement('option');
    defaultAppOption.value = '';
    defaultAppOption.textContent = 'Select App...';
    appSelect.appendChild(defaultAppOption);
    
    console.log('Final tenantSelect innerHTML:', tenantSelect.innerHTML);
    console.log('Final appSelect innerHTML:', appSelect.innerHTML);
    console.log('Final tenantSelect children count:', tenantSelect.children.length);
    console.log('Final appSelect children count:', appSelect.children.length);
    
    // Add event listener to tenant selector to populate app selector
    tenantSelect.addEventListener('change', function() {
        const selectedTenantId = this.value;
        console.log('Tenant selected:', selectedTenantId);
        
        // Clear app selector
        appSelect.innerHTML = '';
        const defaultAppOption = document.createElement('option');
        defaultAppOption.value = '';
        defaultAppOption.textContent = 'Select App...';
        appSelect.appendChild(defaultAppOption);
        
        if (selectedTenantId) {
            // Filter apps for the selected tenant
            const tenantApps = apps.filter(app => app.tenantId === selectedTenantId);
            console.log('Apps for tenant:', tenantApps.length);
            
            tenantApps.forEach(app => {
                const tenant = tenants.find(t => t.id === app.tenantId);
                const tenantName = tenant ? tenant.name : app.tenantId;
                console.log('Adding filtered app:', app.name, app.id, 'for tenant:', tenantName);
                const option = document.createElement('option');
                option.value = app.id;
                option.setAttribute('data-tenant-id', app.tenantId);
                option.textContent = `${app.name} (${tenantName})`;
                appSelect.appendChild(option);
            });
        }
    });
    
    // Check if the innerHTML gets reset after a short delay
    setTimeout(() => {
        console.log('DELAYED CHECK - tenantSelect innerHTML:', tenantSelect.innerHTML);
        console.log('DELAYED CHECK - appSelect innerHTML:', appSelect.innerHTML);
        console.log('DELAYED CHECK - tenantSelect children count:', tenantSelect.children.length);
        console.log('DELAYED CHECK - appSelect children count:', appSelect.children.length);
    }, 100);
}

  function handleRoleChange() {
    const role = roleSelect.value;
    const tenantLabel = document.getElementById('tenantSelectLabel');
    const appLabel = document.getElementById('appSelectLabel');
    
    console.log(`Role changed to: ${role}`);
    
    switch (role) {
      case 'super-admin':
        console.log('Super admin: hiding both selectors');
        tenantLabel.style.visibility = 'hidden';
        appLabel.style.visibility = 'hidden';
        break;
      case 'tenant-admin':
        console.log('Tenant admin: showing tenant selector, hiding app selector');
        tenantLabel.style.visibility = 'visible';
        appLabel.style.visibility = 'hidden';
        break;
      case 'app-user':
        console.log('App user: showing both selectors');
        tenantLabel.style.visibility = 'visible';
        appLabel.style.visibility = 'visible';
        break;
    }
  }

function applyRole() {
    // Don't allow manual role changes when authenticated
    if (isAuthenticated) {
        console.log('Manual role changes disabled for authenticated users');
        return;
    }
    
    const roleSelect = document.getElementById('roleSelect');
    const tenantSelect = document.getElementById('roleTenantSelect');
    const appSelect = document.getElementById('roleAppSelect');
    const roleStatus = document.getElementById('roleStatus');
    
    currentRole = roleSelect.value;
    currentTenantId = null;
    currentAppId = null;
    
    let statusMessage = '';
    
    if (currentRole === 'super-admin') {
        statusMessage = '🔧 Super Admin: Can view and edit all SMTP configurations';
    } else if (currentRole === 'tenant-admin') {
        currentTenantId = tenantSelect.value;
        console.log('Tenant Admin selected, tenantId:', currentTenantId);
        if (!currentTenantId) {
            alert('Please select a tenant for Tenant Admin role');
            return;
        }
        const tenant = tenants.find(t => t.id === currentTenantId);
        console.log('Found tenant:', tenant);
        statusMessage = `🏢 Tenant Admin for "${tenant.name}": Can view and edit tenant and app configs within this tenant only`;
    } else if (currentRole === 'app-user') {
        currentAppId = appSelect.value;
        console.log('App User selected, appId:', currentAppId);
        if (!currentAppId) {
            alert('Please select an app for App User role');
            return;
        }
        const app = apps.find(a => a.id === currentAppId);
        const tenant = tenants.find(t => t.id === app.tenantId);
        currentTenantId = app.tenantId; // App users are implicitly scoped to their tenant
        statusMessage = `📱 App User for "${app.name}" (${tenant.name}): Can only compose and send emails - no configuration access`;
    }
    
    roleStatus.textContent = statusMessage;
    
    // App users should only have access to compose view
    if (currentRole === 'app-user') {
        // Force app users to the compose view and hide SMTP config navigation
        showView('compose');
        // Hide SMTP Config navigation button for app users
        const smtpConfigBtn = document.querySelector('[data-view="smtp-config"]');
        if (smtpConfigBtn) {
            smtpConfigBtn.style.display = 'none';
        }
        return; // Don't rebuild tree since app users can't see it
    } else {
        // Show SMTP Config navigation button for non-app users
        const smtpConfigBtn = document.querySelector('[data-view="smtp-config"]');
        if (smtpConfigBtn) {
            smtpConfigBtn.style.display = '';
        }
    }
    
    // Clear the form since the selected config might no longer be accessible
    selectedNode = null;
    clearForm();
    
    // Rebuild the tree with new permissions
    buildSmtpTree();
}

function canViewConfig(config) {
    if (currentRole === 'super-admin') {
        return true; // Super admin can see everything
    }
    
    if (currentRole === 'tenant-admin') {
        // Tenant admin can see global, their tenant, and their tenant's apps
        return config.scope === 'GLOBAL' || 
               (config.scope === 'TENANT' && config.tenantId === currentTenantId) ||
               (config.scope === 'APP' && config.tenantId === currentTenantId);
    }
    
    if (currentRole === 'app-user') {
        // App users cannot view any SMTP configurations
        return false;
    }
    
    return false;
}

function canEditConfig(config) {
    if (currentRole === 'super-admin') {
        return true; // Super admin can edit everything
    }
    
    if (currentRole === 'tenant-admin') {
        // Tenant admin can edit their tenant and their tenant's apps (but not global)
        return (config.scope === 'TENANT' && config.tenantId === currentTenantId) ||
               (config.scope === 'APP' && config.tenantId === currentTenantId);
    }
    
    if (currentRole === 'app-user') {
        // App users cannot edit any SMTP configurations
        return false;
    }
    
    return false;
}

async function loadSmtpConfigs() {
    try {
        smtpConfigs = await apiCall('/smtp-configs');
        console.log('Loaded SMTP configs:', smtpConfigs.length);
    } catch (error) {
        console.error('Failed to load configs:', error);
        smtpConfigs = [];
    }
}

async function loadAllData() {
    try {
        const [tenantsData, appsData] = await Promise.all([
            apiCall('/tenants'),
            apiCall('/apps')
        ]);
        tenants = tenantsData;
        apps = appsData;
        console.log('Loaded tenants:', tenants.length, 'apps:', apps.length);
        console.log('Tenant data:', tenants);
        tenants.forEach((tenant, i) => {
            console.log(`Tenant ${i}:`, tenant);
        });
        console.log('App data:', apps);
        apps.forEach((app, i) => {
            console.log(`App ${i}:`, app);
        });
    } catch (error) {
        console.error('Failed to load tenant/app data:', error);
        tenants = [];
        apps = [];
    }
}

async function buildSmtpTree() {
    const treeContainer = document.getElementById('smtpTree');
    if (!treeContainer) return;

    treeContainer.innerHTML = '<div>Loading tree...</div>';

    try {
        await Promise.all([loadAllData(), loadSmtpConfigs()]);
        
        // Initialize authentication and roles after data is loaded
        const authenticated = await initializeUserRole();
        
        if (!authenticated) {
            // Only populate role selectors if not authenticated (for testing)
            populateRoleSelectors();
            // Set initial role visibility for simulator
            handleRoleChange();
        }
        
        let html = buildTreeHTML();
        treeContainer.innerHTML = html;
        
        // Select global by default
        if (!selectedNode) {
            selectTreeNode('GLOBAL');
        }
    } catch (error) {
        console.error('Failed to build tree:', error);
        treeContainer.innerHTML = '<div>Failed to load</div>';
    }
}

function buildTreeHTML() {
    let html = '';
    
    // Global level - show if user can view it
    const globalConfig = smtpConfigs.find(c => c.scope === 'GLOBAL');
    if (!globalConfig || canViewConfig(globalConfig)) {
        const globalClass = globalConfig ? 'has-config' : 'no-config';
        const globalEditable = !globalConfig || canEditConfig(globalConfig);
        const editableClass = globalEditable ? 'editable' : 'readonly';
        
        html += `<div class="tree-node ${globalClass} ${editableClass}" data-scope="GLOBAL" onclick="selectTreeNode('GLOBAL', undefined, undefined, this)">
            <div class="tree-node-title">Global Configuration ${globalEditable ? '' : '(Read Only)'}</div>
            <div class="tree-node-subtitle">System-wide SMTP settings</div>
            <div class="tree-node-config">${globalConfig ? 'Provider: ' + (globalConfig.provider || 'Custom') : 'No configuration'}</div>
        </div>`;
    }

    // Filter tenants and configs based on role permissions
    let allowedTenants = tenants;
    let allowedConfigs = smtpConfigs.filter(canViewConfig);
    
    if (currentRole === 'tenant-admin') {
        allowedTenants = tenants.filter(t => t.id === currentTenantId);
    } else if (currentRole === 'app-user') {
        allowedTenants = tenants.filter(t => t.id === currentTenantId);
    }

    // Tenant level - only show tenants that have SMTP configs and are allowed
    const tenantsWithConfigs = allowedTenants.filter(tenant => 
        allowedConfigs.some(c => c.scope === 'TENANT' && c.tenantId === tenant.id) ||
        allowedConfigs.some(c => c.scope === 'APP' && c.tenantId === tenant.id)
    );
    
    if (tenantsWithConfigs.length > 0) {
        html += '<div class="tree-level tree-level-1">';
        
        tenantsWithConfigs.forEach(tenant => {
            const tenantConfig = allowedConfigs.find(c => c.scope === 'TENANT' && c.tenantId === tenant.id);
            const tenantClass = tenantConfig ? 'has-config' : 'no-config';
            const tenantEditable = !tenantConfig || canEditConfig(tenantConfig);
            const editableClass = tenantEditable ? 'editable' : 'readonly';
            
            html += `<div class="tree-node ${tenantClass} ${editableClass}" data-scope="TENANT" data-tenant-id="${tenant.id}" onclick="selectTreeNode('TENANT', '${tenant.id}', undefined, this)">
                <div class="tree-node-title">${tenant.name} ${tenantEditable ? '' : '(Read Only)'}</div>
                <div class="tree-node-subtitle">Tenant SMTP settings</div>
                <div class="tree-node-config">${tenantConfig ? 'Provider: ' + (tenantConfig.provider || 'Custom') : 'No configuration'}</div>
            </div>`;

            // Apps for this tenant - only show apps that have SMTP configs and are allowed
            let allowedApps = apps.filter(app => app.tenantId === tenant.id);
            
            if (currentRole === 'app-user') {
                allowedApps = allowedApps.filter(app => app.id === currentAppId);
            }
            
            const appsWithConfigs = allowedApps.filter(app => 
                allowedConfigs.some(c => c.scope === 'APP' && c.appId === app.id)
            );
            
            if (appsWithConfigs.length > 0) {
                html += '<div class="tree-level tree-level-2">';
                appsWithConfigs.forEach(app => {
                    const appConfig = allowedConfigs.find(c => c.scope === 'APP' && c.appId === app.id);
                    const appClass = appConfig ? 'has-config' : 'no-config';
                    const appEditable = !appConfig || canEditConfig(appConfig);
                    const editableClass = appEditable ? 'editable' : 'readonly';
                    
                    html += `<div class="tree-node ${appClass} ${editableClass}" data-scope="APP" data-tenant-id="${app.tenantId}" data-app-id="${app.id}" onclick="selectTreeNode('APP', '${app.tenantId}', '${app.id}', this)">
                        <div class="tree-node-title">${app.name} ${appEditable ? '' : '(Read Only)'}</div>
                        <div class="tree-node-subtitle">App SMTP settings</div>
                        <div class="tree-node-config">${appConfig ? 'Provider: ' + (appConfig.provider || 'Custom') : 'Has configuration'}</div>
                    </div>`;
                });
                html += '</div>';
            }
        });
        
        html += '</div>';
    }

    return html;
}

function selectTreeNode(scope, tenantId, appId, clickedElement) {
    console.log('Selecting tree node:', scope, tenantId, appId);
    selectedNode = { scope: scope, tenantId: tenantId, appId: appId };
    
    // Update visual selection
    document.querySelectorAll('.tree-node').forEach(node => {
        node.classList.remove('selected');
    });
    
    // Find and select the clicked node
    if (clickedElement) {
        const nodeElement = clickedElement.closest ? clickedElement.closest('.tree-node') : clickedElement;
        if (nodeElement && nodeElement.classList) {
            nodeElement.classList.add('selected');
        }
    } else {
        // Fallback: find node by data attributes
        const nodeSelector = `[data-scope="${scope}"]${tenantId ? `[data-tenant-id="${tenantId}"]` : ''}${appId ? `[data-app-id="${appId}"]` : ''}`;
        const nodeElement = document.querySelector(nodeSelector);
        if (nodeElement) {
            nodeElement.classList.add('selected');
        }
    }
    
    // Update hidden form fields
    const scopeField = document.getElementById('configScope');
    const tenantField = document.getElementById('configTenantId');
    const appField = document.getElementById('configAppId');
    
    if (scopeField) scopeField.value = scope;
    if (tenantField) tenantField.value = tenantId || '';
    if (appField) appField.value = appId || '';
    
    // Update editor title to show what's being edited
    const editorTitle = document.getElementById('configEditorTitle');
    if (editorTitle) {
        let titleText = `${scope} Configuration`;
        if (scope === 'TENANT' && tenantId) {
            const tenant = tenants.find(t => t.id === tenantId);
            titleText = `Tenant Configuration: ${tenant ? tenant.name : tenantId}`;
        } else if (scope === 'APP' && appId) {
            const app = apps.find(a => a.id === appId);
            titleText = `App Configuration: ${app ? app.name : appId}`;
        }
        editorTitle.textContent = titleText;
        editorTitle.style.color = '#4CAF50'; // Green to indicate active editing
    }
    
    loadConfigForNode();
    
    // Show the configuration editor with animation
    const editor = document.getElementById('smtpConfigEditor');
    if (editor) {
        editor.style.display = 'block';
        editor.style.opacity = '0';
        editor.style.transform = 'translateY(-10px)';
        
        // Animate in
        setTimeout(() => {
            editor.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            editor.style.opacity = '1';
            editor.style.transform = 'translateY(0)';
        }, 10);
        
        console.log('Configuration editor shown');
        
        // Scroll the editor into view
        editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // Log current state for debugging
    console.log('Selected node updated:', selectedNode);
    console.log('Editor visibility:', editor ? editor.style.display : 'editor not found');
}

function loadConfigForNode() {
    if (!selectedNode) {
        console.log('No node selected');
        return;
    }
    
    console.log('Loading config for node:', selectedNode);
    console.log('Available configs:', smtpConfigs);
    
    // Debug: show all config details
    smtpConfigs.forEach((config, index) => {
        console.log(`Config ${index}:`, {
            scope: config.scope,
            tenantId: config.tenantId,
            appId: config.appId,
            host: config.host
        });
    });
    
    console.log('Looking for match with:', {
        scope: selectedNode.scope,
        tenantId: selectedNode.tenantId, 
        appId: selectedNode.appId
    });
    
    const config = smtpConfigs.find(c => {
        console.log(`Checking config: scope=${c.scope} vs ${selectedNode.scope}, tenantId=${c.tenantId} vs ${selectedNode.tenantId}, appId=${c.appId} vs ${selectedNode.appId}`);
        
        if (c.scope !== selectedNode.scope) {
            console.log('Scope mismatch');
            return false;
        }
        if (selectedNode.scope === 'TENANT') {
            const match = c.tenantId === selectedNode.tenantId;
            console.log(`Tenant match: ${match}`);
            return match;
        }
        if (selectedNode.scope === 'APP') {
            const match = c.appId === selectedNode.appId;
            console.log(`App match: ${match}`);
            return match;
        }
        console.log('Global scope match');
        return true; // For GLOBAL scope
    });
    
    console.log('Found matching config:', config);
    
    if (config) {
        populateForm(config);
        
        // Show/hide buttons based on edit permissions
        if (canEditConfig(config)) {
            showDeleteButton();
            enableFormEditing();
        } else {
            hideDeleteButton();
            disableFormEditing();
        }
        
        console.log('Form populated with existing config');
    } else {
        clearForm();
        hideDeleteButton();
        console.log('No config found, form cleared');
    }
}

function populateForm(config) {
    const form = document.getElementById('smtpConfigForm');
    if (!form) {
        console.error('SMTP config form not found');
        return;
    }
    
    console.log('Populating form with config:', config);
    console.log('Form element found:', form);
    
    // First, clear and highlight the form to show it's changing
    form.style.transition = 'background-color 0.3s ease';
    form.style.backgroundColor = 'rgba(76, 175, 80, 0.1)'; // Green highlight
    
    // Debug: show all form inputs
    const allInputs = form.querySelectorAll('input, select, textarea');
    console.log('All form inputs found:', allInputs.length);
    allInputs.forEach(input => {
        console.log(`Input: name="${input.name}", type="${input.type}", value="${input.value}"`);
    });
    
    Object.keys(config).forEach(key => {
        console.log(`Trying to populate field: ${key} with value:`, config[key]);
        
        const input = form.querySelector(`[name="${key}"]`);
        console.log(`Input found for ${key}:`, input);
        
        if (input && config[key] !== undefined) {
            if (input.type === 'checkbox') {
                const oldChecked = input.checked;
                input.checked = !!config[key];
                console.log(`Set checkbox ${key}: ${oldChecked} -> ${input.checked}`);
            } else {
                const oldValue = input.value;
                input.value = config[key];
                console.log(`Set field ${key}: "${oldValue}" -> "${input.value}"`);
                
                // Force a change event to ensure any listeners fire
                const changeEvent = new Event('change', { bubbles: true });
                input.dispatchEvent(changeEvent);
                
                // Add visual feedback for populated fields
                input.style.borderColor = '#4CAF50';
                setTimeout(() => {
                    input.style.borderColor = '';
                }, 1000);
            }
        } else if (config[key] !== undefined) {
            console.warn(`Input field not found for ${key}`);
        }
    });
    
    // Trigger service type change to show appropriate fields
    handleServiceTypeChange();
    
    // Remove the highlight after a moment
    setTimeout(() => {
        form.style.backgroundColor = '';
    }, 1000);
    
    console.log('Form population complete');
    
    // Debug: show all form values after population
    allInputs.forEach(input => {
        if (input.name) {
            const value = input.type === 'checkbox' ? input.checked : input.value;
            console.log(`Final value for ${input.name}: ${value}`);
        }
    });
}

function clearForm() {
    const form = document.getElementById('smtpConfigForm');
    if (form) {
        form.reset();
        
        // Visual feedback for cleared form
        form.style.transition = 'background-color 0.3s ease';
        form.style.backgroundColor = 'rgba(255, 193, 7, 0.1)'; // Yellow highlight
        
        // Reset to SMTP view after clearing
        handleServiceTypeChange();
        
        // Remove highlight after a moment
        setTimeout(() => {
            form.style.backgroundColor = '';
        }, 1000);
    }
}

// Handle service type switching (SMTP vs SES)
function handleServiceTypeChange() {
    const serviceSelect = document.getElementById('serviceSelect');
    const smtpFields = document.getElementById('smtpFields');
    const sesFields = document.getElementById('sesFields');
    
    if (!serviceSelect || !smtpFields || !sesFields) {
        console.warn('Service switching elements not found');
        return;
    }
    
    const selectedService = serviceSelect.value;
    console.log(`Service type changed to: ${selectedService}`);
    
    if (selectedService === 'ses') {
        // Show SES fields, hide SMTP fields
        smtpFields.style.display = 'none';
        sesFields.style.display = 'block';
        
        // Update required fields for SES
        updateFieldRequirements('ses');
        
        // Set default host for SES (hidden but needed for backend)
        const hostField = document.querySelector('input[name="host"]');
        if (hostField) {
            hostField.value = 'ses.amazonaws.com';
        }
        
    } else {
        // Show SMTP fields, hide SES fields
        smtpFields.style.display = 'block';
        sesFields.style.display = 'none';
        
        // Update required fields for SMTP
        updateFieldRequirements('smtp');
        
        // Clear SES-specific fields when switching away
        ['awsRegion', 'awsAccessKey', 'awsSecretKey'].forEach(fieldName => {
            const field = document.querySelector(`input[name="${fieldName}"]`);
            if (field) field.value = '';
        });
    }
}

// Update field requirements based on service type
function updateFieldRequirements(serviceType) {
    if (serviceType === 'ses') {
        // SES required fields
        ['awsRegion', 'awsAccessKey', 'awsSecretKey'].forEach(fieldName => {
            const field = document.querySelector(`input[name="${fieldName}"]`);
            if (field) field.required = true;
        });
        
        // SMTP fields not required for SES
        ['host', 'port'].forEach(fieldName => {
            const field = document.querySelector(`input[name="${fieldName}"]`);
            if (field) field.required = false;
        });
    } else {
        // SMTP required fields
        ['host', 'port'].forEach(fieldName => {
            const field = document.querySelector(`input[name="${fieldName}"]`);
            if (field) field.required = true;
        });
        
        // SES fields not required for SMTP
        ['awsRegion', 'awsAccessKey', 'awsSecretKey'].forEach(fieldName => {
            const field = document.querySelector(`input[name="${fieldName}"]`);
            if (field) field.required = false;
        });
    }
}

function showDeleteButton() {
    const deleteBtn = document.getElementById('deleteConfigBtn');
    if (deleteBtn) deleteBtn.style.display = 'inline-block';
}

function hideDeleteButton() {
    const deleteBtn = document.getElementById('deleteConfigBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';
}

function enableFormEditing() {
    const form = document.getElementById('smtpConfigForm');
    const saveBtn = document.getElementById('saveConfigBtn');
    const testBtn = document.getElementById('testConfigBtn');
    
    // Enable all form inputs except hidden fields
    const inputs = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
    inputs.forEach(input => input.disabled = false);
    
    if (saveBtn) saveBtn.style.display = 'inline-block';
    if (testBtn) testBtn.style.display = 'inline-block';
}

function disableFormEditing() {
    const form = document.getElementById('smtpConfigForm');
    const saveBtn = document.getElementById('saveConfigBtn');
    const testBtn = document.getElementById('testConfigBtn');
    
    // Disable all form inputs except hidden fields
    const inputs = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
    inputs.forEach(input => input.disabled = true);
    
    if (saveBtn) saveBtn.style.display = 'none';
    if (testBtn) testBtn.style.display = 'none';
}

async function handleSmtpConfigSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    
    const form = event.target;
    const formData = new FormData(form);
    const status = document.getElementById('smtpConfigStatus');
    
    // Convert FormData to plain object
    const data = {};
    for (let [key, value] of formData.entries()) {
        data[key] = value;
    }
    
    // Handle checkbox
    data.secure = form.querySelector('[name="secure"]').checked;
    
    // Check if we're editing an existing config by looking for a matching config
    const existingConfig = smtpConfigs.find(config => 
        config.scope === data.scope &&
        config.tenantId === (data.tenantId || undefined) &&
        config.appId === (data.appId || undefined)
    );
    
    const isUpdate = !!existingConfig;
    const method = isUpdate ? 'PUT' : 'POST';
    const url = isUpdate ? `/smtp-configs/${existingConfig.id}` : '/smtp-configs';
    
    console.log(`${isUpdate ? 'Updating' : 'Creating'} SMTP config:`, data);
    status.textContent = 'Saving...';
    status.className = 'status';
    
    try {
        const response = await apiCall(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        console.log('SMTP config saved:', response);
        status.textContent = `Configuration ${isUpdate ? 'updated' : 'created'} successfully!`;
        status.className = 'status success';
        
        // Reload the configs and refresh the tree
        await loadSmtpConfigs();
        await buildSmtpTree();
        
        // Clear status after a few seconds
        setTimeout(() => {
            status.textContent = '';
            status.className = 'status';
        }, 3000);
        
    } catch (error) {
        console.error('Failed to save SMTP config:', error);
        status.textContent = `Error: ${error.message}`;
        status.className = 'status error';
    }
}

async function handleDeleteConfig() {
    const selectedScope = document.querySelector('[name="scope"]').value;
    const selectedTenantId = document.querySelector('[name="tenantId"]').value || undefined;
    const selectedAppId = document.querySelector('[name="appId"]').value || undefined;
    
    // Find the config to delete
    const configToDelete = smtpConfigs.find(config => 
        config.scope === selectedScope &&
        config.tenantId === selectedTenantId &&
        config.appId === selectedAppId
    );
    
    if (!configToDelete) {
        alert('No configuration found to delete');
        return;
    }
    
    const configName = selectedScope === 'GLOBAL' ? 'Global Configuration' :
                      selectedScope === 'TENANT' ? `Tenant: ${configToDelete.tenantName || selectedTenantId}` :
                      `App: ${configToDelete.appName || selectedAppId}`;
    
    if (!confirm(`Are you sure you want to delete the SMTP configuration for ${configName}?`)) {
        return;
    }
    
    const status = document.getElementById('smtpConfigStatus');
    status.textContent = 'Deleting...';
    status.className = 'status';
    
    try {
        await apiCall(`/smtp-configs/${configToDelete.id}`, {
            method: 'DELETE'
        });
        
        console.log('SMTP config deleted:', configToDelete.id);
        status.textContent = 'Configuration deleted successfully!';
        status.className = 'status success';
        
        // Reload the configs and refresh the tree
        await loadSmtpConfigs();
        await buildSmtpTree();
        
        // Clear the form and hide delete button
        clearForm();
        hideDeleteButton();
        
        // Clear status after a few seconds
        setTimeout(() => {
            status.textContent = '';
            status.className = 'status';
        }, 3000);
        
    } catch (error) {
        console.error('Failed to delete SMTP config:', error);
        status.textContent = `Error: ${error.message}`;
        status.className = 'status error';
    }
}

function handleScopeChange() {
    console.log('Legacy function - using tree instead');
}

// View switching logic
function showView(view) {
    document.getElementById('view-tenants').style.display = view === 'tenants' ? 'grid' : 'none';
    document.getElementById('view-compose').style.display = view === 'compose' ? 'grid' : 'none';
    document.getElementById('view-smtp-config').style.display = view === 'smtp-config' ? 'block' : 'none';
    
    document.querySelectorAll('.navBtn').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-view') === view);
    });
    
    const titles = {
        'tenants': 'Tenant Management',
        'smtp-config': 'SMTP Configuration',
        'compose': 'Mail Service'
    };
    document.getElementById('viewTitle').textContent = titles[view] || 'Mail Service';
    
    // When SMTP config view is shown, build the tree
    if (view === 'smtp-config') {
        console.log('SMTP Config view shown, building tree...');
        buildSmtpTree();
    }
}

// Wire up navigation
function wireNav() {
    document.querySelectorAll('button.navBtn').forEach(btn => {
        btn.addEventListener('click', () => showView(btn.dataset.view));
    });
    showView('compose'); // Default view
}

async function initSmtpTree() {
    await buildSmtpTree();
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, setting up navigation...');
    wireNav();
    
    // Add form submission handler for SMTP config
    const smtpForm = document.getElementById('smtpConfigForm');
    if (smtpForm) {
        smtpForm.addEventListener('submit', handleSmtpConfigSubmit);
    }
    
    // Add delete button handler
    const deleteBtn = document.getElementById('deleteConfigBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleDeleteConfig);
    }
    
    // Add service type change handler for dynamic field switching
    const serviceSelect = document.getElementById('serviceSelect');
    if (serviceSelect) {
        serviceSelect.addEventListener('change', handleServiceTypeChange);
    }
    
    // Add role selector handlers
    const roleSelect = document.getElementById('roleSelect');
    const applyRoleBtn = document.getElementById('applyRoleBtn');
    
    if (roleSelect) {
        roleSelect.addEventListener('change', handleRoleChange);
    }
    
    if (applyRoleBtn) {
        applyRoleBtn.addEventListener('click', applyRole);
    }
});

window.selectTreeNode = selectTreeNode;
window.initSmtpTree = initSmtpTree;
window.handleScopeChange = handleScopeChange;
window.showView = showView;
