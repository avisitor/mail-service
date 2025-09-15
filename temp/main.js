// UI client: tenant management + compose/send + quick ad-hoc send (DB path only now).
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a, _b, _c, _d, _e, _f, _g, _h;
var _this = this;
var tenantId = localStorage.getItem('tenantId') || '';
var appId = localStorage.getItem('appId') || '';
var authToken = localStorage.getItem('authToken');
var uiConfig = window.__MAIL_UI_CONFIG__ || {};
// Role context management for superadmin tenant switching
var roleContext = {
    isSuperadmin: false,
    isInTenantContext: !!localStorage.getItem('contextTenantId'),
    contextTenantId: localStorage.getItem('contextTenantId') || '',
    contextTenantName: localStorage.getItem('contextTenantName') || ''
};
var state = {
    currentTemplate: undefined,
    tenants: [],
    apps: [],
    smtpConfigs: [],
    dbMode: true,
    user: null,
};
function $(sel) { return document.querySelector(sel); }
function status(el, msg) { el.textContent = msg; setTimeout(function () { if (el.textContent === msg)
    el.textContent = ''; }, 6000); }
function flashInvalid(el) { el.classList.add('invalid'); setTimeout(function () { return el.classList.remove('invalid'); }, 1500); }
function api(path_1) {
    return __awaiter(this, arguments, void 0, function (path, opts) {
        var headers, res, tx;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    headers = __assign({ 'Content-Type': 'application/json' }, (opts.headers || {}));
                    if (authToken)
                        headers['Authorization'] = 'Bearer ' + authToken;
                    return [4 /*yield*/, fetch(path, __assign(__assign({}, opts), { headers: headers }))];
                case 1:
                    res = _a.sent();
                    if (!!res.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, res.text()];
                case 2:
                    tx = _a.sent();
                    throw new Error(tx || res.statusText);
                case 3: return [2 /*return*/, res.json()];
            }
        });
    });
}
function listTemplates() {
    return __awaiter(this, void 0, void 0, function () {
        var list, wrap, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    if (!tenantId) {
                        $('#templateList').innerHTML = '<em>Select or create a tenant first</em>';
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, api("/tenants/".concat(tenantId, "/templates"))];
                case 1:
                    list = _a.sent();
                    wrap = $('#templateList');
                    wrap.innerHTML = list.map(function (t) { return "<div class=\"tplRow\"><button data-id=\"".concat(t.id, "\" class=\"loadTpl\">Load</button> ").concat(t.name, " v").concat(t.version, "</div>"); }).join('') || '<em>No templates yet</em>';
                    wrap.querySelectorAll('button.loadTpl').forEach(function (btn) { return btn.addEventListener('click', function () { return loadTemplate(btn.dataset.id); }); });
                    return [3 /*break*/, 3];
                case 2:
                    e_1 = _a.sent();
                    console.error(e_1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
var selectedGroupId = null;
function listGroups() {
    return __awaiter(this, void 0, void 0, function () {
        var groups, wrap, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!state.dbMode || !tenantId) {
                        (document.getElementById('groupsList')).innerHTML = state.dbMode ? '<em>Select tenant</em>' : '<em>In-memory: groups not tracked</em>';
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, api("/tenants/".concat(tenantId, "/groups"))];
                case 2:
                    groups = _a.sent();
                    wrap = document.getElementById('groupsList');
                    wrap.innerHTML = groups.map(function (g) { return "<div class=\"grpRow\"><button data-g=\"".concat(g.id, "\" class=\"loadGroup\">#</button> ").concat(g.subject || g.id, " <span style='opacity:.6'>").concat(g.status, "</span> <span style='opacity:.6'>S:").concat(g.sentCount, " F:").concat(g.failedCount, "</span></div>"); }).join('') || '<em>No groups</em>';
                    wrap.querySelectorAll('button.loadGroup').forEach(function (btn) { return btn.addEventListener('click', function () { selectedGroupId = btn.dataset.g; document.getElementById('cancelGroupBtn').disabled = false; loadGroupEvents(selectedGroupId); }); });
                    return [3 /*break*/, 4];
                case 3:
                    e_2 = _a.sent();
                    document.getElementById('groupsList').innerHTML = '<em>Error loading groups</em>';
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function loadGroupEvents(groupId) {
    return __awaiter(this, void 0, void 0, function () {
        var events, wrap, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!state.dbMode)
                        return [2 /*return*/];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, api("/groups/".concat(groupId, "/events"))];
                case 2:
                    events = _b.sent();
                    wrap = document.getElementById('eventsList');
                    wrap.innerHTML = events.map(function (ev) { return "<div class=\"evtRow\">".concat(new Date(ev.occurredAt).toLocaleTimeString(), " <strong>").concat(ev.type, "</strong>").concat(ev.recipientId ? ' r:' + ev.recipientId.slice(0, 6) : '', "</div>"); }).join('') || '<em>No events</em>';
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    document.getElementById('eventsList').innerHTML = '<em>Error</em>';
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function loadTemplate(id) {
    return __awaiter(this, void 0, void 0, function () {
        var tpl;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, api("/templates/".concat(id))];
                case 1:
                    tpl = _a.sent();
                    state.currentTemplate = tpl;
                    document.querySelector('#templateForm [name=name]').value = tpl.name;
                    document.querySelector('#templateForm [name=version]').value = String(tpl.version);
                    document.querySelector('#templateForm [name=subject]').value = tpl.subject;
                    document.querySelector('#templateForm [name=bodyHtml]').value = tpl.bodyHtml;
                    document.querySelector('#templateForm [name=bodyText]').value = tpl.bodyText || '';
                    document.querySelector('#templateForm [name=variables]').value = JSON.stringify(tpl.variables || {}, null, 2);
                    updateEnvInfo();
                    return [2 /*return*/];
            }
        });
    });
}
// Template creation
$('#templateForm').addEventListener('submit', function (e) { return __awaiter(_this, void 0, void 0, function () {
    var form, fd, payload, varsRaw, btn, tpl, err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                e.preventDefault();
                form = e.target;
                fd = new FormData(form);
                payload = {
                    tenantId: tenantId,
                    name: fd.get('name'),
                    version: Number(fd.get('version')),
                    subject: fd.get('subject'),
                    bodyHtml: fd.get('bodyHtml'),
                    bodyText: fd.get('bodyText') || undefined,
                    variables: {}
                };
                varsRaw = fd.get('variables');
                if (varsRaw === null || varsRaw === void 0 ? void 0 : varsRaw.trim()) {
                    try {
                        payload.variables = JSON.parse(varsRaw);
                    }
                    catch (_b) {
                        status($('#templateStatus'), 'Invalid JSON in variables');
                        flashInvalid(document.querySelector('#templateForm [name=variables]'));
                        return [2 /*return*/];
                    }
                }
                btn = form.querySelector('button[type=submit]');
                btn.disabled = true;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, 5, 6]);
                return [4 /*yield*/, api('/templates', { method: 'POST', body: JSON.stringify(payload) })];
            case 2:
                tpl = _a.sent();
                state.currentTemplate = tpl;
                status($('#templateStatus'), 'Saved ✔');
                return [4 /*yield*/, listTemplates()];
            case 3:
                _a.sent();
                return [3 /*break*/, 6];
            case 4:
                err_1 = _a.sent();
                status($('#templateStatus'), 'Error: ' + err_1.message);
                return [3 /*break*/, 6];
            case 5:
                btn.disabled = false;
                updateEnvInfo();
                return [7 /*endfinally*/];
            case 6: return [2 /*return*/];
        }
    });
}); });
// Render preview
$('#renderForm').addEventListener('submit', function (e) { return __awaiter(_this, void 0, void 0, function () {
    var form, fd, ctx, raw, btn, rendered, iframe, err_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                e.preventDefault();
                if (!state.currentTemplate) {
                    status($('#renderStatus'), 'No template loaded');
                    return [2 /*return*/];
                }
                form = e.target;
                fd = new FormData(form);
                ctx = {};
                raw = fd.get('context');
                if (raw === null || raw === void 0 ? void 0 : raw.trim()) {
                    try {
                        ctx = JSON.parse(raw);
                    }
                    catch (_b) {
                        status($('#renderStatus'), 'Invalid context JSON');
                        flashInvalid(document.querySelector('#renderForm [name=context]'));
                        return [2 /*return*/];
                    }
                }
                btn = form.querySelector('button[type=submit]');
                btn.disabled = true;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, 4, 5]);
                return [4 /*yield*/, api("/templates/".concat(state.currentTemplate.id, "/render"), { method: 'POST', body: JSON.stringify({ context: ctx }) })];
            case 2:
                rendered = _a.sent();
                $('#previewSubject').textContent = rendered.subject;
                iframe = document.querySelector('#previewHtml');
                iframe.contentDocument.open();
                iframe.contentDocument.write(rendered.html);
                iframe.contentDocument.close();
                $('#previewText').textContent = rendered.text || '';
                status($('#renderStatus'), 'Rendered ✔');
                return [3 /*break*/, 5];
            case 3:
                err_2 = _a.sent();
                status($('#renderStatus'), 'Error: ' + err_2.message);
                return [3 /*break*/, 5];
            case 4:
                btn.disabled = false;
                return [7 /*endfinally*/];
            case 5: return [2 /*return*/];
        }
    });
}); });
// Group send (draft simplified)
$('#groupForm').addEventListener('submit', function (e) { return __awaiter(_this, void 0, void 0, function () {
    var fd, groupSubject, recipientsRaw, btn, useAppId, group, err_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                e.preventDefault();
                if (!state.currentTemplate) {
                    status($('#groupStatus'), 'No template');
                    return [2 /*return*/];
                }
                fd = new FormData(e.target);
                groupSubject = fd.get('groupSubject');
                recipientsRaw = (fd.get('recipients') || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
                btn = e.target.querySelector('button[type=submit]');
                btn.disabled = true;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 8, 9, 10]);
                useAppId = state.dbMode ? appId : 'app1';
                if (state.dbMode && (!tenantId || !useAppId)) {
                    status($('#groupStatus'), 'Select tenant/app');
                    return [2 /*return*/];
                }
                return [4 /*yield*/, api('/groups', { method: 'POST', body: JSON.stringify({ tenantId: tenantId, appId: useAppId, templateId: state.currentTemplate.id, subject: groupSubject }) })];
            case 2:
                group = _a.sent();
                if (!recipientsRaw.length) return [3 /*break*/, 4];
                return [4 /*yield*/, api("/groups/".concat(group.id, "/recipients"), { method: 'POST', body: JSON.stringify({ recipients: recipientsRaw.map(function (email) { return ({ email: email, context: {} }); }), dedupe: true, renderNow: false }) })];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4: return [4 /*yield*/, api("/groups/".concat(group.id, "/schedule"), { method: 'POST', body: JSON.stringify({}) })];
            case 5:
                _a.sent();
                return [4 /*yield*/, api('/internal/worker/tick', { method: 'POST', body: JSON.stringify({}) })];
            case 6:
                _a.sent();
                status($('#groupStatus'), 'Sent (dry-run) ✔');
                return [4 /*yield*/, listGroups()];
            case 7:
                _a.sent();
                return [3 /*break*/, 10];
            case 8:
                err_3 = _a.sent();
                status($('#groupStatus'), 'Error: ' + err_3.message);
                return [3 /*break*/, 10];
            case 9:
                btn.disabled = false;
                return [7 /*endfinally*/];
            case 10: return [2 /*return*/];
        }
    });
}); });
// Deactivate template
(_a = document.getElementById('deactivateTemplateBtn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', function () { return __awaiter(_this, void 0, void 0, function () {
    var e_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!state.currentTemplate)
                    return [2 /*return*/];
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, api("/templates/".concat(state.currentTemplate.id, "/deactivate"), { method: 'PATCH' })];
            case 2:
                _a.sent();
                status(document.getElementById('templateStatus'), 'Template deactivated');
                return [3 /*break*/, 4];
            case 3:
                e_3 = _a.sent();
                status(document.getElementById('templateStatus'), 'Error: ' + e_3.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Cancel group
(_b = document.getElementById('cancelGroupBtn')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', function () { return __awaiter(_this, void 0, void 0, function () {
    var e_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!selectedGroupId)
                    return [2 /*return*/];
                _a.label = 1;
            case 1:
                _a.trys.push([1, 6, , 7]);
                return [4 /*yield*/, api("/groups/".concat(selectedGroupId, "/cancel"), { method: 'POST' })];
            case 2:
                _a.sent();
                status(document.getElementById('groupStatus'), 'Group canceled');
                return [4 /*yield*/, listGroups()];
            case 3:
                _a.sent();
                if (!selectedGroupId) return [3 /*break*/, 5];
                return [4 /*yield*/, loadGroupEvents(selectedGroupId)];
            case 4:
                _a.sent();
                _a.label = 5;
            case 5: return [3 /*break*/, 7];
            case 6:
                e_4 = _a.sent();
                status(document.getElementById('groupStatus'), 'Error: ' + e_4.message);
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
function loadTenants() {
    return __awaiter(this, void 0, void 0, function () {
        var list, sel, tList, e_5, tList;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, api('/tenants')];
                case 1:
                    list = _a.sent();
                    state.tenants = list;
                    sel = document.getElementById('tenantSelect');
                    if (sel) {
                        sel.innerHTML = '<option value="">-- select --</option>' + list.map(function (t) { return "<option value=\"".concat(t.id, "\">").concat(t.name, "</option>"); }).join('');
                        if (tenantId && list.some(function (t) { return t.id === tenantId; }))
                            sel.value = tenantId;
                        else
                            sel.value = '';
                    }
                    tList = document.getElementById('tenantList');
                    if (tList) {
                        tList.innerHTML = list.map(function (t) { return "\n        <div class='tplRow' style=\"display: flex; align-items: center; justify-content: space-between; padding: 8px; margin: 4px 0; border: 1px solid #444; border-radius: 4px;\">\n          <div style=\"flex: 1;\">\n            <div style=\"font-weight: bold; margin-bottom: 2px;\">".concat(escapeHtml(t.name), "</div>\n            <div style=\"font-size: 0.8em; color: #888; font-family: monospace;\">ID: ").concat(escapeHtml(t.id), "</div>\n          </div>\n          <div style=\"display: flex; gap: 8px;\">\n            <button data-e='").concat(t.id, "' class='editTenant smallBtn'>Edit</button> \n            <button data-d='").concat(t.id, "' class='delTenant smallBtn' style=\"background: #dc3545; border-color: #dc3545;\">Delete</button>\n          </div>\n        </div>\n      "); }).join('') || '<em>No tenants</em>';
                        tList.querySelectorAll('button.editTenant').forEach(function (b) { return b.addEventListener('click', function () { return editTenantPrompt(b.dataset.e); }); });
                        tList.querySelectorAll('button.delTenant').forEach(function (b) { return b.addEventListener('click', function () { return deleteTenant(b.dataset.d); }); });
                    }
                    return [3 /*break*/, 3];
                case 2:
                    e_5 = _a.sent();
                    // Likely 403 for non-superadmin; ignore gracefully
                    state.tenants = [];
                    tList = document.getElementById('tenantList');
                    if (tList)
                        tList.innerHTML = '<em>Not authorized</em>';
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function editTenantPrompt(id) {
    return __awaiter(this, void 0, void 0, function () {
        var t, promptMessage, name, e_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    t = state.tenants.find(function (x) { return x.id === id; });
                    if (!t)
                        return [2 /*return*/];
                    promptMessage = "Change tenant name\n\nTenant ID: ".concat(t.id, "\nCurrent name: ").concat(t.name, "\n\nNew name:");
                    name = prompt(promptMessage, t.name);
                    if (!name || name.trim() === '' || name === t.name)
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, api("/tenants/".concat(id), { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) })];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, loadTenants()];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_6 = _a.sent();
                    alert('Update failed: ' + e_6.message);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function deleteTenant(id) {
    return __awaiter(this, void 0, void 0, function () {
        var t, tenantInfo, appsInfo, apps, appNames, e_7, confirmMessage, e_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    t = state.tenants.find(function (x) { return x.id === id; });
                    tenantInfo = t ? "\"".concat(t.name, "\" (ID: ").concat(t.id, ")") : id;
                    appsInfo = '';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, api("/apps?tenantId=".concat(encodeURIComponent(id)))];
                case 2:
                    apps = _a.sent();
                    if (apps.length > 0) {
                        appNames = apps.map(function (app) { return "\u2022 ".concat(app.name, " (").concat(app.id, ")"); }).join('\n');
                        appsInfo = "\n\nThis will also delete ".concat(apps.length, " app").concat(apps.length === 1 ? '' : 's', ":\n").concat(appNames);
                    }
                    return [3 /*break*/, 4];
                case 3:
                    e_7 = _a.sent();
                    console.warn('Could not load apps for tenant deletion confirmation:', e_7);
                    return [3 /*break*/, 4];
                case 4:
                    confirmMessage = "Delete tenant ".concat(tenantInfo, "?").concat(appsInfo, "\n\nThis will be a soft delete and can potentially be reversed by technical support.");
                    if (!confirm(confirmMessage))
                        return [2 /*return*/];
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 8, , 9]);
                    return [4 /*yield*/, api("/tenants/".concat(id), { method: 'DELETE' })];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, loadTenants()];
                case 7:
                    _a.sent();
                    return [3 /*break*/, 9];
                case 8:
                    e_8 = _a.sent();
                    alert('Delete failed: ' + e_8.message);
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/];
            }
        });
    });
}
function loadApps() {
    return __awaiter(this, void 0, void 0, function () {
        var list, sel, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!tenantId) {
                        document.getElementById('appSelect').innerHTML = '<option value="">-- none --</option>';
                        return [2 /*return*/];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, api("/apps?tenantId=".concat(encodeURIComponent(tenantId)))];
                case 2:
                    list = _b.sent();
                    state.apps = list;
                    sel = document.getElementById('appSelect');
                    sel.innerHTML = '<option value="">-- select --</option>' + list.map(function (a) { return "<option value=\"".concat(a.id, "\">").concat(a.name, "</option>"); }).join('');
                    if (appId && list.some(function (a) { return a.id === appId; }))
                        sel.value = appId;
                    else
                        sel.value = '';
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function loadAllApps() {
    return __awaiter(this, void 0, void 0, function () {
        var list, e_9;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    console.log('Loading all apps for SMTP config...');
                    return [4 /*yield*/, api('/apps')];
                case 1:
                    list = _a.sent();
                    state.apps = list;
                    console.log('Loaded apps:', list);
                    return [3 /*break*/, 3];
                case 2:
                    e_9 = _a.sent();
                    console.error('Failed to load all apps:', e_9);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function showLogin() {
    var overlay = document.getElementById('loginOverlay');
    overlay.style.display = 'flex';
    document.getElementById('userPane').style.display = 'none';
}
function hideLogin() {
    var overlay = document.getElementById('loginOverlay');
    if (overlay)
        overlay.style.display = 'none';
}
function applyRoleVisibility() {
    var _a;
    var roles = ((_a = state.user) === null || _a === void 0 ? void 0 : _a.roles) || [];
    var isEditorOnly = roles.includes('editor') && !roles.some(function (r) { return r === 'tenant_admin' || r === 'superadmin'; });
    // Hide SMTP Config for Editor-only users
    var smtpConfigBtn = document.querySelector('[data-view="smtp-config"]');
    if (smtpConfigBtn) {
        smtpConfigBtn.style.display = isEditorOnly ? 'none' : 'block';
        // Rename SMTP Config to just "Config" for non-editor users
        if (!isEditorOnly) {
            smtpConfigBtn.textContent = 'Config';
        }
    }
    // Hide Context pane for Editor-only users
    var contextPanel = document.getElementById('tenantAppPanel');
    if (contextPanel) {
        contextPanel.style.display = isEditorOnly ? 'none' : 'block';
    }
    // Hide role context for Editor-only users (they don't need context switching)
    var roleContextDiv = document.getElementById('roleContext');
    if (roleContextDiv && isEditorOnly) {
        roleContextDiv.style.display = 'none';
    }
}
function onAuthenticated() {
    var _this = this;
    var _a, _b, _c, _d, _e, _f;
    hideLogin();
    var roles = ((_a = state.user) === null || _a === void 0 ? void 0 : _a.roles) || [];
    var userSummary = document.getElementById('userSummary');
    if (userSummary) {
        var appLabel = ((_b = state.user) === null || _b === void 0 ? void 0 : _b.appName) || ((_c = state.user) === null || _c === void 0 ? void 0 : _c.appClientId) || ((_d = state.apps.find(function (a) { var _a; return a.id === ((_a = state.user) === null || _a === void 0 ? void 0 : _a.appId); })) === null || _d === void 0 ? void 0 : _d.name) || '';
        var tenantLabel = ((_e = state.user) === null || _e === void 0 ? void 0 : _e.tenantName) || '';
        var roleLabel = roles.join(',') || 'no-roles';
        // Prominently show application; include tenant if known
        userSummary.textContent = "".concat(appLabel ? '[' + appLabel + '] ' : '').concat(tenantLabel ? tenantLabel + ' · ' : '').concat(state.user.sub || 'user', " [").concat(roleLabel, "]");
    }
    document.getElementById('userPane').style.display = 'flex';
    applyRoleVisibility();
    // Initialize role context
    updateRoleContext();
    // Role based UI adjustments
    var isSuperadmin = roles.includes('superadmin');
    var isEditorOnly = roles.includes('editor') && !roles.some(function (r) { return r === 'tenant_admin' || r === 'superadmin'; });
    // Hide Tenants nav for anyone who is not superadmin
    if (!isSuperadmin) {
        document.querySelectorAll('[data-view=tenants]').forEach(function (el) { return el.style.display = 'none'; });
        (_f = document.getElementById('goToTenantsBtn')) === null || _f === void 0 ? void 0 : _f.remove();
    }
    var loadTenantsPromise = isSuperadmin ? loadTenants().catch(function () { }) : Promise.resolve();
    loadTenantsPromise.then(function () { return __awaiter(_this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    // For non-superadmin, prefer tenantId from token
                    if (!isSuperadmin && ((_a = state.user) === null || _a === void 0 ? void 0 : _a.tenantId) && !tenantId) {
                        tenantId = state.user.tenantId;
                        localStorage.setItem('tenantId', tenantId);
                    }
                    if (!tenantId) return [3 /*break*/, 2];
                    return [4 /*yield*/, loadApps()];
                case 1:
                    _b.sent();
                    _b.label = 2;
                case 2:
                    updateEnvInfo();
                    if (!tenantId) return [3 /*break*/, 4];
                    return [4 /*yield*/, listTemplates()];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4:
                    if (!tenantId) return [3 /*break*/, 6];
                    return [4 /*yield*/, listGroups()];
                case 5:
                    _b.sent();
                    _b.label = 6;
                case 6:
                    wireNav();
                    wireAppManagement();
                    return [2 /*return*/];
            }
        });
    }); });
}
// Tenant creation (exists only in Tenants view now)
var tenantFormEl = document.getElementById('tenantForm');
if (tenantFormEl) {
    tenantFormEl.addEventListener('submit', function (e) { return __awaiter(_this, void 0, void 0, function () {
        var fd, name, btn, t, err_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    fd = new FormData(e.target);
                    name = fd.get('tenantName');
                    btn = e.target.querySelector('button[type=submit]');
                    btn.disabled = true;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 7, 8, 9]);
                    return [4 /*yield*/, api('/tenants', { method: 'POST', body: JSON.stringify({ name: name }) })];
                case 2:
                    t = _a.sent();
                    tenantId = t.id;
                    localStorage.setItem('tenantId', tenantId);
                    status(document.getElementById('tenantStatus'), 'Created ✔');
                    return [4 /*yield*/, loadTenants()];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, loadApps()];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, listTemplates()];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, listGroups()];
                case 6:
                    _a.sent();
                    updateEnvInfo();
                    return [3 /*break*/, 9];
                case 7:
                    err_4 = _a.sent();
                    status(document.getElementById('tenantStatus'), 'Error: ' + err_4.message);
                    return [3 /*break*/, 9];
                case 8:
                    btn.disabled = false;
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    }); });
}
// Login form handling
(_c = document.getElementById('loginForm')) === null || _c === void 0 ? void 0 : _c.addEventListener('submit', function (e) { return __awaiter(_this, void 0, void 0, function () {
    var fd, token, statusEl, _a, err_5;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                e.preventDefault();
                fd = new FormData(e.target);
                token = (fd.get('token') || '').trim();
                statusEl = document.getElementById('loginStatus');
                if (!token) {
                    statusEl.textContent = 'Token required';
                    return [2 /*return*/];
                }
                statusEl.textContent = 'Verifying...';
                authToken = token;
                localStorage.setItem('authToken', authToken);
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                _a = state;
                return [4 /*yield*/, api('/me')];
            case 2:
                _a.user = _b.sent();
                if (!state.user)
                    throw new Error('No user context');
                statusEl.textContent = 'OK';
                setTimeout(function () { statusEl.textContent = ''; }, 800);
                onAuthenticated();
                return [3 /*break*/, 4];
            case 3:
                err_5 = _b.sent();
                statusEl.textContent = 'Invalid token';
                authToken = null;
                localStorage.removeItem('authToken');
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
(_d = document.getElementById('logoutBtn')) === null || _d === void 0 ? void 0 : _d.addEventListener('click', function () {
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
    catch (_a) { }
    // Hide user pane
    document.getElementById('userPane').style.display = 'none';
    // Optional: Redirect to clean URL
    if (window.location.search) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    console.log('✅ Logout complete');
    // Instead of showing manual login, trigger IDP redirect flow
    var idp = uiConfig.idpLoginUrl;
    if (idp) {
        console.log('🔄 Redirecting to IDP for fresh authentication...');
        var ret = uiConfig.returnUrl || (window.location.origin + '/ui/');
        var redirect = new URL(idp);
        redirect.searchParams.set('return', ret);
        window.location.href = redirect.toString();
    }
    else {
        // Fallback to manual login if no IDP configured
        showLogin();
    }
});
// App creation (only in Tenants view)
var appFormEl = document.getElementById('appForm');
if (appFormEl) {
    appFormEl.addEventListener('submit', function (e) { return __awaiter(_this, void 0, void 0, function () {
        var fd, payload, btn, rec, err_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    if (!tenantId) {
                        status(document.getElementById('appStatus'), 'Select tenant first');
                        return [2 /*return*/];
                    }
                    fd = new FormData(e.target);
                    payload = { tenantId: tenantId, name: fd.get('appName'), clientId: fd.get('clientId') };
                    btn = e.target.querySelector('button[type=submit]');
                    btn.disabled = true;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, api('/apps', { method: 'POST', body: JSON.stringify(payload) })];
                case 2:
                    rec = _a.sent();
                    appId = rec.id;
                    localStorage.setItem('appId', appId);
                    status(document.getElementById('appStatus'), 'Created ✔');
                    return [4 /*yield*/, loadApps()];
                case 3:
                    _a.sent();
                    updateEnvInfo();
                    return [3 /*break*/, 6];
                case 4:
                    err_6 = _a.sent();
                    status(document.getElementById('appStatus'), 'Error: ' + err_6.message);
                    return [3 /*break*/, 6];
                case 5:
                    btn.disabled = false;
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); });
}
// Select handlers
(_e = document.getElementById('tenantSelect')) === null || _e === void 0 ? void 0 : _e.addEventListener('change', function (e) { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tenantId = e.target.value;
                localStorage.setItem('tenantId', tenantId);
                appId = '';
                localStorage.removeItem('appId');
                return [4 /*yield*/, loadApps()];
            case 1:
                _a.sent();
                return [4 /*yield*/, listTemplates()];
            case 2:
                _a.sent();
                return [4 /*yield*/, listGroups()];
            case 3:
                _a.sent();
                updateEnvInfo();
                return [2 /*return*/];
        }
    });
}); });
(_f = document.getElementById('appSelect')) === null || _f === void 0 ? void 0 : _f.addEventListener('change', function (e) {
    appId = e.target.value;
    if (appId)
        localStorage.setItem('appId', appId);
    else
        localStorage.removeItem('appId');
    updateEnvInfo();
});
function updateEnvInfo() {
    var _a, _b;
    var parts = [];
    parts.push("Tenant: ".concat(tenantId || '—'));
    var appBadge = ((_a = state.user) === null || _a === void 0 ? void 0 : _a.appName) || ((_b = state.user) === null || _b === void 0 ? void 0 : _b.appClientId) || appId || '—';
    parts.push("App: ".concat(appBadge));
    parts.push(state.dbMode ? 'DB' : 'In-Memory');
    if (state.user) {
        var roles = (state.user.roles || []).join(',') || 'no-roles';
        parts.push("User: ".concat(state.user.sub || 'unknown', " [").concat(roles, "]"));
    }
    (document.getElementById('envInfo')).textContent = parts.join(' | ');
    var deactivateBtn = document.getElementById('deactivateTemplateBtn');
    if (deactivateBtn)
        deactivateBtn.disabled = !state.currentTemplate;
}
function detectMode() {
    return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
        state.dbMode = true;
        return [2 /*return*/];
    }); });
}
function composeHeaderTitle() {
    var app = state.apps.find(function (a) { return a.id === appId; });
    return app ? "Compose - App: ".concat(app.name) : 'Compose Email';
}
function getAppsViewTitle() {
    var _a, _b;
    if (roleContext.isInTenantContext) {
        return "Apps - Tenant: ".concat(roleContext.contextTenantName);
    }
    var roles = ((_a = state.user) === null || _a === void 0 ? void 0 : _a.roles) || [];
    if (roles.includes('superadmin')) {
        return 'Apps Management (Superadmin)';
    }
    if (roles.includes('tenant_admin')) {
        var tenantName = ((_b = state.user) === null || _b === void 0 ? void 0 : _b.tenantName) || 'Current Tenant';
        return "Apps Management - ".concat(tenantName);
    }
    return 'Apps Management';
}
function loadAppsForCurrentContext() {
    return __awaiter(this, void 0, void 0, function () {
        var roles, targetTenantId, appsList;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    roles = ((_a = state.user) === null || _a === void 0 ? void 0 : _a.roles) || [];
                    targetTenantId = roleContext.isInTenantContext ? roleContext.contextTenantId :
                        (roles.includes('tenant_admin') ? (_b = state.user) === null || _b === void 0 ? void 0 : _b.tenantId : null);
                    if (!targetTenantId) return [3 /*break*/, 3];
                    return [4 /*yield*/, loadAppsForTenant(targetTenantId)];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, updateAppsUI()];
                case 2:
                    _c.sent();
                    return [3 /*break*/, 4];
                case 3:
                    if (roles.includes('superadmin') && !roleContext.isInTenantContext) {
                        appsList = document.getElementById('appsList');
                        if (appsList) {
                            appsList.innerHTML = '<div class="empty-state">Select a tenant context to manage apps</div>';
                        }
                    }
                    _c.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
function loadAppsForTenant(tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var list, e_10;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, api("/apps?tenantId=".concat(encodeURIComponent(tenantId)))];
                case 1:
                    list = _a.sent();
                    state.apps = list;
                    return [2 /*return*/, list];
                case 2:
                    e_10 = _a.sent();
                    console.error('Failed to load apps for tenant:', e_10);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function updateAppsUI() {
    return __awaiter(this, void 0, void 0, function () {
        var appsList, appsHtml;
        return __generator(this, function (_a) {
            appsList = document.getElementById('appsList');
            if (!appsList)
                return [2 /*return*/];
            if (state.apps.length === 0) {
                appsList.innerHTML = '<div class="empty-state">No apps found for this tenant</div>';
                return [2 /*return*/];
            }
            appsHtml = state.apps.map(function (app) { return "\n    <div class=\"app-item\">\n      <div class=\"app-info\">\n        <h4>".concat(escapeHtml(app.name), "</h4>\n        <div class=\"app-details\">\n          <span class=\"app-id\">ID: ").concat(escapeHtml(app.id), "</span>\n          <span class=\"app-client-id\">Client ID: ").concat(escapeHtml(app.clientId), "</span>\n        </div>\n      </div>\n      <div class=\"app-actions\">\n        <button type=\"button\" class=\"editApp\" data-id=\"").concat(app.id, "\">Edit</button>\n        <button type=\"button\" class=\"deleteApp\" data-id=\"").concat(app.id, "\">Delete</button>\n      </div>\n    </div>\n  "); }).join('');
            appsList.innerHTML = appsHtml;
            // Wire up edit and delete buttons
            appsList.querySelectorAll('.editApp').forEach(function (btn) {
                return btn.addEventListener('click', function () { return editApp(btn.dataset.id); });
            });
            appsList.querySelectorAll('.deleteApp').forEach(function (btn) {
                return btn.addEventListener('click', function () { return deleteApp(btn.dataset.id); });
            });
            return [2 /*return*/];
        });
    });
}
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function editApp(appId) {
    return __awaiter(this, void 0, void 0, function () {
        var app, newName, e_11;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    app = state.apps.find(function (a) { return a.id === appId; });
                    if (!app)
                        return [2 /*return*/];
                    newName = prompt('Enter new app name:', app.name);
                    if (newName === null || newName.trim() === '')
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, api("/apps/".concat(appId), {
                            method: 'PUT',
                            body: JSON.stringify({ name: newName.trim() })
                        })];
                case 2:
                    _a.sent();
                    // Refresh the apps list
                    return [4 /*yield*/, loadAppsForCurrentContext()];
                case 3:
                    // Refresh the apps list
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_11 = _a.sent();
                    alert('Error updating app: ' + e_11.message);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function deleteApp(appId) {
    return __awaiter(this, void 0, void 0, function () {
        var app, e_12;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    app = state.apps.find(function (a) { return a.id === appId; });
                    if (!app)
                        return [2 /*return*/];
                    if (!confirm("Are you sure you want to delete app \"".concat(app.name, "\"? This cannot be undone.")))
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, api("/apps/".concat(appId), { method: 'DELETE' })];
                case 2:
                    _a.sent();
                    // Refresh the apps list
                    return [4 /*yield*/, loadAppsForCurrentContext()];
                case 3:
                    // Refresh the apps list
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_12 = _a.sent();
                    alert('Error deleting app: ' + e_12.message);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Role context switching for superadmin
function updateRoleContext() {
    var _a, _b, _c, _d;
    var roles = ((_a = state.user) === null || _a === void 0 ? void 0 : _a.roles) || [];
    roleContext.isSuperadmin = roles.includes('superadmin');
    // Update role context display
    var roleContextDisplay = document.getElementById('roleContextDisplay');
    if (roleContextDisplay) {
        if (roleContext.isSuperadmin && roleContext.isInTenantContext) {
            roleContextDisplay.innerHTML = "\n        <span class=\"context-indicator\">\uD83C\uDFE2 Tenant Context: ".concat(escapeHtml(roleContext.contextTenantName), "</span>\n        <button type=\"button\" id=\"exitTenantContextBtn\" title=\"Exit tenant context\">\u00D7</button>\n      ");
            (_b = document.getElementById('exitTenantContextBtn')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', exitTenantContext);
        }
        else if (roleContext.isSuperadmin) {
            roleContextDisplay.innerHTML = "\n        <span class=\"context-indicator\">\uD83D\uDC51 Superadmin</span>\n        <button type=\"button\" id=\"switchTenantContextBtn\" title=\"Switch to tenant context\">\uD83C\uDFE2</button>\n      ";
            (_c = document.getElementById('switchTenantContextBtn')) === null || _c === void 0 ? void 0 : _c.addEventListener('click', showTenantContextSwitcher);
        }
        else {
            var tenantName = ((_d = state.user) === null || _d === void 0 ? void 0 : _d.tenantName) || 'Current Tenant';
            var roleName = roles.includes('tenant_admin') ? 'Tenant Admin' : 'Editor';
            roleContextDisplay.innerHTML = "<span class=\"context-indicator\">".concat(roleName, ": ").concat(escapeHtml(tenantName), "</span>");
        }
    }
    // Update navigation visibility based on role and context
    updateNavigationVisibility();
}
function updateNavigationVisibility() {
    var _a;
    var roles = ((_a = state.user) === null || _a === void 0 ? void 0 : _a.roles) || [];
    var isEditorOnly = roles.includes('editor') && !roles.some(function (r) { return r === 'tenant_admin' || r === 'superadmin'; });
    var appsNavBtn = document.querySelector('[data-view="apps"]');
    var tenantsNavBtn = document.querySelector('[data-view="tenants"]');
    var smtpConfigBtn = document.querySelector('[data-view="smtp-config"]');
    if (appsNavBtn) {
        // Apps button visible for tenant_admin and superadmin (in any context)
        appsNavBtn.style.display = (roles.includes('tenant_admin') || roles.includes('superadmin')) ? 'block' : 'none';
    }
    if (tenantsNavBtn) {
        // Tenants button only visible for superadmin outside tenant context
        tenantsNavBtn.style.display = (roles.includes('superadmin') && !roleContext.isInTenantContext) ? 'block' : 'none';
    }
    if (smtpConfigBtn) {
        // SMTP Config button hidden for editor-only users
        smtpConfigBtn.style.display = isEditorOnly ? 'none' : 'block';
        // Update button text for non-editor users
        if (!isEditorOnly) {
            smtpConfigBtn.textContent = 'Config';
        }
    }
}
function showTenantContextSwitcher() {
    var modal = document.getElementById('contextSwitchModal');
    if (modal) {
        modal.style.display = 'flex';
        loadTenantsForContextSwitch();
    }
}
function loadTenantsForContextSwitch() {
    return __awaiter(this, void 0, void 0, function () {
        var tenantsList, tenants, tenantsHtml, e_13;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tenantsList = document.getElementById('contextTenantsList');
                    if (!tenantsList)
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, api('/tenants')];
                case 2:
                    tenants = _a.sent();
                    tenantsHtml = tenants.map(function (tenant) { return "\n      <div class=\"tenant-context-option\" data-tenant-id=\"".concat(tenant.id, "\">\n        <span class=\"tenant-name\">").concat(escapeHtml(tenant.name), "</span>\n        <button type=\"button\" class=\"switchToTenant\" data-tenant-id=\"").concat(tenant.id, "\" data-tenant-name=\"").concat(tenant.name, "\">\n          Switch\n        </button>\n      </div>\n    "); }).join('');
                    tenantsList.innerHTML = tenantsHtml;
                    // Wire up switch buttons
                    tenantsList.querySelectorAll('.switchToTenant').forEach(function (btn) {
                        btn.addEventListener('click', function () {
                            var tenantId = btn.dataset.tenantId;
                            var tenantName = btn.dataset.tenantName;
                            switchToTenantContext(tenantId, tenantName);
                        });
                    });
                    return [3 /*break*/, 4];
                case 3:
                    e_13 = _a.sent();
                    tenantsList.innerHTML = '<div class="error">Failed to load tenants</div>';
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// App creation functionality
function createApp(event) {
    return __awaiter(this, void 0, void 0, function () {
        var form, formData, name, targetTenantId, e_14;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    event.preventDefault();
                    form = event.target;
                    formData = new FormData(form);
                    name = formData.get('appName');
                    if (!(name === null || name === void 0 ? void 0 : name.trim())) {
                        alert('App name is required');
                        return [2 /*return*/];
                    }
                    targetTenantId = roleContext.isInTenantContext ? roleContext.contextTenantId :
                        (((_a = state.user) === null || _a === void 0 ? void 0 : _a.tenantId) || '');
                    if (!targetTenantId) {
                        alert('No tenant context available for app creation');
                        return [2 /*return*/];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, api('/apps', {
                            method: 'POST',
                            body: JSON.stringify({
                                name: name.trim(),
                                tenantId: targetTenantId
                            })
                        })];
                case 2:
                    _b.sent();
                    // Clear form and refresh apps list
                    form.reset();
                    return [4 /*yield*/, loadAppsForCurrentContext()];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_14 = _b.sent();
                    alert('Error creating app: ' + e_14.message);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Wire up forms and context switching
function wireAppManagement() {
    // App creation form
    var appForm = document.getElementById('createAppForm');
    if (appForm) {
        appForm.addEventListener('submit', createApp);
    }
    // Context switch modal close
    var closeModalBtn = document.getElementById('closeContextModal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', function () {
            var modal = document.getElementById('contextSwitchModal');
            if (modal)
                modal.style.display = 'none';
        });
    }
    // Close modal when clicking outside
    var modal = document.getElementById('contextSwitchModal');
    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}
function showView(view) {
    var _a;
    var roles = ((_a = state.user) === null || _a === void 0 ? void 0 : _a.roles) || [];
    var isEditorOnly = roles.includes('editor') && !roles.some(function (r) { return r === 'tenant_admin' || r === 'superadmin'; });
    // Restrict editor-only users to compose view only
    if (isEditorOnly && view !== 'compose') {
        console.log("[ui-auth] Editor-only user attempted to access ".concat(view, ", redirecting to compose"));
        view = 'compose';
    }
    (document.getElementById('view-tenants')).style.display = view === 'tenants' ? 'grid' : 'none';
    (document.getElementById('view-compose')).style.display = view === 'compose' ? 'grid' : 'none';
    (document.getElementById('view-smtp-config')).style.display = view === 'smtp-config' ? 'block' : 'none';
    (document.getElementById('view-apps')).style.display = view === 'apps' ? 'block' : 'none';
    document.querySelectorAll('.navBtn').forEach(function (el) { return el.classList.toggle('active', el.getAttribute('data-view') === view); });
    // Update title with corrected names
    var title;
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
    document.querySelectorAll('button.navBtn').forEach(function (btn) { return btn.addEventListener('click', function () { return showView(btn.dataset.view); }); });
    showView('compose');
}
// Manage Tenants button (in compose context panel)
(_g = document.getElementById('goToTenantsBtn')) === null || _g === void 0 ? void 0 : _g.addEventListener('click', function () { return showView('tenants'); });
var originalUpdateEnvInfo = updateEnvInfo;
// @ts-ignore
updateEnvInfo = function () { originalUpdateEnvInfo(); (document.getElementById('viewTitle')).textContent = composeHeaderTitle(); };
(_h = document.getElementById('quickSendForm')) === null || _h === void 0 ? void 0 : _h.addEventListener('submit', function (e) { return __awaiter(_this, void 0, void 0, function () {
    var fd, subject, html, text, recipients, btn, err_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                e.preventDefault();
                if (!tenantId || !appId) {
                    status(document.getElementById('quickSendStatus'), 'Select tenant/app first');
                    return [2 /*return*/];
                }
                fd = new FormData(e.target);
                subject = fd.get('qsSubject');
                html = fd.get('qsHtml');
                text = fd.get('qsText');
                recipients = (fd.get('qsRecipients') || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean).map(function (e) { return ({ email: e }); });
                if (!recipients.length) {
                    status(document.getElementById('quickSendStatus'), 'Recipients required');
                    return [2 /*return*/];
                }
                btn = e.target.querySelector('button[type=submit]');
                btn.disabled = true;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, 5, 6]);
                return [4 /*yield*/, api('/send-now', { method: 'POST', body: JSON.stringify({ appId: appId, subject: subject, html: html, text: text, recipients: recipients }) })];
            case 2:
                _a.sent();
                status(document.getElementById('quickSendStatus'), 'Queued ✔');
                return [4 /*yield*/, listGroups()];
            case 3:
                _a.sent();
                return [3 /*break*/, 6];
            case 4:
                err_7 = _a.sent();
                status(document.getElementById('quickSendStatus'), 'Error: ' + err_7.message);
                return [3 /*break*/, 6];
            case 5:
                btn.disabled = false;
                return [7 /*endfinally*/];
            case 6: return [2 /*return*/];
        }
    });
}); });
function init() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, url, tenantHint, clientIdHint, appIdHint, tokenFromUrl, cameFromIdp, authDisabled, _b, e_15, statusEl, idp, alreadyRedirected, ret, redirect, fTenant, fClient, fAppId, mismatch, already, ret, redirect, roleList, isEditorOnly, isTenantAdmin, tenantPanel;
        var _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, detectMode()];
                case 1:
                    _f.sent();
                    _f.label = 2;
                case 2:
                    _f.trys.push([2, 5, , 6]);
                    if (!!uiConfig.returnUrl) return [3 /*break*/, 4];
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var s = document.createElement('script');
                            s.src = '/ui/config.js';
                            s.onload = function () { return resolve(); };
                            s.onerror = function () { return reject(new Error('config load failed')); };
                            document.head.appendChild(s);
                        })];
                case 3:
                    _f.sent();
                    uiConfig = window.__MAIL_UI_CONFIG__ || {};
                    _f.label = 4;
                case 4:
                    try {
                        console.debug('[ui-auth] config loaded', { returnUrl: uiConfig.returnUrl, idp: uiConfig.idpLoginUrl });
                    }
                    catch (_g) { }
                    return [3 /*break*/, 6];
                case 5:
                    _a = _f.sent();
                    return [3 /*break*/, 6];
                case 6:
                    // Initial debug of page state
                    try {
                        console.debug('[ui-auth] init', {
                            href: window.location.href,
                            lsToken: !!authToken,
                            configReturn: uiConfig === null || uiConfig === void 0 ? void 0 : uiConfig.returnUrl,
                            idp: uiConfig === null || uiConfig === void 0 ? void 0 : uiConfig.idpLoginUrl
                        });
                    }
                    catch (_h) { }
                    url = new URL(window.location.href);
                    tenantHint = url.searchParams.get('tenantId');
                    clientIdHint = url.searchParams.get('clientId');
                    appIdHint = url.searchParams.get('appId') || url.searchParams.get('app');
                    if (tenantHint) {
                        try {
                            localStorage.setItem('tenantId', tenantHint);
                            tenantId = tenantHint;
                        }
                        catch (_j) { }
                    }
                    if (clientIdHint) {
                        try {
                            localStorage.setItem('appClientIdHint', clientIdHint);
                        }
                        catch (_k) { }
                    }
                    if (appIdHint) {
                        try {
                            localStorage.setItem('appIdHint', appIdHint);
                        }
                        catch (_l) { }
                    }
                    tokenFromUrl = url.searchParams.get('token');
                    cameFromIdp = !!tokenFromUrl;
                    if (tokenFromUrl) {
                        authToken = tokenFromUrl;
                        localStorage.setItem('authToken', authToken);
                        url.searchParams.delete('token');
                        history.replaceState({}, '', url.toString());
                        try {
                            console.debug('[ui-auth] token accepted from URL', { len: tokenFromUrl.length });
                        }
                        catch (_m) { }
                        // Clear the one-time redirect flag after arriving back from IDP
                        try {
                            sessionStorage.removeItem('idpRedirected');
                        }
                        catch (_o) { }
                    }
                    authDisabled = false;
                    _f.label = 7;
                case 7:
                    _f.trys.push([7, 9, , 10]);
                    console.debug('[ui-auth] Calling /me with token:', authToken ? "".concat(authToken.substring(0, 20), "...") : 'none');
                    _b = state;
                    return [4 /*yield*/, api('/me')];
                case 8:
                    _b.user = _f.sent();
                    console.debug('[ui-auth] /me response:', state.user ? 'user found' : 'null response');
                    // If /me returns null but succeeds, auth is disabled
                    if (state.user === null) {
                        authDisabled = true;
                        console.debug('[ui-auth] Authentication disabled, proceeding without user context');
                    }
                    return [3 /*break*/, 10];
                case 9:
                    e_15 = _f.sent();
                    console.debug('[ui-auth] /me failed with token from IDP:', cameFromIdp, 'error:', (e_15 === null || e_15 === void 0 ? void 0 : e_15.message) || e_15);
                    if (cameFromIdp) {
                        console.error('[ui-auth] Token from IDP failed validation - this suggests an auth configuration issue');
                    }
                    else if (authToken) {
                        // If we have a stored token that failed validation, it's likely expired
                        console.debug('[ui-auth] Stored token failed validation (likely expired), clearing idpRedirected flag for fresh redirect');
                        try {
                            sessionStorage.removeItem('idpRedirected');
                        }
                        catch (_p) { }
                        try {
                            sessionStorage.removeItem('idpRedirectedHints');
                        }
                        catch (_q) { }
                        // Also clear the expired token
                        authToken = null;
                        localStorage.removeItem('authToken');
                    }
                    state.user = null;
                    return [3 /*break*/, 10];
                case 10:
                    if (!state.user && !authDisabled) {
                        console.debug('[ui-auth] No user found and auth enabled, checking IDP redirect...');
                        // Special case: if we came from IDP but token validation failed, show error
                        if (cameFromIdp) {
                            console.error('[ui-auth] Came from IDP but token validation failed');
                            statusEl = document.getElementById('loginStatus');
                            if (statusEl) {
                                statusEl.textContent = 'Token from IDP failed validation. Please check auth configuration.';
                                statusEl.style.color = 'red';
                            }
                            showLogin();
                            return [2 /*return*/];
                        }
                        idp = uiConfig.idpLoginUrl;
                        console.debug('[ui-auth] IDP URL:', idp);
                        if (idp) {
                            alreadyRedirected = (function () { try {
                                return sessionStorage.getItem('idpRedirected') === '1';
                            }
                            catch (_a) {
                                return false;
                            } })();
                            console.debug('[ui-auth] Already redirected?', alreadyRedirected, 'Came from IDP?', cameFromIdp);
                            if (!cameFromIdp && !alreadyRedirected) {
                                ret = uiConfig.returnUrl || (window.location.origin + '/ui/');
                                redirect = new URL(idp);
                                redirect.searchParams.set('return', ret);
                                fTenant = tenantId || tenantHint || '';
                                fClient = (clientIdHint || localStorage.getItem('appClientIdHint') || '');
                                fAppId = (appId || appIdHint || localStorage.getItem('appIdHint') || '');
                                if (fTenant)
                                    redirect.searchParams.set('tenantId', fTenant);
                                if (fClient)
                                    redirect.searchParams.set('clientId', fClient);
                                if (fAppId && !fClient)
                                    redirect.searchParams.set('appId', fAppId);
                                console.debug('[ui-auth] Setting idpRedirected flag and redirecting to:', redirect.toString());
                                try {
                                    console.debug('[ui-auth] redirecting to IDP', { ret: ret, to: redirect.toString() });
                                }
                                catch (_r) { }
                                try {
                                    sessionStorage.setItem('idpRedirected', '1');
                                }
                                catch (_s) { }
                                window.location.href = redirect.toString();
                                return [2 /*return*/];
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
                        return [2 /*return*/];
                    }
                    // If already authenticated but arrived with app/tenant hints, refresh token via IDP once
                    if (state.user && (clientIdHint || appIdHint || tenantHint) && uiConfig.idpLoginUrl) {
                        mismatch = ((clientIdHint && clientIdHint !== (state.user.appClientId || '')) ||
                            (appIdHint && appIdHint !== (state.user.appId || '')) ||
                            (tenantHint && tenantHint !== (state.user.tenantId || '')) ||
                            (!state.user.appClientId && clientIdHint) || (!state.user.appId && appIdHint));
                        already = (function () { try {
                            return sessionStorage.getItem('idpRedirectedHints') === '1';
                        }
                        catch (_a) {
                            return false;
                        } })();
                        if (mismatch && !cameFromIdp && !already) {
                            try {
                                sessionStorage.setItem('idpRedirectedHints', '1');
                            }
                            catch (_t) { }
                            ret = uiConfig.returnUrl || (window.location.origin + '/ui/');
                            redirect = new URL(uiConfig.idpLoginUrl);
                            redirect.searchParams.set('return', ret);
                            if (tenantHint)
                                redirect.searchParams.set('tenantId', tenantHint);
                            if (clientIdHint)
                                redirect.searchParams.set('clientId', clientIdHint);
                            if (appIdHint && !clientIdHint)
                                redirect.searchParams.set('appId', appIdHint);
                            window.location.href = redirect.toString();
                            return [2 /*return*/];
                        }
                    }
                    // If we arrived with a fresh token, immediately reflect authenticated UI
                    if (cameFromIdp && state.user) {
                        onAuthenticated();
                        return [2 /*return*/];
                    }
                    // If we have a user (whether from IDP or pre-existing token), show authenticated UI
                    if (state.user) {
                        onAuthenticated();
                    }
                    roleList = ((_c = state.user) === null || _c === void 0 ? void 0 : _c.roles) || [];
                    isEditorOnly = roleList.includes('editor') && !roleList.some(function (r) { return r === 'tenant_admin' || r === 'superadmin'; });
                    isTenantAdmin = roleList.includes('tenant_admin') && !roleList.includes('superadmin');
                    if (isEditorOnly) {
                        // Hide Tenants navigation button entirely
                        document.querySelectorAll('[data-view=tenants]').forEach(function (el) { return el.style.display = 'none'; });
                    }
                    if (isEditorOnly) {
                        tenantPanel = document.getElementById('tenantAppPanel');
                        // editors should not see Manage Tenants button
                        (_d = document.getElementById('goToTenantsBtn')) === null || _d === void 0 ? void 0 : _d.remove();
                    }
                    if (!(roleList.includes('superadmin') || authDisabled)) return [3 /*break*/, 12];
                    return [4 /*yield*/, loadTenants()];
                case 11:
                    _f.sent();
                    _f.label = 12;
                case 12:
                    if (!tenantId) return [3 /*break*/, 14];
                    return [4 /*yield*/, loadApps()];
                case 13:
                    _f.sent(); // Load apps for specific tenant
                    return [3 /*break*/, 16];
                case 14:
                    if (!authDisabled) return [3 /*break*/, 16];
                    return [4 /*yield*/, loadAllApps()];
                case 15:
                    _f.sent(); // Load all apps for SMTP config dropdowns
                    _f.label = 16;
                case 16:
                    // If appId from token is present, prefer it for initial context
                    if (((_e = state.user) === null || _e === void 0 ? void 0 : _e.appId) && (!appId || appId !== state.user.appId)) {
                        appId = state.user.appId;
                        try {
                            localStorage.setItem('appId', appId);
                        }
                        catch (_u) { }
                    }
                    updateEnvInfo();
                    if (!tenantId) return [3 /*break*/, 18];
                    return [4 /*yield*/, listTemplates()];
                case 17:
                    _f.sent();
                    _f.label = 18;
                case 18:
                    if (!tenantId) return [3 /*break*/, 20];
                    return [4 /*yield*/, listGroups()];
                case 19:
                    _f.sent();
                    _f.label = 20;
                case 20:
                    wireNav();
                    wireAppManagement();
                    setupSmtpConfig();
                    return [2 /*return*/];
            }
        });
    });
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
var currentSmtpConfig = null;
var selectedTreeNode = null;
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
    // Add Global Config button
    var addBtn = document.getElementById('addGlobalConfigBtn');
    addBtn === null || addBtn === void 0 ? void 0 : addBtn.addEventListener('click', function () {
        openGlobalConfigModal();
    });
    // Global config form
    var globalForm = document.getElementById('globalConfigForm');
    globalForm === null || globalForm === void 0 ? void 0 : globalForm.addEventListener('submit', handleGlobalConfigSubmit);
    // Close modal button
    var closeBtn = document.getElementById('closeGlobalConfigModal');
    closeBtn === null || closeBtn === void 0 ? void 0 : closeBtn.addEventListener('click', closeGlobalConfigModal);
    // Cancel button
    var cancelBtn = document.getElementById('cancelGlobalConfigBtn');
    cancelBtn === null || cancelBtn === void 0 ? void 0 : cancelBtn.addEventListener('click', closeGlobalConfigModal);
    // Service selector for global config
    var serviceSelect = document.getElementById('globalServiceSelect');
    serviceSelect === null || serviceSelect === void 0 ? void 0 : serviceSelect.addEventListener('change', function () {
        var service = serviceSelect.value;
        var smtpFields = document.getElementById('globalSmtpFields');
        var sesFields = document.getElementById('globalSesFields');
        if (smtpFields && sesFields) {
            smtpFields.style.display = service === 'smtp' ? 'block' : 'none';
            sesFields.style.display = service === 'ses' ? 'block' : 'none';
        }
    });
    // Test configuration button
    var testBtn = document.getElementById('testGlobalConfigBtn');
    testBtn === null || testBtn === void 0 ? void 0 : testBtn.addEventListener('click', testGlobalConfig);
    // Delete configuration button
    var deleteBtn = document.getElementById('deleteGlobalConfigBtn');
    deleteBtn === null || deleteBtn === void 0 ? void 0 : deleteBtn.addEventListener('click', handleGlobalConfigDelete);
    // Close modal when clicking outside
    var modal = document.getElementById('globalConfigModal');
    modal === null || modal === void 0 ? void 0 : modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            closeGlobalConfigModal();
        }
    });
}
function setupGlobalConfigManagement() {
    // This will be called when displaying global config cards
    console.log('Global config management setup complete');
}
function setupTenantContextHandling() {
    // Exit context button
    var exitBtn = document.getElementById('exitContextBtn');
    exitBtn === null || exitBtn === void 0 ? void 0 : exitBtn.addEventListener('click', function () {
        // Clear tenant context
        localStorage.removeItem('contextTenantId');
        localStorage.removeItem('contextTenantName');
        roleContext.isInTenantContext = false;
        roleContext.contextTenantId = '';
        roleContext.contextTenantName = '';
        // Hide context indicator
        var indicator = document.getElementById('roleContextIndicator');
        if (indicator)
            indicator.style.display = 'none';
        // Reload configurations
        loadAndDisplayConfigs();
    });
}
function loadAndDisplayConfigs() {
    return __awaiter(this, void 0, void 0, function () {
        var error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    // Load all configurations
                    return [4 /*yield*/, loadSmtpConfigs()];
                case 1:
                    // Load all configurations
                    _a.sent();
                    // Display global configurations
                    return [4 /*yield*/, displayGlobalConfigs()];
                case 2:
                    // Display global configurations
                    _a.sent();
                    // Display tenant overview
                    return [4 /*yield*/, displayTenantOverview()];
                case 3:
                    // Display tenant overview
                    _a.sent();
                    // Update context indicator
                    updateContextIndicator();
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    console.error('Failed to load configurations:', error_1);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function displayGlobalConfigs() {
    return __awaiter(this, void 0, void 0, function () {
        var cardsContainer, noConfigsMessage, globalConfigs;
        return __generator(this, function (_a) {
            cardsContainer = document.getElementById('globalConfigCards');
            noConfigsMessage = document.getElementById('noGlobalConfigs');
            if (!cardsContainer || !noConfigsMessage)
                return [2 /*return*/];
            globalConfigs = state.smtpConfigs.filter(function (c) { return c.scope === 'GLOBAL'; });
            if (globalConfigs.length === 0) {
                cardsContainer.style.display = 'none';
                noConfigsMessage.style.display = 'block';
                return [2 /*return*/];
            }
            cardsContainer.style.display = 'flex';
            noConfigsMessage.style.display = 'none';
            cardsContainer.innerHTML = globalConfigs.map(function (config) { return createGlobalConfigCard(config); }).join('');
            return [2 /*return*/];
        });
    });
}
function createGlobalConfigCard(config) {
    var isActive = config.isActive;
    var providerName = config.fromName || "".concat(config.service || 'SMTP', " Config");
    var serviceName = config.service || 'smtp';
    var hostInfo = config.host || 'Not configured';
    var fromAddress = config.fromAddress || 'Not set';
    return "\n    <div class=\"global-config-card ".concat(isActive ? 'active' : '', "\" data-config-id=\"").concat(config.id, "\">\n      <div class=\"global-config-card-header\">\n        <h3 class=\"global-config-card-title\">").concat(providerName, "</h3>\n        <div class=\"global-config-card-status\">\n          <span class=\"service-icon ").concat(serviceName, "\">").concat(serviceName.toUpperCase(), "</span>\n        </div>\n      </div>\n      \n      <div class=\"global-config-card-details\">\n        <div class=\"global-config-card-detail\">\n          <span>Host:</span>\n          <span>").concat(hostInfo, "</span>\n        </div>\n        <div class=\"global-config-card-detail\">\n          <span>Port:</span>\n          <span>").concat(config.port || '587', "</span>\n        </div>\n        <div class=\"global-config-card-detail\">\n          <span>From:</span>\n          <span>").concat(fromAddress, "</span>\n        </div>\n        <div class=\"global-config-card-detail\">\n          <span>Status:</span>\n          <span class=\"status-indicator ").concat(isActive ? 'active' : 'inactive', "\">\n            ").concat(isActive ? '● Active' : '○ Inactive', "\n          </span>\n        </div>\n      </div>\n      \n      <div class=\"global-config-card-actions\">\n        ").concat(!isActive ? "<button class=\"global-config-card-btn success\" onclick=\"activateGlobalConfig('".concat(config.id, "')\">Activate</button>") : '', "\n        <button class=\"global-config-card-btn primary\" onclick=\"editGlobalConfig('").concat(config.id, "')\">Edit</button>\n        <button class=\"global-config-card-btn\" onclick=\"testGlobalConfigById('").concat(config.id, "')\">Test</button>\n        <button class=\"global-config-card-btn danger\" onclick=\"deleteGlobalConfigById('").concat(config.id, "')\">Delete</button>\n      </div>\n    </div>\n  ");
}
function displayTenantOverview() {
    return __awaiter(this, void 0, void 0, function () {
        var treeContainer, treeHtml, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    treeContainer = document.getElementById('smtpTree');
                    if (!treeContainer)
                        return [2 /*return*/];
                    // Show loading
                    treeContainer.innerHTML = 'Loading tenant configuration overview...';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 6, , 7]);
                    if (!(state.tenants.length === 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, loadTenants()];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    if (!(state.apps.length === 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, loadApps()];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    treeHtml = '';
                    if (state.tenants.length === 0) {
                        treeHtml = 'No tenants configured yet.';
                    }
                    else {
                        treeHtml = buildTenantTree();
                    }
                    treeContainer.innerHTML = treeHtml;
                    return [3 /*break*/, 7];
                case 6:
                    error_2 = _a.sent();
                    console.error('Failed to display tenant overview:', error_2);
                    treeContainer.innerHTML = 'Failed to load tenant overview.';
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    });
}
function buildTenantTree() {
    var tree = '';
    var _loop_1 = function (tenant) {
        var tenantConfigs = state.smtpConfigs.filter(function (c) { return c.scope === 'TENANT' && c.tenantId === tenant.id; });
        var tenantApps = state.apps.filter(function (app) { return app.tenantId === tenant.id; });
        tree += "\uD83D\uDCC1 <span class=\"tenant-link\" onclick=\"switchToTenantContext('".concat(tenant.id, "', '").concat(tenant.name, "')\">").concat(tenant.name, "</span>");
        tree += tenantConfigs.length > 0 ? ' [📧]' : ' [no config]';
        tree += '\n';
        var _loop_2 = function (app) {
            var appConfigs = state.smtpConfigs.filter(function (c) { return c.scope === 'APP' && c.appId === app.id; });
            tree += "  \u2514\u2500 \uD83D\uDCF1 ".concat(app.name);
            tree += appConfigs.length > 0 ? ' [📧]' : ' [no config]';
            tree += '\n';
        };
        // Show apps under tenant
        for (var _b = 0, tenantApps_1 = tenantApps; _b < tenantApps_1.length; _b++) {
            var app = tenantApps_1[_b];
            _loop_2(app);
        }
        if (tenantApps.length === 0) {
            tree += '  └─ (no apps)\n';
        }
        tree += '\n';
    };
    for (var _i = 0, _a = state.tenants; _i < _a.length; _i++) {
        var tenant = _a[_i];
        _loop_1(tenant);
    }
    return tree;
}
function updateContextIndicator() {
    var indicator = document.getElementById('roleContextIndicator');
    var tenantNameSpan = document.getElementById('contextTenantName');
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
// Global Configuration Modal Functions
function openGlobalConfigModal(configId) {
    var modal = document.getElementById('globalConfigModal');
    var titleEl = document.getElementById('globalConfigModalTitle');
    var form = document.getElementById('globalConfigForm');
    var deleteBtn = document.getElementById('deleteGlobalConfigBtn');
    if (!modal || !titleEl || !form)
        return;
    // Reset form
    form.reset();
    if (configId) {
        // Editing existing config
        var config = state.smtpConfigs.find(function (c) { return c.id === configId; });
        if (config) {
            titleEl.textContent = 'Edit Global SMTP Configuration';
            populateGlobalConfigForm(config);
            if (deleteBtn)
                deleteBtn.style.display = 'block';
        }
    }
    else {
        // Creating new config
        titleEl.textContent = 'Add Global SMTP Configuration';
        if (deleteBtn)
            deleteBtn.style.display = 'none';
    }
    modal.style.display = 'flex';
}
function closeGlobalConfigModal() {
    var modal = document.getElementById('globalConfigModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // Clear form
    var form = document.getElementById('globalConfigForm');
    if (form) {
        form.reset();
    }
    // Clear any status messages
    var statusEl = document.getElementById('globalConfigStatus');
    if (statusEl) {
        statusEl.textContent = '';
    }
}
function populateGlobalConfigForm(config) {
    var form = document.getElementById('globalConfigForm');
    if (!form)
        return;
    // Set hidden config ID
    form.querySelector('#globalConfigId').value = config.id;
    // Set form fields
    form.querySelector('[name="providerName"]').value = config.fromName || '';
    form.querySelector('[name="service"]').value = config.service || 'smtp';
    form.querySelector('[name="host"]').value = config.host || '';
    form.querySelector('[name="port"]').value = (config.port || 587).toString();
    form.querySelector('[name="secure"]').checked = config.secure || false;
    form.querySelector('[name="user"]').value = config.user || '';
    form.querySelector('[name="fromAddress"]').value = config.fromAddress || '';
    form.querySelector('[name="fromName"]').value = config.fromName || '';
    // Handle SES fields if applicable
    if (config.service === 'ses') {
        form.querySelector('[name="awsRegion"]').value = config.sesRegion || '';
        form.querySelector('[name="awsAccessKey"]').value = config.sesAccessKeyId || '';
    }
    // Trigger service change to show/hide fields
    var serviceSelect = form.querySelector('[name="service"]');
    serviceSelect.dispatchEvent(new Event('change'));
}
function handleGlobalConfigSubmit(e) {
    return __awaiter(this, void 0, void 0, function () {
        var form, statusEl, saveBtn, formData, configId, payload, response, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    form = e.target;
                    statusEl = document.getElementById('globalConfigStatus');
                    saveBtn = document.getElementById('saveGlobalConfigBtn');
                    if (!statusEl)
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 8, 9, 10]);
                    saveBtn.disabled = true;
                    statusEl.textContent = 'Saving configuration...';
                    formData = new FormData(form);
                    configId = form.querySelector('#globalConfigId').value;
                    payload = {
                        scope: 'GLOBAL',
                        service: formData.get('service'),
                        host: formData.get('host'),
                        port: parseInt(formData.get('port')) || 587,
                        secure: formData.has('secure'),
                        user: formData.get('user') || undefined,
                        pass: formData.get('pass') || undefined,
                        fromAddress: formData.get('fromAddress'),
                        fromName: formData.get('fromName')
                    };
                    // Handle SES fields
                    if (payload.service === 'ses') {
                        payload.sesRegion = formData.get('awsRegion');
                        payload.sesAccessKeyId = formData.get('awsAccessKey');
                        payload.sesSecretAccessKey = formData.get('awsSecretKey');
                    }
                    response = void 0;
                    if (!configId) return [3 /*break*/, 3];
                    return [4 /*yield*/, api("/smtp-configs/".concat(configId), {
                            method: 'PUT',
                            body: JSON.stringify(payload)
                        })];
                case 2:
                    // Update existing config
                    response = _a.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, api('/smtp-configs', {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    })];
                case 4:
                    // Create new config
                    response = _a.sent();
                    _a.label = 5;
                case 5:
                    statusEl.textContent = configId ? 'Configuration updated successfully!' : 'Configuration created successfully!';
                    statusEl.className = 'status success';
                    // Reload configs and refresh display
                    return [4 /*yield*/, loadSmtpConfigs()];
                case 6:
                    // Reload configs and refresh display
                    _a.sent();
                    return [4 /*yield*/, displayGlobalConfigs()];
                case 7:
                    _a.sent();
                    // Close modal after short delay
                    setTimeout(function () {
                        closeGlobalConfigModal();
                    }, 1500);
                    return [3 /*break*/, 10];
                case 8:
                    error_3 = _a.sent();
                    console.error('Failed to save global config:', error_3);
                    statusEl.textContent = "Error: ".concat(error_3.message);
                    statusEl.className = 'status error';
                    return [3 /*break*/, 10];
                case 9:
                    saveBtn.disabled = false;
                    return [7 /*endfinally*/];
                case 10: return [2 /*return*/];
            }
        });
    });
}
function testGlobalConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var form, statusEl, testBtn, formData, payload, response, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    form = document.getElementById('globalConfigForm');
                    statusEl = document.getElementById('globalConfigStatus');
                    testBtn = document.getElementById('testGlobalConfigBtn');
                    if (!form || !statusEl)
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    testBtn.disabled = true;
                    statusEl.textContent = 'Testing configuration...';
                    statusEl.className = 'status';
                    formData = new FormData(form);
                    payload = {
                        scope: 'GLOBAL',
                        service: formData.get('service'),
                        host: formData.get('host'),
                        port: parseInt(formData.get('port')) || 587,
                        secure: formData.has('secure'),
                        user: formData.get('user') || undefined,
                        pass: formData.get('pass') || undefined,
                        fromAddress: formData.get('fromAddress'),
                        fromName: formData.get('fromName')
                    };
                    return [4 /*yield*/, api('/smtp-configs/test', {
                            method: 'POST',
                            body: JSON.stringify(payload)
                        })];
                case 2:
                    response = _a.sent();
                    if (response.success) {
                        statusEl.textContent = 'Test successful! Configuration is working.';
                        statusEl.className = 'status success';
                    }
                    else {
                        statusEl.textContent = "Test failed: ".concat(response.message || 'Unknown error');
                        statusEl.className = 'status error';
                    }
                    return [3 /*break*/, 5];
                case 3:
                    error_4 = _a.sent();
                    console.error('Test failed:', error_4);
                    statusEl.textContent = "Test failed: ".concat(error_4.message);
                    statusEl.className = 'status error';
                    return [3 /*break*/, 5];
                case 4:
                    testBtn.disabled = false;
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function handleGlobalConfigDelete() {
    return __awaiter(this, void 0, void 0, function () {
        var configId, config, confirmMessage, otherGlobalConfigs, statusEl, error_5, statusEl;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    configId = document.getElementById('globalConfigId').value;
                    if (!configId) {
                        alert('No configuration to delete');
                        return [2 /*return*/];
                    }
                    config = state.smtpConfigs.find(function (c) { return c.id === configId; });
                    confirmMessage = 'Are you sure you want to delete this global SMTP configuration?';
                    if (config === null || config === void 0 ? void 0 : config.isActive) {
                        otherGlobalConfigs = state.smtpConfigs.filter(function (c) { return c.scope === 'GLOBAL' && c.id !== configId; });
                        if (otherGlobalConfigs.length > 0) {
                            confirmMessage = "This is the ACTIVE global configuration. Deleting it will automatically activate another global configuration (".concat(otherGlobalConfigs[0].fromName || otherGlobalConfigs[0].host, "). Continue?");
                        }
                        else {
                            confirmMessage = 'This is the ACTIVE global configuration and the ONLY global configuration. Deleting it will leave no global fallback for email services. Are you absolutely sure?';
                        }
                    }
                    if (!confirm(confirmMessage))
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    statusEl = document.getElementById('globalConfigStatus');
                    if (statusEl) {
                        statusEl.textContent = 'Deleting configuration...';
                        statusEl.className = 'status';
                    }
                    return [4 /*yield*/, api("/smtp-configs/".concat(configId), { method: 'DELETE' })];
                case 2:
                    _a.sent();
                    // Reload configs and refresh display
                    return [4 /*yield*/, loadSmtpConfigs()];
                case 3:
                    // Reload configs and refresh display
                    _a.sent();
                    return [4 /*yield*/, displayGlobalConfigs()];
                case 4:
                    _a.sent();
                    closeGlobalConfigModal();
                    return [3 /*break*/, 6];
                case 5:
                    error_5 = _a.sent();
                    console.error('Failed to delete config:', error_5);
                    statusEl = document.getElementById('globalConfigStatus');
                    if (statusEl) {
                        statusEl.textContent = "Error: ".concat(error_5.message);
                        statusEl.className = 'status error';
                    }
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// Global Configuration Card Action Functions
function activateGlobalConfig(configId) {
    return __awaiter(this, void 0, void 0, function () {
        var currentActive, confirmMessage, response, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    currentActive = state.smtpConfigs.find(function (c) { return c.scope === 'GLOBAL' && c.isActive; });
                    confirmMessage = 'Activate this global SMTP configuration?';
                    if (currentActive && currentActive.id !== configId) {
                        confirmMessage = "This will deactivate the current active configuration (".concat(currentActive.fromName || currentActive.host, ") and activate the selected one. Continue?");
                    }
                    if (!confirm(confirmMessage))
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 7, , 8]);
                    return [4 /*yield*/, api("/smtp-configs/".concat(configId, "/activate"), {
                            method: 'POST'
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.success) return [3 /*break*/, 5];
                    // Reload configs and refresh display
                    return [4 /*yield*/, loadSmtpConfigs()];
                case 3:
                    // Reload configs and refresh display
                    _a.sent();
                    return [4 /*yield*/, displayGlobalConfigs()];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    alert('Failed to activate configuration');
                    _a.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_6 = _a.sent();
                    console.error('Failed to activate global config:', error_6);
                    alert("Error: ".concat(error_6.message));
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
function editGlobalConfig(configId) {
    openGlobalConfigModal(configId);
}
function testGlobalConfigById(configId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, response, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    config = state.smtpConfigs.find(function (c) { return c.id === configId; });
                    if (!config) {
                        alert('Configuration not found');
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, api('/smtp-configs/test', {
                            method: 'POST',
                            body: JSON.stringify(config)
                        })];
                case 2:
                    response = _a.sent();
                    if (response.success) {
                        alert('Test successful! Configuration is working.');
                    }
                    else {
                        alert("Test failed: ".concat(response.message || 'Unknown error'));
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_7 = _a.sent();
                    console.error('Test failed:', error_7);
                    alert("Test failed: ".concat(error_7.message));
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function deleteGlobalConfigById(configId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, confirmMessage, otherGlobalConfigs, error_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    config = state.smtpConfigs.find(function (c) { return c.id === configId; });
                    if (!config) {
                        alert('Configuration not found');
                        return [2 /*return*/];
                    }
                    confirmMessage = 'Are you sure you want to delete this global SMTP configuration?';
                    if (config.isActive) {
                        otherGlobalConfigs = state.smtpConfigs.filter(function (c) { return c.scope === 'GLOBAL' && c.id !== configId; });
                        if (otherGlobalConfigs.length > 0) {
                            confirmMessage = "This is the ACTIVE global configuration. Deleting it will automatically activate another global configuration (".concat(otherGlobalConfigs[0].fromName || otherGlobalConfigs[0].host, "). Continue?");
                        }
                        else {
                            confirmMessage = 'This is the ACTIVE global configuration and the ONLY global configuration. Deleting it will leave no global fallback for email services. Are you absolutely sure?';
                        }
                    }
                    if (!confirm(confirmMessage))
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, api("/smtp-configs/".concat(configId), { method: 'DELETE' })];
                case 2:
                    _a.sent();
                    // Reload configs and refresh display
                    return [4 /*yield*/, loadSmtpConfigs()];
                case 3:
                    // Reload configs and refresh display
                    _a.sent();
                    return [4 /*yield*/, displayGlobalConfigs()];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    error_8 = _a.sent();
                    console.error('Failed to delete config:', error_8);
                    alert("Error: ".concat(error_8.message));
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function switchToTenantContext(tenantId, tenantName) {
    // Store tenant context
    localStorage.setItem('contextTenantId', tenantId);
    localStorage.setItem('contextTenantName', tenantName);
    roleContext.isInTenantContext = true;
    roleContext.contextTenantId = tenantId;
    roleContext.contextTenantName = tenantName;
    // Update the display
    updateContextIndicator();
    // You might want to reload configs here for tenant-specific view
    // For now, just show the context indicator
    console.log("Switched to tenant context: ".concat(tenantName, " (").concat(tenantId, ")"));
}
// Legacy functions removed - replaced with new card-based UI
// The old buildSmtpTree, selectTreeNode, etc. functions have been replaced
function selectTreeNode(scope, tenantId, appId, configId) {
    var _a;
    console.log('Selecting tree node:', scope, tenantId, appId, configId);
    selectedTreeNode = { scope: scope, tenantId: tenantId, appId: appId, configId: configId };
    // Update visual selection
    document.querySelectorAll('.tree-node').forEach(function (node) {
        node.classList.remove('selected');
    });
    // Find and select the clicked node
    var clickedElement = (_a = event === null || event === void 0 ? void 0 : event.target) === null || _a === void 0 ? void 0 : _a.closest('.tree-node');
    if (clickedElement) {
        clickedElement.classList.add('selected');
    }
    // Update hidden form fields
    var formScope = document.getElementById('formScope');
    var formTenantId = document.getElementById('formTenantId');
    var formAppId = document.getElementById('formAppId');
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
    var config = state.smtpConfigs.find(function (c) {
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
    var actionButtons = document.getElementById('configActionButtons');
    if (!actionButtons || !selectedTreeNode)
        return;
    var hasConfig = currentSmtpConfig !== null;
    var scope = selectedTreeNode.scope;
    var scopeLabel = scope === 'GLOBAL' ? 'Global' :
        scope === 'TENANT' ? 'Tenant' : 'App';
    var buttonsHtml = '';
    if (hasConfig) {
        buttonsHtml += "<button type=\"submit\" class=\"config-btn\">Update ".concat(scopeLabel, " Config</button>");
        // Add activation button for inactive global configs
        if (scope === 'GLOBAL' && currentSmtpConfig && !currentSmtpConfig.isActive) {
            buttonsHtml += "<button type=\"button\" class=\"config-btn config-btn-primary\" onclick=\"activateGlobalConfig('".concat(currentSmtpConfig.id, "')\">Activate This Config</button>");
        }
        buttonsHtml += "<button type=\"button\" class=\"config-btn config-btn-danger\" onclick=\"deleteSmtpConfig()\">Delete Config</button>";
    }
    else {
        buttonsHtml += "<button type=\"submit\" class=\"config-btn\">Create ".concat(scopeLabel, " Config</button>");
    }
    buttonsHtml += "<button type=\"button\" class=\"config-btn config-btn-secondary\" onclick=\"refreshSmtpTree()\">Refresh</button>";
    actionButtons.innerHTML = buttonsHtml;
}
function showConfigEditor() {
    var editor = document.getElementById('smtpConfigEditor');
    if (editor)
        editor.style.display = 'block';
}
function refreshSmtpTree() {
    loadAndDisplayConfigs();
}
function deleteSmtpConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var error_9;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!currentSmtpConfig) {
                        alert('No configuration selected to delete');
                        return [2 /*return*/];
                    }
                    if (!confirm('Are you sure you want to delete this SMTP configuration?'))
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, api("/smtp-configs/".concat(currentSmtpConfig.id), { method: 'DELETE' })];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, loadSmtpConfigs()];
                case 3:
                    _a.sent();
                    currentSmtpConfig = null;
                    clearForm();
                    loadAndDisplayConfigs(); // Refresh the display
                    return [3 /*break*/, 5];
                case 4:
                    error_9 = _a.sent();
                    console.error('Failed to delete config:', error_9);
                    alert('Failed to delete configuration: ' + error_9.message);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function populateFormAppSelect(selectedTenantId) {
    console.log('populateFormAppSelect called with tenantId:', selectedTenantId);
    console.log('state.apps:', state.apps);
    var formAppSelect = document.getElementById('formAppSelect');
    if (!formAppSelect) {
        console.log('formAppSelect element not found');
        return;
    }
    formAppSelect.innerHTML = '<option value="">Select App</option>';
    if (selectedTenantId && state.apps) {
        var tenantApps = state.apps.filter(function (app) { return app.tenantId === selectedTenantId; });
        console.log('Filtered apps for tenant:', tenantApps);
        tenantApps.forEach(function (app) {
            var option = document.createElement('option');
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
    var selectedTenantId = document.getElementById('smtpTenantSelect').value;
    var appSelect = document.getElementById('smtpAppSelect');
    var scope = document.getElementById('smtpScope').value;
    if (scope === 'APP' && selectedTenantId && appSelect) {
        // Load apps for selected tenant
        var tenantApps = state.apps.filter(function (app) { return app.tenantId === selectedTenantId; });
        appSelect.innerHTML = '<option value="">Select App</option>' +
            tenantApps.map(function (app) { return "<option value=\"".concat(app.id, "\">").concat(app.name, "</option>"); }).join('');
        // Auto-select current app if available
        if (appId && tenantApps.some(function (app) { return app.id === appId; })) {
            appSelect.value = appId;
        }
    }
}
function handleServiceChange() {
    var _a;
    var service = (_a = document.querySelector('select[name="service"]')) === null || _a === void 0 ? void 0 : _a.value;
    var sesSettings = document.getElementById('sesSettings');
    if (sesSettings) {
        sesSettings.style.display = service === 'ses' ? 'block' : 'none';
    }
}
function populateFormSelects() {
    // Populate tenant selects
    var tenantSelects = [
        document.getElementById('smtpTenantSelect'),
        document.getElementById('formTenantSelect')
    ];
    tenantSelects.forEach(function (select) {
        if (select) {
            select.innerHTML = '<option value="">Select Tenant</option>' +
                (state.tenants || []).map(function (t) { return "<option value=\"".concat(t.id, "\">").concat(t.name, "</option>"); }).join('');
            // Auto-select current tenant if available
            if (tenantId && (state.tenants || []).some(function (t) { return t.id === tenantId; })) {
                select.value = tenantId;
            }
        }
    });
    // Populate app selects
    var appSelects = [
        document.getElementById('smtpAppSelect'),
        document.getElementById('formAppSelect')
    ];
    appSelects.forEach(function (select) {
        if (select) {
            select.innerHTML = '<option value="">Select App</option>';
            if (tenantId) {
                var tenantApps = (state.apps || []).filter(function (app) { return app.tenantId === tenantId; });
                select.innerHTML += tenantApps.map(function (app) { return "<option value=\"".concat(app.id, "\">").concat(app.name, "</option>"); }).join('');
                // Auto-select current app if available
                if (appId && tenantApps.some(function (app) { return app.id === appId; })) {
                    select.value = appId;
                }
            }
        }
    });
}
function updateEffectiveConfigDisplay() {
    return __awaiter(this, void 0, void 0, function () {
        var effectiveConfigDiv, statusDiv, refreshBtn, scope, tenantId, appId, url, response, config, error_10;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    effectiveConfigDiv = document.getElementById('effectiveConfig');
                    statusDiv = document.getElementById('smtpContextStatus');
                    refreshBtn = document.getElementById('refreshConfigBtn');
                    if (!effectiveConfigDiv)
                        return [2 /*return*/];
                    scope = document.getElementById('smtpScope').value;
                    tenantId = document.getElementById('smtpTenantSelect').value;
                    appId = document.getElementById('smtpAppSelect').value;
                    if (!scope) {
                        effectiveConfigDiv.innerHTML = '<p class="sub">Select a scope to view effective configuration...</p>';
                        statusDiv.innerHTML = '';
                        refreshBtn.style.display = 'none';
                        return [2 /*return*/];
                    }
                    // Check if required selections are made
                    if (scope === 'TENANT' && !tenantId) {
                        effectiveConfigDiv.innerHTML = '<p class="sub">Please select a tenant to view configuration...</p>';
                        statusDiv.innerHTML = '';
                        refreshBtn.style.display = 'none';
                        return [2 /*return*/];
                    }
                    if (scope === 'APP' && (!tenantId || !appId)) {
                        effectiveConfigDiv.innerHTML = '<p class="sub">Please select both tenant and app to view configuration...</p>';
                        statusDiv.innerHTML = '';
                        refreshBtn.style.display = 'none';
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    url = '/smtp-configs/effective?scope=' + scope;
                    if (scope !== 'GLOBAL' && tenantId) {
                        url += '&tenantId=' + tenantId;
                    }
                    if (scope === 'APP' && appId) {
                        url += '&appId=' + appId;
                    }
                    return [4 /*yield*/, api(url)];
                case 2:
                    response = _a.sent();
                    config = response;
                    if (config) {
                        effectiveConfigDiv.innerHTML = "\n        <div class=\"code\" style=\"font-size:0.85rem\">\n          <div><strong>Scope:</strong> ".concat(config.scope, "</div>\n          ").concat(config.tenantId ? "<div><strong>Tenant:</strong> ".concat(config.tenantId, "</div>") : '', "\n          ").concat(config.appId ? "<div><strong>App:</strong> ".concat(config.appId, "</div>") : '', "\n          <div><strong>Provider:</strong> ").concat(config.provider || 'smtp', "</div>\n          <div><strong>Host:</strong> ").concat(config.host || 'Not configured', "</div>\n          <div><strong>Port:</strong> ").concat(config.port || 'Not configured', "</div>\n          <div><strong>From:</strong> ").concat(config.fromAddress || 'Not configured', "</div>\n          <div><strong>Created:</strong> ").concat(new Date(config.createdAt).toLocaleString(), "</div>\n        </div>\n      ");
                        statusDiv.innerHTML = '';
                    }
                    else {
                        effectiveConfigDiv.innerHTML = '<p class="sub">No configuration found for this scope.</p>';
                        statusDiv.innerHTML = '';
                    }
                    refreshBtn.style.display = 'block';
                    return [3 /*break*/, 4];
                case 3:
                    error_10 = _a.sent();
                    effectiveConfigDiv.innerHTML = '<p class="sub error">Error loading configuration</p>';
                    statusDiv.innerHTML = "<div class=\"error\">Error: ".concat(error_10.message, "</div>");
                    refreshBtn.style.display = 'none';
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function handleProviderChange() {
    var _a;
    var provider = (_a = document.querySelector('input[name="provider"]:checked')) === null || _a === void 0 ? void 0 : _a.value;
    var smtpFieldset = document.getElementById('smtp-fieldset');
    var sesFieldset = document.getElementById('ses-fieldset');
    smtpFieldset.style.display = provider === 'smtp' ? 'block' : 'none';
    sesFieldset.style.display = provider === 'ses' ? 'block' : 'none';
}
function handleConfigSubmit(e) {
    return __awaiter(this, void 0, void 0, function () {
        var form, formData, statusEl, config, submitBtn, error_11;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    form = e.target;
                    formData = new FormData(form);
                    statusEl = document.getElementById('smtpConfigStatus');
                    config = {
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
                        config.sesAccessKeyId = formData.get('sesAccessKeyId');
                        config.sesSecretAccessKey = formData.get('sesSecretAccessKey');
                        config.sesRegion = formData.get('sesRegion');
                        config.fromAddress = formData.get('fromAddress');
                        config.fromName = formData.get('fromName');
                    }
                    submitBtn = form.querySelector('button[type="submit"]');
                    submitBtn.disabled = true;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 7, 8, 9]);
                    if (!currentSmtpConfig) return [3 /*break*/, 3];
                    // Update existing config
                    return [4 /*yield*/, api("/smtp-configs/".concat(currentSmtpConfig.id), {
                            method: 'PUT',
                            body: JSON.stringify(config)
                        })];
                case 2:
                    // Update existing config
                    _a.sent();
                    showStatus(statusEl, 'Configuration updated successfully', 'success');
                    return [3 /*break*/, 5];
                case 3: 
                // Create new config
                return [4 /*yield*/, api('/smtp-configs', {
                        method: 'POST',
                        body: JSON.stringify(config)
                    })];
                case 4:
                    // Create new config
                    _a.sent();
                    showStatus(statusEl, 'Configuration created successfully', 'success');
                    _a.label = 5;
                case 5: return [4 /*yield*/, loadSmtpConfigs()];
                case 6:
                    _a.sent();
                    clearForm();
                    return [3 /*break*/, 9];
                case 7:
                    error_11 = _a.sent();
                    showStatus(statusEl, "Error: ".concat(error_11.message), 'error');
                    return [3 /*break*/, 9];
                case 8:
                    submitBtn.disabled = false;
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    });
}
function handleConfigDelete() {
    return __awaiter(this, void 0, void 0, function () {
        var statusEl, deleteBtn, error_12;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!currentSmtpConfig)
                        return [2 /*return*/];
                    if (!confirm('Are you sure you want to delete this SMTP configuration?'))
                        return [2 /*return*/];
                    statusEl = document.getElementById('config-status');
                    deleteBtn = document.getElementById('delete-config-btn');
                    deleteBtn.disabled = true;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, api("/smtp-configs/".concat(currentSmtpConfig.id), { method: 'DELETE' })];
                case 2:
                    _a.sent();
                    showStatus(statusEl, 'Configuration deleted successfully', 'success');
                    return [4 /*yield*/, loadSmtpConfigs()];
                case 3:
                    _a.sent();
                    clearForm();
                    return [3 /*break*/, 6];
                case 4:
                    error_12 = _a.sent();
                    showStatus(statusEl, "Error: ".concat(error_12.message), 'error');
                    return [3 /*break*/, 6];
                case 5:
                    deleteBtn.disabled = false;
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function handleTestConnection() {
    return __awaiter(this, void 0, void 0, function () {
        var statusEl, testBtn, scope, tenantId_1, appId_1, error_13;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    statusEl = document.getElementById('config-status');
                    testBtn = document.getElementById('test-connection-btn');
                    testBtn.disabled = true;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    scope = document.getElementById('smtp-scope').value;
                    tenantId_1 = scope !== 'GLOBAL' ? document.getElementById('smtp-tenant-id').value : undefined;
                    appId_1 = scope === 'APP' ? document.getElementById('smtp-app-id').value : undefined;
                    return [4 /*yield*/, api('/smtp-configs/test', {
                            method: 'POST',
                            body: JSON.stringify({ tenantId: tenantId_1, appId: appId_1 })
                        })];
                case 2:
                    _a.sent();
                    showStatus(statusEl, 'Connection test successful', 'success');
                    return [3 /*break*/, 5];
                case 3:
                    error_13 = _a.sent();
                    showStatus(statusEl, "Connection test failed: ".concat(error_13.message), 'error');
                    return [3 /*break*/, 5];
                case 4:
                    testBtn.disabled = false;
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function loadSmtpConfigs() {
    return __awaiter(this, void 0, void 0, function () {
        var configs, error_14;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, api('/smtp-configs')];
                case 1:
                    configs = _a.sent();
                    state.smtpConfigs = configs; // Store in state for tree building
                    displayConfigList(configs);
                    return [3 /*break*/, 3];
                case 2:
                    error_14 = _a.sent();
                    console.error('Failed to load SMTP configs:', error_14);
                    state.smtpConfigs = []; // Clear on error
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function displayConfigList(configs) {
    // No longer needed - using tree-based UI instead
    console.log('displayConfigList called with', configs.length, 'configs (tree UI is used instead)');
}
function editConfig(configId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, error_15;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Edit button clicked for config:', configId);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, api("/smtp-configs/".concat(configId))];
                case 2:
                    config = _a.sent();
                    console.log('Loaded config for editing:', config);
                    currentSmtpConfig = config;
                    populateForm(config);
                    return [3 /*break*/, 4];
                case 3:
                    error_15 = _a.sent();
                    console.error('Failed to load config:', error_15);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function deleteConfig(configId) {
    return __awaiter(this, void 0, void 0, function () {
        var error_16;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!confirm('Are you sure you want to delete this SMTP configuration?'))
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, api("/smtp-configs/".concat(configId), { method: 'DELETE' })];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, loadSmtpConfigs()];
                case 3:
                    _a.sent();
                    if ((currentSmtpConfig === null || currentSmtpConfig === void 0 ? void 0 : currentSmtpConfig.id) === configId) {
                        clearForm();
                    }
                    return [3 /*break*/, 5];
                case 4:
                    error_16 = _a.sent();
                    console.error('Failed to delete config:', error_16);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function populateForm(config) {
    // Expand the form details element so user can see the form
    var detailsElement = document.querySelector('details');
    if (detailsElement) {
        detailsElement.open = true;
    }
    // Set scope and trigger change
    var scopeSelect = document.getElementById('smtpScope');
    if (scopeSelect) {
        scopeSelect.value = config.scope;
        // Trigger scope change event
        scopeSelect.dispatchEvent(new Event('change'));
    }
    // Set tenant/app if applicable
    if (config.tenantId) {
        var tenantSelect = document.getElementById('formTenantSelect');
        if (tenantSelect) {
            tenantSelect.value = config.tenantId;
            tenantSelect.dispatchEvent(new Event('change'));
        }
    }
    if (config.appId) {
        var appSelect = document.getElementById('formAppSelect');
        if (appSelect) {
            appSelect.value = config.appId;
        }
    }
    // Set provider/service
    var serviceSelect = document.querySelector('select[name="service"]');
    if (serviceSelect) {
        serviceSelect.value = config.service || config.provider || 'smtp';
    }
    // Set SMTP fields using name attributes
    var form = document.getElementById('smtpConfigForm');
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
    var form = document.getElementById('smtpConfigForm');
    if (form) {
        form.reset();
    }
    var deleteBtn = document.getElementById('delete-config-btn');
    if (deleteBtn) {
        deleteBtn.style.display = 'none';
    }
    // handleScopeChange(); // Removed - not needed with tree-based UI
}
function loadEffectiveConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var statusEl, effectiveEl, scope, tenantId_2, appId_2, config, error_17;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    statusEl = document.getElementById('config-status');
                    effectiveEl = document.getElementById('effective-config');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    scope = document.getElementById('smtp-scope').value;
                    tenantId_2 = scope !== 'GLOBAL' ? document.getElementById('smtp-tenant-id').value : undefined;
                    appId_2 = scope === 'APP' ? document.getElementById('smtp-app-id').value : undefined;
                    return [4 /*yield*/, api('/smtp-configs/effective', {
                            method: 'POST',
                            body: JSON.stringify({ tenantId: tenantId_2, appId: appId_2 })
                        })];
                case 2:
                    config = _a.sent();
                    if (!config) {
                        effectiveEl.innerHTML = '<div class="effective-config-item">No configuration found</div>';
                        return [2 /*return*/];
                    }
                    effectiveEl.innerHTML = Object.entries(config)
                        .filter(function (_a) {
                        var key = _a[0], value = _a[1];
                        return value !== null && value !== undefined && key !== 'id';
                    })
                        .map(function (_a) {
                        var key = _a[0], value = _a[1];
                        return "\n        <div class=\"effective-config-item\">\n          <span class=\"effective-config-key\">".concat(key, ":</span>\n          <span class=\"effective-config-value\">").concat(key.includes('pass') || key.includes('secret') ? '***' : value, "</span>\n        </div>\n      ");
                    }).join('');
                    showStatus(statusEl, 'Effective configuration loaded', 'info');
                    return [3 /*break*/, 4];
                case 3:
                    error_17 = _a.sent();
                    showStatus(statusEl, "Error: ".concat(error_17.message), 'error');
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function showStatus(element, message, type) {
    if (!element) {
        console.error('showStatus called with null element, message:', message);
        return;
    }
    element.textContent = message;
    element.className = "config-status ".concat(type);
    element.style.display = 'block';
    setTimeout(function () {
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
