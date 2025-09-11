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
  document.querySelectorAll('.navBtn').forEach(el=> el.classList.toggle('active', (el as HTMLElement).getAttribute('data-view')===view));
  (document.getElementById('viewTitle')!).textContent = view==='tenants' ? 'Tenant Management' : composeHeaderTitle();
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
  try { await api('/send-now', { method:'POST', body: JSON.stringify({ tenantId, appId, subject, html, text, recipients }) }); status(document.getElementById('quickSendStatus') as HTMLElement, 'Queued ✔'); await listGroups(); }
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
  try { state.user = await api('/me'); } catch (e:any) { try { console.debug('[ui-auth] /me failed', e?.message||e); } catch {}; state.user = null; }
  if (!state.user) {
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
  // Only superadmins can list all tenants; avoid 403 noise for others
  if (roleList.includes('superadmin')) { await loadTenants(); }
  if (tenantId) await loadApps();
  // If appId from token is present, prefer it for initial context
  if (state.user?.appId && (!appId || appId !== state.user.appId)) {
    appId = state.user.appId; try { localStorage.setItem('appId', appId); } catch {}
  }
  updateEnvInfo();
  if (tenantId) await listTemplates();
  if (tenantId) await listGroups();
  wireNav();
}

init();
