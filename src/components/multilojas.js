import { db } from "../db.js";
import { fmt, refreshIcons } from "../utils.js";
import { _statCard } from "./produtos.js";
import { openModal, closeModal } from "../modal.js";
import { toast } from "../toast.js";

var CONSOLE_API = "https://kontaki-console.vercel.app/api";

var _mlActiveTab = "resumo";
var _mlSelectedStoreId = "all"; // "all" ou o id (uuid) de uma loja
var _mlStoresCache = null;      // [{id, name, status, lastSeenAt, salesThisMonth}, ...]
var _mlChartInstance = null;
var _mlAuthMode = "login"; // login | register — estado do ecrã de autenticação Workspace

var TABS = [
  { key: "resumo",     label: "Resumo" },
  { key: "incidentes", label: "Incidentes" },
  { key: "escritorio", label: "Escritório" },
  { key: "registros",  label: "Registos" },
];

async function _getLicenseCode() {
  var lic = await db.get("settings", "license");
  return lic ? lic.code : null;
}

// ── AUTENTICAÇÃO WORKSPACE ───────────────────────────────────────────────
// Token único (Workspace/owner JWT) para TODO o módulo Multi-lojas —
// nunca licenseCode, em nenhuma aba. licenseCode continua a existir só
// para ativação/sync da própria loja, nunca para autenticar este módulo.

async function _getWorkspaceToken() {
  var t = await db.get("settings", "workspaceToken");
  return t && t.value ? t.value : null;
}

async function _mlAuthFetch(path, options) {
  var token = await _getWorkspaceToken();
  if (!token) {
    return { ok: false, status: 401, json: async function() { return { error: "Sessão expirada." }; } };
  }

  options = options || {};
  var headers = Object.assign({}, options.headers, { Authorization: "Bearer " + token });
  var res = await fetch(CONSOLE_API + path, Object.assign({}, options, { headers: headers }));

  if (res.status === 401) {
    // Token inválido/expirado — limpa a sessão local para forçar novo login.
    await db.put("settings", { key: "workspaceToken", value: null, owner: null });
  }

  return res;
}

window._mlLogout = async function() {
  await db.put("settings", { key: "workspaceToken", value: null, owner: null });
  loadMultilojas();
};

function _renderTabs() {
  var wrap = document.getElementById("multilojas-tabs");
  if (!wrap) return;
  wrap.innerHTML = TABS.map(function(t) {
    var active = _mlActiveTab === t.key;
    return '<button onclick="window._mlSwitchTab(\'' + t.key + '\')" style="flex:1;padding:9px 4px;border:none;border-radius:8px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;background:' + (active ? "#fff" : "transparent") + ';color:' + (active ? "#5b21b6" : "#71717a") + ';box-shadow:' + (active ? "0 1px 3px rgba(0,0,0,.08)" : "none") + '">' + t.label + '</button>';
  }).join("");
}

function _renderStoreSelector() {
  var wrap = document.getElementById("multilojas-store-selector");
  if (!wrap || !_mlStoresCache) return;

  var options = '<option value="all"' + (_mlSelectedStoreId === "all" ? ' selected' : '') + '>Todas as lojas</option>' +
    _mlStoresCache.map(function(s) {
      return '<option value="' + s.id + '"' + (_mlSelectedStoreId === s.id ? ' selected' : '') + '>' + s.name + '</option>';
    }).join("");

  wrap.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:10px 12px;margin-bottom:14px">' +
      '<i data-lucide="store" style="width:16px;height:16px;color:var(--text3);flex-shrink:0"></i>' +
      '<select onchange="window._mlSelectStore(this.value)" style="flex:1;border:none;outline:none;font-family:inherit;font-size:13px;font-weight:700;color:var(--text);background:transparent;-webkit-appearance:none;appearance:none">' +
        options +
      '</select>' +
      '<i data-lucide="chevron-down" style="width:14px;height:14px;color:var(--text4);flex-shrink:0"></i>' +
      '<button onclick="window._mlLogout()" title="Sair" style="border:none;background:none;padding:2px;cursor:pointer;flex-shrink:0;display:flex;align-items:center">' +
        '<i data-lucide="log-out" style="width:15px;height:15px;color:var(--text4)"></i>' +
      '</button>' +
    '</div>';
  refreshIcons(wrap);
}

window._mlSwitchTab = function(tab) {
  _mlActiveTab = tab;
  _renderTabs();
  _renderContent();
};

window._mlSelectStore = function(storeId) {
  _mlSelectedStoreId = storeId;
  _renderContent();
};

function _errorHtml(message) {
  return '<div class="empty-state">' +
    '<i data-lucide="wifi-off"></i>' +
    '<div class="empty-state-title">Não foi possível carregar</div>' +
    '<div class="empty-state-sub">' + message + '</div>' +
    '<button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="window._mlSwitchTab(\'' + _mlActiveTab + '\')">Tentar novamente</button>' +
  '</div>';
}

function _comingSoonHtml(label) {
  return '<div class="empty-state">' +
    '<i data-lucide="clock"></i>' +
    '<div class="empty-state-title">Em breve</div>' +
    '<div class="empty-state-sub">' + label + ' fica disponível quando os dados relevantes forem sincronizados com o Console.</div>' +
  '</div>';
}

export async function loadMultilojas() {
  var btn = document.getElementById("btn-back-multilojas");
  if (btn) btn.onclick = function() { window._showSubpage(null); };

  var token = await _getWorkspaceToken();
  if (!token) {
    _mlAuthMode = "login";
    _renderWorkspaceAuthGate();
    return;
  }

  _mlActiveTab = "resumo";
  _mlSelectedStoreId = "all";
  _renderTabs();

  await _loadStoresList();
  _renderStoreSelector();
  await _renderContent();
}

// ── AUTENTICAÇÃO — ECRÃ DE LOGIN / REGISTO / RECUPERAÇÃO ────────────────

function _renderWorkspaceAuthGate() {
  var tabsWrap = document.getElementById("multilojas-tabs");
  var selectorWrap = document.getElementById("multilojas-store-selector");
  var wrap = document.getElementById("multilojas-content");
  if (tabsWrap) tabsWrap.innerHTML = "";
  if (selectorWrap) selectorWrap.innerHTML = "";
  if (!wrap) return;

  var isLogin = _mlAuthMode === "login";

  wrap.innerHTML =
    '<div style="max-width:360px;margin:20px auto;padding:4px">' +
      '<div style="text-align:center;margin-bottom:20px">' +
        '<i data-lucide="building-2" style="width:32px;height:32px;color:var(--primary,#5b21b6);margin-bottom:8px"></i>' +
        '<div style="font-size:16px;font-weight:800;color:var(--text)">Workspace</div>' +
        '<div style="font-size:12px;color:var(--text4);margin-top:4px">' + (isLogin ? "Entra na tua conta para gerir as tuas lojas" : "Cria uma conta para gerir as tuas lojas") + '</div>' +
      '</div>' +

      (isLogin ? '' : '<div class="field" style="margin-bottom:10px"><label>Nome</label><input id="wsa-name" type="text" placeholder="O teu nome"></div>') +
      '<div class="field" style="margin-bottom:10px"><label>Email</label><input id="wsa-email" type="email" placeholder="email@exemplo.com"></div>' +
      (isLogin ? '' : '<div class="field" style="margin-bottom:10px"><label>Telefone (opcional)</label><input id="wsa-phone" type="tel" placeholder="9XX XXX XXX"></div>') +
      '<div class="field" style="margin-bottom:6px"><label>Senha</label><input id="wsa-password" type="password" placeholder="••••••••"></div>' +
      (isLogin
        ? '<div style="text-align:right;margin-bottom:14px"><button onclick="window._mlShowRecovery()" style="border:none;background:none;color:var(--primary,#5b21b6);font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;padding:0">Esqueci a senha</button></div>'
        : '<div style="margin-bottom:14px"></div>') +

      '<div id="wsa-error" style="display:none;font-size:12px;color:#dc2626;background:#fef2f2;border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:12px"></div>' +

      '<button id="wsa-submit-btn" class="btn btn-primary btn-full" onclick="window._mlSubmitAuth()">' + (isLogin ? "Entrar" : "Criar conta") + '</button>' +

      '<div style="text-align:center;margin-top:14px;font-size:12px;color:var(--text4)">' +
        (isLogin ? "Ainda não tens conta? " : "Já tens conta? ") +
        '<button onclick="window._mlToggleAuthMode()" style="border:none;background:none;color:var(--primary,#5b21b6);font-weight:700;cursor:pointer;font-family:inherit;padding:0;font-size:12px">' + (isLogin ? "Criar conta" : "Entrar") + '</button>' +
      '</div>' +
    '</div>';

  refreshIcons(wrap);
}

window._mlToggleAuthMode = function() {
  _mlAuthMode = _mlAuthMode === "login" ? "register" : "login";
  _renderWorkspaceAuthGate();
};

function _mlShowAuthError(msg) {
  var el = document.getElementById("wsa-error");
  if (el) { el.textContent = msg; el.style.display = "block"; }
}

window._mlSubmitAuth = async function() {
  var isLogin = _mlAuthMode === "login";
  var errEl = document.getElementById("wsa-error");
  if (errEl) errEl.style.display = "none";

  var email = (document.getElementById("wsa-email").value || "").trim();
  var password = document.getElementById("wsa-password").value || "";

  if (!email || !password) { return _mlShowAuthError("Preenche email e senha."); }

  var body = { email: email, password: password };
  var path = "/workspace-auth/login";

  if (!isLogin) {
    var name = (document.getElementById("wsa-name").value || "").trim();
    var phone = (document.getElementById("wsa-phone").value || "").trim();
    if (!name) return _mlShowAuthError("Preenche o teu nome.");
    if (password.length < 8) return _mlShowAuthError("A senha deve ter pelo menos 8 caracteres.");
    body.name = name;
    if (phone) body.phone = phone;
    path = "/workspace-auth/register";
  }

  var submitBtn = document.getElementById("wsa-submit-btn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "A processar…"; }

  var res, data;
  try {
    res = await fetch(CONSOLE_API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    data = await res.json();
  } catch (e) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = isLogin ? "Entrar" : "Criar conta"; }
    return _mlShowAuthError("Sem ligação à internet.");
  }

  if (!res.ok || !data || !data.success) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = isLogin ? "Entrar" : "Criar conta"; }
    return _mlShowAuthError((data && data.error) || "Erro ao processar pedido.");
  }

  await db.put("settings", { key: "workspaceToken", value: data.token, owner: data.owner, createdAt: new Date().toISOString() });

  if (!isLogin && data.recoveryCodes && data.recoveryCodes.length) {
    _mlShowRecoveryCodes(data.recoveryCodes);
    return;
  }

  toast("Sessão iniciada.", "success");
  loadMultilojas();
};

function _mlShowRecoveryCodes(codes) {
  var body =
    '<div style="font-size:12.5px;color:var(--text3);margin-bottom:14px;line-height:1.5">Guarda estes códigos num local seguro. Cada um serve para recuperar a tua senha uma única vez e não podem ser mostrados de novo.</div>' +
    '<div style="background:var(--bg,#f4f4f5);border-radius:var(--radius-sm);padding:12px;font-family:monospace;font-size:13px;line-height:2;text-align:center">' +
      codes.join("<br>") +
    '</div>' +
    '<div class="form-actions" style="margin-top:16px">' +
      '<button class="btn btn-primary btn-full" onclick="window._closeModal(); window._mlReturnAfterRegister();">Já guardei, continuar</button>' +
    '</div>';
  openModal("Códigos de recuperação", body);
}

window._mlReturnAfterRegister = function() {
  toast("Conta criada.", "success");
  loadMultilojas();
};

window._mlShowRecovery = function() {
  var body =
    '<div class="field" style="margin-bottom:10px"><label>Email</label><input id="wsr-email" type="email" placeholder="email@exemplo.com"></div>' +
    '<div class="field" style="margin-bottom:10px"><label>Código de recuperação</label><input id="wsr-code" type="text" placeholder="XXXX-XXXX" style="text-transform:uppercase"></div>' +
    '<div class="field" style="margin-bottom:6px"><label>Nova senha</label><input id="wsr-password" type="password" placeholder="Mínimo 8 caracteres"></div>' +
    '<div id="wsr-error" style="display:none;font-size:12px;color:#dc2626;background:#fef2f2;border-radius:var(--radius-sm);padding:8px 10px;margin:10px 0"></div>' +
    '<div class="form-actions" style="margin-top:10px">' +
      '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
      '<button class="btn btn-primary btn-full" onclick="window._mlSubmitRecovery()">Repor senha</button>' +
    '</div>';
  openModal("Recuperar senha", body);
};

window._mlSubmitRecovery = async function() {
  var errEl = document.getElementById("wsr-error");
  if (errEl) errEl.style.display = "none";

  var email = (document.getElementById("wsr-email").value || "").trim();
  var code = (document.getElementById("wsr-code").value || "").trim();
  var newPassword = document.getElementById("wsr-password").value || "";

  if (!email || !code || !newPassword) {
    if (errEl) { errEl.textContent = "Preenche todos os campos."; errEl.style.display = "block"; }
    return;
  }

  var res, data;
  try {
    res = await fetch(CONSOLE_API + "/workspace-auth/recover-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, code: code, newPassword: newPassword }),
    });
    data = await res.json();
  } catch (e) {
    if (errEl) { errEl.textContent = "Sem ligação à internet."; errEl.style.display = "block"; }
    return;
  }

  if (!res.ok || !data || !data.success) {
    if (errEl) { errEl.textContent = (data && data.error) || "Código ou email inválido."; errEl.style.display = "block"; }
    return;
  }

  closeModal();
  toast("Senha alterada. Entra com a nova senha.", "success");
};

async function _loadStoresList() {
  var res;
  try {
    res = await _mlAuthFetch("/reports/multi-store/stores");
  } catch (e) {
    _mlStoresCache = [];
    return;
  }
  if (res.status === 401) {
    _mlStoresCache = [];
    loadMultilojas();
    return;
  }
  if (!res.ok) { _mlStoresCache = []; return; }
  var data = await res.json();
  _mlStoresCache = (data && data.success) ? data.stores : [];
}

async function _renderContent() {
  var wrap = document.getElementById("multilojas-content");
  if (!wrap) return;

  if (_mlActiveTab === "resumo") {
    return _mlSelectedStoreId === "all" ? _renderResumoAgregado(wrap) : _renderResumoLoja(wrap, _mlSelectedStoreId);
  }
  if (_mlActiveTab === "incidentes") { return _renderIncidentes(wrap); }
  if (_mlActiveTab === "escritorio") { return _renderEscritorio(wrap); }
  if (_mlActiveTab === "registros")  { return _renderRegistos(wrap); }
}


// ── INCIDENTES — dados reais (por loja e agregados) ─────────────────────

var _mlIncFilterStatus = "open"; // open | resolved | archived | all

window._mlToggleIncident = function(cardId) {
  var body = document.getElementById(cardId);
  var chevron = document.getElementById(cardId + "-chevron");
  if (!body) return;
  var isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "block";
  if (chevron) chevron.style.transform = isOpen ? "rotate(0deg)" : "rotate(180deg)";
};

window._mlSetIncFilter = function(status) {
  _mlIncFilterStatus = status;
  _renderContent();
};

async function _fetchRealIncidents(storeId) {
  try {
    var res = await _mlAuthFetch("/reports/multi-store/store/" + encodeURIComponent(storeId));
    if (res.status === 401) { loadMultilojas(); return null; }
    if (!res.ok) return null;
    var data = await res.json();
    if (!data || !data.success || !data.incidents || !data.incidents.available) return null;
    return data.incidents.items.map(function(i) {
      return {
        productName: i.productName || (i.type === "caixa" ? "Numerário (Caixa)" : "Produto"),
        expected: i.expected,
        found: i.found,
        diff: i.diff,
        status: i.archived ? "archived" : (i.status || "open"),
        operator: "—",
        when: _relativeTime(i.createdAt),
      };
    });
  } catch (e) {
    return null;
  }
}

async function _fetchRealAllIncidents() {
  try {
    var res = await _mlAuthFetch("/reports/multi-store/incidents");
    if (res.status === 401) { loadMultilojas(); return null; }
    if (!res.ok) return null;
    var data = await res.json();
    if (!data || !data.success || !data.incidents || !data.incidents.available) return null;
    return data.incidents.items.map(function(i) {
      return {
        storeId: i.storeId,
        storeName: i.storeName,
        productName: i.productName || (i.type === "caixa" ? "Numerário (Caixa)" : "Produto"),
        expected: i.expected,
        found: i.found,
        diff: i.diff,
        status: i.archived ? "archived" : (i.status || "open"),
        operator: "—",
        when: _relativeTime(i.createdAt),
      };
    });
  } catch (e) {
    return null;
  }
}

async function _renderIncidentes(wrap) {
  wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">A carregar…</div>';

  if (!_mlStoresCache || !_mlStoresCache.length) {
    wrap.innerHTML = _errorHtml("Sem lojas para mostrar.");
    return;
  }

  var all;
  if (_mlSelectedStoreId !== "all") {
    all = await _fetchRealIncidents(_mlSelectedStoreId);
  } else {
    all = await _fetchRealAllIncidents();
  }
  if (all === null) {
    wrap.innerHTML = _errorHtml("Não foi possível carregar os incidentes.");
    return;
  }

  var openCount = all.filter(function(i) { return i.status === "open"; }).length;
  var resolvedCount = all.filter(function(i) { return i.status === "resolved"; }).length;
  var archivedCount = all.filter(function(i) { return i.status === "archived"; }).length;

  var filtered = _mlIncFilterStatus === "all" ? all : all.filter(function(i) { return i.status === _mlIncFilterStatus; });

  var statusTabs = [
    { key: "open",     label: "Abertos",    count: openCount },
    { key: "resolved", label: "Resolvidos", count: resolvedCount },
    { key: "archived", label: "Arquivados", count: archivedCount },
    { key: "all",      label: "Todos",      count: all.length },
  ];

  wrap.innerHTML =
    '<div style="margin-bottom:4px">' +
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:2px">Incidentes</div>' +
      '<div style="font-size:11px;color:var(--text4)">Reconciliação de stock, dados reais</div>' +
    '</div>' +

    '<div style="display:flex;background:var(--primary-light,#ede9fe);border-radius:var(--radius-xl);padding:3px;gap:2px;margin:14px 0 14px">' +
      statusTabs.map(function(t) {
        var active = _mlIncFilterStatus === t.key;
        return '<button onclick="window._mlSetIncFilter(\'' + t.key + '\')" style="flex:1;padding:8px 4px;border-radius:calc(var(--radius-xl) - 3px);border:none;background:' + (active ? "#fff" : "transparent") + ';color:' + (active ? "var(--primary,#5b21b6)" : "var(--text3)") + ';font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:' + (active ? "var(--shadow-sm)" : "none") + '">' + t.label + (t.count ? ' (' + t.count + ')' : '') + '</button>';
      }).join("") +
    '</div>' +

    (filtered.length ? (
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        filtered.map(function(inc, idx) {
          var isOpen = inc.status === "open";
          var diffColor = inc.diff < 0 ? "#dc2626" : "#16a34a";
          var cardId = "ml-inc-" + idx;
          return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:12px 14px">' +
            '<button onclick="window._mlToggleIncident(\'' + cardId + '\')" style="width:100%;border:none;background:none;padding:0;margin:0;font-family:inherit;text-align:left;cursor:pointer;display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">' +
              '<div style="display:flex;align-items:center;gap:7px">' +
                (isOpen ? '<span style="width:7px;height:7px;border-radius:50%;background:#dc2626;flex-shrink:0"></span>' : '') +
                '<span style="font-size:13.5px;font-weight:700;color:var(--text)">' + inc.productName + '</span>' +
              '</div>' +
              '<i data-lucide="chevron-down" id="' + cardId + '-chevron" style="width:16px;height:16px;color:var(--text4);flex-shrink:0;transition:transform .15s ease"></i>' +
            '</button>' +
            '<div style="font-size:12px;color:var(--text3);margin-bottom:4px">Diferença: <strong style="color:' + diffColor + '">' + inc.diff + ' unidades</strong></div>' +
            '<div style="font-size:11.5px;color:var(--text4);margin-bottom:6px">Esperado: ' + inc.expected + ' → Encontrado: ' + inc.found + '</div>' +
            '<div style="font-size:11px;color:var(--text4);display:flex;justify-content:space-between;align-items:center">' +
              '<span>' + (_mlSelectedStoreId === "all" && inc.storeName ? inc.storeName : "") + '</span>' +
              '<span>' + inc.when + '</span>' +
            '</div>' +
            '<div id="' + cardId + '" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid #f4f4f5;font-size:11.5px;color:var(--text3);line-height:1.6">' +
              (inc.note ? '<div>Nota: ' + inc.note + '</div>' : '') +
              (inc.createdAt ? '<div>Detetado em: ' + new Date(inc.createdAt).toLocaleString("pt-AO") + '</div>' : '') +
              (inc.resolvedAt ? '<div>Resolvido em: ' + new Date(inc.resolvedAt).toLocaleString("pt-AO") + '</div>' : '') +
              (inc.status ? '<div>Estado: ' + inc.status + '</div>' : '') +
            '</div>' +
          '</div>';
        }).join("") +
      '</div>'
    ) : '<div class="empty-state"><div class="empty-state-title">Sem incidentes nesta categoria</div></div>');

  refreshIcons(wrap);
}


// ── ESCRITÓRIO — ESTADO AO VIVO POR TURNO (protótipo, dados mocados) ────
// ATENÇÃO: operador, estado do turno e diferença de caixa são mocados.
// vendas de hoje é real (já vem de _mlStoresCache). A entidade real
// (sessions/turno) só chega na Fase 3.

var TURNO_STATUS_META = {
  aberto:     { label: "Em funcionamento", color: "#16a34a", bg: "#f0fdf4", dot: "#16a34a" },
  fechando:   { label: "Aguardando fecho", color: "#d97706", bg: "#fffbeb", dot: "#d97706" },
  incidente:  { label: "Incidente",        color: "#dc2626", bg: "#fef2f2", dot: "#dc2626" },
  fechado:    { label: "Fechado",          color: "#71717a", bg: "#f4f4f5", dot: "#a1a1aa" },
};

var MOCK_OPERATORS = ["João", "Maria", "Ana", "Pedro", "Carla"];

function _mockTurnoStatus(store) {
  var seed = (store.id || "").split("").reduce(function(a, c) { return a + c.charCodeAt(0); }, 0);
  var statusKeys = Object.keys(TURNO_STATUS_META);
  var status = statusKeys[seed % statusKeys.length];
  var operator = MOCK_OPERATORS[seed % MOCK_OPERATORS.length];
  var diffSeed = (seed % 7) - 3;
  var caixaDiff = status === "incidente" ? -(2500 + Math.abs(diffSeed) * 1500) : (diffSeed === 0 ? 0 : diffSeed * 200);

  return { status: status, operator: operator, caixaDiff: caixaDiff };
}

async function _renderEscritorio(wrap) {
  wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">A carregar…</div>';

  if (!_mlStoresCache || !_mlStoresCache.length) {
    wrap.innerHTML = _errorHtml("Sem lojas para mostrar.");
    return;
  }

  var relevantStores = _mlSelectedStoreId === "all"
    ? _mlStoresCache
    : _mlStoresCache.filter(function(s) { return s.id === _mlSelectedStoreId; });

  wrap.innerHTML =
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:2px">Escritório</div>' +
      '<div style="font-size:11px;color:var(--text4)">Protótipo — estado do turno e operador são simulados</div>' +
    '</div>' +

    '<div style="display:flex;flex-direction:column;gap:10px">' +
      relevantStores.map(function(s) {
        var t = _mockTurnoStatus(s);
        var meta = TURNO_STATUS_META[t.status];
        var diffColor = t.caixaDiff === 0 ? "var(--text3)" : (t.caixaDiff < 0 ? "#dc2626" : "#16a34a");
        var diffLabel = t.caixaDiff === 0 ? "Sem diferença" : (t.caixaDiff < 0 ? fmt(t.caixaDiff) : "+" + fmt(t.caixaDiff));

        return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
            '<span style="font-size:14px;font-weight:700;color:var(--text)">' + s.name + '</span>' +
            '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:' + meta.color + ';background:' + meta.bg + ';padding:3px 9px;border-radius:20px">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:' + meta.dot + '"></span>' + meta.label +
            '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">' +
            '<div>' +
              '<div style="font-size:10.5px;color:var(--text4);margin-bottom:2px">Caixa</div>' +
              '<div style="font-size:12.5px;font-weight:700;color:var(--text2)">' + t.operator + '</div>' +
            '</div>' +
            '<div>' +
              '<div style="font-size:10.5px;color:var(--text4);margin-bottom:2px">Vendas hoje</div>' +
              '<div style="font-size:12.5px;font-weight:700;color:var(--text2)">' + fmt(s.salesToday) + '</div>' +
            '</div>' +
            '<div>' +
              '<div style="font-size:10.5px;color:var(--text4);margin-bottom:2px">Diferença</div>' +
              '<div style="font-size:12.5px;font-weight:700;color:' + diffColor + '">' + diffLabel + '</div>' +
            '</div>' +
          '</div>' +
          '<button onclick="window._mlOpenKtkcat(\'' + s.id + '\', \'' + s.name.replace(/'/g, "\\'") + '\')" style="width:100%;margin-top:12px;padding:9px;border-radius:var(--radius-sm);border:1.5px solid var(--primary,#5b21b6);background:transparent;color:var(--primary,#5b21b6);font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">' +
            '<i data-lucide="package-plus" style="width:14px;height:14px"></i> Gerar catálogo' +
          '</button>' +
        '</div>';
      }).join("") +
    '</div>';

  refreshIcons(wrap);
}


// ── REGISTOS — AUDITORIA POR FUNCIONÁRIO (protótipo, dados mocados) ─────
// ATENÇÃO: tudo mocado. A entidade real (auditLog) já existe localmente
// no Kontaki mas ainda não é sincronizada para este ecrã (Fase 3).

// ATENÇÃO: por agora, logAudit() só é chamado em produtos.js com a ação
// "edit" — as restantes ações (create/delete/login) ainda não têm
// nenhuma chamada real no código e existem aqui para quando forem
// adicionadas.
var ACTION_META = {
  create: { label: "criou",    icon: "plus-circle",   color: "#16a34a" },
  edit:   { label: "editou",   icon: "pencil",         color: "#2563eb" },
  update: { label: "editou",   icon: "pencil",         color: "#2563eb" },
  delete: { label: "eliminou", icon: "trash-2",        color: "#dc2626" },
  login:  { label: "iniciou sessão", icon: "log-in",   color: "#71717a" },
};

// ATENÇÃO: entityType/action vêm diretamente do logAudit() do Kontaki.
// A tradução abaixo é uma primeira aproximação — ajustar os nomes se os
// valores reais gravados forem diferentes.
var ENTITY_LABELS = {
  sale: "venda", product: "produto", expense: "despesa",
  stock: "stock", customer: "cliente", session: "turno",
};

function _mlAuditDetail(a) {
  var entityLabel = ENTITY_LABELS[a.entityType] || a.entityType || "registo";
  var capitalized = entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1);
  if (a.changes && typeof a.changes === "object") {
    var fields = Object.keys(a.changes);
    if (fields.length) return capitalized + " · " + fields.join(", ");
  }
  return capitalized + (a.entityId ? " #" + a.entityId : "");
}

async function _fetchRealAuditLog() {
  try {
    var res = await _mlAuthFetch("/reports/multi-store/audit");
    if (res.status === 401) { loadMultilojas(); return null; }
    if (!res.ok) return null;
    var data = await res.json();
    if (!data || !data.success || !data.audit || !data.audit.available) return null;
    return data.audit.items.map(function(a) {
      return {
        storeId: a.storeId,
        storeName: a.storeName,
        operator: a.userName || "—",
        action: a.action,
        detail: _mlAuditDetail(a),
        when: _relativeTime(a.createdAt),
      };
    });
  } catch (e) {
    return null;
  }
}

async function _renderRegistos(wrap) {
  wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">A carregar…</div>';

  if (!_mlStoresCache || !_mlStoresCache.length) {
    wrap.innerHTML = _errorHtml("Sem lojas para mostrar.");
    return;
  }

  var allEntries = await _fetchRealAuditLog();
  if (allEntries === null) {
    wrap.innerHTML = _errorHtml("Não foi possível carregar os registos.");
    return;
  }

  var entries = _mlSelectedStoreId === "all"
    ? allEntries
    : allEntries.filter(function(e) { return e.storeId === _mlSelectedStoreId; });

  wrap.innerHTML =
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:2px">Registos</div>' +
      '<div style="font-size:11px;color:var(--text4)">Auditoria de alterações, dados reais</div>' +
    '</div>' +

    (entries.length
      ? '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);overflow:hidden">' +
        entries.map(function(e, i) {
          var meta = ACTION_META[e.action] || { label: e.action || "alterou", icon: "circle", color: "var(--text3)" };
          return '<div style="display:flex;gap:10px;padding:12px 14px;' + (i < entries.length - 1 ? 'border-bottom:1px solid #f4f4f5;' : '') + '">' +
            '<i data-lucide="' + meta.icon + '" style="width:15px;height:15px;color:' + meta.color + ';flex-shrink:0;margin-top:1px"></i>' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-size:12.5px;color:var(--text2);margin-bottom:2px">' +
                '<span style="font-weight:700;color:var(--text)">' + e.operator + '</span> ' + meta.label +
                (_mlSelectedStoreId === "all" ? ' em <span style="font-weight:600">' + e.storeName + '</span>' : '') +
              '</div>' +
              '<div style="font-size:11.5px;color:var(--text3)">' + e.detail + '</div>' +
            '</div>' +
            '<span style="font-size:10px;color:var(--text4);white-space:nowrap;flex-shrink:0">' + e.when + '</span>' +
          '</div>';
        }).join("") +
        '</div>'
      : '<div class="empty-state"><div class="empty-state-title">Sem registos</div></div>');

  refreshIcons(wrap);
}


// ── GERAÇÃO DE .ktkcat (protótipo, dados mocados) ───────────────────────
// TODO (Opção D, ADR-0010): este fluxo gera um ficheiro descarregável no
// browser do dono, mas a arquitetura validada usa o dispositivo a
// descarregar o catálogo publicado via HTTPS (syncWorkspaceCatalog →
// GET /api/sync/workspace-catalog), não um ficheiro gerado aqui. Este
// botão deve ser substituído por um link/atalho para o Workspace real
// assim que o URL do frontend do Workspace estiver definido.

function _mockCatalogChanges(storeId) {
  var seed = (storeId || "").split("").reduce(function(a, c) { return a + c.charCodeAt(0); }, 0);
  return {
    newProducts: [
      { name: "Sumo Manga 1L", price: 850 },
      { name: "Bolachas Maria 200g", price: 450 },
    ].slice(0, 1 + (seed % 2)),
    priceChanges: [
      { name: "Óleo Girassol 1L", from: 2200, to: 2450 },
      { name: "Arroz 5kg", from: 4800, to: 5100 },
    ].slice(0, 1 + (seed % 2)),
    stockCorrections: [
      { name: "Água 1.5L (pack 6)", from: 12, to: 20 },
    ],
  };
}

window._mlOpenKtkcat = function(storeId, storeName) {
  var changes = _mockCatalogChanges(storeId);
  var totalChanges = changes.newProducts.length + changes.priceChanges.length + changes.stockCorrections.length;

  var body =
    '<div style="font-size:12.5px;color:var(--text3);margin-bottom:16px;line-height:1.5">Revê as alterações antes de gerar o ficheiro para <strong>' + storeName + '</strong>. O funcionário importa este ficheiro no Kontaki — nada é aplicado automaticamente.</div>' +

    (changes.newProducts.length ? (
      '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Produtos novos (' + changes.newProducts.length + ')</div>' +
      '<div style="background:#f0fdf4;border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:14px">' +
        changes.newProducts.map(function(p) {
          return '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text2);margin-bottom:4px"><span>' + p.name + '</span><span style="font-weight:700">' + fmt(p.price) + '</span></div>';
        }).join("") +
      '</div>'
    ) : '') +

    (changes.priceChanges.length ? (
      '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Alterações de preço (' + changes.priceChanges.length + ')</div>' +
      '<div style="background:#eff6ff;border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:14px">' +
        changes.priceChanges.map(function(p) {
          return '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text2);margin-bottom:4px"><span>' + p.name + '</span><span>' + fmt(p.from) + ' → <strong>' + fmt(p.to) + '</strong></span></div>';
        }).join("") +
      '</div>'
    ) : '') +

    (changes.stockCorrections.length ? (
      '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Correções de stock (' + changes.stockCorrections.length + ')</div>' +
      '<div style="background:#fffbeb;border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:14px">' +
        changes.stockCorrections.map(function(p) {
          return '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text2);margin-bottom:4px"><span>' + p.name + '</span><span>' + p.from + ' → <strong>' + p.to + '</strong> un.</span></div>';
        }).join("") +
      '</div>'
    ) : '') +

    '<div class="field" style="margin-top:10px">' +
      '<label>Mensagem para a loja (opcional)</label>' +
      '<textarea id="ktkcat-msg" rows="2" style="width:100%;border:1.5px solid #e4e4e7;border-radius:var(--radius-sm);padding:10px 12px;font-family:inherit;font-size:13px;resize:vertical" placeholder="Ex.: Confirmar stock físico antes de aplicar."></textarea>' +
    '</div>' +

    '<div class="form-actions" style="margin-top:16px">' +
      '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
      '<button class="btn btn-primary btn-full" onclick="window._mlGenerateKtkcat(\'' + storeId + '\', \'' + storeName.replace(/'/g, "\\'") + '\')">Gerar .ktkcat (' + totalChanges + ')</button>' +
    '</div>';

  openModal("Gerar catálogo", body);
  refreshIcons(document.getElementById("modal-box") || document.body);
};

window._mlGenerateKtkcat = function(storeId, storeName) {
  var changes = _mockCatalogChanges(storeId);
  var msgEl = document.getElementById("ktkcat-msg");
  var message = msgEl ? msgEl.value.trim() : "";

  var payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    storeId: storeId,
    storeName: storeName,
    message: message || null,
    newProducts: changes.newProducts,
    priceChanges: changes.priceChanges,
    stockCorrections: changes.stockCorrections,
  };

  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var fname = "catalogo_" + storeName.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + new Date().toISOString().slice(0, 10) + ".ktkcat";

  var a = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);

  closeModal();
  toast("Catálogo gerado. Envia o ficheiro à loja para importação.", "success");
};

// ── RESUMO — TODAS AS LOJAS ────────────────────────────────────────────

async function _renderResumoAgregado(wrap) {
  wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">A carregar…</div>';

  var res;
  try {
    res = await _mlAuthFetch("/reports/multi-store/summary?days=30");
  } catch (e) {
    wrap.innerHTML = _errorHtml("Sem ligação à internet. Verifica a rede e tenta novamente.");
    return;
  }

  if (res.status === 401) { loadMultilojas(); return; }

  if (!res.ok) {
    var errData = await res.json().catch(function() { return {}; });
    wrap.innerHTML = _errorHtml(errData.error || "Erro ao carregar o resumo.");
    return;
  }

  var data = await res.json();
  if (!data || !data.success) { wrap.innerHTML = _errorHtml("Resposta inválida do servidor."); return; }

  var multiStore = data.storeCount > 1;

  wrap.innerHTML =
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:2px">Vendas agregadas</div>' +
      '<div style="font-size:12px;color:var(--text3)">' + data.storeCount + ' loja' + (data.storeCount !== 1 ? 's' : '') + ' · últimos 30 dias</div>' +
    '</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px 12px 8px;margin-bottom:20px;height:200px"><canvas id="ml-trend-canvas"></canvas></div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">' +
      _statCard({ label: "Total geral", value: fmt(data.grandTotal), sub: "últimos 30 dias", color: "var(--bg)", iconColor: "var(--text3)", icon: "banknote" }) +
      _statCard({ label: "Lojas ativas", value: data.storeCount, sub: "na empresa", color: "var(--bg)", iconColor: "var(--text3)", icon: "store" }) +
    '</div>' +

    _liveStatusHtml() +

    (multiStore ? (
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:12px">Ranking de lojas</div>' +
      '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px">' +
        data.ranking.map(function(r, i) {
          var maxTotal = data.ranking[0].total || 1;
          var pct = Math.round((r.total / maxTotal) * 100);
          return '<button onclick="window._mlSelectStore(\'' + r.id + '\')" style="width:100%;text-align:left;border:none;background:none;font-family:inherit;cursor:pointer;padding:0;margin-bottom:' + (i < data.ranking.length - 1 ? '14px' : '0') + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">' +
              '<span style="font-size:13px;font-weight:700;color:var(--text)">' + (i + 1) + '. ' + r.name + '</span>' +
              '<span style="font-size:12px;font-weight:700;color:var(--text2)">' + fmt(r.total) + '</span>' +
            '</div>' +
            '<div style="height:6px;background:#f4f4f5;border-radius:3px;overflow:hidden">' +
              '<div style="height:100%;width:' + pct + '%;background:var(--primary,#5b21b6);border-radius:3px"></div>' +
            '</div>' +
          '</button>';
        }).join("") +
      '</div>'
    ) : (
      '<div style="font-size:12px;color:var(--text4);text-align:center;padding:12px">A tua licença está associada a uma única loja. O ranking aparece quando a empresa tiver mais do que uma.</div>'
    ));

  refreshIcons(wrap);
  _renderTrendChart(data.trend.days, data.trend.values);
}

function _renderTrendChart(days, values) {
  var canvas = document.getElementById("ml-trend-canvas");
  if (!canvas || typeof Chart === "undefined") return;

  var labels = days.map(function(d) { return d.slice(5).split("-").reverse().join("/"); });
  var maxV = Math.max.apply(null, values.concat([1]));

  if (_mlChartInstance) { _mlChartInstance.destroy(); _mlChartInstance = null; }

  var ctx = canvas.getContext("2d");
  var gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, "rgba(91,33,182,0.25)");
  gradient.addColorStop(1, "rgba(91,33,182,0)");

  _mlChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        borderColor: "#5b21b6",
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: "#7c3aed",
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function(c) { return fmt(c.parsed.y); } } }
      },
      scales: {
        y: { suggestedMax: maxV * 1.2, ticks: { display: false }, grid: { display: false } },
        x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}


function _liveStatusHtml() {
  if (!_mlStoresCache || !_mlStoresCache.length) return '';

  return '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:4px">Estado ao vivo</div>' +
    '<div style="font-size:11px;color:var(--text4);margin-bottom:12px">Aproximado pela última sincronização — não é o estado real do turno</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:24px">' +
      _mlStoresCache.map(function(s, i) {
        var isRecent = s.liveStatus === 'recent';
        var dotColor = isRecent ? 'var(--success,#16a34a)' : '#d4d4d8';
        var label = isRecent ? 'Sincronizada há pouco' : 'Sem sincronizar há um tempo';
        return '<button onclick="window._mlSelectStore(\'' + s.id + '\')" style="width:100%;text-align:left;border:none;background:none;font-family:inherit;cursor:pointer;padding:0;display:flex;justify-content:space-between;align-items:center;margin-bottom:' + (i < _mlStoresCache.length - 1 ? '12px' : '0') + '">' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:' + dotColor + ';flex-shrink:0"></span>' +
            '<div>' +
              '<div style="font-size:13px;font-weight:700;color:var(--text)">' + s.name + '</div>' +
              '<div style="font-size:10.5px;color:var(--text4)">' + label + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<div style="font-size:13px;font-weight:700;color:var(--text2)">' + fmt(s.salesToday) + '</div>' +
            '<div style="font-size:10.5px;color:var(--text4)">' + s.transactionsToday + ' venda' + (s.transactionsToday !== 1 ? 's' : '') + ' hoje</div>' +
          '</div>' +
        '</button>';
      }).join("") +
    '</div>';
}

// ── RESUMO — UMA LOJA ───────────────────────────────────────────────────

// ── PAINEL DE SAÚDE (protótipo visual) ──────────────────────────────────
// ATENÇÃO: a maioria destes sinais está MOCADA para efeitos de desenho de
// interface. Só "syncRecency" usa um dado real (store.lastSeenAt). Os
// restantes (backup, stock mínimo, fiados vencidos, conflitos) dependem
// de entidades ainda não sincronizadas (Fase 3) e devem ser substituídos
// por cálculos reais antes de ir para produção.
function _mockHealthSignals(store, stock) {
  // Determinístico por loja (mesmo id → mesmo resultado), para os sinais
  // ainda mocados não "saltarem" a cada re-render.
  var seed = (store.id || "").split("").reduce(function(a, c) { return a + c.charCodeAt(0); }, 0);
  var pseudoRandom = function(offset) { return ((seed + offset) % 100) / 100; };

  var minsAgo = store.lastSeenAt ? (Date.now() - new Date(store.lastSeenAt).getTime()) / 60000 : Infinity;

  var stockAvailable = stock && stock.available;
  var lowStockCount = stockAvailable ? stock.lowStockCount : 0;
  var stockOk = stockAvailable ? lowStockCount === 0 : pseudoRandom(3) > 0.3;
  var stockDetail = stockAvailable
    ? (lowStockCount === 0 ? "Sem produtos abaixo do mínimo" : lowStockCount + " produto" + (lowStockCount !== 1 ? "s" : "") + " abaixo do stock mínimo")
    : (pseudoRandom(3) > 0.3 ? "Sem produtos abaixo do mínimo" : "2 produtos abaixo do stock mínimo");

  return [
    { key: "sync",     label: "Última sincronização",      ok: minsAgo <= 30,        detail: isFinite(minsAgo) ? _relativeTime(store.lastSeenAt) : "nunca sincronizada", real: true },
    { key: "backup",   label: "Backup atualizado",          ok: pseudoRandom(1) > 0.2, detail: pseudoRandom(1) > 0.2 ? "Backup feito há menos de 24h" : "Sem backup recente", real: false },
    { key: "conflicts",label: "Sem conflitos de dados",     ok: pseudoRandom(2) > 0.15, detail: pseudoRandom(2) > 0.15 ? "Nenhum conflito detetado" : "1 conflito de storeId por resolver", real: false },
    { key: "stock",    label: "Stock consistente",          ok: stockOk, detail: stockDetail, real: stockAvailable },
    { key: "caixa",    label: "Caixa reconciliado",         ok: pseudoRandom(4) > 0.25, detail: pseudoRandom(4) > 0.25 ? "Sem divergências no último fecho" : "Divergência de -2 500 Kz no último turno", real: false },
    { key: "fiados",   label: "Fiados em dia",              ok: pseudoRandom(5) > 0.35, detail: pseudoRandom(5) > 0.35 ? "Sem fiados vencidos" : "1 fiado vencido há mais de 30 dias", real: false },
  ];
}

function _computeHealthScore(signals) {
  var okCount = signals.filter(function(s) { return s.ok; }).length;
  return Math.round((okCount / signals.length) * 100);
}

function _healthScoreHtml(store, stock) {
  var signals = _mockHealthSignals(store, stock);
  var score = _computeHealthScore(signals);
  var scoreColor = score >= 85 ? "var(--success,#16a34a)" : score >= 60 ? "var(--warning,#d97706)" : "var(--danger,#dc2626)";

  return '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:2px">Saúde da loja</div>' +
    '<div style="font-size:11px;color:var(--text4);margin-bottom:10px">Protótipo — a maioria dos sinais ainda é simulada</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px;margin-bottom:24px">' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">' +
        '<div style="width:56px;height:56px;border-radius:50%;border:4px solid ' + scoreColor + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<span style="font-size:16px;font-weight:800;color:' + scoreColor + '">' + score + '</span>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:var(--text)">' + (score >= 85 ? "Saudável" : score >= 60 ? "Precisa de atenção" : "Requer ação") + '</div>' +
          '<div style="font-size:11px;color:var(--text4)">Pontuação de 0 a 100</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:9px">' +
        signals.map(function(s) {
          var icon = s.ok ? "check-circle-2" : "alert-triangle";
          var color = s.ok ? "var(--success,#16a34a)" : "var(--warning,#d97706)";
          return '<div style="display:flex;align-items:center;gap:8px">' +
            '<i data-lucide="' + icon + '" style="width:14px;height:14px;color:' + color + ';flex-shrink:0"></i>' +
            '<div style="flex:1;min-width:0">' +
              '<span style="font-size:12.5px;color:var(--text2)">' + s.label + '</span>' +
              '<span style="font-size:11px;color:var(--text4)"> — ' + s.detail + '</span>' +
            '</div>' +
          '</div>';
        }).join("") +
      '</div>' +
    '</div>';
}


function _relativeTime(iso) {
  var diffMs = Date.now() - new Date(iso).getTime();
  var mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return "há " + mins + " min";
  var hours = Math.floor(mins / 60);
  if (hours < 24) return "há " + hours + "h";
  var days = Math.floor(hours / 24);
  return "há " + days + " dia" + (days !== 1 ? "s" : "");
}

async function _renderResumoLoja(wrap, storeId) {
  wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">A carregar…</div>';

  var res;
  try {
    res = await _mlAuthFetch("/reports/multi-store/store/" + encodeURIComponent(storeId));
  } catch (e) {
    wrap.innerHTML = _errorHtml("Sem ligação à internet. Verifica a rede e tenta novamente.");
    return;
  }

  if (res.status === 401) { loadMultilojas(); return; }

  if (!res.ok) {
    var errData = await res.json().catch(function() { return {}; });
    wrap.innerHTML = _errorHtml(errData.error || "Erro ao carregar a loja.");
    return;
  }

  var data = await res.json();
  if (!data || !data.success) { wrap.innerHTML = _errorHtml("Resposta inválida do servidor."); return; }

  var totalVendas = data.sales.reduce(function(a, s) { return a + (s.total || 0); }, 0);

  wrap.innerHTML =
    '<div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:2px">' + data.store.name + '</div>' +
    '<div style="font-size:12px;color:var(--text4);margin-bottom:20px">' + (data.store.lastSeenAt ? _relativeTime(data.store.lastSeenAt) : "nunca sincronizada") + '</div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">' +
      _statCard({ label: "Vendas", value: fmt(totalVendas), sub: "últimos registos", color: "var(--bg)", iconColor: "var(--text3)", icon: "shopping-bag" }) +
      _statCard({ label: "Transações", value: data.sales.length, sub: "sincronizadas", color: "var(--bg)", iconColor: "var(--text3)", icon: "receipt" }) +
    '</div>' +

    _healthScoreHtml(data.store, data.stock) +

    '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">Produtos mais vendidos</div>' +
    (data.topProducts.length
      ? '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:24px">' +
        data.topProducts.slice(0, 5).map(function(p, i) {
          return '<div style="display:flex;justify-content:space-between;margin-bottom:' + (i < 4 ? '10px' : '0') + ';font-size:13px">' +
            '<span style="color:var(--text)">' + (i + 1) + '. ' + p.name + '</span>' +
            '<span style="font-weight:700;color:var(--text2)">' + fmt(p.receita) + '</span>' +
          '</div>';
        }).join("") +
        '</div>'
      : '<div style="font-size:12px;color:var(--text4);margin-bottom:24px">Sem vendas registadas ainda.</div>') +

    '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">Histórico de vendas</div>' +
    (data.sales.length
      ? '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);overflow:hidden;margin-bottom:24px">' +
        data.sales.slice(0, 20).map(function(s, i) {
          return '<div style="padding:12px 16px;' + (i < Math.min(data.sales.length, 20) - 1 ? 'border-bottom:1px solid #f4f4f5;' : '') + 'display:flex;justify-content:space-between;align-items:center">' +
            '<div>' +
              '<div style="font-size:13px;font-weight:700;color:var(--text)">' + (s.clientName || "Cliente não identificado") + '</div>' +
              '<div style="font-size:11px;color:var(--text4)">' + (s.date ? new Date(s.date).toLocaleDateString("pt-AO") : "") + ' · ' + (s.payMethod || "") + '</div>' +
            '</div>' +
            '<div style="font-size:13px;font-weight:700;color:var(--text2)">' + fmt(s.total) + '</div>' +
          '</div>';
        }).join("") +
        '</div>'
      : '<div style="font-size:12px;color:var(--text4);margin-bottom:24px">Sem vendas registadas ainda.</div>') +

    '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">Outros dados</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px;display:flex;flex-direction:column;gap:10px">' +
      _pendingRow("Produtos", data.products.available ? (data.products.count + " sincronizados") : data.products.message) +
      _pendingRow("Stock", data.stock.available ? (data.stock.lowStockCount + " abaixo do mínimo") : data.stock.message) +
      _pendingRow("Clientes", data.customers.message) +
      _pendingRow("Despesas", data.expenses.message) +
    '</div>';

  refreshIcons(wrap);
}

function _pendingRow(label, message) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px">' +
    '<span style="color:var(--text3)">' + label + '</span>' +
    '<span style="color:var(--text4);font-size:11px">' + message + '</span>' +
  '</div>';
}
