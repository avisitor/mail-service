// UI client: tenant management + compose/send + quick ad-hoc send (DB path only now).
let tenantId = localStorage.getItem('tenantId') || '';
let appId = localStorage.getItem('appId') || '';
let authToken = localStorage.getItem('authToken');
let uiConfig = window.__MAIL_UI_CONFIG__ || {};
// Role context management for superadmin tenant switching
let roleContext = {
    isSuperadmin: false,
    isInTenantContext: !!localStorage.getItem('contextTenantId'),
    contextTenantId: localStorage.getItem('contextTenantId') || '',
    contextTenantName: localStorage.getItem('contextTenantName') || ''
};
const state = {
    currentTemplate: undefined,
    tenants: [],
    apps: [],
    smtpConfigs: [],
    dbMode: true,
    user: null,
};

// Helper function to get effective role for decision making
function getEffectiveRole() {
    return state.user?.effectiveRole || 'editor';
}

// Helper function to check if user can perform superadmin actions
function canPerformSuperadminActions() {
    return state.user?.realRole === 'superadmin';
}

// Helper function to check if user is in tenant admin context (real or impersonated)
function isInTenantAdminContext() {
    return getEffectiveRole() === 'tenant_admin';
}

// Helper function to check if user is editor-only (no admin privileges)
function isEditorOnly() {
    const effectiveRole = getEffectiveRole();
    return effectiveRole === 'editor';
}
function $(sel) { return document.querySelector(sel); }
function showStatusMessage(el, msg) { el.textContent = msg; setTimeout(() => { if (el.textContent === msg)
    el.textContent = ''; }, 6000); }
function flashInvalid(el) { el.classList.add('invalid'); setTimeout(() => el.classList.remove('invalid'), 1500); }
async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (authToken)
        headers['Authorization'] = 'Bearer ' + authToken;
    const res = await fetch(path, { ...opts, headers });
    if (!res.ok) {
        const tx = await res.text();
        throw new Error(tx || res.statusText);
    }
    return res.json();
}
async function listTemplates() {
    try {
        if (!tenantId) {
            $('#templateList').innerHTML = '<em>Select or create a tenant first</em>';
            return;
        }
        const list = await api(`/tenants/${tenantId}/templates`);
        const wrap = $('#templateList');
        wrap.innerHTML = list.map((t) => `<div class="tplRow"><button data-id="${t.id}" class="loadTpl">Load</button> ${t.name} v${t.version}</div>`).join('') || '<em>No templates yet</em>';
        wrap.querySelectorAll('button.loadTpl').forEach(btn => btn.addEventListener('click', () => loadTemplate(btn.dataset.id)));
    }
    catch (e) {
        console.error(e);
    }
}
let selectedGroupId = null;
async function listGroups() {
    if (!state.dbMode || !tenantId) {
        (document.getElementById('groupsList')).innerHTML = state.dbMode ? '<em>Select tenant</em>' : '<em>In-memory: groups not tracked</em>';
        return;
    }
    try {
        const groups = await api(`/tenants/${tenantId}/groups`);
        const wrap = document.getElementById('groupsList');
        wrap.innerHTML = groups.map((g) => `<div class="grpRow"><button data-g="${g.id}" class="loadGroup">#</button> ${g.subject || g.id} <span style='opacity:.6'>${g.status}</span> <span style='opacity:.6'>S:${g.sentCount} F:${g.failedCount}</span></div>`).join('') || '<em>No groups</em>';
        wrap.querySelectorAll('button.loadGroup').forEach(btn => btn.addEventListener('click', () => { selectedGroupId = btn.dataset.g; document.getElementById('cancelGroupBtn').disabled = false; loadGroupEvents(selectedGroupId); }));
    }
    catch (e) {
        document.getElementById('groupsList').innerHTML = '<em>Error loading groups</em>';
    }
}
async function loadGroupEvents(groupId) {
    if (!state.dbMode)
        return;
    try {
        const events = await api(`/groups/${groupId}/events`);
        const wrap = document.getElementById('eventsList');
        wrap.innerHTML = events.map((ev) => `<div class="evtRow">${new Date(ev.occurredAt).toLocaleTimeString()} <strong>${ev.type}</strong>${ev.recipientId ? ' r:' + ev.recipientId.slice(0, 6) : ''}</div>`).join('') || '<em>No events</em>';
    }
    catch {
        document.getElementById('eventsList').innerHTML = '<em>Error</em>';
    }
}
async function loadTemplate(id) {
    const tpl = await api(`/templates/${id}`);
    state.currentTemplate = tpl;
    document.querySelector('#templateForm [name=name]').value = tpl.name;
    document.querySelector('#templateForm [name=version]').value = String(tpl.version);
    document.querySelector('#templateForm [name=subject]').value = tpl.subject;
    document.querySelector('#templateForm [name=bodyHtml]').value = tpl.bodyHtml;
    document.querySelector('#templateForm [name=bodyText]').value = tpl.bodyText || '';
    document.querySelector('#templateForm [name=variables]').value = JSON.stringify(tpl.variables || {}, null, 2);
    updateEnvInfo();
}
// Template creation
$('#templateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const payload = {
        tenantId,
        name: fd.get('name'),
        version: Number(fd.get('version')),
        subject: fd.get('subject'),
        bodyHtml: fd.get('bodyHtml'),
        bodyText: fd.get('bodyText') || undefined,
        variables: {}
    };
    const varsRaw = fd.get('variables');
    if (varsRaw?.trim()) {
        try {
            payload.variables = JSON.parse(varsRaw);
        }
        catch {
            showStatusMessage($('#templateStatus'), 'Invalid JSON in variables');
            flashInvalid(document.querySelector('#templateForm [name=variables]'));
            return;
        }
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
        const tpl = await api('/templates', { method: 'POST', body: JSON.stringify(payload) });
        state.currentTemplate = tpl;
        showStatusMessage($('#templateStatus'), 'Saved ✔');
        await listTemplates();
    }
    catch (err) {
        showStatusMessage($('#templateStatus'), 'Error: ' + err.message);
    }
    finally {
        btn.disabled = false;
        updateEnvInfo();
    }
});
// Render preview
$('#renderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentTemplate) {
        showStatusMessage($('#renderStatus'), 'No template loaded');
        return;
    }
    const form = e.target;
    const fd = new FormData(form);
    let ctx = {};
    const raw = fd.get('context');
    if (raw?.trim()) {
        try {
            ctx = JSON.parse(raw);
        }
        catch {
            showStatusMessage($('#renderStatus'), 'Invalid context JSON');
            flashInvalid(document.querySelector('#renderForm [name=context]'));
            return;
        }
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
        const rendered = await api(`/templates/${state.currentTemplate.id}/render`, { method: 'POST', body: JSON.stringify({ context: ctx }) });
        $('#previewSubject').textContent = rendered.subject;
        const iframe = document.querySelector('#previewHtml');
        iframe.contentDocument.open();
        iframe.contentDocument.write(rendered.html);
        iframe.contentDocument.close();
        $('#previewText').textContent = rendered.text || '';
        showStatusMessage($('#renderStatus'), 'Rendered ✔');
    }
    catch (err) {
        showStatusMessage($('#renderStatus'), 'Error: ' + err.message);
    }
    finally {
        btn.disabled = false;
    }
});
// Group send (draft simplified)
$('#groupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentTemplate) {
        showStatusMessage($('#groupStatus'), 'No template');
        return;
    }
    const fd = new FormData(e.target);
    const groupSubject = fd.get('groupSubject');
    const recipientsRaw = (fd.get('recipients') || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
        const useAppId = state.dbMode ? appId : 'app1';
        if (state.dbMode && (!tenantId || !useAppId)) {
            showStatusMessage($('#groupStatus'), 'Select tenant/app');
            return;
        }
        const group = await api('/groups', { method: 'POST', body: JSON.stringify({ tenantId, appId: useAppId, templateId: state.currentTemplate.id, subject: groupSubject }) });
        if (recipientsRaw.length) {
            await api(`/groups/${group.id}/recipients`, { method: 'POST', body: JSON.stringify({ recipients: recipientsRaw.map(email => ({ email, context: {} })), dedupe: true, renderNow: false }) });
        }
        await api(`/groups/${group.id}/schedule`, { method: 'POST', body: JSON.stringify({}) });
        await api('/internal/worker/tick', { method: 'POST', body: JSON.stringify({}) });
        showStatusMessage($('#groupStatus'), 'Sent (dry-run) ✔');
        await listGroups();
    }
    catch (err) {
        showStatusMessage($('#groupStatus'), 'Error: ' + err.message);
    }
    finally {
        btn.disabled = false;
    }
});
// Deactivate template
document.getElementById('deactivateTemplateBtn')?.addEventListener('click', async () => {
    if (!state.currentTemplate)
        return;
    try {
        await api(`/templates/${state.currentTemplate.id}/deactivate`, { method: 'PATCH' });
        showStatusMessage(document.getElementById('templateStatus'), 'Template deactivated');
    }
    catch (e) {
        showStatusMessage(document.getElementById('templateStatus'), 'Error: ' + e.message);
    }
});
// Cancel group
document.getElementById('cancelGroupBtn')?.addEventListener('click', async () => {
    if (!selectedGroupId)
        return;
    try {
        await api(`/groups/${selectedGroupId}/cancel`, { method: 'POST' });
        showStatusMessage(document.getElementById('groupStatus'), 'Group canceled');
        await listGroups();
        if (selectedGroupId)
            await loadGroupEvents(selectedGroupId);
    }
    catch (e) {
        showStatusMessage(document.getElementById('groupStatus'), 'Error: ' + e.message);
    }
});
async function loadTenants() {
    try {
        const list = await api('/tenants');
        state.tenants = list;
        const sel = document.getElementById('tenantSelect');
        if (sel) {
            sel.innerHTML = '<option value="">-- select --</option>' + list.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            if (tenantId && list.some(t => t.id === tenantId))
                sel.value = tenantId;
            else
                sel.value = '';
        }
        const tList = document.getElementById('tenantList');
        if (tList) {
            tList.innerHTML = list.map(t => `
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
            tList.querySelectorAll('button.editTenant').forEach(b => b.addEventListener('click', () => editTenantPrompt(b.dataset.e)));
            tList.querySelectorAll('button.delTenant').forEach(b => b.addEventListener('click', () => deleteTenant(b.dataset.d)));
            // Add click handlers for tenant names to view their apps
            tList.querySelectorAll('[data-tenant-click]').forEach(el => {
                el.addEventListener('click', () => {
                    const tenantId = el.dataset.tenantClick;
                    const tenant = list.find(t => t.id === tenantId);
                    if (tenant) {
                        switchToTenantContext(tenantId, tenant.name);
                    }
                });
            });
        }
    }
    catch (e) {
        // Likely 403 for non-superadmin; ignore gracefully
        state.tenants = [];
        const tList = document.getElementById('tenantList');
        if (tList)
            tList.innerHTML = '<em>Not authorized</em>';
    }
}
async function editTenantPrompt(id) {
    const t = state.tenants.find(x => x.id === id);
    if (!t)
        return;
    // Show a more informative prompt with tenant ID
    const promptMessage = `Change tenant name\n\nTenant ID: ${t.id}\nCurrent name: ${t.name}\n\nNew name:`;
    const name = prompt(promptMessage, t.name);
    if (!name || name.trim() === '' || name === t.name)
        return;
    try {
        await api(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
        await loadTenants();
    }
    catch (e) {
        alert('Update failed: ' + e.message);
    }
}
async function deleteTenant(id) {
    const t = state.tenants.find(x => x.id === id);
    const tenantInfo = t ? `"${t.name}" (ID: ${t.id})` : id;
    // Load apps for this tenant to show what will be affected
    let appsInfo = '';
    try {
        const apps = await api(`/apps?tenantId=${encodeURIComponent(id)}`);
        if (apps.length > 0) {
            const appNames = apps.map(app => `• ${app.name} (${app.id})`).join('\n');
            appsInfo = `\n\nThis will also delete ${apps.length} app${apps.length === 1 ? '' : 's'}:\n${appNames}`;
        }
    }
    catch (e) {
        console.warn('Could not load apps for tenant deletion confirmation:', e);
    }
    const confirmMessage = `Delete tenant ${tenantInfo}?${appsInfo}\n\nThis will be a soft delete and can potentially be reversed by technical support.`;
    if (!confirm(confirmMessage))
        return;
    try {
        await api(`/tenants/${id}`, { method: 'DELETE' });
        await loadTenants();
    }
    catch (e) {
        alert('Delete failed: ' + e.message);
    }
}
async function loadApps() {
    console.log('[TRACE] loadApps() LEGACY FUNCTION ENTRY - uses global tenantId!', {
        tenantId,
        userTenantId: state.user?.tenantId,
        caller: new Error().stack.split('\n')[1].trim()
    });
    
    if (!tenantId) {
        document.getElementById('appSelect').innerHTML = '<option value="">-- none --</option>';
        return;
    }
    try {
        const list = await api(`/apps?tenantId=${encodeURIComponent(tenantId)}`);
        state.apps = list;
        const sel = document.getElementById('appSelect');
        sel.innerHTML = '<option value="">-- select --</option>' + list.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        if (appId && list.some(a => a.id === appId))
            sel.value = appId;
        else
            sel.value = '';
    }
    catch { /* ignore */ }
}
async function loadAllApps() {
    console.log('[TRACE] loadAllApps() ENTRY - WARNING: This loads ALL apps from ALL tenants!', {
        caller: new Error().stack.split('\n')[1].trim()
    });
    
    try {
        console.log('Loading all apps for SMTP config...');
        const list = await api('/apps');
        state.apps = list;
        console.log('Loaded apps:', list);
    }
    catch (e) {
        console.error('Failed to load all apps:', e);
    }
}
function showLogin() {
    const overlay = document.getElementById('loginOverlay');
    overlay.style.display = 'flex';
    document.getElementById('userPane').style.display = 'none';
}
function hideLogin() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay)
        overlay.style.display = 'none';
}
function applyRoleVisibility() {
    const roles = state.user?.roles || [];
    const isEditorOnlyUser = isEditorOnly();
    // Hide SMTP Config for Editor-only users
    const smtpConfigBtn = document.querySelector('[data-view="smtp-config"]');
    if (smtpConfigBtn) {
        smtpConfigBtn.style.display = isEditorOnlyUser ? 'none' : 'block';
        // Rename SMTP Config to just "Config" for non-editor users
        if (!isEditorOnlyUser) {
            smtpConfigBtn.textContent = 'Config';
        }
    }
    // Hide Context pane for Editor-only users
    const contextPanel = document.getElementById('tenantAppPanel');
    if (contextPanel) {
        contextPanel.style.display = isEditorOnlyUser ? 'none' : 'block';
    }
    // Hide role context for Editor-only users (they don't need context switching)
    const roleContextDiv = document.getElementById('roleContext');
    if (roleContextDiv && isEditorOnlyUser) {
        roleContextDiv.style.display = 'none';
    }
}
function onAuthenticated() {
    console.log('[TRACE] onAuthenticated() ENTRY', {
        user: state.user?.sub,
        roles: state.user?.roles,
        tenantId: state.user?.tenantId,
        tenantName: state.user?.tenantName
    });
    
    hideLogin();
    
    // Initialize user state with role tracking
    if (state.user) {
        state.user.realRole = state.user.roles?.[0] || 'editor';
        state.user.effectiveRole = state.user.realRole; // Will be updated by context switching if needed
    }
    
    const roles = state.user?.roles || [];
    const userSummary = document.getElementById('userSummary');
    if (userSummary) {
        const appLabel = state.user?.appName || state.user?.appClientId || state.apps.find(a => a.id === state.user?.appId)?.name || '';
        const tenantLabel = state.user?.tenantName || '';
        const roleLabel = roles.join(',') || 'no-roles';
        // Prominently show application; include tenant if known
        userSummary.textContent = `${appLabel ? '[' + appLabel + '] ' : ''}${tenantLabel ? tenantLabel + ' · ' : ''}${state.user.sub || 'user'} [${roleLabel}]`;
    }
    document.getElementById('userPane').style.display = 'flex';
    applyRoleVisibility();
    
    // UNIFIED PATH: Determine effective context from resolved /me data
    const resolvedTenantId = state.user?.tenantId;  // Already looked up from appId by backend
    const resolvedTenantName = state.user?.tenantName || resolvedTenantId || 'Your Tenant';
    const isSuperadmin = canPerformSuperadminActions();
    
    if (resolvedTenantId) {
        // SINGLE PATH: Anyone with a resolved tenantId gets tenant context automatically
        console.log(`[unified-auth] Setting tenant context for ${state.user?.sub}: ${resolvedTenantName} (${resolvedTenantId})`);
        switchToTenantContext(resolvedTenantId, resolvedTenantName);
    } else if (isSuperadmin) {
        // Superadmin without tenant context - show tenant selection
        console.log(`[unified-auth] Superadmin without tenant context - loading tenant selection`);
        loadTenants().then(() => {
            wireNav();
            wireAppManagement();
            updateRoleContext();
        });
    } else {
        // Edge case: no tenant context available
        console.error('[unified-auth] No tenant context available for user');
        updateRoleContext();
        wireNav();
        wireAppManagement();
    }
}
// Tenant creation (exists only in Tenants view now)
const tenantFormEl = document.getElementById('tenantForm');
if (tenantFormEl) {
    tenantFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const name = fd.get('tenantName');
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
            const t = await api('/tenants', { method: 'POST', body: JSON.stringify({ name }) });
            tenantId = t.id;
            localStorage.setItem('tenantId', tenantId);
            showStatusMessage(document.getElementById('tenantStatus'), 'Created ✔');
            await loadTenants();
            await loadApps();
            await listTemplates();
            await listGroups();
            updateEnvInfo();
        }
        catch (err) {
            showStatusMessage(document.getElementById('tenantStatus'), 'Error: ' + err.message);
        }
        finally {
            btn.disabled = false;
        }
    });
}
// Login form handling
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const token = (fd.get('token') || '').trim();
    const statusEl = document.getElementById('loginStatus');
    if (!token) {
        statusEl.textContent = 'Token required';
        return;
    }
    statusEl.textContent = 'Verifying...';
    authToken = token;
    localStorage.setItem('authToken', authToken);
    try {
        console.log('[TRACE] api() call to /me - about to authenticate');
        state.user = await api('/me');
        console.log('[TRACE] api() call to /me - success, state.user:', state.user);
        if (!state.user)
            throw new Error('No user context');
        statusEl.textContent = 'OK';
        setTimeout(() => { statusEl.textContent = ''; }, 800);
        console.log('[TRACE] About to call onAuthenticated()');
        onAuthenticated();
    }
    catch (err) {
        statusEl.textContent = 'Invalid token';
        authToken = null;
        localStorage.removeItem('authToken');
    }
});

// Dev helper buttons for quick login
document.getElementById('loginAsSuperAdmin')?.addEventListener('click', async () => {
    const superAdminToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjZjYTFhMzA5YTczNWZiODMifQ.eyJzdWIiOiJzdXBlcmFkbWluIiwiaXNzIjoiaHR0cHM6Ly9pZHAud29ybGRzcG90Lm9yZyIsImF1ZCI6Im1haWwtc2VydmljZSIsImV4cCI6MTc1NzkxMTU0NCwiaWF0IjoxNzU3OTA3OTQ0LCJyb2xlcyI6WyJzdXBlcmFkbWluIl0sImFwcElkIjoiY21ma2E2ODhyMDAwMWI3N29mcGdtNTdpeCJ9.RfFnidmMD55qaYkNxMt7sdsXxLf1VLDhdFJGBro-1c2w2aKSI-17lWaZ9C-2aYNysiAOOW0_4KE8i9-i25YAZnXQXaKjVFXpZGE3l0Xt4LZ1pyH3s2B4YjS7r2nCNi4FplMfDa-r10gRghAyBWzYSeHGyAgfeFHOisy6oLfUF2il1s_E46-ailu-Z3wuqE1y1och3RO84pUHjrfaw5LMvehC_WIxb10VZotUTC0R2c4fyZKS58mZb2sXCPnta68EqQeWppY7itAU50rMM6ZoZGoalkRq5PzEmgS6st8bZZkXfM6lmIvgMQ9DwCtLAn5DUbeKECMnJ7ckm8wrThlJ5w';
    authToken = superAdminToken;
    localStorage.setItem('authToken', authToken);
    try {
        state.user = await api('/me');
        if (!state.user) throw new Error('No user context');
        onAuthenticated();
        // Close login overlay
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'none';
    } catch (err) {
        console.error('SuperAdmin login failed:', err);
    }
});

document.getElementById('loginAsTenantAdmin')?.addEventListener('click', async () => {
    const tenantAdminToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjZjYTFhMzA5YTczNWZiODMifQ.eyJzdWIiOiJ0ZW5hbnQtYWRtaW4tdGVzdC10ZW5hbnQtMSIsImlzcyI6Imh0dHBzOi8vaWRwLndvcmxkc3BvdC5vcmciLCJhdWQiOiJtYWlsLXNlcnZpY2UiLCJleHAiOjE3NTc5MTE1NDQsImlhdCI6MTc1NzkwNzk0NCwicm9sZXMiOlsidGVuYW50X2FkbWluIl0sInRlbmFudElkIjoidGVzdC10ZW5hbnQtMSIsImFwcElkIjoiY21ma2E2ODhyMDAwMWI3N29mcGdtNTdpeCJ9.arElgmBjwtGFd-NzkhCt9FSfUVbvOjPWDIJTfbNzSX6iBOaGP398cKNDr1QQv7Ou6S1jKR0au_eaE9bYhxhZSAs2MtO_RCb_S9G4q4TKZEro7dy6SoF2iH7g08yuKQILUGByvs6QROZMZVnStIdCT9ZprxUli5W0blB4tdxmyBI7nOf5vwMI0alBq9gs4hTAHrDaSJdl4WbeTxknPRefpRaWh1wFplsTFrqCogiZnBFW0nVH1w0g2vq17Si7EEAQFzRRacN29M-Jv5l587jz9ThVrphWyfjv-jDFtYsespQ6-DuV2i-n-YsQpge3QDuPJnM909LMhj1pPEgom0jyxA';
    authToken = tenantAdminToken;
    localStorage.setItem('authToken', authToken);
    try {
        state.user = await api('/me');
        if (!state.user) throw new Error('No user context');
        onAuthenticated();
        // Close login overlay
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'none';
    } catch (err) {
        console.error('TenantAdmin login failed:', err);
    }
});
document.getElementById('logoutBtn')?.addEventListener('click', () => {
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
    }
    catch { }
    // Hide user pane
    document.getElementById('userPane').style.display = 'none';
    // Optional: Redirect to clean URL
    if (window.location.search) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    console.log('✅ Logout complete');
    // Instead of showing manual login, trigger IDP redirect flow
    const idp = uiConfig.idpLoginUrl;
    if (idp) {
        console.log('🔄 Redirecting to IDP for fresh authentication...');
        const ret = uiConfig.returnUrl || (window.location.origin + '/ui/');
        const redirect = new URL(idp);
        redirect.searchParams.set('return', ret);
        // Always include the default ReTree Hawaii appId for tenant admin context
        redirect.searchParams.set('appId', 'cmfka688r0001b77ofpgm57ix');
        console.log('🔄 Logout redirect URL:', redirect.toString());
        window.location.href = redirect.toString();
    }
    else {
        // Fallback to manual login if no IDP configured
        showLogin();
    }
});
// App creation (only in Tenants view)
const appFormEl = document.getElementById('appForm');
if (appFormEl) {
    appFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!tenantId) {
            showStatusMessage(document.getElementById('appStatus'), 'Select tenant first');
            return;
        }
        const fd = new FormData(e.target);
        const payload = { tenantId, name: fd.get('appName'), clientId: fd.get('clientId') };
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
            const rec = await api('/apps', { method: 'POST', body: JSON.stringify(payload) });
            appId = rec.id;
            localStorage.setItem('appId', appId);
            showStatusMessage(document.getElementById('appStatus'), 'Created ✔');
            await loadApps();
            updateEnvInfo();
        }
        catch (err) {
            showStatusMessage(document.getElementById('appStatus'), 'Error: ' + err.message);
        }
        finally {
            btn.disabled = false;
        }
    });
}
// Select handlers
document.getElementById('tenantSelect')?.addEventListener('change', async (e) => {
    tenantId = e.target.value;
    localStorage.setItem('tenantId', tenantId);
    appId = '';
    localStorage.removeItem('appId');
    await loadApps();
    await listTemplates();
    await listGroups();
    updateEnvInfo();
});
document.getElementById('appSelect')?.addEventListener('change', (e) => {
    appId = e.target.value;
    if (appId)
        localStorage.setItem('appId', appId);
    else
        localStorage.removeItem('appId');
    updateEnvInfo();
});
function updateEnvInfo() {
    const parts = [];
    parts.push(`Tenant: ${tenantId || '—'}`);
    const appBadge = state.user?.appName || state.user?.appClientId || appId || '—';
    parts.push(`App: ${appBadge}`);
    parts.push(state.dbMode ? 'DB' : 'In-Memory');
    if (state.user) {
        const roles = (state.user.roles || []).join(',') || 'no-roles';
        parts.push(`User: ${state.user.sub || 'unknown'} [${roles}]`);
    }
    (document.getElementById('envInfo')).textContent = parts.join(' | ');
    const deactivateBtn = document.getElementById('deactivateTemplateBtn');
    if (deactivateBtn)
        deactivateBtn.disabled = !state.currentTemplate;
}
async function detectMode() { state.dbMode = true; }
function composeHeaderTitle() {
    const app = state.apps.find(a => a.id === appId);
    return app ? `Compose - App: ${app.name}` : 'Compose Email';
}
function getAppsViewTitle() {
    if (roleContext.isInTenantContext) {
        return `Apps - Tenant: ${roleContext.contextTenantName}`;
    }
    const roles = state.user?.roles || [];
    if (canPerformSuperadminActions()) {
        return 'Apps Management (Superadmin)';
    }
    if (isInTenantAdminContext()) {
        const tenantName = state.user?.tenantName || 'Current Tenant';
        return `Apps Management - ${tenantName}`;
    }
    return 'Apps Management';
}
async function loadAppsForCurrentContext() {
    console.log('[TRACE] loadAppsForCurrentContext() ENTRY', {
        roleContextInTenantContext: roleContext.isInTenantContext,
        roleContextTenantId: roleContext.contextTenantId,
        roleContextTenantName: roleContext.contextTenantName,
        userTenantId: state.user?.tenantId,
        isInTenantAdminContext: isInTenantAdminContext(),
        caller: new Error().stack.split('\n')[1].trim()
    });
    
    const roles = state.user?.roles || [];
    const targetTenantId = roleContext.isInTenantContext ? roleContext.contextTenantId :
        (isInTenantAdminContext() ? state.user?.tenantId : null);
    // Update the app context display
    const appTenantContext = document.getElementById('appTenantContext');
    if (appTenantContext) {
        if (roleContext.isInTenantContext) {
            appTenantContext.textContent = `Managing apps for: ${roleContext.contextTenantName} (${roleContext.contextTenantId})`;
        }
        else if (targetTenantId) {
            const tenantName = state.user?.tenantName || 'Current Tenant';
            appTenantContext.textContent = `Managing apps for: ${tenantName}`;
        }
        else {
            appTenantContext.textContent = 'No tenant context selected';
        }
    }
    if (targetTenantId) {
        console.log('[TRACE] loadAppsForCurrentContext() - calling loadAppsForTenant with:', targetTenantId);
        await loadAppsForTenant(targetTenantId);
        console.log('[TRACE] loadAppsForCurrentContext() - after loadAppsForTenant, state.apps count:', state.apps?.length);
        await updateAppsUI();
        console.log('[TRACE] loadAppsForCurrentContext() - after updateAppsUI');
    }
    else if (canPerformSuperadminActions() && !roleContext.isInTenantContext) {
        // Superadmin outside tenant context - show message to select tenant
        const appsList = document.getElementById('appsList');
        if (appsList) {
            appsList.innerHTML = '<div class="empty-state">Select a tenant context to manage apps</div>';
        }
    }
}
async function loadAppsForTenant(tenantId) {
    console.log('[TRACE] loadAppsForTenant() ENTRY', {
        tenantId,
        caller: new Error().stack.split('\n')[1].trim()
    });
    
    try {
        console.log('[TRACE] loadAppsForTenant() - before API call, current state.apps count:', state.apps?.length);
        const list = await api(`/apps?tenantId=${encodeURIComponent(tenantId)}`);
        console.log('[TRACE] loadAppsForTenant() - API returned apps:', list?.length, 'apps');
        state.apps = list;
        console.log('[TRACE] loadAppsForTenant() - after setting state.apps, count:', state.apps?.length);
        return list;
    }
    catch (e) {
        console.error('Failed to load apps for tenant:', e);
        return [];
    }
}
async function updateAppsUI() {
    console.log('[TRACE] updateAppsUI() ENTRY', {
        appsCount: state.apps?.length,
        appsPreview: state.apps?.slice(0, 3).map(a => ({id: a.id, name: a.name, tenantId: a.tenantId})),
        caller: new Error().stack.split('\n')[1].trim()
    });
    
    const appsList = document.getElementById('appsList');
    if (!appsList)
        return;
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
    appsList.querySelectorAll('.configureSmtp').forEach(btn => btn.addEventListener('click', () => {
        const appId = btn.dataset.id;
        const appName = btn.dataset.name;
        openAppSmtpConfigModal(appId, appName);
    }));
    // Wire up edit and delete buttons
    appsList.querySelectorAll('.editApp').forEach(btn => btn.addEventListener('click', () => editApp(btn.dataset.id)));
    appsList.querySelectorAll('.deleteApp').forEach(btn => btn.addEventListener('click', () => deleteApp(btn.dataset.id)));
}
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
async function editApp(appId) {
    const app = state.apps.find(a => a.id === appId);
    if (!app)
        return;
    const newName = prompt('Enter new app name:', app.name);
    if (newName === null || newName.trim() === '')
        return;
    try {
        await api(`/apps/${appId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName.trim() })
        });
        // Refresh the apps list
        await loadAppsForCurrentContext();
    }
    catch (e) {
        alert('Error updating app: ' + e.message);
    }
}
async function deleteApp(appId) {
    const app = state.apps.find(a => a.id === appId);
    if (!app)
        return;
    if (!confirm(`Are you sure you want to delete app "${app.name}"? This cannot be undone.`))
        return;
    try {
        await api(`/apps/${appId}`, { method: 'DELETE' });
        // Refresh the apps list
        await loadAppsForCurrentContext();
    }
    catch (e) {
        alert('Error deleting app: ' + e.message);
    }
}
// Role context switching for superadmin
function updateRoleContext() {
    const roles = state.user?.roles || [];
    roleContext.isSuperadmin = canPerformSuperadminActions();
    // Update role context display
    const roleContextDisplay = document.getElementById('roleContextDisplay');
    if (roleContextDisplay) {
        if (roleContext.isSuperadmin && roleContext.isInTenantContext) {
            roleContextDisplay.innerHTML = `
        <span class="context-indicator">🏢 Tenant Context: ${escapeHtml(roleContext.contextTenantName)}</span>
        <button type="button" id="exitTenantContextBtn" title="Exit tenant context">×</button>
      `;
            document.getElementById('exitTenantContextBtn')?.addEventListener('click', exitTenantContext);
        }
        else if (roleContext.isSuperadmin) {
            roleContextDisplay.innerHTML = `
        <span class="context-indicator">👑 Superadmin</span>
        <button type="button" id="switchTenantContextBtn" title="Switch to tenant context">🏢</button>
      `;
            document.getElementById('switchTenantContextBtn')?.addEventListener('click', showTenantContextSwitcher);
        }
        else {
            const tenantName = state.user?.tenantName || 'Current Tenant';
            const roleName = isInTenantAdminContext() ? 'Tenant Admin' : 'Editor';
            roleContextDisplay.innerHTML = `<span class="context-indicator">${roleName}: ${escapeHtml(tenantName)}</span>`;
        }
    }
    // Update navigation visibility based on role and context
    updateNavigationVisibility();
}
function updateNavigationVisibility() {
    const roles = state.user?.roles || [];
    const isEditorOnlyUser = isEditorOnly();
    const appsNavBtn = document.querySelector('[data-view="apps"]');
    const composeNavBtn = document.querySelector('[data-view="compose"]');
    const tenantsNavBtn = document.querySelector('[data-view="tenants"]');
    const smtpConfigBtn = document.querySelector('[data-view="smtp-config"]');
    if (appsNavBtn) {
        // Apps button visible for tenant_admin and superadmin ONLY when in tenant context
        appsNavBtn.style.display = (isInTenantAdminContext() || (canPerformSuperadminActions() && roleContext.isInTenantContext)) ? 'block' : 'none';
    }
    if (composeNavBtn) {
        // Compose button hidden for superadmin when not in tenant context
        composeNavBtn.style.display = (canPerformSuperadminActions() && !roleContext.isInTenantContext) ? 'none' : 'block';
    }
    if (tenantsNavBtn) {
        // Tenants button only visible for superadmin outside tenant context
        tenantsNavBtn.style.display = (canPerformSuperadminActions() && !roleContext.isInTenantContext) ? 'block' : 'none';
    }
    if (smtpConfigBtn) {
        // SMTP Config button hidden for editor-only users
        smtpConfigBtn.style.display = isEditorOnly() ? 'none' : 'block';
        // Update button text for non-editor users
        if (!isEditorOnly()) {
            smtpConfigBtn.textContent = 'Config';
        }
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
    if (!tenantsList)
        return;
    try {
        const tenants = await api('/tenants');
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
                const tenantId = btn.dataset.tenantId;
                const tenantName = btn.dataset.tenantName;
                switchToTenantContext(tenantId, tenantName);
            });
        });
    }
    catch (e) {
        tenantsList.innerHTML = '<div class="error">Failed to load tenants</div>';
    }
}
// App creation functionality
async function createApp(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const name = formData.get('appName');
    const clientId = formData.get('clientId');
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
    }
    catch (e) {
        alert('Error creating app: ' + e.message);
    }
}
// Wire up forms and context switching
function wireAppManagement() {
    // App creation form
    const appForm = document.getElementById('appForm');
    if (appForm) {
        appForm.addEventListener('submit', createApp);
    }
    // Context switch modal close
    const closeModalBtn = document.getElementById('closeContextModal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            const modal = document.getElementById('contextSwitchModal');
            if (modal)
                modal.style.display = 'none';
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
function showView(view) {
    console.log('[TRACE] showView() ENTRY', {
        view,
        roleContextInTenantContext: roleContext.isInTenantContext,
        caller: new Error().stack.split('\n')[1].trim()
    });
    
    const roles = state.user?.roles || [];
    const isEditorOnlyUser = isEditorOnly();
    // Restrict editor-only users to compose view only
    if (isEditorOnlyUser && view !== 'compose') {
        console.log(`[ui-auth] Editor-only user attempted to access ${view}, redirecting to compose`);
        view = 'compose';
    }
    (document.getElementById('view-tenants')).style.display = view === 'tenants' ? 'grid' : 'none';
    (document.getElementById('view-compose')).style.display = view === 'compose' ? 'grid' : 'none';
    (document.getElementById('view-smtp-config')).style.display = view === 'smtp-config' ? 'block' : 'none';
    (document.getElementById('view-apps')).style.display = view === 'apps' ? 'block' : 'none';
    document.querySelectorAll('.navBtn').forEach(el => el.classList.toggle('active', el.getAttribute('data-view') === view));
    // Update title with corrected names
    let title;
    if (view === 'tenants') {
        title = 'Tenant Management';
    }
    else if (view === 'smtp-config') {
        title = 'Configuration'; // Renamed from "SMTP Configuration"
    }
    else if (view === 'apps') {
        title = getAppsViewTitle();
    }
    else {
        title = composeHeaderTitle();
    }
    (document.getElementById('viewTitle')).textContent = title;
    // When SMTP config view is shown, load and display configs
    if (view === 'smtp-config') {
        console.log('SMTP Config view shown, loading configurations...');
        loadAndDisplayConfigs();
    }
    // When Apps view is shown, load apps for current tenant context
    if (view === 'apps') {
        loadAppsForCurrentContext();
    }
}
function wireNav() {
    document.querySelectorAll('button.navBtn').forEach(btn => btn.addEventListener('click', () => {
        showView(btn.dataset.view);
        savePageState();
    }));
    
    // Default view: Config for superadmins not in tenant context, otherwise Compose
    const defaultView = (canPerformSuperadminActions() && !roleContext.isInTenantContext) ? 'smtp-config' : 'compose';
    showView(defaultView);
}
// Manage Tenants button (in compose context panel)
document.getElementById('goToTenantsBtn')?.addEventListener('click', () => showView('tenants'));
const originalUpdateEnvInfo = updateEnvInfo;
// @ts-ignore
updateEnvInfo = function () { originalUpdateEnvInfo(); (document.getElementById('viewTitle')).textContent = composeHeaderTitle(); };
document.getElementById('quickSendForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!tenantId || !appId) {
        showStatusMessage(document.getElementById('quickSendStatus'), 'Select tenant/app first');
        return;
    }
    const fd = new FormData(e.target);
    const subject = fd.get('qsSubject');
    const html = fd.get('qsHtml');
    const text = fd.get('qsText');
    const recipients = (fd.get('qsRecipients') || '').split(/\n+/).map(s => s.trim()).filter(Boolean).map(e => ({ email: e }));
    if (!recipients.length) {
        showStatusMessage(document.getElementById('quickSendStatus'), 'Recipients required');
        return;
    }
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
        await api('/send-now', { method: 'POST', body: JSON.stringify({ appId, subject, html, text, recipients }) });
        showStatusMessage(document.getElementById('quickSendStatus'), 'Queued ✔');
        await listGroups();
    }
    catch (err) {
        showStatusMessage(document.getElementById('quickSendStatus'), 'Error: ' + err.message);
    }
    finally {
        btn.disabled = false;
    }
});
async function init() {
    console.log('[TRACE] init() ENTRY');
    
    await detectMode();
    // Load dynamic UI config
    try {
        // If not already injected, fetch config.js and evaluate (simple pattern)
        if (!uiConfig.returnUrl) {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = '/ui/config.js';
                s.onload = () => resolve();
                s.onerror = () => reject(new Error('config load failed'));
                document.head.appendChild(s);
            });
            uiConfig = window.__MAIL_UI_CONFIG__ || {};
        }
        try {
            console.debug('[ui-auth] config loaded', { returnUrl: uiConfig.returnUrl, idp: uiConfig.idpLoginUrl });
        }
        catch { }
    }
    catch {
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
    }
    catch { }
    // Accept token passed via URL strictly as a query parameter: ?token=JWT
    const url = new URL(window.location.href);
    // Capture multi-tenant/app hints from URL if provided by the referring app
    const tenantHint = url.searchParams.get('tenantId');
    const clientIdHint = url.searchParams.get('clientId');
    const appIdHint = url.searchParams.get('appId') || url.searchParams.get('app');
    if (tenantHint) {
        try {
            localStorage.setItem('tenantId', tenantHint);
            tenantId = tenantHint;
        }
        catch { }
    }
    if (clientIdHint) {
        try {
            localStorage.setItem('appClientIdHint', clientIdHint);
        }
        catch { }
    }
    if (appIdHint) {
        try {
            localStorage.setItem('appIdHint', appIdHint);
        }
        catch { }
    }
    const tokenFromUrl = url.searchParams.get('token');
    const cameFromIdp = !!tokenFromUrl;
    if (tokenFromUrl) {
        authToken = tokenFromUrl;
        localStorage.setItem('authToken', authToken);
        url.searchParams.delete('token');
        history.replaceState({}, '', url.toString());
        try {
            console.debug('[ui-auth] token accepted from URL', { len: tokenFromUrl.length });
        }
        catch { }
        // Clear the one-time redirect flag after arriving back from IDP
        try {
            sessionStorage.removeItem('idpRedirected');
        }
        catch { }
    }
    // load user context if auth enabled (ignore errors if auth disabled)
    let authDisabled = false;
    try {
        console.debug('[ui-auth] Calling /me with token:', authToken ? `${authToken.substring(0, 20)}...` : 'none');
        const userResponse = await api('/me');
        console.debug('[ui-auth] /me response:', userResponse ? 'user found' : 'null response');
        
        // Enhance user state with role tracking
        if (userResponse) {
            state.user = {
                ...userResponse,
                realRole: userResponse.roles?.[0] || 'editor', // The actual role from authentication
                effectiveRole: userResponse.roles?.[0] || 'editor' // The role we're operating as (can be changed by impersonation)
            };
            
            // If this is a real tenant admin, automatically set effective tenant context
            if (state.user.realRole === 'tenant_admin' && state.user.tenantId) {
                roleContext.isInTenantContext = true;
                roleContext.contextTenantId = state.user.tenantId;
                roleContext.contextTenantName = state.user.tenantName || state.user.tenantId;
                console.debug('[ui-auth] Tenant admin auto-context:', roleContext);
            }
        } else {
            state.user = null;
        }
        
        // If /me returns null but succeeds, auth is disabled
        if (state.user === null) {
            authDisabled = true;
            console.debug('[ui-auth] Authentication disabled, proceeding without user context');
        }
    }
    catch (e) {
        console.debug('[ui-auth] /me failed with token from IDP:', cameFromIdp, 'error:', e?.message || e);
        if (cameFromIdp) {
            console.error('[ui-auth] Token from IDP failed validation - this suggests an auth configuration issue');
        }
        else if (authToken) {
            // If we have a stored token that failed validation, it's likely expired
            console.debug('[ui-auth] Stored token failed validation (likely expired), clearing idpRedirected flag for fresh redirect');
            try {
                sessionStorage.removeItem('idpRedirected');
            }
            catch { }
            try {
                sessionStorage.removeItem('idpRedirectedHints');
            }
            catch { }
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
        const idp = uiConfig.idpLoginUrl;
        console.debug('[ui-auth] IDP URL:', idp);
        if (idp) {
            // Prevent infinite redirect loop: only auto-redirect once per page load/session
            const alreadyRedirected = (() => { try {
                return sessionStorage.getItem('idpRedirected') === '1';
            }
            catch {
                return false;
            } })();
            console.debug('[ui-auth] Already redirected?', alreadyRedirected, 'Came from IDP?', cameFromIdp);
            if (!cameFromIdp && !alreadyRedirected) {
                const ret = uiConfig.returnUrl || (window.location.origin + '/ui/');
                const redirect = new URL(idp);
                redirect.searchParams.set('return', ret);
                // Forward multi-tenant/app hints to IDP so they are embedded in the token
                const fTenant = tenantId || tenantHint || '';
                const fClient = (clientIdHint || localStorage.getItem('appClientIdHint') || '');
                const fAppId = (appId || appIdHint || localStorage.getItem('appIdHint') || 'cmfka688r0001b77ofpgm57ix'); // Default to ReTree Hawaii app
                console.log('[IDP-DEBUG] Redirect params:', {
                    tenantId, tenantHint, appId, appIdHint,
                    fTenant, fClient, fAppId,
                    localStorage_appIdHint: localStorage.getItem('appIdHint'),
                    localStorage_appClientIdHint: localStorage.getItem('appClientIdHint')
                });
                if (fTenant)
                    redirect.searchParams.set('tenantId', fTenant);
                if (fClient)
                    redirect.searchParams.set('clientId', fClient);
                if (fAppId)
                    redirect.searchParams.set('appId', fAppId); // Always send appId if we have one
                console.debug('[ui-auth] Setting idpRedirected flag and redirecting to:', redirect.toString());
                try {
                    console.debug('[ui-auth] redirecting to IDP', { ret, to: redirect.toString() });
                }
                catch { }
                try {
                    sessionStorage.setItem('idpRedirected', '1');
                }
                catch { }
                window.location.href = redirect.toString();
                return;
            }
            else {
                console.debug('[ui-auth] Skipping redirect - cameFromIdp:', cameFromIdp, 'alreadyRedirected:', alreadyRedirected);
            }
        }
        else {
            console.debug('[ui-auth] No IDP URL configured');
        }
        // Otherwise, show manual token login overlay and stop initialization
        showLogin();
        return;
    }
    // If already authenticated but arrived with app/tenant hints, refresh token via IDP once
    if (state.user && (clientIdHint || appIdHint || tenantHint) && uiConfig.idpLoginUrl) {
        const mismatch = ((clientIdHint && clientIdHint !== (state.user.appClientId || '')) ||
            (appIdHint && appIdHint !== (state.user.appId || '')) ||
            (tenantHint && tenantHint !== (state.user.tenantId || '')) ||
            (!state.user.appClientId && clientIdHint) || (!state.user.appId && appIdHint));
        const already = (() => { try {
            return sessionStorage.getItem('idpRedirectedHints') === '1';
        }
        catch {
            return false;
        } })();
        if (mismatch && !cameFromIdp && !already) {
            try {
                sessionStorage.setItem('idpRedirectedHints', '1');
            }
            catch { }
            const ret = uiConfig.returnUrl || (window.location.origin + '/ui/');
            const redirect = new URL(uiConfig.idpLoginUrl);
            redirect.searchParams.set('return', ret);
            if (tenantHint)
                redirect.searchParams.set('tenantId', tenantHint);
            if (clientIdHint)
                redirect.searchParams.set('clientId', clientIdHint);
            if (appIdHint && !clientIdHint)
                redirect.searchParams.set('appId', appIdHint);
            window.location.href = redirect.toString();
            return;
        }
    }
    // If we arrived with a fresh token, immediately reflect authenticated UI
    if (cameFromIdp && state.user) {
        onAuthenticated();
        return;
    }
    // If we have a user (whether from IDP or pre-existing token), show authenticated UI
    if (state.user) {
        onAuthenticated();
    }
    // Role based UI adjustments
    const roleList = state.user?.roles || [];
    const isEditorOnly = roleList.includes('editor') && !roleList.some(r => r === 'tenant_admin' || r === 'superadmin');
    const isTenantAdmin = roleList.includes('tenant_admin') && !roleList.includes('superadmin');
    if (isEditorOnly) {
        // Hide Tenants navigation button entirely
        document.querySelectorAll('[data-view=tenants]').forEach(el => el.style.display = 'none');
    }
    if (isEditorOnly) {
        // Hide tenant creation & app creation panels if present (compose context should only allow selecting existing)
        const tenantPanel = document.getElementById('tenantAppPanel');
        // editors should not see Manage Tenants button
        document.getElementById('goToTenantsBtn')?.remove();
    }
    // Load tenants if superadmin or if auth is disabled (for SMTP config to work)
    if (roleList.includes('superadmin') || authDisabled) {
        await loadTenants();
    }
    // Load apps if we have a tenantId or if auth is disabled
    if (tenantId) {
        await loadApps(); // Load apps for specific tenant
    }
    else if (authDisabled) {
        await loadAllApps(); // Load all apps for SMTP config dropdowns
    }
    // If appId from token is present, prefer it for initial context
    if (state.user?.appId && (!appId || appId !== state.user.appId)) {
        appId = state.user.appId;
        try {
            localStorage.setItem('appId', appId);
        }
        catch { }
    }
    updateEnvInfo();
    if (tenantId)
        await listTemplates();
    if (tenantId)
        await listGroups();
    wireNav();
    wireAppManagement();
    setupSmtpConfig();
    // Set up browser history handling
    setupHistoryHandling();
    // Restore page state after everything is loaded and set up
    // Use setTimeout to ensure all DOM updates are complete
    setTimeout(() => {
        restorePageState();
    }, 100);
}
function savePageState() {
    try {
        const currentView = getCurrentView();
        const inTenantContext = roleContext.isInTenantContext;
        const state = {
            currentView: currentView,
            tenantId: tenantId || undefined,
            tenantName: roleContext.contextTenantName || undefined,
            smtpConfigView: document.getElementById('view-smtp-config')?.style.display !== 'none',
            inTenantContext: inTenantContext,
            contextType: inTenantContext ? 'tenant' : 'global'
        };
        console.debug('[page-state] Saving state:', state);
        localStorage.setItem('pageState', JSON.stringify(state));
        // Also save to browser history
        saveToHistory(state);
    }
    catch (error) {
        console.debug('Failed to save page state:', error);
    }
}
function saveToHistory(state) {
    try {
        // Create a URL that represents the current state
        const url = new URL(window.location.href);
        url.pathname = '/ui/';
        url.search = ''; // Clear any existing query params
        if (state.tenantId) {
            url.searchParams.set('tenant', state.tenantId);
        }
        // Set view parameter based on current state
        if (state.currentView && state.currentView !== 'compose') {
            url.searchParams.set('view', state.currentView);
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
        }
        else {
            // Just replace the current state with updated data
            history.replaceState(state, '', newUrl);
            console.debug('[page-state] Replaced current history state');
        }
    }
    catch (error) {
        console.error('Failed to save to history:', error);
    }
}
function restorePageState() {
    console.log('[TRACE] restorePageState() ENTRY', {
        caller: new Error().stack.split('\n')[1].trim()
    });
    
    try {
        console.debug('[page-state] Starting page state restoration');
        // First try to restore from URL parameters
        const url = new URL(window.location.href);
        const urlTenantId = url.searchParams.get('tenant');
        const urlView = url.searchParams.get('view');
        const urlContext = url.searchParams.get('context');
        console.debug('[page-state] URL params:', { urlTenantId, urlView, urlContext });
        if (urlTenantId || urlView) {
            // Restore tenant context first if needed
            if (urlTenantId && urlTenantId !== tenantId) {
                console.debug('[page-state] Switching to tenant from URL:', urlTenantId);
                // Find tenant name from loaded tenants
                const tenant = window.state?.tenants?.find((t) => t.id === urlTenantId);
                console.debug('[page-state] Found tenant:', tenant);
                if (tenant) {
                    // Use the original function directly to avoid circular calls
                    if (originalSwitchToTenantContext) {
                        originalSwitchToTenantContext(urlTenantId, tenant.name);
                    }
                    else {
                        // Fallback to global function
                        window.switchToTenantContext(urlTenantId, tenant.name);
                    }
                    // If this is a tenant-apps view, the switchToTenantContext already set the view
                    if (urlView === 'tenant-apps') {
                        console.debug('[page-state] Tenant apps view set by switchToTenantContext');
                        return;
                    }
                }
                else {
                    console.warn('[page-state] Tenant not found:', urlTenantId);
                }
            }
            // Then restore the view
            if (urlView) {
                console.debug('[page-state] Switching to view from URL:', urlView);
                // Handle different view types
                switch (urlView) {
                    case 'tenant-apps':
                        // This is the tenant's apps view - the switchToTenantContext above should have set this up
                        // No need to call showView again as switchToTenantContext calls showView('apps')
                        console.debug('[page-state] Tenant apps view - context already set by switchToTenantContext');
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
                        showView('compose');
                        break;
                    default:
                        console.warn('[page-state] Unknown view type:', urlView);
                        showView(urlView); // Try anyway
                }
            }
            return;
        }
        // Fallback to localStorage
        const savedState = localStorage.getItem('pageState');
        if (!savedState) {
            console.debug('[page-state] No saved state found');
            return;
        }
        console.debug('[page-state] Restoring from localStorage');
        const savedPageState = JSON.parse(savedState);
        console.debug('[page-state] Saved state:', savedPageState);
        // Restore tenant context if it was saved
        if (savedPageState.tenantId && savedPageState.tenantId !== tenantId) {
            console.debug('[page-state] Switching to saved tenant:', savedPageState.tenantId);
            // Use the original function to avoid recursive calls
            if (originalSwitchToTenantContext) {
                originalSwitchToTenantContext(savedPageState.tenantId, savedPageState.tenantName || '');
            }
            else {
                // Fallback to global function
                window.switchToTenantContext(savedPageState.tenantId, savedPageState.tenantName || '');
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
            }
            else if (savedPageState.currentView === 'smtp-config') {
                showView('smtp-config');
            }
            else {
                showView(savedPageState.currentView);
            }
        }
    }
    catch (error) {
        console.error('Failed to restore page state:', error);
    }
}
function getCurrentView() {
    // Check what's currently visible
    const isSmtpConfigVisible = document.getElementById('view-smtp-config')?.style.display !== 'none';
    const isTenantsVisible = document.getElementById('view-tenants')?.style.display !== 'none';
    const isAppsVisible = document.getElementById('view-apps')?.style.display !== 'none';
    const isComposeVisible = document.getElementById('view-compose')?.style.display !== 'none';
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
function enhancedShowView(viewName) {
    showView(viewName);
    savePageState();
}
// Override navigation functions to save state
const originalSwitchToTenantContext = window.switchToTenantContext;
function enhancedSwitchToTenantContext(newTenantId, tenantName) {
    if (originalSwitchToTenantContext) {
        originalSwitchToTenantContext(newTenantId, tenantName);
    }
    savePageState();
}
// Handle browser back/forward buttons
function setupHistoryHandling() {
    window.addEventListener('popstate', (event) => {
        console.debug('[page-state] Popstate event:', event.state);
        if (event.state) {
            // Restore from history state
            const historyState = event.state;
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
        }
        else {
            // Fallback: try to restore from URL
            console.debug('[page-state] No history state, trying URL restoration');
            const url = new URL(window.location.href);
            const urlTenantId = url.searchParams.get('tenant');
            const urlView = url.searchParams.get('view');
            if (urlTenantId && urlTenantId !== tenantId) {
                const tenant = window.state?.tenants?.find((t) => t.id === urlTenantId);
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
window.switchToTenantContext = enhancedSwitchToTenantContext;
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
let currentSmtpConfig = null;
let selectedTreeNode = null;
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
    const globalForm = document.getElementById('globalConfigForm');
    globalForm?.addEventListener('submit', handleGlobalConfigSubmit);
    // Close modal button
    const closeBtn = document.getElementById('closeGlobalConfigModal');
    closeBtn?.addEventListener('click', closeGlobalConfigModal);
    // Cancel button
    const cancelBtn = document.getElementById('cancelGlobalConfigBtn');
    cancelBtn?.addEventListener('click', closeGlobalConfigModal);
    // Service selector for global config
    const serviceSelect = document.getElementById('globalServiceSelect');
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
    const appConfigForm = document.getElementById('appConfigForm');
    appConfigForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveAppConfig();
    });
    // Close app config modal button
    const closeAppBtn = document.getElementById('closeAppConfigModal');
    closeAppBtn?.addEventListener('click', () => {
        const modal = document.getElementById('appConfigModal');
        if (modal)
            modal.style.display = 'none';
    });
    // Cancel app config button
    const cancelAppBtn = document.getElementById('cancelAppConfigBtn');
    cancelAppBtn?.addEventListener('click', () => {
        const modal = document.getElementById('appConfigModal');
        if (modal)
            modal.style.display = 'none';
    });
    // App service selector
    const appServiceSelect = document.getElementById('appServiceSelect');
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
        if (indicator)
            indicator.style.display = 'none';
        // Reload configurations
        loadAndDisplayConfigs();
    });
}
async function loadAndDisplayConfigs() {
    console.log('[TRACE] loadAndDisplayConfigs() ENTRY', {
        user: state.user?.sub,
        roles: state.user?.roles,
        isSuperadmin: canPerformSuperadminActions(),
        isTenantAdmin: isInTenantAdminContext(),
        caller: new Error().stack.split('\n')[1].trim()
    });
    
    try {
        // Load all necessary data
        await loadSmtpConfigs();
        // Check user role to determine what to display
        const roles = state.user?.roles || [];
        const isSuperadmin = canPerformSuperadminActions();
        const isTenantAdmin = isInTenantAdminContext();
        if (isSuperadmin) {
            // Superadmin: full tenant management view
            await loadTenants();
            await loadAllApps(); // Load ALL apps for proper tree display
            await displayGlobalConfigs();
            await displayTenantOverview();
        }
        else if (isTenantAdmin) {
            // Tenant admin: use the EXACT same view as superadmin impersonating their tenant
            const tenantId = state.user?.tenantId;
            const tenantName = state.user?.tenantName || tenantId || 'Your Tenant';
            if (tenantId) {
                // UNIFIED: Use the same switchToTenantContext that superadmin uses when impersonating
                // This ensures the exact same API calls and state management
                if (window.switchToTenantContext) {
                    window.switchToTenantContext(tenantId, tenantName);
                }
                else {
                    console.warn('switchToTenantContext not available, falling back to basic view');
                    await displayTenantAdminView();
                }
            }
            else {
                console.error('Tenant admin has no tenantId context');
                await displayTenantAdminView();
            }
        }
        else {
            // Regular user: basic view
            await loadAllApps();
            await displayGlobalConfigs();
            await displayTenantAdminView();
        }
        // Update context indicator
        updateContextIndicator();
    }
    catch (error) {
        console.error('Failed to load configurations:', error);
    }
}
async function displayGlobalConfigs() {
    const cardsContainer = document.getElementById('globalConfigCards');
    const noConfigsMessage = document.getElementById('noGlobalConfigs');
    if (!cardsContainer || !noConfigsMessage)
        return;
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
function createGlobalConfigCard(config) {
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
    if (!treeContainer)
        return;
    // Show loading
    treeContainer.innerHTML = 'Loading configuration overview...';
    try {
        const roles = state.user?.roles || [];
        const isSuperadmin = canPerformSuperadminActions();
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
            }
            else {
                treeHtml = buildTenantTree();
            }
            treeContainer.innerHTML = treeHtml;
        }
        else {
            // Tenant admin view: show only their tenant's apps
            await displayTenantAdminView();
        }
    }
    catch (error) {
        console.error('Failed to display overview:', error);
        treeContainer.innerHTML = 'Failed to load configuration overview.';
    }
}
async function displayTenantAdminView() {
    const treeContainer = document.getElementById('smtpTree');
    if (!treeContainer)
        return;
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
    <div class="tenant-admin-header" style="margin-bottom: 20px; padding: 15px; background: #2d3748; border-radius: 8px; border-left: 4px solid #4CAF50;">
      <h3 style="margin: 0 0 5px 0; color: #fff;">Tenant: ${escapeHtml(tenantName)}</h3>
      <p style="margin: 0; color: #a0aec0; font-size: 0.9em;">Managing ${tenantApps.length} application(s)</p>
    </div>
  `;
    if (tenantApps.length === 0) {
        treeHtml += '<div style="text-align: center; color: #888; padding: 40px;">No applications found for this tenant.</div>';
    }
    else {
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
function buildTenantTree() {
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
    if (!indicator || !tenantNameSpan)
        return;
    if (roleContext.isInTenantContext && roleContext.contextTenantName) {
        indicator.style.display = 'block';
        tenantNameSpan.textContent = roleContext.contextTenantName;
    }
    else {
        indicator.style.display = 'none';
    }
}
// App SMTP Configuration Modal
function openAppSmtpConfigModal(appId, appName) {
    const modal = document.getElementById('appConfigModal');
    if (!modal) {
        console.error('App config modal not found!');
        return;
    }
    // Set app information in modal
    const appNameEl = document.getElementById('appConfigAppName');
    const appIdEl = document.getElementById('appConfigAppId');
    if (appNameEl)
        appNameEl.textContent = appName;
    if (appIdEl)
        appIdEl.textContent = `App ID: ${appId}`;
    // Find existing config for this app
    const existingConfig = state.smtpConfigs.find(c => c.scope === 'APP' && c.appId === appId);
    const form = document.getElementById('appConfigForm');
    const deleteBtn = document.getElementById('deleteAppConfigBtn');
    if (existingConfig) {
        // Populate form with existing config
        populateAppConfigForm(existingConfig);
        if (deleteBtn)
            deleteBtn.style.display = 'block';
        document.getElementById('appConfigModalTitle').textContent = `Edit SMTP Configuration - ${appName}`;
    }
    else {
        // Clear form for new config
        if (form)
            form.reset();
        if (deleteBtn)
            deleteBtn.style.display = 'none';
        document.getElementById('appConfigModalTitle').textContent = `Configure SMTP - ${appName}`;
    }
    // Store current app info for form submission
    window.currentAppConfig = { appId, appName, existingConfig };
    modal.style.display = 'flex';
}
function populateAppConfigForm(config) {
    const form = document.getElementById('appConfigForm');
    if (!form)
        return;
    // Set service type
    const serviceSelect = form.querySelector('[name="service"]');
    if (serviceSelect)
        serviceSelect.value = config.service || config.provider || 'smtp';
    // Set SMTP fields
    const hostInput = form.querySelector('[name="host"]');
    const portInput = form.querySelector('[name="port"]');
    const secureInput = form.querySelector('[name="secure"]');
    const userInput = form.querySelector('[name="user"]');
    const passInput = form.querySelector('[name="pass"]');
    if (hostInput)
        hostInput.value = config.host || config.smtpHost || '';
    if (portInput)
        portInput.value = String(config.port || config.smtpPort || '');
    if (secureInput)
        secureInput.checked = config.secure || config.smtpSecure || false;
    if (userInput)
        userInput.value = config.user || config.smtpUser || '';
    if (passInput)
        passInput.value = config.pass || config.smtpPass || '';
    // Set SES fields
    const awsAccessKeyInput = form.querySelector('[name="awsAccessKey"]');
    const awsSecretKeyInput = form.querySelector('[name="awsSecretKey"]');
    const awsRegionInput = form.querySelector('[name="awsRegion"]');
    if (awsAccessKeyInput)
        awsAccessKeyInput.value = config.awsAccessKey || '';
    if (awsSecretKeyInput)
        awsSecretKeyInput.value = config.awsSecretKey || '';
    if (awsRegionInput)
        awsRegionInput.value = config.awsRegion || 'us-east-1';
    // Set common fields
    const fromAddressInput = form.querySelector('[name="fromAddress"]');
    const fromNameInput = form.querySelector('[name="fromName"]');
    if (fromAddressInput)
        fromAddressInput.value = config.fromAddress || config.smtpFromAddress || '';
    if (fromNameInput)
        fromNameInput.value = config.fromName || config.smtpFromName || '';
    // Update field visibility
    updateAppConfigFieldVisibility();
}
function updateAppConfigFieldVisibility() {
    const serviceSelect = document.getElementById('appServiceSelect');
    const smtpFields = document.getElementById('appSmtpFields');
    const sesFields = document.getElementById('appSesFields');
    if (serviceSelect && smtpFields && sesFields) {
        const service = serviceSelect.value;
        smtpFields.style.display = service === 'smtp' ? 'block' : 'none';
        sesFields.style.display = service === 'ses' ? 'block' : 'none';
    }
}
async function saveAppConfig() {
    const appConfig = window.currentAppConfig;
    if (!appConfig) {
        console.error('No app config context');
        return;
    }
    const form = document.getElementById('appConfigForm');
    if (!form)
        return;
    const formData = new FormData(form);
    const service = formData.get('service');
    const config = {
        scope: 'APP',
        appId: appConfig.appId,
        service: service,
        fromAddress: formData.get('fromAddress'),
        fromName: formData.get('fromName')
    };
    // Add service-specific fields
    if (service === 'smtp') {
        config.host = formData.get('host');
        config.port = parseInt(formData.get('port'));
        config.secure = formData.get('secure') === 'on';
        config.user = formData.get('user');
        config.pass = formData.get('pass');
    }
    else if (service === 'ses') {
        config.awsAccessKey = formData.get('awsAccessKey');
        config.awsSecretKey = formData.get('awsSecretKey');
        config.awsRegion = formData.get('awsRegion');
    }
    try {
        let response;
        if (appConfig.existingConfig) {
            // Update existing config
            response = await api(`/smtp-configs/${appConfig.existingConfig.id}`, {
                method: 'PUT',
                body: JSON.stringify(config)
            });
        }
        else {
            // Create new config
            response = await api('/smtp-configs', {
                method: 'POST',
                body: JSON.stringify(config)
            });
        }
        showStatus(null, 'App SMTP configuration saved successfully!', 'success');
        // Close modal
        const modal = document.getElementById('appConfigModal');
        if (modal)
            modal.style.display = 'none';
        // Refresh data while preserving current context
        await loadSmtpConfigs(); // Only reload SMTP configs
        // Update UI based on current context
        if (tenantId) {
            // We're in tenant context, reload only the current tenant's apps
            await loadAppsForCurrentContext();
            updateAppsUI();
        }
        else {
            // We're in global context, refresh everything
            await loadAndDisplayConfigs();
        }
    }
    catch (error) {
        console.error('Error saving app config:', error);
        showStatus(null, `Failed to save app configuration: ${error}`, 'error');
    }
}
async function testAppConfig() {
    const appConfig = window.currentAppConfig;
    if (!appConfig) {
        console.error('No app config context');
        return;
    }
    const form = document.getElementById('appConfigForm');
    if (!form)
        return;
    const formData = new FormData(form);
    const service = formData.get('service');
    const config = {
        scope: 'APP',
        appId: appConfig.appId,
        service: service,
        fromAddress: formData.get('fromAddress'),
        fromName: formData.get('fromName')
    };
    // Add service-specific fields
    if (service === 'smtp') {
        config.host = formData.get('host');
        config.port = parseInt(formData.get('port'));
        config.secure = formData.get('secure') === 'on';
        config.user = formData.get('user');
        config.pass = formData.get('pass');
    }
    else if (service === 'ses') {
        config.awsAccessKey = formData.get('awsAccessKey');
        config.awsSecretKey = formData.get('awsSecretKey');
        config.awsRegion = formData.get('awsRegion');
    }
    try {
        const response = await api('/smtp-configs/test', {
            method: 'POST',
            body: JSON.stringify(config)
        });
        showStatus(null, 'Test email sent successfully!', 'success');
    }
    catch (error) {
        console.error('Error testing app config:', error);
        showStatus(null, `Test failed: ${error}`, 'error');
    }
}
async function deleteAppConfig() {
    const appConfig = window.currentAppConfig;
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
        if (modal)
            modal.style.display = 'none';
        // Refresh data while preserving current context
        await loadSmtpConfigs(); // Only reload SMTP configs
        // Update UI based on current context
        if (tenantId) {
            // We're in tenant context, reload only the current tenant's apps
            await loadAppsForCurrentContext();
            updateAppsUI();
        }
        else {
            // We're in global context, refresh everything
            await loadAndDisplayConfigs();
        }
    }
    catch (error) {
        console.error('Error deleting app config:', error);
        showStatus(null, `Failed to delete app configuration: ${error}`, 'error');
    }
}
// Global Configuration Modal Functions
function openGlobalConfigModal(configId) {
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
    const form = document.getElementById('globalConfigForm');
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
        const child = form.children[i];
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
            if (deleteBtn)
                deleteBtn.style.display = 'block';
        }
    }
    else {
        // Creating new config
        console.log('Creating new config');
        titleEl.textContent = 'Add Global SMTP Configuration';
        if (deleteBtn)
            deleteBtn.style.display = 'none';
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
    const form = document.getElementById('globalConfigForm');
    if (form) {
        form.reset();
    }
    // Clear any status messages
    const statusEl = document.getElementById('globalConfigStatus');
    if (statusEl) {
        statusEl.textContent = '';
    }
}
function populateGlobalConfigForm(config) {
    const form = document.getElementById('globalConfigForm');
    if (!form)
        return;
    // Set hidden config ID
    form.querySelector('#globalConfigId').value = config.id;
    // Set form fields
    form.querySelector('[name="service"]').value = config.service || 'smtp';
    form.querySelector('[name="host"]').value = config.host || '';
    form.querySelector('[name="port"]').value = (config.port || 587).toString();
    form.querySelector('[name="secure"]').checked = config.secure || false;
    form.querySelector('[name="user"]').value = config.user || '';
    // Handle password field (sensitive)
    const passField = form.querySelector('[name="pass"]');
    if (config.pass && !config.pass.includes('*')) {
        passField.value = config.pass;
    }
    else {
        passField.value = '';
        passField.placeholder = 'Enter password (leave blank to keep current)';
    }
    form.querySelector('[name="fromAddress"]').value = config.fromAddress || '';
    form.querySelector('[name="fromName"]').value = config.fromName || '';
    // Handle SES fields if applicable
    if (config.service === 'ses') {
        form.querySelector('[name="awsRegion"]').value = config.awsRegion || '';
        // Handle AWS Access Key (may be masked)
        const accessKeyField = form.querySelector('[name="awsAccessKey"]');
        if (config.awsAccessKey && !config.awsAccessKey.includes('*')) {
            accessKeyField.value = config.awsAccessKey;
        }
        else {
            accessKeyField.value = '';
            accessKeyField.placeholder = 'Enter access key (leave blank to keep current)';
        }
        // For sensitive fields, only populate if not masked
        const secretField = form.querySelector('[name="awsSecretKey"]');
        if (config.awsSecretKey && !config.awsSecretKey.includes('*')) {
            secretField.value = config.awsSecretKey;
        }
        else {
            // Clear the field for security, user must re-enter if they want to change it
            secretField.value = '';
            secretField.placeholder = 'Enter secret key (leave blank to keep current)';
        }
    } // Trigger service change to show/hide fields
    const serviceSelect = form.querySelector('[name="service"]');
    serviceSelect.dispatchEvent(new Event('change'));
}
async function handleGlobalConfigSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const statusEl = document.getElementById('globalConfigStatus');
    const saveBtn = document.getElementById('saveGlobalConfigBtn');
    if (!statusEl)
        return;
    try {
        saveBtn.disabled = true;
        statusEl.textContent = 'Saving configuration...';
        const formData = new FormData(form);
        const configId = form.querySelector('#globalConfigId').value;
        const payload = {
            scope: 'GLOBAL',
            service: formData.get('service'),
            host: formData.get('host'),
            port: parseInt(formData.get('port')) || 587,
            secure: formData.has('secure'),
            user: formData.get('user') || undefined,
            fromAddress: formData.get('fromAddress')
            // fromName removed - no longer using Provider Name field
        };
        // Handle SMTP password (sensitive field)
        const password = formData.get('pass');
        if (password && password.trim()) {
            payload.pass = password;
        }
        // If editing and password is empty, backend will keep existing password
        // Handle SES fields
        if (payload.service === 'ses') {
            payload.awsRegion = formData.get('awsRegion');
            // Only include access key if it has been provided (not empty)
            const accessKey = formData.get('awsAccessKey');
            if (accessKey && accessKey.trim()) {
                payload.awsAccessKey = accessKey;
            }
            // Only include secret key if it has been provided (not empty)
            const secretKey = formData.get('awsSecretKey');
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
        }
        else {
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
    }
    catch (error) {
        console.error('Failed to save global config:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status error';
    }
    finally {
        saveBtn.disabled = false;
    }
}
async function testGlobalConfig() {
    const form = document.getElementById('globalConfigForm');
    const statusEl = document.getElementById('globalConfigStatus');
    const testBtn = document.getElementById('testGlobalConfigBtn');
    if (!form || !statusEl)
        return;
    try {
        testBtn.disabled = true;
        statusEl.textContent = 'Testing configuration...';
        statusEl.className = 'status';
        // Get the config ID for testing existing configs
        const configId = form.querySelector('#globalConfigId').value;
        if (!configId) {
            statusEl.textContent = 'Cannot test unsaved configuration. Please save first.';
            statusEl.className = 'status error';
            return;
        }
        const formData = new FormData(form);
        const payload = {
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
        }
        else {
            statusEl.textContent = `Test failed: ${response.message || 'Unknown error'}`;
            statusEl.className = 'status error';
        }
    }
    catch (error) {
        console.error('Test failed:', error);
        statusEl.textContent = `Test failed: ${error.message}`;
        statusEl.className = 'status error';
    }
    finally {
        testBtn.disabled = false;
    }
}
async function handleGlobalConfigDelete() {
    const configId = document.getElementById('globalConfigId').value;
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
            }
            else {
                confirmMessage = 'This is the ACTIVE global configuration and the ONLY global configuration. Deleting it will leave no global fallback for email services. Are you absolutely sure?';
            }
        }
        catch (error) {
            console.warn('Failed to get next active config, falling back to basic warning:', error);
            confirmMessage = 'This is the ACTIVE global configuration. Deleting it may activate another configuration or leave no global fallback. Continue?';
        }
    }
    if (!confirm(confirmMessage))
        return;
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
                }
                else {
                    statusEl.textContent = 'Configuration deleted successfully. Warning: No global configuration is now active.';
                }
            }
            else {
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
    }
    catch (error) {
        console.error('Failed to delete config:', error);
        const statusEl = document.getElementById('globalConfigStatus');
        if (statusEl) {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.className = 'status error';
        }
    }
}
// Global Configuration Card Action Functions
async function activateGlobalConfig(configId) {
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
        }
        else {
            console.error('Failed to activate configuration');
        }
    }
    catch (error) {
        console.error('Failed to activate global config:', error);
        // Reset radio button to previous state
        await loadSmtpConfigs();
        await displayGlobalConfigs();
    }
}
function editGlobalConfig(configId) {
    openGlobalConfigModal(configId);
}
async function testGlobalConfigById(configId) {
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
        }
        else {
            alert(`Test failed: ${response.message || 'Unknown error'}`);
        }
    }
    catch (error) {
        console.error('Test failed:', error);
        alert(`Test failed: ${error.message}`);
    }
}
async function deleteGlobalConfigById(configId) {
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
            }
            else {
                confirmMessage = 'This is the ACTIVE global configuration and the ONLY global configuration. Deleting it will leave no global fallback for email services. Are you absolutely sure?';
            }
        }
        catch (error) {
            console.warn('Failed to get next active config, falling back to basic warning:', error);
            confirmMessage = 'This is the ACTIVE global configuration. Deleting it may activate another configuration or leave no global fallback. Continue?';
        }
    }
    if (!confirm(confirmMessage))
        return;
    try {
        // DELETE returns 204 with no content, so handle it specially
        const headers = { 'Content-Type': 'application/json' };
        if (authToken)
            headers['Authorization'] = 'Bearer ' + authToken;
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
    }
    catch (error) {
        console.error('Failed to delete config:', error);
        alert(`Error: ${error.message}`);
    }
}
function switchToTenantContext(tenantId, tenantName) {
    console.log('[TRACE] switchToTenantContext() ENTRY', {
        tenantId,
        tenantName,
        caller: new Error().stack.split('\n')[1].trim()
    });
    
    // Store tenant context
    localStorage.setItem('contextTenantId', tenantId);
    localStorage.setItem('contextTenantName', tenantName);
    roleContext.isInTenantContext = true;
    roleContext.contextTenantId = tenantId;
    roleContext.contextTenantName = tenantName;
    
    // UNIFIED: Initialize user state if not already done
    if (state.user && !state.user.realRole) {
        state.user.realRole = state.user.roles?.[0] || 'editor';
    }
    
    // Set effective role for tenant context
    if (state.user) {
        state.user.effectiveRole = 'tenant_admin'; // UNIFIED: Everyone in tenant context is effectively tenant_admin
        console.log(`[unified-context] User ${state.user.sub} (real role: ${state.user.realRole}) now in tenant context: ${tenantName} (${tenantId})`);
    }
    
    // UNIFIED: Complete initialization
    updateContextIndicator();
    updateRoleContext();
    wireNav();
    wireAppManagement();
    
    // Switch to apps view to show this tenant's apps
    showView('apps');
    console.log(`[unified-context] Switched to tenant context: ${tenantName} (${tenantId})`);
}
// Legacy functions removed - replaced with new card-based UI
// The old buildSmtpTree, selectTreeNode, etc. functions have been replaced
function selectTreeNode(scope, tenantId, appId, configId) {
    console.log('Selecting tree node:', scope, tenantId, appId, configId);
    selectedTreeNode = { scope, tenantId, appId, configId };
    // Update visual selection
    document.querySelectorAll('.tree-node').forEach(node => {
        node.classList.remove('selected');
    });
    // Find and select the clicked node
    const clickedElement = event?.target?.closest('.tree-node');
    if (clickedElement) {
        clickedElement.classList.add('selected');
    }
    // Update hidden form fields
    const formScope = document.getElementById('formScope');
    const formTenantId = document.getElementById('formTenantId');
    const formAppId = document.getElementById('formAppId');
    if (formScope)
        formScope.value = scope;
    if (formTenantId)
        formTenantId.value = tenantId || '';
    if (formAppId)
        formAppId.value = appId || '';
    // Load configuration for this node
    loadConfigForNode();
    // Update action buttons
    updateActionButtons();
}
function loadConfigForNode() {
    if (!selectedTreeNode)
        return;
    // Find existing config for this node
    const config = state.smtpConfigs.find((c) => {
        if (c.scope !== selectedTreeNode.scope)
            return false;
        if (selectedTreeNode.scope === 'TENANT')
            return c.tenantId === selectedTreeNode.tenantId;
        if (selectedTreeNode.scope === 'APP')
            return c.appId === selectedTreeNode.appId;
        if (selectedTreeNode.scope === 'GLOBAL') {
            // For global configs, if configId is specified, match by ID, otherwise find active one
            if (selectedTreeNode.configId) {
                return c.id === selectedTreeNode.configId;
            }
            else {
                return c.isActive; // Show active global config when no specific ID selected
            }
        }
        return false;
    });
    currentSmtpConfig = config || null;
    if (config) {
        populateForm(config);
        showConfigEditor();
    }
    else {
        clearForm();
        showConfigEditor();
    }
}
function updateActionButtons() {
    const actionButtons = document.getElementById('configActionButtons');
    if (!actionButtons || !selectedTreeNode)
        return;
    const hasConfig = currentSmtpConfig !== null;
    const scope = selectedTreeNode.scope;
    const scopeLabel = scope === 'GLOBAL' ? 'Global' :
        scope === 'TENANT' ? 'Tenant' : 'App';
    let buttonsHtml = '';
    if (hasConfig) {
        buttonsHtml += `<button type="submit" class="config-btn">Update ${scopeLabel} Config</button>`;
        // Add activation button for inactive global configs
        if (scope === 'GLOBAL' && currentSmtpConfig && !currentSmtpConfig.isActive) {
            buttonsHtml += `<button type="button" class="config-btn config-btn-primary" onclick="activateGlobalConfig('${currentSmtpConfig.id}')">Activate This Config</button>`;
        }
        buttonsHtml += `<button type="button" class="config-btn config-btn-danger" onclick="deleteSmtpConfig()">Delete Config</button>`;
    }
    else {
        buttonsHtml += `<button type="submit" class="config-btn">Create ${scopeLabel} Config</button>`;
    }
    buttonsHtml += `<button type="button" class="config-btn config-btn-secondary" onclick="refreshSmtpTree()">Refresh</button>`;
    actionButtons.innerHTML = buttonsHtml;
}
function showConfigEditor() {
    const editor = document.getElementById('smtpConfigEditor');
    if (editor)
        editor.style.display = 'block';
}
function refreshSmtpTree() {
    loadAndDisplayConfigs();
}
async function deleteSmtpConfig() {
    if (!currentSmtpConfig) {
        alert('No configuration selected to delete');
        return;
    }
    if (!confirm('Are you sure you want to delete this SMTP configuration?'))
        return;
    try {
        await api(`/smtp-configs/${currentSmtpConfig.id}`, { method: 'DELETE' });
        await loadSmtpConfigs();
        currentSmtpConfig = null;
        clearForm();
        loadAndDisplayConfigs(); // Refresh the display
    }
    catch (error) {
        console.error('Failed to delete config:', error);
        alert('Failed to delete configuration: ' + error.message);
    }
}
function populateFormAppSelect(selectedTenantId) {
    console.log('populateFormAppSelect called with tenantId:', selectedTenantId);
    console.log('state.apps:', state.apps);
    const formAppSelect = document.getElementById('formAppSelect');
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
    }
    else {
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
    const selectedTenantId = document.getElementById('smtpTenantSelect').value;
    const appSelect = document.getElementById('smtpAppSelect');
    const scope = document.getElementById('smtpScope').value;
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
    const service = document.querySelector('select[name="service"]')?.value;
    const sesSettings = document.getElementById('sesSettings');
    if (sesSettings) {
        sesSettings.style.display = service === 'ses' ? 'block' : 'none';
    }
}
function populateFormSelects() {
    // Populate tenant selects
    const tenantSelects = [
        document.getElementById('smtpTenantSelect'),
        document.getElementById('formTenantSelect')
    ];
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
    ];
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
    const effectiveConfigDiv = document.getElementById('effectiveConfig');
    const statusDiv = document.getElementById('smtpContextStatus');
    const refreshBtn = document.getElementById('refreshConfigBtn');
    if (!effectiveConfigDiv)
        return;
    const scope = document.getElementById('smtpScope').value;
    const tenantId = document.getElementById('smtpTenantSelect').value;
    const appId = document.getElementById('smtpAppSelect').value;
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
        }
        else {
            effectiveConfigDiv.innerHTML = '<p class="sub">No configuration found for this scope.</p>';
            statusDiv.innerHTML = '';
        }
        refreshBtn.style.display = 'block';
    }
    catch (error) {
        effectiveConfigDiv.innerHTML = '<p class="sub error">Error loading configuration</p>';
        statusDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        refreshBtn.style.display = 'none';
    }
}
function handleProviderChange() {
    const provider = document.querySelector('input[name="provider"]:checked')?.value;
    const smtpFieldset = document.getElementById('smtp-fieldset');
    const sesFieldset = document.getElementById('ses-fieldset');
    smtpFieldset.style.display = provider === 'smtp' ? 'block' : 'none';
    sesFieldset.style.display = provider === 'ses' ? 'block' : 'none';
}
async function handleConfigSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const statusEl = document.getElementById('smtpConfigStatus');
    const config = {
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
        config.port = parseInt(formData.get('port')) || 587;
        config.secure = formData.has('secure');
        config.user = formData.get('user');
        config.pass = formData.get('pass');
        config.fromAddress = formData.get('fromAddress');
        config.fromName = formData.get('fromName');
    }
    else if (config.service === 'ses') {
        config.awsAccessKey = formData.get('awsAccessKey');
        config.awsSecretKey = formData.get('awsSecretKey');
        config.awsRegion = formData.get('awsRegion');
        config.fromAddress = formData.get('fromAddress');
        config.fromName = formData.get('fromName');
    }
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
        if (currentSmtpConfig) {
            // Update existing config
            await api(`/smtp-configs/${currentSmtpConfig.id}`, {
                method: 'PUT',
                body: JSON.stringify(config)
            });
            showStatus(statusEl, 'Configuration updated successfully', 'success');
        }
        else {
            // Create new config
            await api('/smtp-configs', {
                method: 'POST',
                body: JSON.stringify(config)
            });
            showStatus(statusEl, 'Configuration created successfully', 'success');
        }
        await loadSmtpConfigs();
        clearForm();
    }
    catch (error) {
        showStatus(statusEl, `Error: ${error.message}`, 'error');
    }
    finally {
        submitBtn.disabled = false;
    }
}
async function handleConfigDelete() {
    if (!currentSmtpConfig)
        return;
    if (!confirm('Are you sure you want to delete this SMTP configuration?'))
        return;
    const statusEl = document.getElementById('config-status');
    const deleteBtn = document.getElementById('delete-config-btn');
    deleteBtn.disabled = true;
    try {
        await api(`/smtp-configs/${currentSmtpConfig.id}`, { method: 'DELETE' });
        showStatus(statusEl, 'Configuration deleted successfully', 'success');
        await loadSmtpConfigs();
        clearForm();
    }
    catch (error) {
        showStatus(statusEl, `Error: ${error.message}`, 'error');
    }
    finally {
        deleteBtn.disabled = false;
    }
}
async function handleTestConnection() {
    const statusEl = document.getElementById('config-status');
    const testBtn = document.getElementById('test-connection-btn');
    testBtn.disabled = true;
    try {
        const scope = document.getElementById('smtp-scope').value;
        const tenantId = scope !== 'GLOBAL' ? document.getElementById('smtp-tenant-id').value : undefined;
        const appId = scope === 'APP' ? document.getElementById('smtp-app-id').value : undefined;
        await api('/smtp-configs/test', {
            method: 'POST',
            body: JSON.stringify({ tenantId, appId })
        });
        showStatus(statusEl, 'Connection test successful', 'success');
    }
    catch (error) {
        showStatus(statusEl, `Connection test failed: ${error.message}`, 'error');
    }
    finally {
        testBtn.disabled = false;
    }
}
async function loadSmtpConfigs() {
    try {
        const configs = await api('/smtp-configs');
        state.smtpConfigs = configs; // Store in state for tree building
        displayConfigList(configs);
    }
    catch (error) {
        console.error('Failed to load SMTP configs:', error);
        state.smtpConfigs = []; // Clear on error
    }
}
function displayConfigList(configs) {
    // No longer needed - using tree-based UI instead
    console.log('displayConfigList called with', configs.length, 'configs (tree UI is used instead)');
}
async function editConfig(configId) {
    console.log('Edit button clicked for config:', configId);
    try {
        const config = await api(`/smtp-configs/${configId}`);
        console.log('Loaded config for editing:', config);
        currentSmtpConfig = config;
        populateForm(config);
    }
    catch (error) {
        console.error('Failed to load config:', error);
    }
}
async function deleteConfig(configId) {
    if (!confirm('Are you sure you want to delete this SMTP configuration?'))
        return;
    try {
        await api(`/smtp-configs/${configId}`, { method: 'DELETE' });
        await loadSmtpConfigs();
        if (currentSmtpConfig?.id === configId) {
            clearForm();
        }
    }
    catch (error) {
        console.error('Failed to delete config:', error);
    }
}
function populateForm(config) {
    // Expand the form details element so user can see the form
    const detailsElement = document.querySelector('details');
    if (detailsElement) {
        detailsElement.open = true;
    }
    // Set scope and trigger change
    const scopeSelect = document.getElementById('smtpScope');
    if (scopeSelect) {
        scopeSelect.value = config.scope;
        // Trigger scope change event
        scopeSelect.dispatchEvent(new Event('change'));
    }
    // Set tenant/app if applicable
    if (config.tenantId) {
        const tenantSelect = document.getElementById('formTenantSelect');
        if (tenantSelect) {
            tenantSelect.value = config.tenantId;
            tenantSelect.dispatchEvent(new Event('change'));
        }
    }
    if (config.appId) {
        const appSelect = document.getElementById('formAppSelect');
        if (appSelect) {
            appSelect.value = config.appId;
        }
    }
    // Set provider/service
    const serviceSelect = document.querySelector('select[name="service"]');
    if (serviceSelect) {
        serviceSelect.value = config.service || config.provider || 'smtp';
    }
    // Set SMTP fields using name attributes
    const form = document.getElementById('smtpConfigForm');
    if (form) {
        form.querySelector('input[name="host"]').value = config.host || config.smtpHost || '';
        form.querySelector('input[name="port"]').value = (config.port || config.smtpPort || 587).toString();
        form.querySelector('input[name="secure"]').checked = config.secure || config.smtpSecure || false;
        form.querySelector('input[name="user"]').value = config.user || config.smtpUser || '';
        form.querySelector('input[name="pass"]').value = ''; // Don't populate password for security
        form.querySelector('input[name="fromAddress"]').value = config.fromAddress || config.smtpFromAddress || '';
        form.querySelector('input[name="fromName"]').value = config.fromName || config.smtpFromName || '';
    }
}
function clearForm() {
    currentSmtpConfig = null;
    const form = document.getElementById('smtpConfigForm');
    if (form) {
        form.reset();
    }
    const deleteBtn = document.getElementById('delete-config-btn');
    if (deleteBtn) {
        deleteBtn.style.display = 'none';
    }
    // handleScopeChange(); // Removed - not needed with tree-based UI
}
async function loadEffectiveConfig() {
    const statusEl = document.getElementById('config-status');
    const effectiveEl = document.getElementById('effective-config');
    try {
        const scope = document.getElementById('smtp-scope').value;
        const tenantId = scope !== 'GLOBAL' ? document.getElementById('smtp-tenant-id').value : undefined;
        const appId = scope === 'APP' ? document.getElementById('smtp-app-id').value : undefined;
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
    }
    catch (error) {
        showStatus(statusEl, `Error: ${error.message}`, 'error');
    }
}
function showStatus(element, message, type) {
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
// Make functions available globally for onclick handlers
window.activateGlobalConfig = activateGlobalConfig;
window.editGlobalConfig = editGlobalConfig;
window.testGlobalConfigById = testGlobalConfigById;
window.deleteGlobalConfigById = deleteGlobalConfigById;
window.switchToTenantContext = switchToTenantContext;
init();
export {};
//# sourceMappingURL=main.js.map