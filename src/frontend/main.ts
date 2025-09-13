// UI client: tenant management + compose/send + quick ad-hoc send (DB path only now).

interface TemplateRecord { id:string; tenantId:string; name:string; version:number; subject:string; bodyHtml:string; bodyText?:string; }
interface Tenant { id:string; name:string; status?:string; }
interface AppRec { id:string; tenantId:string; name:string; clientId:string; }

let tenantId = localStorage.getItem('tenantId') || '';
let appId = localStorage.getItem('appId') || '';
let authToken: string | null = localStorage.getItem('authToken');
let uiConfig: any = (window as any).__MAIL_UI_CONFIG__ || {};

const state = {
  currentTemplate: undefined as TemplateRecord|undefined,
  tenants: [] as Tenant[],
  apps: [] as AppRec[],
  smtpConfigs: [] as SmtpConfig[],
  dbMode: true,
  user: null as any,
};

function $(sel: string) { return document.querySelector(sel)!; }

function status(el: HTMLElement, msg: string) { el.textContent = msg; setTimeout(()=> { if (el.textContent === msg) el.textContent=''; }, 6000); }
function flashInvalid(el: HTMLElement) { el.classList.add('invalid'); setTimeout(()=> el.classList.remove('invalid'), 1500); }

async function api(path: string, opts: RequestInit = {}) {
  const headers: Record<string,string> = { 'Content-Type':'application/json', ...(opts.headers as any || {}) };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    const tx = await res.text();
    throw new Error(tx || res.statusText);
  }
  return res.json();
}

async function listTemplates() {
  try {
    if (!tenantId) { $('#templateList').innerHTML = '<em>Select or create a tenant first</em>'; return; }
    const list = await api(`/tenants/${tenantId}/templates`);
    const wrap = $('#templateList');
    wrap.innerHTML = list.map((t:TemplateRecord)=>`<div class="tplRow"><button data-id="${t.id}" class="loadTpl">Load</button> ${t.name} v${t.version}</div>`).join('') || '<em>No templates yet</em>';
    wrap.querySelectorAll<HTMLButtonElement>('button.loadTpl').forEach(btn => btn.addEventListener('click', () => loadTemplate(btn.dataset.id!)));
  } catch (e:any) { console.error(e); }
}

let selectedGroupId: string | null = null;

async function listGroups() {
  if (!state.dbMode || !tenantId) { (document.getElementById('groupsList')!).innerHTML = state.dbMode ? '<em>Select tenant</em>' : '<em>In-memory: groups not tracked</em>'; return; }
  try {
    const groups = await api(`/tenants/${tenantId}/groups`);
    const wrap = document.getElementById('groupsList')!;
    wrap.innerHTML = groups.map((g:any)=>`<div class="grpRow"><button data-g="${g.id}" class="loadGroup">#</button> ${g.subject||g.id} <span style='opacity:.6'>${g.status}</span> <span style='opacity:.6'>S:${g.sentCount} F:${g.failedCount}</span></div>`).join('') || '<em>No groups</em>';
    wrap.querySelectorAll<HTMLButtonElement>('button.loadGroup').forEach(btn => btn.addEventListener('click', () => { selectedGroupId = btn.dataset.g!; (document.getElementById('cancelGroupBtn') as HTMLButtonElement).disabled = false; loadGroupEvents(selectedGroupId); }));
  } catch (e:any) {
    document.getElementById('groupsList')!.innerHTML = '<em>Error loading groups</em>';
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
  (document.querySelector('#templateForm [name=bodyHtml]') as HTMLTextAreaElement).value = tpl.bodyHtml;
  (document.querySelector('#templateForm [name=bodyText]') as HTMLTextAreaElement).value = tpl.bodyText || '';
  (document.querySelector('#templateForm [name=variables]') as HTMLTextAreaElement).value = JSON.stringify(tpl.variables||{}, null, 2);
  updateEnvInfo();
}

// Template creation
$('#templateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);
  const payload: any = {
    tenantId,
    name: fd.get('name') as string,
    version: Number(fd.get('version')),
    subject: fd.get('subject'),
    bodyHtml: fd.get('bodyHtml'),
    bodyText: fd.get('bodyText') || undefined,
    variables: {}
  };
  const varsRaw = fd.get('variables') as string;
  if (varsRaw?.trim()) {
    try { payload.variables = JSON.parse(varsRaw); } catch { status($('#templateStatus') as HTMLElement, 'Invalid JSON in variables'); flashInvalid(document.querySelector('#templateForm [name=variables]') as HTMLElement); return; }
  }
  const btn = form.querySelector('button[type=submit]') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const tpl = await api('/templates', { method:'POST', body: JSON.stringify(payload) });
    state.currentTemplate = tpl;
    status($('#templateStatus') as HTMLElement, 'Saved ✔');
    await listTemplates();
  } catch (err:any) {
    status($('#templateStatus') as HTMLElement, 'Error: '+ err.message);
  } finally { btn.disabled = false; updateEnvInfo(); }
});

// Render preview
$('#renderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.currentTemplate) { status($('#renderStatus') as HTMLElement, 'No template loaded'); return; }
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);
  let ctx: any = {};
  const raw = fd.get('context') as string;
  if (raw?.trim()) { try { ctx = JSON.parse(raw); } catch { status($('#renderStatus') as HTMLElement, 'Invalid context JSON'); flashInvalid(document.querySelector('#renderForm [name=context]') as HTMLElement); return; } }
  const btn = form.querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  try {
    const rendered = await api(`/templates/${state.currentTemplate.id}/render`, { method:'POST', body: JSON.stringify({ context: ctx }) });
    $('#previewSubject').textContent = rendered.subject;
    const iframe = document.querySelector('#previewHtml') as HTMLIFrameElement;
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(rendered.html);
    iframe.contentDocument!.close();
    $('#previewText').textContent = rendered.text || '';
    status($('#renderStatus') as HTMLElement, 'Rendered ✔');
  } catch (err:any) { status($('#renderStatus') as HTMLElement, 'Error: '+ err.message); } finally { btn.disabled = false; }
});

// Group send (draft simplified)
$('#groupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.currentTemplate) { status($('#groupStatus') as HTMLElement, 'No template'); return; }
  const fd = new FormData(e.target as HTMLFormElement);
  const groupSubject = fd.get('groupSubject') as string;
  const recipientsRaw = (fd.get('recipients') as string || '').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const btn = (e.target as HTMLFormElement).querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  try {
    const useAppId = state.dbMode ? appId : 'app1';
    if (state.dbMode && (!tenantId || !useAppId)) { status($('#groupStatus') as HTMLElement, 'Select tenant/app'); return; }
    const group = await api('/groups', { method:'POST', body: JSON.stringify({ tenantId, appId: useAppId, templateId: state.currentTemplate.id, subject: groupSubject }) });
    if (recipientsRaw.length) {
      await api(`/groups/${group.id}/recipients`, { method:'POST', body: JSON.stringify({ recipients: recipientsRaw.map(email => ({ email, context:{} })), dedupe:true, renderNow:false }) });
    }
    await api(`/groups/${group.id}/schedule`, { method:'POST', body: JSON.stringify({}) });
    await api('/internal/worker/tick', { method:'POST', body: JSON.stringify({}) });
    status($('#groupStatus') as HTMLElement, 'Sent (dry-run) ✔');
    await listGroups();
  } catch (err:any) { status($('#groupStatus') as HTMLElement, 'Error: '+ err.message); } finally { btn.disabled = false; }
});

// Deactivate template
(document.getElementById('deactivateTemplateBtn') as HTMLButtonElement | null)?.addEventListener('click', async () => {
  if (!state.currentTemplate) return;
  try {
    await api(`/templates/${state.currentTemplate.id}/deactivate`, { method:'PATCH' });
    status(document.getElementById('templateStatus') as HTMLElement, 'Template deactivated');
  } catch (e:any) { status(document.getElementById('templateStatus') as HTMLElement, 'Error: '+ e.message); }
});

// Cancel group
(document.getElementById('cancelGroupBtn') as HTMLButtonElement | null)?.addEventListener('click', async () => {
  if (!selectedGroupId) return;
  try {
    await api(`/groups/${selectedGroupId}/cancel`, { method:'POST' });
    status(document.getElementById('groupStatus') as HTMLElement, 'Group canceled');
    await listGroups();
    if (selectedGroupId) await loadGroupEvents(selectedGroupId);
  } catch (e:any) { status(document.getElementById('groupStatus') as HTMLElement, 'Error: '+ e.message); }
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
      tList.innerHTML = list.map(t=>`<div class='tplRow'><span>${t.name}</span> <button data-e='${t.id}' class='editTenant smallBtn'>Edit</button> <button data-d='${t.id}' class='delTenant smallBtn'>Delete</button></div>`).join('') || '<em>No tenants</em>';
      tList.querySelectorAll<HTMLButtonElement>('button.editTenant').forEach(b=>b.addEventListener('click', ()=> editTenantPrompt(b.dataset.e!)));
      tList.querySelectorAll<HTMLButtonElement>('button.delTenant').forEach(b=>b.addEventListener('click', ()=> deleteTenant(b.dataset.d!)));
    }
  } catch (e:any) {
    // Likely 403 for non-superadmin; ignore gracefully
    state.tenants = [];
    const tList = document.getElementById('tenantList');
    if (tList) tList.innerHTML = '<em>Not authorized</em>';
  }
}

async function editTenantPrompt(id: string) {
  const t = state.tenants.find(x=>x.id===id); if (!t) return;
  const name = prompt('New tenant name', t.name); if (!name || name===t.name) return;
  try { await api(`/tenants/${id}`, { method:'PATCH', body: JSON.stringify({ name }) }); await loadTenants(); } catch (e:any){ alert('Update failed: '+e.message); }
}

async function deleteTenant(id: string) {
  if (!confirm('Delete tenant? (soft)')) return;
  try { await api(`/tenants/${id}`, { method:'DELETE' }); await loadTenants(); } catch (e:any){ alert('Delete failed: '+e.message); }
}

async function loadApps() {
  if (!tenantId) { (document.getElementById('appSelect') as HTMLSelectElement).innerHTML = '<option value="">-- none --</option>'; return; }
  try {
    const list: AppRec[] = await api(`/apps?tenantId=${encodeURIComponent(tenantId)}`);
    state.apps = list;
    const sel = document.getElementById('appSelect') as HTMLSelectElement;
    sel.innerHTML = '<option value="">-- select --</option>' + list.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
    if (appId && list.some(a=>a.id===appId)) sel.value = appId; else sel.value = '';
  } catch {/* ignore */}
}

async function loadAllApps() {
  try {
    console.log('Loading all apps for SMTP config...');
    const list: AppRec[] = await api('/apps');
    state.apps = list;
    console.log('Loaded apps:', list);
  } catch (e) {
    console.error('Failed to load all apps:', e);
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
  if (!roles.includes('superadmin')) {
    // Placeholder for future restrictions
  }
}

function onAuthenticated() {
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
  // Role based UI adjustments
  const isSuperadmin = roles.includes('superadmin');
  const isEditorOnly = roles.includes('editor') && !roles.some((r: string)=> r==='tenant_admin' || r==='superadmin');
  // Hide Tenants nav for anyone who is not superadmin
  if (!isSuperadmin) {
    document.querySelectorAll('[data-view=tenants]').forEach(el=> (el as HTMLElement).style.display='none');
    document.getElementById('goToTenantsBtn')?.remove();
  }
  const loadTenantsPromise = isSuperadmin ? loadTenants().catch(()=>{}) : Promise.resolve();
  loadTenantsPromise.then(async () => {
    // For non-superadmin, prefer tenantId from token
    if (!isSuperadmin && state.user?.tenantId && !tenantId) {
      tenantId = state.user.tenantId;
      localStorage.setItem('tenantId', tenantId);
    }
    if (tenantId) await loadApps();
    updateEnvInfo();
    if (tenantId) await listTemplates();
    if (tenantId) await listGroups();
    wireNav();
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
      status(document.getElementById('tenantStatus') as HTMLElement, 'Created ✔');
      await loadTenants(); await loadApps(); await listTemplates(); await listGroups();
      updateEnvInfo();
    } catch (err:any) { status(document.getElementById('tenantStatus') as HTMLElement, 'Error: '+err.message); } finally { btn.disabled = false; }
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
    statusEl.textContent = 'OK';
    setTimeout(()=> { statusEl.textContent=''; }, 800);
    onAuthenticated();
  } catch (err:any) {
    statusEl.textContent = 'Invalid token';
    authToken = null; localStorage.removeItem('authToken');
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  authToken = null; localStorage.removeItem('authToken');
  state.user = null;
  showLogin();
});

// App creation (only in Tenants view)
const appFormEl = document.getElementById('appForm') as HTMLFormElement | null;
if (appFormEl) {
  appFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!tenantId) { status(document.getElementById('appStatus') as HTMLElement, 'Select tenant first'); return; }
    const fd = new FormData(e.target as HTMLFormElement);
    const payload = { tenantId, name: fd.get('appName'), clientId: fd.get('clientId') };
    const btn = (e.target as HTMLFormElement).querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
    try {
      const rec = await api('/apps', { method:'POST', body: JSON.stringify(payload) });
      appId = rec.id; localStorage.setItem('appId', appId);
      status(document.getElementById('appStatus') as HTMLElement, 'Created ✔');
      await loadApps();
      updateEnvInfo();
    } catch (err:any) { status(document.getElementById('appStatus') as HTMLElement, 'Error: '+err.message); } finally { btn.disabled = false; }
  });
}

// Select handlers
(document.getElementById('tenantSelect') as HTMLSelectElement | null)?.addEventListener('change', async (e) => {
  tenantId = (e.target as HTMLSelectElement).value;
  localStorage.setItem('tenantId', tenantId);
  appId = '';
  localStorage.removeItem('appId');
  await loadApps();
  await listTemplates();
  await listGroups();
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

function composeHeaderTitle() {
  const app = state.apps.find(a=>a.id===appId); return app ? `Compose - App: ${app.name}` : 'Compose Email';
}

function showView(view: string) {
  (document.getElementById('view-tenants')!).style.display = view==='tenants' ? 'grid':'none';
  (document.getElementById('view-compose')!).style.display = view==='compose' ? 'grid':'none';
  (document.getElementById('view-smtp-config')!).style.display = view==='smtp-config' ? 'block':'none';
  document.querySelectorAll('.navBtn').forEach(el=> el.classList.toggle('active', (el as HTMLElement).getAttribute('data-view')===view));
  const title = view==='tenants' ? 'Tenant Management' : view==='smtp-config' ? 'SMTP Configuration' : composeHeaderTitle();
  (document.getElementById('viewTitle')!).textContent = title;
  
  // When SMTP config view is shown, build the tree
  if (view === 'smtp-config') {
    console.log('SMTP Config view shown, building tree...');
    buildSmtpTree();
  }
}

function wireNav() {
  document.querySelectorAll<HTMLButtonElement>('button.navBtn').forEach(btn => btn.addEventListener('click', ()=> showView(btn.dataset.view!)));
  showView('compose');
}

// Manage Tenants button (in compose context panel)
document.getElementById('goToTenantsBtn')?.addEventListener('click', () => showView('tenants'));

const originalUpdateEnvInfo = updateEnvInfo;
// @ts-ignore
updateEnvInfo = function() { originalUpdateEnvInfo(); (document.getElementById('viewTitle')!).textContent = composeHeaderTitle(); };

document.getElementById('quickSendForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!tenantId || !appId) { status(document.getElementById('quickSendStatus') as HTMLElement, 'Select tenant/app first'); return; }
  const fd = new FormData(e.target as HTMLFormElement);
  const subject = fd.get('qsSubject') as string;
  const html = fd.get('qsHtml') as string;
  const text = fd.get('qsText') as string;
  const recipients = (fd.get('qsRecipients') as string || '').split(/\n+/).map(s=>s.trim()).filter(Boolean).map(e=>({ email: e }));
  if (!recipients.length) { status(document.getElementById('quickSendStatus') as HTMLElement, 'Recipients required'); return; }
  const btn = (e.target as HTMLFormElement).querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  try { await api('/send-now', { method:'POST', body: JSON.stringify({ appId, subject, html, text, recipients }) }); status(document.getElementById('quickSendStatus') as HTMLElement, 'Queued ✔'); await listGroups(); }
  catch (err:any) { status(document.getElementById('quickSendStatus') as HTMLElement, 'Error: '+err.message); }
  finally { btn.disabled = false; }
});

async function init() {
  await detectMode();
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
  if (tenantHint) { try { localStorage.setItem('tenantId', tenantHint); tenantId = tenantHint; } catch {} }
  if (clientIdHint) { try { localStorage.setItem('appClientIdHint', clientIdHint); } catch {} }
  if (appIdHint) { try { localStorage.setItem('appIdHint', appIdHint); } catch {} }
  const tokenFromUrl = url.searchParams.get('token');
  const cameFromIdp = !!tokenFromUrl;
  if (tokenFromUrl) {
    authToken = tokenFromUrl;
    localStorage.setItem('authToken', authToken);
    url.searchParams.delete('token');
    history.replaceState({}, '', url.toString());
    try { console.debug('[ui-auth] token accepted from URL', { len: tokenFromUrl.length }); } catch {}
    // Clear the one-time redirect flag after arriving back from IDP
    try { sessionStorage.removeItem('idpRedirected'); } catch {}
  }

  // load user context if auth enabled (ignore errors if auth disabled)
  let authDisabled = false;
  try { 
    state.user = await api('/me'); 
    // If /me returns null but succeeds, auth is disabled
    if (state.user === null) {
      authDisabled = true;
      console.debug('[ui-auth] Authentication disabled, proceeding without user context');
    }
  } catch (e:any) { 
    try { console.debug('[ui-auth] /me failed', e?.message||e); } catch {}; 
    state.user = null; 
  }
  
  if (!state.user && !authDisabled) {
    // If an IDP login URL is configured, redirect to it with a returnUrl
    const idp = uiConfig.idpLoginUrl as string | null;
    if (idp) {
      // Prevent infinite redirect loop: only auto-redirect once per page load/session
      const alreadyRedirected = (() => { try { return sessionStorage.getItem('idpRedirected') === '1'; } catch { return false; } })();
      if (!cameFromIdp && !alreadyRedirected) {
        const ret = (uiConfig.returnUrl as string) || (window.location.origin + '/ui/');
        const redirect = new URL(idp);
        redirect.searchParams.set('return', ret);
  // Forward multi-tenant/app hints to IDP so they are embedded in the token
  const fTenant = tenantId || tenantHint || '';
  const fClient = (clientIdHint || localStorage.getItem('appClientIdHint') || '') as string;
  const fAppId = (appId || appIdHint || localStorage.getItem('appIdHint') || '') as string;
  if (fTenant) redirect.searchParams.set('tenantId', fTenant);
  if (fClient) redirect.searchParams.set('clientId', fClient);
  if (fAppId && !fClient) redirect.searchParams.set('appId', fAppId);
        try { console.debug('[ui-auth] redirecting to IDP', { ret, to: redirect.toString() }); } catch {}
        try { sessionStorage.setItem('idpRedirected', '1'); } catch {}
        window.location.href = redirect.toString();
        return;
      }
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
    onAuthenticated();
    return;
  }

  // Role based UI adjustments
  const roleList: string[] = state.user?.roles || [];
  const isEditorOnly = roleList.includes('editor') && !roleList.some(r=> r==='tenant_admin' || r==='superadmin');
  const isTenantAdmin = roleList.includes('tenant_admin') && !roleList.includes('superadmin');
  if (isEditorOnly) {
    // Hide Tenants navigation button entirely
    document.querySelectorAll('[data-view=tenants]').forEach(el=> (el as HTMLElement).style.display='none');
  }
  if (isEditorOnly) {
    // Hide tenant creation & app creation panels if present (compose context should only allow selecting existing)
    const tenantPanel = document.getElementById('tenantAppPanel');
    // editors should not see Manage Tenants button
    document.getElementById('goToTenantsBtn')?.remove();
  }
  // Load tenants if superadmin or if auth is disabled (for SMTP config to work)
  if (roleList.includes('superadmin') || authDisabled) { await loadTenants(); }
  // Load apps if we have a tenantId or if auth is disabled
  if (tenantId) {
    await loadApps(); // Load apps for specific tenant
  } else if (authDisabled) {
    await loadAllApps(); // Load all apps for SMTP config dropdowns
  }
  // If appId from token is present, prefer it for initial context
  if (state.user?.appId && (!appId || appId !== state.user.appId)) {
    appId = state.user.appId; try { localStorage.setItem('appId', appId); } catch {}
  }
  updateEnvInfo();
  if (tenantId) await listTemplates();
  if (tenantId) await listGroups();
  wireNav();
  setupSmtpConfig();
}

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
  sesAccessKeyId?: string;
  sesSecretAccessKey?: string;
  sesRegion?: string;
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

let currentSmtpConfig: SmtpConfig | null = null;
let selectedTreeNode: {scope: string, tenantId?: string, appId?: string} | null = null;

function setupSmtpConfig() {
  console.log('Setting up SMTP configuration tree UI');
  
  // Configuration form
  const configForm = document.getElementById('smtpConfigForm') as HTMLFormElement;
  configForm?.addEventListener('submit', handleConfigSubmit);

  // Service selector change handler
  const serviceSelect = configForm?.querySelector('select[name="service"]') as HTMLSelectElement;
  serviceSelect?.addEventListener('change', handleServiceChange);

  // Initialize the tree
  buildSmtpTree();
}

async function buildSmtpTree() {
  const treeContainer = document.getElementById('smtpTree');
  if (!treeContainer) {
    console.error('smtpTree element not found in DOM');
    return;
  }

  console.log('Building SMTP tree...');
  console.log('State tenants:', state.tenants);
  console.log('State apps:', state.apps);
  console.log('State smtpConfigs:', state.smtpConfigs);
  
  treeContainer.innerHTML = '<div class="tree-loading">Loading configuration tree...</div>';

  try {
    // Load all configs
    await loadSmtpConfigs();
    
    // Get all configs grouped by scope
    const globalConfigs = state.smtpConfigs.filter(c => c.scope === 'GLOBAL');
    const tenantConfigs = state.smtpConfigs.filter(c => c.scope === 'TENANT');
    const appConfigs = state.smtpConfigs.filter(c => c.scope === 'APP');

    let treeHtml = '';

    // Global level
    const globalConfig = globalConfigs[0] || null;
    treeHtml += `
      <div class="tree-node ${globalConfig ? 'has-config' : 'no-config'} ${selectedTreeNode?.scope === 'GLOBAL' ? 'selected' : ''}" 
           onclick="selectTreeNode('GLOBAL')">
        <div class="tree-node-title">Global Configuration</div>
        <div class="tree-node-subtitle">System-wide default SMTP settings</div>
        ${globalConfig ? `<div class="tree-node-config">Provider: ${globalConfig.provider || 'Custom'}</div>` : '<div class="tree-node-config">No configuration</div>'}
      </div>
    `;

    // Tenant level
    if (state.tenants && state.tenants.length > 0) {
      treeHtml += '<div class="tree-level tree-level-1">';
      
      for (const tenant of state.tenants) {
        const tenantConfig = tenantConfigs.find(c => c.tenantId === tenant.id);
        const tenantApps = state.apps.filter(app => app.tenantId === tenant.id);
        
        treeHtml += `
          <div class="tree-node ${tenantConfig ? 'has-config' : 'no-config'} ${selectedTreeNode?.scope === 'TENANT' && selectedTreeNode.tenantId === tenant.id ? 'selected' : ''}" 
               onclick="selectTreeNode('TENANT', '${tenant.id}')">
            <div class="tree-node-title">${tenant.name}</div>
            <div class="tree-node-subtitle">Tenant-specific SMTP settings</div>
            ${tenantConfig ? `<div class="tree-node-config">Provider: ${tenantConfig.provider || 'Custom'}</div>` : '<div class="tree-node-config">No configuration</div>'}
          </div>
        `;

        // App level for this tenant
        if (tenantApps.length > 0) {
          treeHtml += '<div class="tree-level tree-level-2">';
          
          for (const app of tenantApps) {
            const appConfig = appConfigs.find(c => c.appId === app.id);
            
            treeHtml += `
              <div class="tree-node ${appConfig ? 'has-config' : 'no-config'} ${selectedTreeNode?.scope === 'APP' && selectedTreeNode.appId === app.id ? 'selected' : ''}" 
                   onclick="selectTreeNode('APP', '${app.tenantId}', '${app.id}')">
                <div class="tree-node-title">${app.name}</div>
                <div class="tree-node-subtitle">App-specific SMTP settings</div>
                ${appConfig ? `<div class="tree-node-config">Provider: ${appConfig.provider || 'Custom'}</div>` : '<div class="tree-node-config">No configuration</div>'}
              </div>
            `;
          }
          
          treeHtml += '</div>';
        }
      }
      
      treeHtml += '</div>';
    }

    treeContainer.innerHTML = treeHtml;
    
    // Select the first node if nothing is selected
    if (!selectedTreeNode) {
      selectTreeNode('GLOBAL');
    }

  } catch (error) {
    console.error('Failed to build SMTP tree:', error);
    treeContainer.innerHTML = '<div class="tree-loading">Failed to load configuration tree</div>';
  }
}

function selectTreeNode(scope: string, tenantId?: string, appId?: string) {
  console.log('Selecting tree node:', scope, tenantId, appId);
  
  selectedTreeNode = { scope, tenantId, appId };
  
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
    return c.scope === 'GLOBAL';
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
  
  actionButtons.innerHTML = `
    ${hasConfig ? `
      <button type="submit" class="config-btn">Update ${scopeLabel} Config</button>
      <button type="button" class="config-btn config-btn-danger" onclick="deleteSmtpConfig()">Delete Config</button>
    ` : `
      <button type="submit" class="config-btn">Create ${scopeLabel} Config</button>
    `}
    <button type="button" class="config-btn config-btn-secondary" onclick="refreshSmtpTree()">Refresh</button>
  `;
}

function showConfigEditor() {
  const editor = document.getElementById('smtpConfigEditor');
  if (editor) editor.style.display = 'block';
}

function refreshSmtpTree() {
  buildSmtpTree();
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
    buildSmtpTree(); // Refresh the tree
  } catch (error: any) {
    console.error('Failed to delete config:', error);
    alert('Failed to delete configuration: ' + error.message);
  }
}

// Make functions globally available
(window as any).selectTreeNode = selectTreeNode;
(window as any).deleteSmtpConfig = deleteSmtpConfig;
(window as any).refreshSmtpTree = refreshSmtpTree;

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
    config.sesAccessKeyId = formData.get('sesAccessKeyId');
    config.sesSecretAccessKey = formData.get('sesSecretAccessKey');
    config.sesRegion = formData.get('sesRegion');
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

// Make functions available globally for onclick handlers
(window as any).editConfig = editConfig;
(window as any).deleteConfig = deleteConfig;

init();
