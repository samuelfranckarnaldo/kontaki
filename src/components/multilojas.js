import { db } from "../db.js";
import { fmt, refreshIcons, el } from "../utils.js";
import { _statCard, _prodAbbrevQty, _prodAbbrevUnit, categoryColor } from "./produtos.js";
import { openModal, closeModal } from "../modal.js";
import { toast } from "../toast.js";
import { openPicker } from "../picker.js";
import { canOpenWorkspace } from "../license.js";
import { CHART_OF_ACCOUNTS } from "../pgc.js";
import { kpi, skeletonKpi } from "./historico.js";
import { _fallbackCopy } from "../setup.js";

var CONSOLE_API = "https://kontaki-console.vercel.app/api";

// ── PREFERENCIAS DE UI (localStorage — nao e dado de negocio) ───────────
function _mlLoadPref(key, fallback) {
  try {
    var v = localStorage.getItem("ml_pref_" + key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function _mlSavePref(key, value) {
  try { localStorage.setItem("ml_pref_" + key, value); } catch (e) {}
}

var _mlActiveTab = "resumo";
var _mlSelectedStoreId = "all"; // "all" ou o id (uuid) de uma loja
var _mlRenderToken = 0; // incrementado a cada troca de aba/loja — protege contra race condition de fetches lentos

// ── CACHE STALE-WHILE-REVALIDATE ─────────────────────────────────────
// So dados (nunca HTML) sao cacheados, por chave "aba+loja". Usado
// apenas pelas abas classificadas como "pesadas, nao criticas ao
// segundo": Resumo, Escritorio, Registos. Incidentes/BI/Contabilidade
// fazem sempre fetch fresco (decisoes que dependem de precisao imediata).
var _ML_CACHE_TTL_MS = 45000;
var _mlCache = {}; // key -> { data, savedAt }

function _mlCacheKey(tab, storeId) {
  return tab + ":" + (storeId || "all");
}

function _mlCacheGet(key) {
  var entry = _mlCache[key];
  if (!entry) return null;
  var age = Date.now() - entry.savedAt;
  return { data: entry.data, isFresh: age < _ML_CACHE_TTL_MS };
}

function _mlCacheSet(key, data) {
  _mlCache[key] = { data: data, savedAt: Date.now() };
}

function _mlCacheClear() {
  _mlCache = {};
}
var _mlResumoSalesCache = null; // vendas da loja atual no Resumo, para o modal "Ver histórico completo"
var _mlResumoStoreName = null;
var _mlEscritorioPendingUpdate = null; // dados novos que chegaram durante uma edicao em curso, ainda nao aplicados
var _mlEscritorioPendingStoreId = null;
var _mlStoresCache = null;      // [{id, name, status, lastSeenAt, salesThisMonth}, ...]
var _mlChartInstance = null;
var _mlAuthMode = "login"; // login | register — estado do ecrã de autenticação Workspace

var _mlWorkspaceStoreId = null;
var _mlWorkspaceStoreName = null;
var _mlWorkspaceCache = null;    // { id, store_id, version, status, ... }
var _mlWorkspaceProducts = null; // [{ catalog_id, name, price, stock, category, active, ... }, ...]

var TABS = [
  { key: "resumo",        label: "Resumo" },
  { key: "bi",             label: "BI" },
  { key: "contabilidade", label: "Contabilidade" },
  { key: "escritorio",    label: "Escritório" },
  { key: "incidentes",    label: "Incidentes" },
  { key: "registros",     label: "Registos" },
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
    return '<button class="ct-tab' + (active ? " active" : "") + '" data-tab="' + t.key + '" onclick="window._mlSwitchTab(\'' + t.key + '\')">' + t.label + '</button>';
  }).join("") + '<div class="ct-tab-indicator" id="ml-tab-indicator"></div>';
  _mlSetupTabIndicator();

  var activeBtn = wrap.querySelector('.ct-tab.active');
  if (activeBtn && activeBtn.scrollIntoView) {
    activeBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }
}

function _mlSetupTabIndicator() {
  var wrap = document.getElementById("multilojas-tabs");
  var indicator = document.getElementById("ml-tab-indicator");
  if (!wrap || !indicator) return;

  var activeBtn = wrap.querySelector('.ct-tab[data-tab="' + _mlActiveTab + '"]');
  if (!activeBtn) return;

  indicator.style.width = "1px";
  indicator.style.transformOrigin = "left center";
  indicator.style.willChange = "transform";
  indicator.style.transform = "translateX(" + activeBtn.offsetLeft + "px) scaleX(" + activeBtn.offsetWidth + ")";
}

function _renderStoreSelector() {
  var wrap = document.getElementById("multilojas-store-selector");
  if (!wrap || !_mlStoresCache) return;

  if (!_mlStoresCache.length) {
    wrap.innerHTML =
      '<div style="display:flex;align-items:stretch;gap:10px;margin-bottom:16px;width:100%;box-sizing:border-box">' +
        '<button class="ml-store-select-btn" style="flex:1 1 auto;min-width:0" onclick="window._mlShowAddStore()">' +
          '<span class="ml-store-select-icon"><i data-lucide="store"></i></span>' +
          '<span class="ml-store-select-text">' +
            '<span class="ml-store-select-label" style="color:var(--text4)">Nenhuma loja ligada</span>' +
            '<span class="ml-store-select-sub">+ Adicionar</span>' +
          '</span>' +
        '</button>' +
        '<button onclick="window._mlOpenStoreMenu()" title="Mais opções" style="flex:0 0 52px;width:52px;box-sizing:border-box;background:var(--primary-light);border:1px solid var(--border2);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;cursor:pointer">' +
          '<i data-lucide="more-vertical" style="width:20px;height:20px;color:var(--primary)"></i>' +
        '</button>' +
      '</div>';
    refreshIcons(wrap);
    return;
  }

  var currentLabel = _mlSelectedStoreId === "all" ? "Todas as lojas" :
    ((_mlStoresCache.find(function(s) { return s.id === _mlSelectedStoreId; }) || {}).name || "Todas as lojas");

  var storeCountLabel = _mlStoresCache.length + (_mlStoresCache.length === 1 ? " loja ligada" : " lojas ligadas");

  wrap.innerHTML =
    '<div style="display:flex;align-items:stretch;gap:10px;margin-bottom:16px;width:100%;box-sizing:border-box">' +
      '<button class="ml-store-select-btn" style="flex:1 1 auto;min-width:0" onclick="window._mlOpenStorePicker()">' +
        '<span class="ml-store-select-icon"><i data-lucide="store"></i></span>' +
        '<span class="ml-store-select-text">' +
          '<span class="ml-store-select-label">' + currentLabel + '</span>' +
          '<span class="ml-store-select-sub">' + storeCountLabel + '</span>' +
        '</span>' +
        '<i data-lucide="chevron-down" class="ml-store-select-chevron"></i>' +
      '</button>' +
      '<button onclick="window._mlOpenStoreMenu()" title="Mais opções" style="flex:0 0 52px;width:52px;box-sizing:border-box;background:var(--primary-light);border:1px solid var(--border2);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;cursor:pointer">' +
        '<i data-lucide="more-vertical" style="width:20px;height:20px;color:var(--primary)"></i>' +
      '</button>' +
    '</div>';
  refreshIcons(wrap);
}

// Picker customizado (evita o <select> nativo, que no Android usa o
// menu suspenso do sistema com fundo escuro, destoando do resto do app).
window._mlOpenStorePicker = function() {
  var labels = ["Todas as lojas"].concat(_mlStoresCache.map(function(s) { return s.name; }));
  var current = _mlSelectedStoreId === "all" ? "Todas as lojas" :
    ((_mlStoresCache.find(function(s) { return s.id === _mlSelectedStoreId; }) || {}).name || "Todas as lojas");
  openPicker("Selecionar loja", labels, current, function(val) {
    if (val === "Todas as lojas") {
      window._mlSelectStore("all");
    } else {
      var match = _mlStoresCache.find(function(s) { return s.name === val; });
      if (match) window._mlSelectStore(match.id);
    }
  });
};

// Consolida Atualizar/Adicionar/Sair num unico botao "..." — mesmo
// padrao de "Mais opcoes" ja usado em Equipa, Fornecedores e Estoque.
window._mlOpenStoreMenu = function() {
  var items = [
    { icon: "refresh-cw", label: "Atualizar", desc: "Sincronizar dados das lojas", iconClass: "hist-export-icon--csv", action: "window._mlRefreshStores()" },
    { icon: "plus", label: "Adicionar loja", desc: "Ligar outra loja a este workspace", iconClass: "hist-export-icon--edit", action: "window._mlShowAddStore()" },
    { icon: "log-out", label: "Sair", desc: "Terminar sessão do Workspace neste dispositivo", iconClass: "hist-export-icon--cancel", action: "window._mlLogout()" },
  ];
  openModal("Mais opções",
    '<div class="hist-export-options">' +
    items.map(function(it) {
      return '<button class="hist-export-option" onclick="window._closeModal(); setTimeout(function(){ ' + it.action + '; }, 50);">' +
        '<div class="hist-export-icon ' + it.iconClass + '"><i data-lucide="' + it.icon + '"></i></div>' +
        '<div class="hist-export-info">' +
        '<div class="hist-export-title">' + it.label + '</div>' +
        '<div class="hist-export-desc">' + it.desc + '</div>' +
        '</div>' +
        '<i data-lucide="chevron-right" class="hist-export-arrow"></i>' +
        '</button>';
    }).join("") +
    '</div>'
  );
  refreshIcons(el("modal-box"));
};

window._mlSwitchTab = function(tab) {
  _mlRenderToken++;
  _mlActiveTab = tab;
  _mlSavePref("activeTab", tab);
  _renderTabs();
  _renderContent();
};

window._mlSelectStore = function(storeId) {
  _mlRenderToken++;
  _mlSelectedStoreId = storeId;
  _mlSavePref("selectedStoreId", storeId);
  _renderStoreSelector();
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

// ── ADICIONAR LOJA (pareamento loja↔Workspace) ──────────────────────────
// O dono introduz o store_id PÚBLICO mostrado no Kontaki em
// Configurações → Segurança → Workspace. Isto cria um store_link
// "pending" e envia uma mensagem bloqueante à loja — só fica "active"
// depois de a loja aceitar (link-response, do lado do dispositivo).

function _mlNoStoresHtml() {
  return '<div class="empty-state">' +
    '<i data-lucide="store"></i>' +
    '<div class="empty-state-title">Ainda sem lojas ligadas</div>' +
    '<div class="empty-state-sub">Liga a tua primeira loja usando o identificador público mostrado no dispositivo, em Configurações → Segurança → Workspace.</div>' +
    '<button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="window._mlShowAddStore()">Adicionar loja</button>' +
  '</div>';
}

window._mlShowAddStore = function() {
  var body =
    '<div style="font-size:12.5px;color:var(--text3);margin-bottom:14px;line-height:1.5">No dispositivo da loja, abre Configurações → Segurança → Workspace para veres o identificador público (ou o código QR). Introduz esse código aqui para pedir a ligação — a loja tem de aceitar antes de aparecer aqui.</div>' +
    '<div class="field" style="margin-bottom:6px"><label>Identificador da loja</label><input id="was-store-id" type="text" placeholder="Ex.: 8f3a1c2b-..."></div>' +
    '<div id="was-error" style="display:none;font-size:12px;color:#dc2626;background:#fef2f2;border-radius:var(--radius-sm);padding:8px 10px;margin:10px 0"></div>' +
    '<div class="form-actions" style="margin-top:10px">' +
      '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
      '<button id="was-submit-btn" class="btn btn-primary btn-full" onclick="window._mlSubmitAddStore()">Pedir ligação</button>' +
    '</div>';
  openModal("Adicionar loja", body);
};

window._mlSubmitAddStore = async function() {
  var errEl = document.getElementById("was-error");
  if (errEl) errEl.style.display = "none";

  var storeId = (document.getElementById("was-store-id").value || "").trim();
  if (!storeId) {
    if (errEl) { errEl.textContent = "Introduz o identificador da loja."; errEl.style.display = "block"; }
    return;
  }

  var btn = document.getElementById("was-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "A processar…"; }

  var res, data;
  try {
    res = await _mlAuthFetch("/workspace-auth/link-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storePublicId: storeId }),
    });
    data = await res.json();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Pedir ligação"; }
    if (errEl) { errEl.textContent = "Sem ligação à internet."; errEl.style.display = "block"; }
    return;
  }

  if (res.status === 401) { closeModal(); loadMultilojas(); return; }

  if (!res.ok || !data || !data.success) {
    if (btn) { btn.disabled = false; btn.textContent = "Pedir ligação"; }
    if (errEl) { errEl.textContent = (data && data.error) || "Erro ao pedir ligação."; errEl.style.display = "block"; }
    return;
  }

  closeModal();
  toast('Pedido enviado para "' + data.storeName + '". Aceita a ligação no dispositivo da loja.', "success");
};

export async function loadMultilojas() {
  var btn = document.getElementById("btn-back-multilojas");
  if (btn) btn.onclick = function() { window._showSubpage(null); };

  // Gate por licença — Multilojas/Workspace é feature Pro (ver license.js canOpenWorkspace)
  if (!canOpenWorkspace()) {
    var wrap0 = document.getElementById("multilojas-content");
    var tabsWrap0 = document.getElementById("multilojas-tabs");
    var selectorWrap0 = document.getElementById("multilojas-store-selector");
    if (tabsWrap0) tabsWrap0.innerHTML = "";
    if (selectorWrap0) selectorWrap0.innerHTML = "";
    if (wrap0) {
      wrap0.innerHTML =
        '<div style="text-align:center;padding:48px 20px;color:#a1a1aa">' +
        '<div style="font-size:14px;font-weight:600">Funcionalidade Pro</div>' +
        '<div style="font-size:13px;margin-top:6px">O Multilojas está disponível apenas no plano Pro.</div>' +
        '</div>';
    }
    return;
  }

  var token = await _getWorkspaceToken();
  if (!token) {
    _mlAuthMode = "login";
    _renderWorkspaceAuthGate();
    return;
  }

  _mlActiveTab = _mlLoadPref("activeTab", "resumo");
  _mlSelectedStoreId = _mlLoadPref("selectedStoreId", "all");
  _renderTabs();

  var selectorWrapInit = document.getElementById("multilojas-store-selector");
  if (selectorWrapInit && !_mlCacheGet(_mlCacheKey("stores", "global"))) {
    selectorWrapInit.innerHTML =
      '<div style="display:flex;align-items:stretch;gap:10px;margin-bottom:16px;width:100%;box-sizing:border-box">' +
        '<div class="skel-line hist-skel" style="flex:1 1 auto;min-width:0;height:60px;border-radius:var(--radius-lg)"></div>' +
        '<div class="skel-line hist-skel" style="flex:0 0 52px;width:52px;height:60px;border-radius:var(--radius-lg)"></div>' +
      '</div>';
  }

  await _loadStoresList();
  _renderStoreSelector();
  await _renderContent();
}

// ── AUTENTICAÇÃO — ECRÃ DE LOGIN / REGISTO / RECUPERAÇÃO ────────────────

function _mlAuthFeatureRow(label) {
  return '<div class="ws-auth-feature">' +
    '<i data-lucide="check-circle-2"></i>' +
    '<span>' + label + '</span>' +
  '</div>';
}

function _renderWorkspaceAuthGate() {
  var tabsWrap = document.getElementById("multilojas-tabs");
  var selectorWrap = document.getElementById("multilojas-store-selector");
  var wrap = document.getElementById("multilojas-content");
  if (tabsWrap) tabsWrap.innerHTML = "";
  if (selectorWrap) selectorWrap.innerHTML = "";
  if (!wrap) return;

  var isLogin = _mlAuthMode === "login";

  wrap.innerHTML =
    '<div class="ws-auth-wrap"><div class="ws-auth-card">' +
      '<div class="ws-auth-header">' +
        '<div class="ws-auth-subtitle">Gere todas as tuas lojas a partir de uma única conta.</div>' +
      '</div>' +

      '<div class="ws-auth-features">' +
        _mlAuthFeatureRow("Várias lojas num único lugar") +
        _mlAuthFeatureRow("Equipa e permissões partilhadas") +
        _mlAuthFeatureRow("Sincronização e backup automático") +
      '</div>' +

      '<div class="ws-auth-form">' +
      (isLogin ? '' : '<div class="field"><label>Nome</label><input id="wsa-name" type="text" placeholder="O teu nome"></div>') +
      '<div class="field"><label>Email</label><input id="wsa-email" type="email" placeholder="email@exemplo.com"></div>' +
      (isLogin ? '' : '<div class="field"><label>Telefone (opcional)</label><input id="wsa-phone" type="tel" placeholder="9XX XXX XXX"></div>') +
      '<div class="field"><label>Senha</label><div class="pin-input-wrap"><input id="wsa-password" type="password" placeholder="••••••••" style="padding-right:42px"/>' +
      '<button type="button" class="pin-eye-btn" onclick="window._mlTogglePw(this,\'wsa-password\')"><i data-lucide="eye"></i></button></div></div>' +
      '<div class="ws-auth-forgot">' + (isLogin ? '<button onclick="window._mlShowRecovery()">Esqueci a senha</button>' : '') + '</div>' +

      '<div id="wsa-error" class="ws-auth-error"></div>' +

      '<button id="wsa-submit-btn" class="btn btn-primary btn-full" onclick="window._mlSubmitAuth()">' + (isLogin ? "Entrar" : "Criar conta") + '</button>' +

      '<div class="ws-auth-divider"><div class="ws-auth-divider-line"></div><span class="ws-auth-divider-label">ou</span><div class="ws-auth-divider-line"></div></div>' +

      '<button class="btn btn-outline btn-full" onclick="window._mlToggleAuthMode()">' + (isLogin ? "Criar conta" : "Já tenho conta — Entrar") + '</button>' +
      '</div>' +
    '</div></div>';

  refreshIcons(wrap);
}

window._mlTogglePw = function(btn, inputId) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  btn.innerHTML = '<i data-lucide="' + (isHidden?"eye-off":"eye") + '"></i>';
  refreshIcons(btn.parentElement);
};

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
  window._mlRecoveryCodesCache = codes;
  var body =
    '<div style="font-size:12.5px;color:var(--text3);margin-bottom:14px;line-height:1.5">Guarda estes códigos num local seguro. Cada um serve para recuperar a tua senha uma única vez e não podem ser mostrados de novo.</div>' +
    '<div style="background:var(--bg,#f4f4f5);border-radius:var(--radius-sm);padding:12px;font-family:monospace;font-size:13px;line-height:2;text-align:center">' +
      codes.join("<br>") +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button class="btn btn-ghost" style="flex:1;padding:11px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px" onclick="window._mlCopyRecoveryCodes()">' +
        '<i data-lucide="copy" style="width:14px;height:14px"></i> Copiar' +
      '</button>' +
      '<button class="btn btn-ghost" style="flex:1;padding:11px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px" onclick="window._mlDownloadRecoveryCodes()">' +
        '<i data-lucide="download" style="width:14px;height:14px"></i> Baixar' +
      '</button>' +
    '</div>' +
    '<div class="form-actions" style="margin-top:16px">' +
      '<button class="btn btn-primary btn-full" onclick="window._closeModal(); window._mlReturnAfterRegister();">Já guardei, continuar</button>' +
    '</div>';
  openModal("Códigos de recuperação", body);
  refreshIcons(document.getElementById("modal-box") || document.body);
}

window._mlCopyRecoveryCodes = function() {
  var codes = window._mlRecoveryCodesCache || [];
  var text = codes.join("\n");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(function() { toast("Códigos copiados.", "success"); })
      .catch(function() { _fallbackCopy(text); });
  } else {
    _fallbackCopy(text);
  }
};

window._mlDownloadRecoveryCodes = function() {
  var codes = window._mlRecoveryCodesCache || [];
  var now = new Date();
  var dataCriacao = now.toLocaleDateString("pt-AO", { day: "2-digit", month: "2-digit", year: "numeric" });
  var isoDate = now.toISOString().slice(0, 10);
  var conteudo =
    "KONTAKI — CÓDIGOS DE RECUPERAÇÃO (WORKSPACE)\n" +
    "Data de criação: " + dataCriacao + "\n" +
    "Cada código só pode ser usado uma vez. Guarda este ficheiro num local seguro.\n" +
    "\n" +
    codes.join("\n") + "\n";
  var blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "Kontaki-workspace-recovery-" + isoDate + ".txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Ficheiro descarregado.", "success");
};

window._mlReturnAfterRegister = function() {
  toast("Conta criada.", "success");
  loadMultilojas();
};

window._mlShowRecovery = function() {
  var body =
    '<div class="field" style="margin-bottom:10px"><label>Email</label><input id="wsr-email" type="email" placeholder="email@exemplo.com"></div>' +
    '<div class="field" style="margin-bottom:10px"><label>Código de recuperação</label><input id="wsr-code" type="text" placeholder="XXXX-XXXX" style="text-transform:uppercase"></div>' +
    '<div class="field" style="margin-bottom:6px"><label>Nova senha</label><div class="pin-input-wrap"><input id="wsr-password" type="password" placeholder="Mínimo 8 caracteres" style="padding-right:42px"/>' +
    '<button type="button" class="pin-eye-btn" onclick="window._mlTogglePw(this,\'wsr-password\')"><i data-lucide="eye"></i></button></div></div>' +
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

window._mlRefreshStores = async function() {
  var refreshBtn = document.getElementById("ml-refresh-btn");
  var icon = refreshBtn ? refreshBtn.querySelector("i") : null;
  if (icon) icon.style.animation = "spin 0.6s linear infinite";

  await _loadStoresList();
  _renderStoreSelector();
  await _renderContent();

  if (icon) icon.style.animation = "";
};

async function _mlFetchStoresList() {
  var res;
  try {
    res = await _mlAuthFetch("/reports/multi-store/stores");
  } catch (e) {
    return null;
  }
  if (res.status === 401) { loadMultilojas(); return null; }
  if (!res.ok) return null;
  var data = await res.json();
  return (data && data.success) ? data.stores : null;
}

function _mlRefreshStoresListInBackground() {
  _mlFetchStoresList().then(function(stores) {
    if (stores === null) return; // falha — mantem o que ja esta
    var changed = JSON.stringify(stores) !== JSON.stringify(_mlStoresCache);
    _mlStoresCache = stores;
    _mlCacheSet(_mlCacheKey("stores", "global"), stores);
    if (changed) {
      _renderStoreSelector();
      _renderContent();
    }
  });
}

async function _loadStoresList() {
  var cacheKey = _mlCacheKey("stores", "global");
  var cached = _mlCacheGet(cacheKey);

  if (cached) {
    _mlStoresCache = cached.data;
    if (!cached.isFresh) _mlRefreshStoresListInBackground();
    return;
  }

  var stores = await _mlFetchStoresList();
  _mlStoresCache = stores;
  if (stores !== null) _mlCacheSet(cacheKey, stores);
}

window._mlRetryLoadStores = async function() {
  var wrap = document.getElementById("multilojas-content");
  if (wrap) wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">A carregar…</div>';
  await _loadStoresList();
  _renderStoreSelector();
  await _renderContent();
};

async function _renderContent() {
  var wrap = document.getElementById("multilojas-content");
  if (!wrap) return;

  if (_mlStoresCache === null) {
    wrap.innerHTML =
      '<div class="empty-state">' +
        '<i data-lucide="wifi-off"></i>' +
        '<div class="empty-state-title">Sem ligação</div>' +
        '<div class="empty-state-sub">Não foi possível verificar as tuas lojas. Confirma a conexão à internet e tenta novamente.</div>' +
        '<button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="window._mlRetryLoadStores()">Tentar novamente</button>' +
      '</div>';
    refreshIcons(wrap);
    return;
  }

  if (!_mlStoresCache.length) {
    wrap.innerHTML = _mlNoStoresHtml();
    refreshIcons(wrap);
    return;
  }

  if (_mlSelectedStoreId !== "all" && !_mlStoresCache.some(function(s) { return s.id === _mlSelectedStoreId; })) {
    _mlSelectedStoreId = "all";
    _mlSavePref("selectedStoreId", "all");
    _renderStoreSelector();
  }

  if (_mlActiveTab === "resumo") {
    return _mlSelectedStoreId === "all" ? _renderResumoAgregado(wrap) : _renderResumoLoja(wrap, _mlSelectedStoreId);
  }
  if (_mlActiveTab === "incidentes") { return _renderIncidentes(wrap); }
  if (_mlActiveTab === "escritorio") { return _renderEscritorio(wrap); }
  if (_mlActiveTab === "registros")  { return _renderRegistos(wrap); }
  if (_mlActiveTab === "bi")         { return _renderBI(wrap); }
  if (_mlActiveTab === "contabilidade") { return _renderContabilidade(wrap); }
}

function _accountName(code) {
  var acc = CHART_OF_ACCOUNTS.find(function(c) { return c.code === code; });
  return acc ? acc.name : ("Conta " + code);
}

async function _renderContabilidade(wrap) {
  if (_mlSelectedStoreId === "all") {
    wrap.innerHTML =
      '<div class="empty-state">' +
        '<i data-lucide="landmark"></i>' +
        '<div class="empty-state-title">Escolhe uma loja</div>' +
        '<div class="empty-state-sub">A contabilidade é vista uma loja de cada vez. Seleciona uma loja no topo para continuar.</div>' +
      '</div>';
    refreshIcons(wrap);
    return;
  }

  var store = (_mlStoresCache || []).find(function(s) { return s.id === _mlSelectedStoreId; });
  if (!store) {
    wrap.innerHTML = _errorHtml("Sem lojas para mostrar.");
    return;
  }

  function skeletonContaRow() {
    return '<div class="hist-mov-item hist-mov-item--compact hist-skel" style="border-left:3px solid var(--border)">' +
      '<div class="skel-circle" style="width:40px;height:40px;margin-right:0"></div>' +
      '<div style="flex:1;min-width:0;padding-left:12px">' +
        '<div class="skel-line skel-line--title" style="width:55%"></div>' +
        '<div class="skel-line skel-line--sub" style="width:30%"></div>' +
      '</div>' +
      '<div class="skel-line skel-line--price"></div>' +
    '</div>';
  }

  wrap.innerHTML =
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center" class="hist-skel">' +
      '<div style="flex:1">' +
        '<div class="skel-line skel-line--label"></div>' +
        '<div class="skel-line skel-line--title" style="width:40%;margin-top:6px"></div>' +
      '</div>' +
    '</div>' +
    '<div class="hist-stats-grid" style="margin-bottom:18px">' +
      skeletonKpi() + skeletonKpi() + skeletonKpi() + skeletonKpi() +
    '</div>' +
    '<div class="hist-mov-card">' +
      skeletonContaRow() + skeletonContaRow() + skeletonContaRow() + skeletonContaRow() +
    '</div>';

  var res, data, balRes, balData;
  try {
    res = await _mlAuthFetch("/reports/multi-store/store/" + encodeURIComponent(store.id) + "/accounting");
    data = await res.json();
    balRes = await _mlAuthFetch("/reports/multi-store/store/" + encodeURIComponent(store.id));
    balData = await balRes.json();
  } catch (e) {
    wrap.innerHTML = _errorHtml("Sem ligação à internet.");
    return;
  }
  if (res.status === 401) { loadMultilojas(); return; }
  if (!res.ok || !data || !data.success) {
    wrap.innerHTML = _errorHtml((data && data.error) || "Erro ao carregar contabilidade.");
    return;
  }

  var acc = data.accounting;
  var balances = (balRes.ok && balData && balData.success && balData.balances) ? balData.balances : { cash: null, bank: null };

  if (!acc.available) {
    wrap.innerHTML =
      '<div class="empty-state">' +
        '<i data-lucide="landmark"></i>' +
        '<div class="empty-state-title">Sem dados ainda</div>' +
        '<div class="empty-state-sub">' + acc.message + ' (' + acc.period + ').</div>' +
      '</div>';
    refreshIcons(wrap);
    return;
  }

  var breakdown = acc.breakdown || {};
  var receitaCodes = Object.keys(breakdown).filter(function(code) {
    var a = CHART_OF_ACCOUNTS.find(function(c) { return c.code === code; });
    return a && a.tipo === "proveito" && breakdown[code];
  }).sort(function(a, b) { return breakdown[b] - breakdown[a]; });
  var custoCodes = Object.keys(breakdown).filter(function(code) {
    var a = CHART_OF_ACCOUNTS.find(function(c) { return c.code === code; });
    return a && a.tipo === "custo" && breakdown[code];
  }).sort(function(a, b) { return breakdown[b] - breakdown[a]; });

  function contaEmptyRow(msg) {
    return '<div style="padding:16px;text-align:center;font-size:12px;color:var(--text4)">' + msg + '</div>';
  }

  function contaItemHtml(code, tone) {
    var color = tone === "receita" ? "var(--success)" : "var(--danger)";
    var icon = tone === "receita" ? "trending-up" : "trending-down";
    return '<div class="hist-mov-item hist-mov-item--compact" style="border-left:3px solid ' + color + '">' +
      '<div class="hist-mov-icon" style="background:' + color + '1a;color:' + color + '"><i data-lucide="' + icon + '" style="width:18px;height:18px"></i></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="hist-mov-name">' + _accountName(code) + '</div>' +
        '<div class="hist-mov-meta">Conta ' + code + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
        '<div class="hist-mov-qty" style="color:' + color + '">' + fmt(breakdown[code]) + '</div>' +
      '</div>' +
    '</div>';
  }

  var resultadoColor = acc.resultadoLiquido >= 0 ? "var(--success)" : "var(--danger)";

  var statusMeta = acc.closed
    ? { label: "Fechado", color: "var(--text3)", bg: "var(--bg,#f4f4f5)" }
    : { label: "Em curso", color: "var(--primary,#5b21b6)", bg: "var(--primary-light,#ede9fe)" };

  wrap.innerHTML =
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">' +
      '<div>' +
        '<div style="font-size:10.5px;font-weight:700;color:var(--primary,#5b21b6);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Contabilidade</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--text2)">Período ' + acc.period + '</div>' +
      '</div>' +
      '<span style="font-size:11px;font-weight:700;color:' + statusMeta.color + ';background:' + statusMeta.bg + ';padding:4px 10px;border-radius:20px">' + statusMeta.label + '</span>' +
    '</div>' +
    '<div class="hist-stats-grid" style="margin-bottom:18px">' +
      kpi("Receita", fmt(acc.totalReceita), "var(--success)", "", null) +
      kpi("Custos", fmt(acc.totalCustos), "var(--danger)", "", null) +
      kpi("Resultado", fmt(acc.resultadoLiquido), resultadoColor, "líquido", acc.resultadoLiquido < 0 ? "hist-kpi--danger" : null) +
      kpi("Contas", receitaCodes.length + custoCodes.length, "var(--info)", "movimentadas", null) +
    '</div>' +
    ((balances.cash !== null || balances.bank !== null) ?
    ('<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">Posição de caixa</div>' +
     '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px;margin-bottom:18px">' +
       '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">' +
         '<div>' +
           '<div style="font-size:10.5px;color:var(--text4);margin-bottom:2px">Caixa</div>' +
           '<div style="font-size:18px;font-weight:800;color:var(--text)">' + (balances.cash !== null ? fmt(balances.cash) : "—") + '</div>' +
         '</div>' +
         '<div>' +
           '<div style="font-size:10.5px;color:var(--text4);margin-bottom:2px">Banco</div>' +
           '<div style="font-size:18px;font-weight:800;color:var(--text)">' + (balances.bank !== null ? fmt(balances.bank) : "—") + '</div>' +
         '</div>' +
       '</div>' +
       '<div style="font-size:11px;color:var(--text4)">Total combinado: ' + fmt((balances.cash||0) + (balances.bank||0)) + '</div>' +
     '</div>') : '') +
    '<div class="hist-mov-card">' +
      '<div class="hist-day-label--inset"><i data-lucide="trending-up" style="width:13px;height:13px"></i>Receita por conta' + (receitaCodes.length ? ' (' + receitaCodes.length + ')' : '') + '</div>' +
      (receitaCodes.length
        ? receitaCodes.map(function(c) { return contaItemHtml(c, "receita"); }).join("")
        : contaEmptyRow("Sem receita neste período")) +
      '<div class="hist-day-label--inset"><i data-lucide="trending-down" style="width:13px;height:13px"></i>Custos por conta' + (custoCodes.length ? ' (' + custoCodes.length + ')' : '') + '</div>' +
      (custoCodes.length
        ? custoCodes.map(function(c) { return contaItemHtml(c, "custo"); }).join("")
        : contaEmptyRow("Sem custos neste período")) +
    '</div>';

  refreshIcons(wrap);
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
        note: i.note,
        createdAt: i.createdAt,
        resolvedAt: i.resolvedAt,
        sessionUserName: i.sessionUserName,
        responsibleUserName: i.responsibleUserName,
        responsibleClosedAt: i.responsibleClosedAt,
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
        note: i.note,
        createdAt: i.createdAt,
        resolvedAt: i.resolvedAt,
        sessionUserName: i.sessionUserName,
        responsibleUserName: i.responsibleUserName,
        responsibleClosedAt: i.responsibleClosedAt,
        when: _relativeTime(i.createdAt),
      };
    });
  } catch (e) {
    return null;
  }
}

async function _renderIncidentes(wrap) {
  var _token = _mlRenderToken;
  wrap.innerHTML =
    '<div style="display:flex;gap:6px;margin-bottom:16px">' +
      '<div class="skel-line hist-skel" style="height:28px;border-radius:999px;flex:1"></div>' +
      '<div class="skel-line hist-skel" style="height:28px;border-radius:999px;flex:1"></div>' +
      '<div class="skel-line hist-skel" style="height:28px;border-radius:999px;flex:1"></div>' +
      '<div class="skel-line hist-skel" style="height:28px;border-radius:999px;flex:1"></div>' +
    '</div>' +
    '<div class="hist-mov-card">' +
      '<div class="hist-mov-item hist-mov-item--compact hist-skel">' +
        '<div class="skel-circle" style="width:40px;height:40px;margin-right:0"></div>' +
        '<div style="flex:1;min-width:0;padding-left:12px">' +
          '<div class="skel-line skel-line--title" style="width:55%;margin-bottom:6px"></div>' +
          '<div class="skel-line skel-line--sub" style="width:70%"></div>' +
        '</div>' +
      '</div>' +
      '<div class="hist-mov-item hist-mov-item--compact hist-skel">' +
        '<div class="skel-circle" style="width:40px;height:40px;margin-right:0"></div>' +
        '<div style="flex:1;min-width:0;padding-left:12px">' +
          '<div class="skel-line skel-line--title" style="width:45%;margin-bottom:6px"></div>' +
          '<div class="skel-line skel-line--sub" style="width:60%"></div>' +
        '</div>' +
      '</div>' +
      '<div class="hist-mov-item hist-mov-item--compact hist-skel">' +
        '<div class="skel-circle" style="width:40px;height:40px;margin-right:0"></div>' +
        '<div style="flex:1;min-width:0;padding-left:12px">' +
          '<div class="skel-line skel-line--title" style="width:60%;margin-bottom:6px"></div>' +
          '<div class="skel-line skel-line--sub" style="width:40%"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  await _mlMinDelay(280);
  if (_token !== _mlRenderToken) return;

  if (!_mlStoresCache || !_mlStoresCache.length) {
    if (_token !== _mlRenderToken) return;
    wrap.innerHTML = _errorHtml("Sem lojas para mostrar.");
    return;
  }

  var all;
  if (_mlSelectedStoreId !== "all") {
    all = await _fetchRealIncidents(_mlSelectedStoreId);
  } else {
    all = await _fetchRealAllIncidents();
  }
  if (_token !== _mlRenderToken) return;
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
    '<div style="display:flex;background:var(--primary-light,#ede9fe);border-radius:var(--radius-xl);padding:3px;gap:2px;margin-bottom:14px">' +
      statusTabs.map(function(t) {
        var active = _mlIncFilterStatus === t.key;
        return '<button onclick="window._mlSetIncFilter(\'' + t.key + '\')" style="flex:1;padding:8px 4px;border-radius:calc(var(--radius-xl) - 3px);border:none;background:' + (active ? "#fff" : "transparent") + ';color:' + (active ? "var(--primary,#5b21b6)" : "var(--text3)") + ';font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:' + (active ? "var(--shadow-sm)" : "none") + '">' + t.label + (t.count ? ' (' + t.count + ')' : '') + '</button>';
      }).join("") +
    '</div>' +

    (filtered.length ? (
      '<div class="hist-mov-card">' +
        filtered.map(function(inc, idx) {
          var isOpen = inc.status === "open";
          var diffColor = inc.diff < 0 ? "#dc2626" : "#16a34a";
          var cardId = "ml-inc-" + idx;
          return '<div>' +
            '<button onclick="window._mlToggleIncident(\'' + cardId + '\')" class="hist-mov-item hist-mov-item--compact" style="width:100%;border:none;background:none;padding-right:14px;font-family:inherit;text-align:left;cursor:pointer;' + (isOpen ? 'border-left:3px solid #dc2626' : '') + '">' +
              '<div class="hist-mov-icon" style="background:' + (isOpen ? '#fee2e2' : 'var(--border2)') + ';color:' + (isOpen ? '#dc2626' : 'var(--text4)') + '"><i data-lucide="package" style="width:18px;height:18px"></i></div>' +
              '<div style="flex:1;min-width:0">' +
                '<div class="hist-mov-name">' + inc.productName + '</div>' +
                '<div class="hist-mov-meta">Diferença: <strong style="color:' + diffColor + '">' + inc.diff + ' un.</strong> · Esperado ' + inc.expected + ' → Encontrado ' + inc.found + '</div>' +
                '<div class="hist-mov-meta">' + (_mlSelectedStoreId === "all" && inc.storeName ? inc.storeName + ' · ' : '') + inc.when + '</div>' +
              '</div>' +
              '<i data-lucide="chevron-down" id="' + cardId + '-chevron" style="width:16px;height:16px;color:var(--text4);flex-shrink:0;transition:transform .15s ease"></i>' +
            '</button>' +
            '<div id="' + cardId + '" style="display:none;padding:0 14px 12px 66px;font-size:11.5px;color:var(--text3);line-height:1.6">' +
              (inc.responsibleUserName
                ? '<div>Detetado no turno de <strong>' + (inc.sessionUserName || "?") + '</strong> — responsabilidade do turno anterior: <strong>' + inc.responsibleUserName + '</strong>' + (inc.responsibleClosedAt ? ' (fechou ' + new Date(inc.responsibleClosedAt).toLocaleString("pt-AO") + ')' : '') + '</div>'
                : (inc.sessionUserName ? '<div>Turno: <strong>' + inc.sessionUserName + '</strong></div>' : '')) +
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


// ── ESCRITÓRIO — turno, Espelho e Workspace (dados reais) ──────────────

var _mlEspelhoProducts = null;
var _mlEscritorioSession = null;
var _mlEscritorioStoreId = null;
var _mlEscritorioView = "turno"; // turno | produtos | catalogo
var _mlWorkspaceSubView = "list";
var _mlWorkspaceEditingCatalogId = null;
var _mlWorkspaceLastExport = null;
var _mlWorkspaceDiffData = null;
var _mlWorkspaceDiffError = null;

function _mlApplyEscritorioData(store, d) {
  _mlEspelhoProducts = (d.storeData.products && d.storeData.products.items) || [];
  _mlEscritorioSession = d.storeData.session || { available: false, message: "Sem sessões sincronizadas ainda" };
  _mlEscritorioBalances = d.storeData.balances || { cash: null, bank: null };
  _mlWorkspaceStoreId = store.id;
  _mlWorkspaceStoreName = store.name;
  _mlEscritorioView = "turno";
  _mlWorkspaceSubView = "list";
  _mlWorkspaceEditingCatalogId = null;
  _mlEscritorioStoreId = store.id;
  if (!d.wsData.hasWorkspace) {
    _mlWorkspaceCache = null;
    _mlWorkspaceProducts = null;
    _mlWorkspaceLastExport = d.wsData.lastExport || null;
  } else {
    _mlWorkspaceCache = d.wsData.workspace;
    _mlWorkspaceProducts = d.wsData.products || [];
  }
  _mlInventarioReports = d.invData;
}

window._mlApplyPendingEscritorioUpdate = function() {
  if (!_mlEscritorioPendingUpdate) return;
  var store = (_mlStoresCache || []).find(function(s) { return s.id === _mlEscritorioPendingStoreId; });
  if (!store) { _mlEscritorioPendingUpdate = null; _mlEscritorioPendingStoreId = null; return; }
  var cacheKey = _mlCacheKey("escritorio", store.id);
  _mlCacheSet(cacheKey, _mlEscritorioPendingUpdate);
  _mlApplyEscritorioData(store, _mlEscritorioPendingUpdate);
  _mlEscritorioPendingUpdate = null;
  _mlEscritorioPendingStoreId = null;
  var wrap = document.getElementById("multilojas-content");
  if (wrap) _mlRenderEscritorioContent(wrap, store);
};

async function _renderEscritorio(wrap) {
  var _token = _mlRenderToken;

  if (_mlSelectedStoreId === "all") {
    wrap.innerHTML =
      '<div class="empty-state">' +
        '<i data-lucide="store"></i>' +
        '<div class="empty-state-title">Escolhe uma loja</div>' +
        '<div class="empty-state-sub">O Escritório edita o catálogo de uma loja de cada vez. Seleciona uma loja no topo para continuar.</div>' +
      '</div>';
    refreshIcons(wrap);
    return;
  }

  var store = (_mlStoresCache || []).find(function(s) { return s.id === _mlSelectedStoreId; });
  if (!store) {
    wrap.innerHTML = _errorHtml("Sem lojas para mostrar.");
    return;
  }

  var cacheKey = _mlCacheKey("escritorio", store.id);
  var cached = _mlCacheGet(cacheKey);

  if (_mlEscritorioPendingStoreId !== store.id) {
    _mlEscritorioPendingUpdate = null;
    _mlEscritorioPendingStoreId = null;
  }

  if (cached) {
    _mlApplyEscritorioData(store, cached.data);
    _mlRenderEscritorioContent(wrap, store);
    if (cached.isFresh) return;
  } else {
    wrap.innerHTML =
      '<div class="skel-line hist-skel" style="height:40px;border-radius:var(--radius-lg);margin-bottom:14px"></div>' +
      '<div class="hist-mov-card hist-skel">' +
        '<div class="skel-line skel-line--label" style="margin-bottom:6px"></div>' +
        '<div class="skel-line skel-line--title" style="margin-bottom:14px"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div class="skel-line hist-skel" style="height:52px;border-radius:var(--radius-sm)"></div>' +
          '<div class="skel-line hist-skel" style="height:52px;border-radius:var(--radius-sm)"></div>' +
        '</div>' +
      '</div>';
    await _mlMinDelay(280);
    if (_token !== _mlRenderToken) return;
  }

  var storeRes, storeData;
  try {
    storeRes = await _mlAuthFetch("/reports/multi-store/store/" + encodeURIComponent(store.id));
    storeData = await storeRes.json();
  } catch (e) {
    if (_token !== _mlRenderToken) return;
    if (!cached) wrap.innerHTML = _errorHtml("Sem ligação à internet.");
    return;
  }
  if (_token !== _mlRenderToken) return;
  if (storeRes.status === 401) { loadMultilojas(); return; }
  if (!storeRes.ok || !storeData || !storeData.success) {
    if (!cached) wrap.innerHTML = _errorHtml((storeData && storeData.error) || "Erro ao carregar dados da loja.");
    return;
  }

  var wsRes, wsData;
  try {
    wsRes = await _mlAuthFetch("/workspace/" + encodeURIComponent(store.id));
    wsData = await wsRes.json();
  } catch (e) {
    if (_token !== _mlRenderToken) return;
    if (!cached) wrap.innerHTML = _errorHtml("Sem ligação à internet.");
    return;
  }
  if (_token !== _mlRenderToken) return;
  if (wsRes.status === 401) { loadMultilojas(); return; }
  if (!wsRes.ok || !wsData || !wsData.success) {
    if (!cached) wrap.innerHTML = _errorHtml((wsData && wsData.error) || "Erro ao carregar workspace.");
    return;
  }

  var invRes, invData;
  try {
    invRes = await _mlAuthFetch("/workspace/" + encodeURIComponent(store.id) + "/inventory-reports");
    invData = await invRes.json();
  } catch (e) {
    invData = null;
  }
  var inventarioReports = (invData && invData.success) ? (invData.reports || []) : [];

  if (_token !== _mlRenderToken) return;

  var combined = { storeData: storeData, wsData: wsData, invData: inventarioReports };

  // Se entretanto o utilizador comecou a editar (raro, mas possivel se
  // o fetch em segundo plano demorar), nao sobrescrever o que esta a
  // fazer — guarda os dados novos para aplicar so quando ele decidir.
  if (_mlWorkspaceSubView !== "list" && _mlEscritorioStoreId === store.id) {
    _mlEscritorioPendingUpdate = combined;
    _mlEscritorioPendingStoreId = store.id;
    return;
  }

  _mlCacheSet(cacheKey, combined);
  _mlApplyEscritorioData(store, combined);
  _mlRenderEscritorioContent(wrap, store);
}

var _mlInventarioReports = [];
var _mlEscritorioBalances = { cash: null, bank: null };
var _mlHistoricoTurnos = [];
var _mlHistoricoTurnosLoading = false;
var _mlRegistosAllEntries = [];

var ESCRITORIO_VIEWS = [
  { key: "turno",       label: "Turno",       desc: "Estado do turno, operador e diferença de caixa", icon: "clipboard-list", iconClass: "hist-export-icon--edit" },
  { key: "produtos",    label: "Produtos",    desc: "Inventário da loja, só leitura",                   icon: "package",        iconStyle: "background:#eff6ff;color:#2563eb" },
  { key: "catalogo",    label: "Catálogo",    desc: "Editar produtos e publicar alterações",           icon: "pencil",         iconClass: "hist-export-icon--csv" },
  { key: "inventario",  label: "Inventário Periódico", desc: "Relatórios arquivados de stock + caixa/banco, só leitura", icon: "clipboard-list", iconStyle: "background:#f0fdf4;color:#16a34a" },
  { key: "historico_turnos", label: "Histórico de Turnos", desc: "Turnos sincronizados: stock declarado e incidentes, só leitura", icon: "history", iconStyle: "background:#faf5ff;color:#7c3aed" },
];

function _mlEscritorioViewLabel(key) {
  var v = ESCRITORIO_VIEWS.find(function(x) { return x.key === key; });
  return v ? v.label : key;
}

window._mlShowEscritorioViewPicker = function() {
  var body = '<div class="hist-export-options">' +
    ESCRITORIO_VIEWS.map(function(v) {
      var active = _mlEscritorioView === v.key;
      var iconAttrs = v.iconClass ? (' class="hist-export-icon ' + v.iconClass + '"') : (' class="hist-export-icon" style="' + v.iconStyle + '"');
      return '<div class="hist-export-option" onclick="window._mlSelectEscritorioView(\'' + v.key + '\')" style="' + (active ? "border-color:var(--primary,#5b21b6)" : "") + '">' +
        '<div' + iconAttrs + '><i data-lucide="' + v.icon + '"></i></div>' +
        '<div class="hist-export-info">' +
          '<div class="hist-export-title">' + v.label + (active ? ' <span style="color:var(--primary,#5b21b6);font-weight:700">· atual</span>' : '') + '</div>' +
          '<div class="hist-export-desc">' + v.desc + '</div>' +
        '</div>' +
        '<i data-lucide="chevron-right" class="hist-export-arrow"></i>' +
      '</div>';
    }).join("") +
  '</div>';
  openModal("Ver secção", body);
  refreshIcons(document.getElementById("modal-box") || document.body);
};

window._mlSelectEscritorioView = function(key) {
  _mlEscritorioView = key;
  closeModal();
  var wrap = document.getElementById("multilojas-content");
  if (wrap) _mlRenderEscritorioContent(wrap, (_mlStoresCache || []).find(function(s) { return s.id === _mlEscritorioStoreId; }));
  if (key === "historico_turnos" && _mlHistoricoTurnos.length === 0) _mlLoadHistoricoTurnos();
};

function _mlEscritorioPickerHtml() {
  var v = ESCRITORIO_VIEWS.find(function(x) { return x.key === _mlEscritorioView; }) || ESCRITORIO_VIEWS[0];
  var iconAttrs = v.iconClass ? (' class="hist-mov-icon ' + v.iconClass + '"') : (' class="hist-mov-icon" style="' + v.iconStyle + '"');
  return '<button onclick="window._mlShowEscritorioViewPicker()" style="display:flex;align-items:center;gap:10px;width:100%;background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:10px 12px;margin-bottom:14px;font-family:inherit;cursor:pointer">' +
    '<div' + iconAttrs + ' style="width:34px;height:34px;' + (v.iconStyle || "") + '"><i data-lucide="' + v.icon + '" style="width:16px;height:16px"></i></div>' +
    '<span style="flex:1;text-align:left;font-size:13.5px;font-weight:700;color:var(--text)">' + v.label + '</span>' +
    '<i data-lucide="chevron-down" style="width:15px;height:15px;color:var(--text4);flex-shrink:0"></i>' +
  '</button>';
}

function _mlFormatDuration(startIso, endIso) {
  if (!startIso) return null;
  var start = new Date(startIso).getTime();
  var end = endIso ? new Date(endIso).getTime() : Date.now();
  var mins = Math.max(0, Math.round((end - start) / 60000));
  if (mins < 60) return mins + "min";
  var hours = Math.floor(mins / 60);
  var rem = mins % 60;
  return hours + "h" + (rem > 0 ? " " + rem + "min" : "");
}

function _mlTurnoBox(label, value, valueColor) {
  return '<div style="background:var(--bg,#f4f4f5);border-radius:var(--radius-sm);padding:10px 12px">' +
    '<div style="font-size:10px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px">' + label + '</div>' +
    '<div style="font-size:14px;font-weight:800;color:' + (valueColor || "var(--text)") + '">' + value + '</div>' +
  '</div>';
}

function _mlTurnoSectionHtml(store) {
  var session = _mlEscritorioSession;

  if (!session || !session.available) {
    return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px">' +
      '<div style="font-size:10.5px;font-weight:700;color:var(--primary,#5b21b6);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Turno</div>' +
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:10px">' + store.name + '</div>' +
      '<div style="font-size:12.5px;color:var(--text4)">' + ((session && session.message) || "Sem sessões sincronizadas ainda") + '</div>' +
    '</div>';
  }

  var isOpen = session.status === "open" || session.status === "aberto";
  var statusMeta = isOpen
    ? { label: "Aberto",  color: "var(--primary,#5b21b6)", bg: "var(--primary-light,#ede9fe)" }
    : { label: "Fechado", color: "var(--text3)",           bg: "var(--bg,#f4f4f5)" };

  var diff = session.cashDiff;
  var diffColor = "var(--text3)";
  var diffLabel = "Sem dados de conferência de caixa";
  if (diff !== null && diff !== undefined) {
    diffColor = diff === 0 ? "var(--text3)" : (diff < 0 ? "var(--primary,#5b21b6)" : "var(--success,#16a34a)");
    diffLabel = diff === 0 ? "Sem diferença" : (diff < 0 ? fmt(diff) : "+" + fmt(diff));
  }

  return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">' +
      '<div>' +
        '<div style="font-size:10.5px;font-weight:700;color:var(--primary,#5b21b6);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Turno</div>' +
        '<div style="font-size:15px;font-weight:800;color:var(--text)">' + store.name + '</div>' +
        '<div style="font-size:11px;color:var(--text4);margin-top:2px">desde ' + (session.openedAt ? new Date(session.openedAt).toLocaleString("pt-AO") : "—") + (session.openedAt ? ' · ' + _mlFormatDuration(session.openedAt, isOpen ? null : session.closedAt) : '') + '</div>' +
      '</div>' +
      '<span style="font-size:11px;font-weight:700;color:' + statusMeta.color + ';background:' + statusMeta.bg + ';padding:4px 10px;border-radius:20px">' + statusMeta.label + '</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
      _mlTurnoBox("Caixa", session.operatorName || "—") +
      _mlTurnoBox("Vendas do turno", fmt(session.totalVendas || 0)) +
    '</div>' +
    _mlTurnoBox("Diferença de caixa", diffLabel, diffColor) +
  '</div>';
}

function _mlProdutoItemHtml(p) {
  var qty = p.stock || 0;
  var arm = p.warehouseStock || 0;
  var min = p.minStock != null ? p.minStock : 5;
  var badgeClass = qty === 0 ? "produto-badge-zero" : (qty <= min ? "produto-badge-low" : "");
  var tag = qty === 0 ? "Esgotado" : (qty <= min ? "Stock baixo" : "");
  var cColor = categoryColor(p.category);
  var initial = (p.name || "P").charAt(0).toUpperCase();
  var avatarHtml = '<div class="produto-avatar" style="background:' + cColor + '20;color:' + cColor + '">' + initial + '</div>';

  return '<div class="produto-item ' + (qty === 0 ? "produto-item-zero" : (qty <= min ? "produto-item-low" : "")) + '">' +
    avatarHtml +
    '<div style="flex:1;min-width:0">' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
        '<div class="produto-name">' + p.name + '</div>' +
        (tag ? '<span class="produto-badge ' + badgeClass + '">' + tag + '</span>' : "") +
      '</div>' +
      '<div class="produto-meta">' + (p.category || "") + '</div>' +
      '<div class="produto-stock-line" style="white-space:normal;overflow:visible;text-overflow:clip">' +
        '<span><span class="produto-stock-label">Loja</span> ' + _prodAbbrevQty(qty) + '</span>' +
        '<span><span class="produto-stock-label">Arm.</span> ' + _prodAbbrevQty(arm) + '</span>' +
        '<span><strong>' + _prodAbbrevQty(qty + arm) + ' ' + _prodAbbrevUnit(p.unit) + '</strong></span>' +
      '</div>' +
      '<div class="produto-price" style="margin-top:4px">' + fmt(p.price) + '</div>' +
    '</div>' +
  '</div>';
}

function _mlProdutosSectionHtml() {
  var products = _mlEspelhoProducts || [];
  return '<div>' +
    '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Inventário da loja</div>' +
    (products.length
      ? '<div style="border:1px solid #e4e4e7;border-radius:var(--radius-lg);overflow:hidden">' +
          products.map(_mlProdutoItemHtml).join("") +
        '</div>'
      : '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px;text-align:center;font-size:12px;color:var(--text4)">Sem produtos sincronizados.</div>') +
  '</div>';
}

function _mlInventarioSectionHtml(store) {
  var reports = _mlInventarioReports || [];
  var listHtml = reports.length
    ? '<div class="hist-mov-card">' +
      '<div class="hist-day-label--inset" style="padding-top:14px"><i data-lucide="archive" style="width:13px;height:13px"></i>Relatórios arquivados</div>' +
      reports.map(function(r) {
        var date = r.generated_at ? new Date(r.generated_at).toLocaleString("pt-AO") : "—";
        var count = r.divergences_count || 0;
        var hasDiv = count > 0;
        var summary = hasDiv
          ? count + ' divergência' + (count !== 1 ? "s" : "")
          : 'Sem divergências';
        return '<button onclick="window._mlViewInventoryReport(\'' + r.id + '\')" class="hist-mov-item hist-mov-item--compact" style="width:100%;border:none;background:none;padding-right:14px;font-family:inherit;text-align:left;cursor:pointer;' + (hasDiv ? 'border-left:3px solid #dc2626' : '') + '">' +
          '<div class="hist-mov-icon" style="background:' + (hasDiv ? '#fee2e2' : 'var(--success)1a') + ';color:' + (hasDiv ? '#dc2626' : 'var(--success,#16a34a)') + '"><i data-lucide="' + (hasDiv ? "alert-triangle" : "check") + '" style="width:18px;height:18px"></i></div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="hist-mov-name">' + date + '</div>' +
            '<div class="hist-mov-meta" style="color:' + (hasDiv ? '#dc2626' : 'var(--text4)') + ';font-weight:' + (hasDiv ? '700' : '400') + '">' + summary + '</div>' +
          '</div>' +
          '<i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text4);flex-shrink:0"></i>' +
        '</button>';
      }).join("") +
      '</div>'
    : '<div class="hist-mov-card"><div class="hist-day-label--inset" style="padding-top:14px"><i data-lucide="archive" style="width:13px;height:13px"></i>Relatórios arquivados</div><div style="padding:16px;text-align:center;font-size:12px;color:var(--text4)">Ainda sem relatórios gerados para esta loja.</div></div>';

  return '<div>' +
    '<div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.5">Cada relatório é uma fotografia do stock (loja/armazém) e do saldo de caixa/banco no momento em que foi gerado, com base na última sincronização — não altera nada na loja.</div>' +
    '<button class="btn btn-primary btn-full" style="margin-bottom:14px" id="ml-inv-gen-btn" onclick="window._mlOpenInventarioContagem()"><i data-lucide="clipboard-list"></i> Nova Contagem</button>' +
    listHtml +
  '</div>';
}

window._mlOpenInventarioContagem = async function() {
  var products = (_mlEspelhoProducts || []).slice();

  var draftRes, draftData, draft = null;
  try {
    draftRes = await _mlAuthFetch("/workspace/" + encodeURIComponent(_mlEscritorioStoreId) + "/inventory-draft");
    draftData = await draftRes.json();
    if (draftRes.ok && draftData && draftData.success) draft = draftData.draft;
  } catch (e) { draft = null; }

  var draftCountsByCatalogId = {};
  (draft && Array.isArray(draft.counts) ? draft.counts : []).forEach(function(c) {
    if (c && c.catalogId) draftCountsByCatalogId[c.catalogId] = c;
  });

  var expCash = (_mlEscritorioBalances && _mlEscritorioBalances.cash != null) ? _mlEscritorioBalances.cash : 0;
  var expBank = (_mlEscritorioBalances && _mlEscritorioBalances.bank != null) ? _mlEscritorioBalances.bank : 0;
  var valCash = (draft && draft.found_cash != null) ? draft.found_cash : expCash;
  var valBank = (draft && draft.found_bank != null) ? draft.found_bank : expBank;
  var hasDraft = !!draft && (Object.keys(draftCountsByCatalogId).length > 0 || draft.found_cash != null || draft.found_bank != null);
  var moneyChanged = (valCash !== expCash) || (valBank !== expBank);

  var moneyRowHtml = '<div class="ml-inv-money-row" data-exp-cash="' + expCash + '" data-exp-bank="' + expBank + '" ' +
    'style="padding:10px 8px;border-bottom:2px solid var(--border2);border-left:3px solid ' + (moneyChanged?"var(--primary)":"transparent") + ';background:' + (moneyChanged?"var(--primary-light)":"transparent") + ';margin-bottom:10px;border-radius:8px;transition:background .15s">' +
    '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Caixa e Banco</div>' +
    '<div style="display:flex;gap:8px">' +
    '<div style="flex:1">' +
    '<div style="font-size:10.5px;color:var(--text3);margin-bottom:3px">Caixa (esp. ' + fmt(expCash) + ')</div>' +
    '<input type="number" class="ml-inv-input-cash" value="' + valCash + '" ' +
    'oninput="window._mlInvMoneyRowChanged(this)" ' +
    'style="width:100%;padding:7px;border:1.5px solid var(--border2);border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit"/>' +
    '</div>' +
    '<div style="flex:1">' +
    '<div style="font-size:10.5px;color:var(--text3);margin-bottom:3px">Banco (esp. ' + fmt(expBank) + ')</div>' +
    '<input type="number" class="ml-inv-input-bank" value="' + valBank + '" ' +
    'oninput="window._mlInvMoneyRowChanged(this)" ' +
    'style="width:100%;padding:7px;border:1.5px solid var(--border2);border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit"/>' +
    '</div>' +
    '</div>' +
  '</div>';

  var rowsHtml = products.length
    ? products.map(function(p) {
        var espLoja = p.stock || 0;
        var espArm = p.warehouseStock || 0;
        var draftCount = p.catalogId ? draftCountsByCatalogId[p.catalogId] : null;
        var valLoja = (draftCount && draftCount.foundStock != null) ? draftCount.foundStock : espLoja;
        var valArm = (draftCount && draftCount.foundWarehouseStock != null) ? draftCount.foundWarehouseStock : espArm;
        var rowChanged = (valLoja !== espLoja) || (valArm !== espArm);
        return '<div class="ml-inv-row" data-catalog-id="' + (p.catalogId || "") + '" data-exp-loja="' + espLoja + '" data-exp-arm="' + espArm + '" ' +
          'style="padding:10px 8px;border-bottom:1px solid var(--border2);border-left:3px solid ' + (rowChanged?"var(--primary)":"transparent") + ';background:' + (rowChanged?"var(--primary-light)":"transparent") + ';transition:background .15s">' +
          '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px">' + p.name + '</div>' +
          '<div style="display:flex;gap:8px">' +
          '<div style="flex:1">' +
          '<div style="font-size:10.5px;color:var(--text3);margin-bottom:3px">Loja (esp. ' + espLoja + ' ' + _prodAbbrevUnit(p.unit) + ')</div>' +
          '<input type="number" class="ml-inv-input-loja" min="0" value="' + valLoja + '" ' +
          'oninput="window._mlInvRowChanged(this)" ' +
          'style="width:100%;padding:7px;border:1.5px solid var(--border2);border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit"/>' +
          '</div>' +
          '<div style="flex:1">' +
          '<div style="font-size:10.5px;color:var(--text3);margin-bottom:3px">Armazém (esp. ' + espArm + ' ' + _prodAbbrevUnit(p.unit) + ')</div>' +
          '<input type="number" class="ml-inv-input-arm" min="0" value="' + valArm + '" ' +
          'oninput="window._mlInvRowChanged(this)" ' +
          'style="width:100%;padding:7px;border:1.5px solid var(--border2);border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit"/>' +
          '</div>' +
          '</div>' +
          '</div>';
      }).join("")
    : '<div style="font-size:12px;color:var(--text4);text-align:center;padding:16px">Sem produtos sincronizados para contar.</div>';

  openModal("Contagem — Inventário Periódico",
    (hasDraft ?
      '<div style="display:flex;justify-content:space-between;align-items:center;background:var(--primary-light);border-radius:8px;padding:8px 12px;margin-bottom:10px">' +
      '<span style="font-size:11.5px;color:var(--primary);font-weight:600">A continuar contagem anterior</span>' +
      '<button onclick="window._mlInvContagemReset()" style="background:none;border:none;color:var(--primary);font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit">Recomeçar</button>' +
      '</div>' : "") +
    '<div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.5">Preenche o valor encontrado por produto e o saldo de caixa/banco. Ao confirmar, o relatório é calculado e guardado com as divergências — não altera o stock da loja nem cria incidentes. Podes fechar e continuar mais tarde — o progresso fica guardado no servidor.</div>' +
    moneyRowHtml +
    '<div style="max-height:46vh;overflow-y:auto">' + rowsHtml + '</div>' +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
    '<button class="btn btn-ghost btn-full" onclick="window._mlCloseInventarioContagem()">Fechar (guarda progresso)</button>' +
    '<button class="btn btn-primary btn-full" id="ml-inv-confirm-btn" onclick="window._mlConfirmInventarioContagem()"><i data-lucide="check"></i> Calcular e Guardar</button>' +
    '</div>'
  );
  refreshIcons(document.getElementById("modal-box") || document.body);
};

window._mlInvRowChanged = function(input) {
  var row = input.closest(".ml-inv-row");
  var loja = row.querySelector(".ml-inv-input-loja");
  var arm = row.querySelector(".ml-inv-input-arm");
  var espLoja = Number(row.getAttribute("data-exp-loja"));
  var espArm = Number(row.getAttribute("data-exp-arm"));
  var changed = Number(loja.value || 0) !== espLoja || Number(arm.value || 0) !== espArm;
  row.style.background = changed ? "var(--primary-light)" : "transparent";
  row.style.borderLeftColor = changed ? "var(--primary)" : "transparent";
};

window._mlInvMoneyRowChanged = function(input) {
  var row = input.closest(".ml-inv-money-row");
  var cash = row.querySelector(".ml-inv-input-cash");
  var bank = row.querySelector(".ml-inv-input-bank");
  var expCash = Number(row.getAttribute("data-exp-cash"));
  var expBank = Number(row.getAttribute("data-exp-bank"));
  var changed = Number(cash.value || 0) !== expCash || Number(bank.value || 0) !== expBank;
  row.style.background = changed ? "var(--primary-light)" : "transparent";
  row.style.borderLeftColor = changed ? "var(--primary)" : "transparent";
};

function _mlGatherInventarioContagem() {
  var rows = document.querySelectorAll(".ml-inv-row");
  var counts = [];
  rows.forEach(function(row) {
    var catalogId = row.getAttribute("data-catalog-id");
    if (!catalogId) return;
    var foundLoja = Number(row.querySelector(".ml-inv-input-loja").value || 0);
    var foundArm = Number(row.querySelector(".ml-inv-input-arm").value || 0);
    counts.push({ catalogId: catalogId, foundStock: foundLoja, foundWarehouseStock: foundArm });
  });
  var moneyRow = document.querySelector(".ml-inv-money-row");
  var foundCash = moneyRow ? Number(moneyRow.querySelector(".ml-inv-input-cash").value || 0) : null;
  var foundBank = moneyRow ? Number(moneyRow.querySelector(".ml-inv-input-bank").value || 0) : null;
  return { counts: counts, foundCash: foundCash, foundBank: foundBank };
}

window._mlCloseInventarioContagem = async function() {
  var payload = _mlGatherInventarioContagem();
  try {
    await _mlAuthFetch("/workspace/" + encodeURIComponent(_mlEscritorioStoreId) + "/inventory-draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) { /* falha a guardar rascunho não deve bloquear o fecho do modal */ }
  closeModal();
};

window._mlInvContagemReset = async function() {
  try {
    await _mlAuthFetch("/workspace/" + encodeURIComponent(_mlEscritorioStoreId) + "/inventory-draft", { method: "DELETE" });
  } catch (e) { /* ignora falha, reabre na mesma */ }
  window._mlOpenInventarioContagem();
};

function _mlShowProcessing(message) {
  var el = document.createElement("div");
  el.id = "ml-processing-overlay";
  el.style.cssText = "position:fixed;inset:0;background:rgba(255,255,255,.92);z-index:99997;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:inherit";
  el.innerHTML =
    '<div style="width:38px;height:38px;border:3.5px solid var(--primary-light,#ede9fe);border-top-color:var(--primary,#5b21b6);border-radius:50%;animation:boot-spin .8s linear infinite"></div>' +
    '<div style="font-size:13px;font-weight:600;color:var(--text2);text-align:center;padding:0 24px">' + (message || "A processar…") + '</div>';
  document.body.appendChild(el);
}

function _mlHideProcessing() {
  var el = document.getElementById("ml-processing-overlay");
  if (el) el.remove();
}

window._mlConfirmInventarioContagem = async function() {
  var btn = document.getElementById("ml-inv-confirm-btn");
  if (btn) btn.disabled = true;
  _mlShowProcessing("A calcular e guardar o relatório…");

  var payload = _mlGatherInventarioContagem();

  var res, data;
  try {
    res = await _mlAuthFetch("/workspace/" + encodeURIComponent(_mlEscritorioStoreId) + "/inventory-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    data = await res.json();
  } catch (e) {
    _mlHideProcessing();
    toast("Sem ligação à internet.", "error");
    if (btn) btn.disabled = false;
    return;
  }
  _mlHideProcessing();
  if (res.status === 401) { loadMultilojas(); return; }
  if (!res.ok || !data || !data.success) {
    toast((data && data.error) || "Erro ao guardar relatório.", "error");
    if (btn) btn.disabled = false;
    return;
  }

  closeModal();
  toast("Relatório de inventário guardado.", "success");
  await _mlReloadInventarioReports();
};

async function _mlReloadInventarioReports() {
  var res, data;
  try {
    res = await _mlAuthFetch("/workspace/" + encodeURIComponent(_mlEscritorioStoreId) + "/inventory-reports");
    data = await res.json();
  } catch (e) { return; }
  if (!res.ok || !data || !data.success) return;
  _mlInventarioReports = data.reports || [];
  var wrap = document.getElementById("multilojas-content");
  if (wrap && _mlEscritorioView === "inventario") {
    _mlRenderEscritorioContent(wrap, (_mlStoresCache || []).find(function(s) { return s.id === _mlEscritorioStoreId; }));
  }
}

window._mlViewInventoryReport = async function(reportId) {
  var res, data;
  try {
    res = await _mlAuthFetch("/workspace/" + encodeURIComponent(_mlEscritorioStoreId) + "/inventory-reports/" + encodeURIComponent(reportId));
    data = await res.json();
  } catch (e) { toast("Sem ligação à internet.", "error"); return; }
  if (res.status === 401) { loadMultilojas(); return; }
  if (!res.ok || !data || !data.success) { toast((data && data.error) || "Erro ao carregar relatório.", "error"); return; }

  var r = data.report;
  var date = r.generated_at ? new Date(r.generated_at).toLocaleString("pt-AO") : "—";
  var syncedAs = r.synced_as_of ? new Date(r.synced_as_of).toLocaleString("pt-AO") : "—";
  var products = r.products || [];

  function _mlInvDiffPart(label, expected, found, diff) {
    var unitTxt = "";
    var valueTxt = _prodAbbrevQty(expected || 0);
    if (found !== null && found !== undefined) {
      valueTxt += " → " + _prodAbbrevQty(found);
      if (diff) {
        var diffColor = diff < 0 ? "#dc2626" : "#16a34a";
        valueTxt += ' <strong style="color:' + diffColor + '">(' + (diff > 0 ? "+" : "") + diff + ")</strong>";
      }
    }
    return '<span>' + label + ': ' + valueTxt + '</span>';
  }

  var rowsHtml = products.length
    ? products.map(function(p) {
        return '<div style="padding:8px 0;border-bottom:1px solid var(--border2)">' +
          '<div style="font-size:12.5px;font-weight:600;color:var(--text);margin-bottom:3px">' + p.name + (p.counted ? "" : ' <span style="font-size:10.5px;font-weight:600;color:var(--text4)">(não contado)</span>') + '</div>' +
          '<div style="display:flex;gap:14px;font-size:11.5px;color:var(--text3)">' +
            _mlInvDiffPart("Loja " + _prodAbbrevUnit(p.unit), p.expectedStock, p.foundStock, p.diffStock) +
            _mlInvDiffPart("Arm. " + _prodAbbrevUnit(p.unit), p.expectedWarehouseStock, p.foundWarehouseStock, p.diffWarehouseStock) +
          '</div>' +
        '</div>';
      }).join("")
    : '<div style="font-size:12px;color:var(--text4);text-align:center;padding:12px">Sem produtos neste relatório.</div>';

  openModal("Relatório de Inventário",
    '<div style="font-size:11.5px;color:var(--text4);margin-bottom:4px">Gerado em ' + date + '</div>' +
    '<div style="font-size:11px;color:var(--text4);margin-bottom:14px">Dados sincronizados até ' + syncedAs + '</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:12px;margin-bottom:14px;display:flex;gap:18px;font-size:12.5px;color:var(--text3)">' +
      (function() {
        var cashDiff = r.cash_found != null ? (r.cash_found - (r.cash_balance || 0)) : null;
        var bankDiff = r.bank_found != null ? (r.bank_found - (r.bank_balance || 0)) : null;
        function part(label, expected, found, diff) {
          var txt = fmt(expected || 0);
          if (found != null) {
            txt += " → " + fmt(found);
            if (diff) {
              var color = diff < 0 ? "#dc2626" : "#16a34a";
              txt += ' <strong style="color:' + color + '">(' + (diff > 0 ? "+" : "") + fmt(diff) + ")</strong>";
            }
          }
          return "<span>" + label + ": " + txt + "</span>";
        }
        return part("Caixa", r.cash_balance, r.cash_found, cashDiff) + part("Banco", r.bank_balance, r.bank_found, bankDiff);
      })() +
    '</div>' +
    '<div style="font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Produtos (' + products.length + ')</div>' +
    '<div style="max-height:50vh;overflow-y:auto">' + rowsHtml + '</div>' +
    '<button class="btn btn-ghost btn-full" style="margin-top:14px" onclick="window._closeModal ? window._closeModal() : null">Fechar</button>'
  );
  refreshIcons(document.getElementById("modal-box") || document.body);
};

function _mlHistoricoTurnoSkeletonRow() {
  return '<div class="hist-mov-item hist-mov-item--compact hist-skel">' +
    '<div class="skel-circle" style="width:40px;height:40px;margin-right:0"></div>' +
    '<div style="flex:1;min-width:0;padding-left:12px">' +
      '<div class="skel-line skel-line--title" style="width:50%"></div>' +
      '<div class="skel-line skel-line--sub" style="width:70%"></div>' +
    '</div>' +
  '</div>';
}

function _mlHistoricoTurnosSectionHtml() {
  var sessions = _mlHistoricoTurnos || [];
  var listHtml = sessions.length
    ? '<div class="hist-mov-card">' +
      '<div class="hist-day-label--inset" style="padding-top:14px"><i data-lucide="history" style="width:13px;height:13px"></i>Turnos sincronizados</div>' +
      sessions.map(function(s) {
        var opened = s.opened_at ? new Date(s.opened_at).toLocaleString("pt-AO") : "—";
        var isOpen = s.status === "open";
        var closedLabel = isOpen ? "Aberto" : (s.closed_at ? new Date(s.closed_at).toLocaleString("pt-AO") : "—");
        var hasInc = !!s.has_incidents;
        var initial = (s.user_name || "?").charAt(0).toUpperCase();
        return '<button onclick="window._mlViewTurnoDetail(\'' + s.id + '\')" class="hist-mov-item hist-mov-item--compact" style="width:100%;border:none;background:none;padding-right:14px;font-family:inherit;text-align:left;cursor:pointer;' + (hasInc ? 'border-left:3px solid #dc2626' : '') + '">' +
          '<div class="hist-mov-icon" style="background:' + (isOpen ? 'var(--primary-light,#ede9fe)' : 'var(--border2)') + ';color:' + (isOpen ? 'var(--primary,#5b21b6)' : 'var(--text4)') + ';font-weight:800;font-size:14px">' + initial + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="hist-mov-name">' + (s.user_name || "—") + (hasInc ? ' <i data-lucide="alert-triangle" style="width:12px;height:12px;color:#dc2626;vertical-align:middle"></i>' : '') + '</div>' +
            '<div class="hist-mov-meta">' + opened + ' → ' + closedLabel + (s.opened_at ? ' · ' + _mlFormatDuration(s.opened_at, isOpen ? null : s.closed_at) : '') + '</div>' +
            '<div class="hist-mov-meta">' + fmt(s.total_vendas || 0) + ' · ' + (s.n_vendas || 0) + ' vendas' + (s.cash_diff ? ' · Dif. caixa ' + (s.cash_diff > 0 ? "+" : "") + fmt(s.cash_diff) : "") + '</div>' +
          '</div>' +
          '<i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text4);flex-shrink:0"></i>' +
        '</button>';
      }).join("") +
      '</div>'
    : (_mlHistoricoTurnosLoading
        ? '<div class="hist-mov-card">' + _mlHistoricoTurnoSkeletonRow() + _mlHistoricoTurnoSkeletonRow() + _mlHistoricoTurnoSkeletonRow() + '</div>'
        : '<div class="hist-mov-card"><div class="hist-day-label--inset" style="padding-top:14px"><i data-lucide="history" style="width:13px;height:13px"></i>Turnos sincronizados</div><div style="padding:16px;text-align:center;font-size:12px;color:var(--text4)">Sem turnos sincronizados ainda.</div></div>');

  return '<div>' +
    '<div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.5">Turnos sincronizam sozinhos ao abrir/fechar — esta lista mostra o que já chegou ao Console, sem precisares de gerar nada.</div>' +
    listHtml +
  '</div>';
}

async function _mlLoadHistoricoTurnos() {
  _mlHistoricoTurnosLoading = true;
  var res, data;
  try {
    res = await _mlAuthFetch("/workspace/" + encodeURIComponent(_mlEscritorioStoreId) + "/sessions?limit=30");
    data = await res.json();
  } catch (e) { _mlHistoricoTurnosLoading = false; return; }
  _mlHistoricoTurnosLoading = false;
  if (!res.ok || !data || !data.success) return;
  _mlHistoricoTurnos = data.sessions || [];
  var wrap = document.getElementById("multilojas-content");
  if (wrap && _mlEscritorioView === "historico_turnos") {
    _mlRenderEscritorioContent(wrap, (_mlStoresCache || []).find(function(s) { return s.id === _mlEscritorioStoreId; }));
  }
}

window._mlViewTurnoDetail = async function(sessionId) {
  var res, data;
  try {
    res = await _mlAuthFetch("/workspace/" + encodeURIComponent(_mlEscritorioStoreId) + "/sessions/" + encodeURIComponent(sessionId));
    data = await res.json();
  } catch (e) { toast("Sem ligação à internet.", "error"); return; }
  if (res.status === 401) { loadMultilojas(); return; }
  if (!res.ok || !data || !data.success) { toast((data && data.error) || "Erro ao carregar turno.", "error"); return; }

  var s = data.session;
  var incidents = data.incidents || [];
  var opened = s.opened_at ? new Date(s.opened_at).toLocaleString("pt-AO") : "—";
  var closedLabel = s.status === "open" ? "Aberto" : (s.closed_at ? new Date(s.closed_at).toLocaleString("pt-AO") : "—");

  var stockRows = Object.values(s.stock_esperado || {});
  var stockHtml = stockRows.length
    ? '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px">Stock Declarado</div>' +
      '<div style="background:#fff;border-radius:10px;border:1px solid #f4f4f5;overflow:hidden">' +
      '<div style="display:grid;grid-template-columns:1fr 60px 60px 60px;padding:8px 12px;background:#f4f4f5;font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase">' +
      '<span>Produto</span><span style="text-align:center">Recebeu</span><span style="text-align:center">Vendeu</span><span style="text-align:right">Esperado</span></div>' +
      stockRows.map(function(r) {
        var color = r.expected < 0 ? "#dc2626" : r.expected < 2 ? "#d97706" : "#16a34a";
        return '<div style="display:grid;grid-template-columns:1fr 60px 60px 60px;padding:9px 12px;border-top:1px solid #f4f4f5;align-items:center">' +
          '<span style="font-size:13px;font-weight:600">' + r.productName + '</span>' +
          '<span style="text-align:center;font-size:13px;color:#71717a">' + r.received + '</span>' +
          '<span style="text-align:center;font-size:13px;color:#dc2626">' + r.sold + '</span>' +
          '<span style="text-align:right;font-size:13px;font-weight:700;color:' + color + '">' + r.expected + '</span>' +
          '</div>';
      }).join("") + '</div>'
    : '';

  var incHtml = incidents.length
    ? '<div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px">⚠ Incidentes (' + incidents.length + ')</div>' +
      incidents.map(function(i) {
        return '<div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:10px;padding:10px;margin-bottom:6px">' +
          '<div style="font-size:13px;font-weight:700;color:#dc2626">' + (i.product_name || (i.type === "stock" ? "Produto" : "Numerário (Caixa)")) + '</div>' +
          '<div style="font-size:12px;color:#71717a;margin-top:4px">Esperado: <strong>' + i.expected + '</strong> · Encontrado: <strong>' + i.found + '</strong> · Dif: <strong style="color:#dc2626">' + (i.diff > 0 ? "+" : "") + i.diff + '</strong></div>' +
          '</div>';
      }).join("")
    : '';

  openModal("Turno — " + (s.user_name || "—"),
    '<div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);border-radius:12px;padding:14px;margin-bottom:12px;color:#fff">' +
      '<div style="font-size:14px;font-weight:700">' + (s.user_name || "—") + '</div>' +
      '<div style="font-size:11.5px;opacity:.85;margin-top:2px">' + opened + ' → ' + closedLabel + '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">' +
      _mlTurnoBox("Total Vendido", fmt(s.total_vendas || 0), "#16a34a") +
      _mlTurnoBox("Incidentes", String(incidents.length), incidents.length ? "#dc2626" : "var(--text)") +
    '</div>' +
    stockHtml +
    incHtml +
    '<button class="btn btn-ghost btn-full" style="margin-top:14px" onclick="window._closeModal ? window._closeModal() : null">Fechar</button>'
  );
  refreshIcons(document.getElementById("modal-box") || document.body);
};

function _mlRenderEscritorioContent(wrap, store) {
  var sectionHtml;
  if (_mlEscritorioView === "turno") {
    sectionHtml = _mlTurnoSectionHtml(store);
  } else if (_mlEscritorioView === "produtos") {
    sectionHtml = _mlProdutosSectionHtml();
  } else if (_mlEscritorioView === "inventario") {
    sectionHtml = _mlInventarioSectionHtml(store);
  } else if (_mlEscritorioView === "historico_turnos") {
    sectionHtml = _mlHistoricoTurnosSectionHtml();
  } else {
    sectionHtml = '<div id="ml-workspace-section">' + _mlWorkspaceSectionHtml() + '</div>';
  }

  var pendingBanner = (_mlEscritorioPendingUpdate && _mlEscritorioPendingStoreId === store.id)
    ? '<div class="esc-conflict-banner">' +
        '<i data-lucide="refresh-cw"></i>' +
        '<div style="flex:1">' +
          '<div class="esc-conflict-title">Existem alterações novas nesta loja</div>' +
          '<div class="esc-conflict-sub">Os dados foram atualizados no servidor enquanto editavas. Atualizar agora?</div>' +
        '</div>' +
        '<button onclick="window._mlApplyPendingEscritorioUpdate()" style="font-size:11px;font-weight:700;color:#92400e;background:none;border:none;cursor:pointer;font-family:inherit;flex-shrink:0;white-space:nowrap">Atualizar</button>' +
      '</div>'
    : '';

  wrap.innerHTML = pendingBanner + _mlEscritorioPickerHtml() + sectionHtml;
  refreshIcons(wrap);
}

function _mlRerenderWorkspaceSection() {
  var el = document.getElementById("ml-workspace-section");
  if (!el) return;
  el.innerHTML = _mlWorkspaceSectionHtml();
  refreshIcons(el);
}

async function _mlReloadWorkspaceOnly() {
  var res, data;
  try {
    res = await _mlAuthFetch("/workspace/" + encodeURIComponent(_mlWorkspaceStoreId));
    data = await res.json();
  } catch (e) { toast("Sem ligação à internet.", "error"); return false; }
  if (res.status === 401) { loadMultilojas(); return false; }
  if (!res.ok || !data || !data.success) { toast((data && data.error) || "Erro ao recarregar workspace.", "error"); return false; }
  if (!data.hasWorkspace) {
    _mlWorkspaceCache = null; _mlWorkspaceProducts = null; _mlWorkspaceLastExport = data.lastExport || null;
  } else {
    _mlWorkspaceCache = data.workspace; _mlWorkspaceProducts = data.products || [];
  }
  return true;
}

function _mlWorkspaceSectionHtml() {
  var header = '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Workspace — editor de catálogo</div>';

  if (!_mlWorkspaceCache) {
    var lastExport = _mlWorkspaceLastExport;
    var lastInfo = lastExport
      ? ('<div style="font-size:11px;color:var(--text4);margin-bottom:12px">Última versão: v' + lastExport.version + ' · ' + (lastExport.status === "exported" ? "publicada" : lastExport.status) + (lastExport.exported_at ? (" em " + new Date(lastExport.exported_at).toLocaleDateString("pt-AO")) : "") + '</div>')
      : '';
    return header +
      '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px;text-align:center">' +
        '<i data-lucide="package" style="width:28px;height:28px;color:var(--text4);margin-bottom:8px"></i>' +
        '<div style="font-size:13px;color:var(--text3);margin-bottom:12px">Sem rascunho de catálogo aberto para esta loja.</div>' +
        lastInfo +
        '<button class="btn btn-primary btn-full" onclick="window._mlCreateWorkspace()">Criar novo rascunho</button>' +
      '</div>';
  }

  if (_mlWorkspaceCache.status !== "draft") {
    return header +
      '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px;text-align:center">' +
        '<i data-lucide="check-circle" style="width:28px;height:28px;color:#16a34a;margin-bottom:8px"></i>' +
        '<div style="font-size:13px;color:var(--text3);margin-bottom:12px">Versão v' + _mlWorkspaceCache.version + ' publicada' + (_mlWorkspaceCache.exported_at ? (" em " + new Date(_mlWorkspaceCache.exported_at).toLocaleDateString("pt-AO")) : "") + '. Este rascunho já não é editável.</div>' +
        '<button class="btn btn-primary btn-full" onclick="window._mlCreateWorkspace()">Criar novo rascunho</button>' +
      '</div>';
  }

  if (_mlWorkspaceSubView === "edit") return header + _mlEditWorkspaceProductHtml(_mlWorkspaceEditingCatalogId);
  if (_mlWorkspaceSubView === "diff") return header + _mlWorkspaceDiffPlaceholderHtml();
  if (_mlWorkspaceSubView === "confirm-export") {
    return header +
      '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px">' +
        '<div style="font-size:12.5px;color:var(--text3);margin-bottom:16px;line-height:1.5">Ao publicar, o rascunho fica congelado e a loja passa a poder descarregar este catálogo na próxima sincronização. Não é possível editar depois de publicado.</div>' +
        '<div class="form-actions">' +
          '<button class="btn btn-ghost btn-full" onclick="window._mlBackToWorkspaceList()">Cancelar</button>' +
          '<button class="btn btn-primary btn-full" onclick="window._mlExportWorkspace()">Confirmar publicação</button>' +
        '</div>' +
      '</div>';
  }

  var products = _mlWorkspaceProducts || [];
  return header +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px">' +
      '<div style="font-size:11px;color:var(--text4);margin-bottom:10px">Rascunho v' + _mlWorkspaceCache.version + ' · ' + products.length + ' produto' + (products.length !== 1 ? 's' : '') + '</div>' +
      '<div style="max-height:40vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:14px">' +
        (products.length
          ? products.map(function(p) {
              var inactive = p.active === false;
              return '<button onclick="window._mlEditWorkspaceProduct(\'' + p.catalog_id + '\')" style="width:100%;text-align:left;border:1px solid #e4e4e7;border-radius:var(--radius-sm);padding:10px 12px;background:' + (inactive ? "#f4f4f5" : "#fff") + ';font-family:inherit;cursor:pointer;display:flex;justify-content:space-between;align-items:center">' +
                '<div>' +
                  '<div style="font-size:13px;font-weight:700;color:' + (inactive ? "var(--text4)" : "var(--text)") + '">' + (p.name || "(sem nome)") + (inactive ? " · inativo" : "") + '</div>' +
                  '<div style="font-size:11px;color:var(--text4)">' + (p.category || "") + '</div>' +
                '</div>' +
                '<div style="font-size:13px;font-weight:700;color:var(--text2)">' + fmt(p.price) + '</div>' +
              '</button>';
            }).join("")
          : '<div style="font-size:12px;color:var(--text4);text-align:center;padding:16px">Sem produtos.</div>') +
      '</div>' +
      '<div class="form-actions">' +
        '<button class="btn btn-outline btn-full" onclick="window._mlReviewWorkspaceDiff()">Rever alterações</button>' +
        '<button class="btn btn-primary btn-full" onclick="window._mlConfirmExportWorkspace()">Publicar</button>' +
      '</div>' +
    '</div>';
}

window._mlCreateWorkspace = async function() {
  var res, data;
  try {
    res = await _mlAuthFetch("/workspace/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: _mlWorkspaceStoreId }),
    });
    data = await res.json();
  } catch (e) {
    toast("Sem ligação à internet.", "error");
    return;
  }
  if (res.status === 401) { loadMultilojas(); return; }
  if (!res.ok || !data || !data.success) {
    toast((data && data.error) || "Erro ao criar rascunho.", "error");
    return;
  }
  toast("Rascunho criado com " + data.productsCopied + " produto(s).", "success");
  _mlWorkspaceSubView = "list";
  await _mlReloadWorkspaceOnly();
  _mlRerenderWorkspaceSection();
};

window._mlEditWorkspaceProduct = function(catalogId) {
  _mlWorkspaceSubView = "edit";
  _mlWorkspaceEditingCatalogId = catalogId;
  _mlRerenderWorkspaceSection();
};

window._mlBackToWorkspaceList = function() {
  _mlWorkspaceSubView = "list";
  _mlRerenderWorkspaceSection();
};

function _mlEditWorkspaceProductHtml(catalogId) {
  var p = (_mlWorkspaceProducts || []).find(function(x) { return x.catalog_id === catalogId; });
  if (!p) return '<div style="font-size:12px;color:var(--text4)">Produto não encontrado.</div>';
  return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px">' +
    '<div class="field" style="margin-bottom:10px"><label>Nome</label><input id="wsp-name" type="text" value="' + (p.name || "").replace(/"/g, "&quot;") + '"></div>' +
    '<div class="field" style="margin-bottom:10px"><label>Preço</label><input id="wsp-price" type="number" step="0.01" value="' + (p.price != null ? p.price : "") + '"></div>' +
    '<div class="field" style="margin-bottom:10px"><label>Stock</label><input id="wsp-stock" type="number" value="' + (p.stock != null ? p.stock : "") + '"></div>' +
    '<div class="field" style="margin-bottom:10px"><label>Categoria</label><input id="wsp-category" type="text" value="' + (p.category || "").replace(/"/g, "&quot;") + '"></div>' +
    '<div class="field" style="margin-bottom:14px;display:flex;align-items:center;gap:8px">' +
      '<input id="wsp-active" type="checkbox" ' + (p.active !== false ? "checked" : "") + ' style="width:auto">' +
      '<label style="margin:0">Produto ativo</label>' +
    '</div>' +
    '<div class="form-actions">' +
      '<button class="btn btn-ghost btn-full" onclick="window._mlBackToWorkspaceList()">Voltar</button>' +
      '<button class="btn btn-primary btn-full" onclick="window._mlSaveWorkspaceProduct(\'' + catalogId + '\')">Guardar</button>' +
    '</div>' +
  '</div>';
}

window._mlSaveWorkspaceProduct = async function(catalogId) {
  var name = document.getElementById("wsp-name").value.trim();
  var priceVal = document.getElementById("wsp-price").value;
  var stockVal = document.getElementById("wsp-stock").value;
  var category = document.getElementById("wsp-category").value.trim();
  var active = document.getElementById("wsp-active").checked;

  var updates = {
    name: name,
    price: priceVal === "" ? null : parseFloat(priceVal),
    stock: stockVal === "" ? null : parseFloat(stockVal),
    category: category || null,
    active: active,
  };

  var res, data;
  try {
    res = await _mlAuthFetch("/workspace/" + _mlWorkspaceCache.id + "/product/" + encodeURIComponent(catalogId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    data = await res.json();
  } catch (e) {
    toast("Sem ligação à internet.", "error");
    return;
  }
  if (res.status === 401) { loadMultilojas(); return; }
  if (!res.ok || !data || !data.success) {
    toast((data && data.error) || "Erro ao guardar alteração.", "error");
    return;
  }

  var idx = _mlWorkspaceProducts.findIndex(function(x) { return x.catalog_id === catalogId; });
  if (idx >= 0) {
    _mlWorkspaceProducts[idx] = Object.assign({}, _mlWorkspaceProducts[idx], updates);
  }

  toast("Produto atualizado.", "success");
  _mlWorkspaceSubView = "list";
  _mlRerenderWorkspaceSection();
};

function _mlDiffSection(title, items, bg, renderItem) {
  if (!items || !items.length) return '';
  return '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">' + title + ' (' + items.length + ')</div>' +
    '<div style="background:' + bg + ';border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:14px;display:flex;flex-direction:column;gap:6px">' +
      items.map(function(item) {
        return '<div style="font-size:12.5px;color:var(--text2)">' + renderItem(item) + '</div>';
      }).join("") +
    '</div>';
}

window._mlReviewWorkspaceDiff = async function() {
  _mlWorkspaceSubView = "diff";
  _mlWorkspaceDiffData = null;
  _mlWorkspaceDiffError = null;
  _mlRerenderWorkspaceSection();

  var res, data;
  try {
    res = await _mlAuthFetch("/workspace/" + _mlWorkspaceCache.id + "/diff");
    data = await res.json();
  } catch (e) {
    _mlWorkspaceDiffError = "Sem ligação à internet.";
    _mlRerenderWorkspaceSection();
    return;
  }
  if (res.status === 401) { loadMultilojas(); return; }
  if (!res.ok || !data || !data.success) {
    _mlWorkspaceDiffError = (data && data.error) || "Erro ao calcular diferenças.";
    _mlRerenderWorkspaceSection();
    return;
  }
  _mlWorkspaceDiffData = data;
  _mlRerenderWorkspaceSection();
};

function _mlWorkspaceDiffPlaceholderHtml() {
  if (_mlWorkspaceDiffError) {
    return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px">' +
      '<div class="empty-state-sub" style="margin-bottom:12px">' + _mlWorkspaceDiffError + '</div>' +
      '<button class="btn btn-outline btn-full" onclick="window._mlReviewWorkspaceDiff()">Tentar novamente</button>' +
    '</div>';
  }
  if (!_mlWorkspaceDiffData) {
    return '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">A carregar…</div>';
  }
  var data = _mlWorkspaceDiffData;
  var totalDiff = (data.novos || []).length + (data.alterados || []).length + (data.conflitos || []).length;
  return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px">' +
    '<div style="font-size:12px;color:var(--text3);margin-bottom:14px">Comparação entre o rascunho e o que está atualmente na loja.</div>' +
    (totalDiff === 0
      ? '<div class="empty-state"><div class="empty-state-title">Sem diferenças</div><div class="empty-state-sub">O rascunho está igual ao que a loja tem neste momento.</div></div>'
      : (
        _mlDiffSection("Produtos novos", data.novos, "#f0fdf4", function(item) { return '<span>' + item.name + '</span>'; }) +
        _mlDiffSection("Alterados", data.alterados, "#eff6ff", function(item) { return '<span>' + item.name + '</span><span style="font-size:11px;color:var(--text4)"> — ' + Object.keys(item.fieldsChanged).join(", ") + '</span>'; }) +
        _mlDiffSection("Conflitos (editados na loja e no rascunho)", data.conflitos, "#fef2f2", function(item) { return '<span>' + item.name + '</span><span style="font-size:11px;color:var(--text4)"> — ' + Object.keys(item.fieldsChanged).join(", ") + '</span>'; })
      )) +
    '<div class="form-actions" style="margin-top:16px">' +
      '<button class="btn btn-ghost btn-full" onclick="window._mlBackToWorkspaceList()">Voltar</button>' +
    '</div>' +
  '</div>';
}

window._mlConfirmExportWorkspace = function() {
  _mlWorkspaceSubView = "confirm-export";
  _mlRerenderWorkspaceSection();
};

window._mlExportWorkspace = async function() {
  var res, data;
  try {
    res = await _mlAuthFetch("/workspace/" + _mlWorkspaceCache.id + "/export", { method: "POST" });
    data = await res.json();
  } catch (e) {
    toast("Sem ligação à internet.", "error");
    return;
  }
  if (res.status === 401) { loadMultilojas(); return; }
  if (!res.ok || !data || !data.success) {
    toast((data && data.error) || "Erro ao publicar catálogo.", "error");
    return;
  }
  toast("Catálogo publicado. A loja recebe na próxima sincronização.", "success");
  _mlWorkspaceSubView = "list";
  await _mlReloadWorkspaceOnly();
  _mlRerenderWorkspaceSection();
};

// ── REGISTOS — AUDITORIA POR FUNCIONÁRIO (dados reais) ──────────────────
var ACTION_META = {
  create:  { label: "criou",              icon: "plus-circle",       color: "#16a34a" },
  edit:    { label: "editou",             icon: "pencil",            color: "#2563eb" },
  update:  { label: "editou",             icon: "pencil",            color: "#2563eb" },
  delete:  { label: "eliminou",           icon: "trash-2",           color: "#dc2626" },
  login:   { label: "iniciou sessão",     icon: "log-in",            color: "#71717a" },
  failed_admin_login: { label: "tentou aceder como admin (PIN errado)", icon: "shield-alert", color: "#dc2626" },
  resolve: { label: "resolveu incidente", icon: "check-circle",      color: "#16a34a" },
  ignore:  { label: "ignorou incidente",  icon: "x-circle",          color: "#71717a" },
  open:    { label: "abriu turno",        icon: "unlock",            color: "#16a34a" },
  close:   { label: "fechou turno",       icon: "lock",              color: "#71717a" },
  reforco:                { label: "registou reforço",           icon: "arrow-up-circle",   color: "#16a34a" },
  sangria:                { label: "registou sangria",           icon: "arrow-down-circle", color: "#d97706" },
  ajuste:                 { label: "registou ajuste de caixa",   icon: "sliders-horizontal", color: "#2563eb" },
  levantamento_bancario:  { label: "levantou do banco",          icon: "landmark",          color: "#d97706" },
  deposito_bancario:      { label: "depositou no banco",         icon: "landmark",          color: "#16a34a" },
  retirada_proprietario:  { label: "fez retirada",               icon: "user-minus",        color: "#dc2626" },
  aporte_capital:         { label: "fez aporte de capital",      icon: "user-plus",         color: "#16a34a" },
};

// ATENÇÃO: entityType/action vêm diretamente do logAudit() do Kontaki.
// A tradução abaixo é uma primeira aproximação — ajustar os nomes se os
// valores reais gravados forem diferentes.
var ENTITY_LABELS = {
  sale: "venda", product: "produto", expense: "despesa",
  stock: "stock", customer: "cliente", session: "turno",
  incident: "incidente", treasury: "movimento de tesouraria",
  user: "utilizador",
};

var REGISTO_CATEGORIES = [
  { key: "all",         label: "Todos" },
  { key: "session",     label: "Turno" },
  { key: "treasury",    label: "Tesouraria" },
  { key: "product",     label: "Produtos" },
  { key: "incident",    label: "Incidentes" },
  { key: "user",        label: "Acessos" },
];

var _mlRegistosFilter = "all";

function _mlFormatDateHeader(isoDate) {
  var d = new Date(isoDate);
  var today = new Date();
  var yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  var sameDay = function(a, b) { return a.toDateString() === b.toDateString(); };
  if (sameDay(d, today)) return "Hoje";
  if (sameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-AO", { day: "2-digit", month: "long", year: "numeric" });
}

function _mlAuditDetail(a) {
  var entityLabel = ENTITY_LABELS[a.entityType] || a.entityType || "registo";
  var capitalized = entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1);
  // logAudit() no Kontaki grava "changes" como array de {field, before, after},
  // nunca como objeto simples — por isso lemos c.field, não Object.keys().
  if (Array.isArray(a.changes) && a.changes.length) {
    var fields = a.changes.map(function(c) { return c && c.field; }).filter(Boolean);
    if (fields.length) return capitalized + " · " + fields.join(", ");
  } else if (a.changes && typeof a.changes === "object" && !Array.isArray(a.changes)) {
    // Compatibilidade com um eventual formato antigo em objeto simples.
    var keys = Object.keys(a.changes);
    if (keys.length) return capitalized + " · " + keys.join(", ");
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
        entityType: a.entityType,
        detail: _mlAuditDetail(a),
        when: _relativeTime(a.createdAt),
        createdAt: a.createdAt,
      };
    });
  } catch (e) {
    return null;
  }
}

function _mlRegistoSkelRow(isLast) {
  return '<div style="display:flex;gap:10px;padding:12px 14px;' + (isLast ? '' : 'border-bottom:1px solid #f4f4f5;') + '">' +
    '<div class="skel-line hist-skel" style="width:15px;height:15px;border-radius:4px;flex-shrink:0;margin-top:1px"></div>' +
    '<div style="flex:1;min-width:0">' +
      '<div class="skel-line skel-line--title" style="margin-bottom:6px"></div>' +
      '<div class="skel-line skel-line--sub"></div>' +
    '</div>' +
    '<div class="skel-line hist-skel" style="width:28px;height:10px;flex-shrink:0"></div>' +
  '</div>';
}

async function _renderRegistos(wrap) {
  var _token = _mlRenderToken;
  wrap.innerHTML =
    '<div style="margin-bottom:14px">' +
      '<div class="skel-line hist-skel" style="width:70px;height:15px;margin-bottom:6px"></div>' +
      '<div class="skel-line hist-skel" style="width:160px;height:11px"></div>' +
    '</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);overflow:hidden">' +
      _mlRegistoSkelRow(false) +
      _mlRegistoSkelRow(false) +
      _mlRegistoSkelRow(false) +
      _mlRegistoSkelRow(false) +
      _mlRegistoSkelRow(true) +
    '</div>';
  await _mlMinDelay(280);
  if (_token !== _mlRenderToken) return;

  if (!_mlStoresCache || !_mlStoresCache.length) {
    wrap.innerHTML = _errorHtml("Sem lojas para mostrar.");
    return;
  }

  var allEntries = await _fetchRealAuditLog();
  if (_token !== _mlRenderToken) return;
  if (allEntries === null) {
    wrap.innerHTML = _errorHtml("Não foi possível carregar os registos.");
    return;
  }

  var storeEntries = _mlSelectedStoreId === "all"
    ? allEntries
    : allEntries.filter(function(e) { return e.storeId === _mlSelectedStoreId; });

  _mlRegistosAllEntries = storeEntries;
  _mlRenderRegistosList(wrap);
}

function _mlRenderRegistosList(wrap) {
  var storeEntries = _mlRegistosAllEntries || [];
  var entries = _mlRegistosFilter === "all"
    ? storeEntries
    : storeEntries.filter(function(e) { return e.entityType === _mlRegistosFilter; });

  var chipsHtml = '<div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:12px;padding-bottom:2px">' +
    REGISTO_CATEGORIES.map(function(c) {
      var active = _mlRegistosFilter === c.key;
      return '<button onclick="window._mlSetRegistosFilter(\'' + c.key + '\')" style="flex-shrink:0;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;border:1.5px solid ' + (active ? "var(--primary,#5b21b6)" : "#e4e4e7") + ';background:' + (active ? "var(--primary,#5b21b6)" : "#fff") + ';color:' + (active ? "#fff" : "var(--text3)") + '">' + c.label + '</button>';
    }).join("") +
  '</div>';

  var groups = [];
  var groupsByDay = {};
  entries.forEach(function(e) {
    var dayKey = e.createdAt ? new Date(e.createdAt).toDateString() : "—";
    if (!groupsByDay[dayKey]) {
      groupsByDay[dayKey] = { header: e.createdAt ? _mlFormatDateHeader(e.createdAt) : "—", items: [] };
      groups.push(groupsByDay[dayKey]);
    }
    groupsByDay[dayKey].items.push(e);
  });

  var listHtml = groups.length
    ? groups.map(function(g) {
        return '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin:16px 0 6px">' + g.header + '</div>' +
          '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);overflow:hidden">' +
          g.items.map(function(e, i) {
            var meta = ACTION_META[e.action] || { label: e.action || "alterou", icon: "circle", color: "var(--text3)" };
            return '<div style="display:flex;gap:10px;padding:12px 14px;' + (i < g.items.length - 1 ? 'border-bottom:1px solid #f4f4f5;' : '') + '">' +
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
          '</div>';
      }).join("")
    : '<div class="empty-state"><div class="empty-state-title">Sem registos</div></div>';

  wrap.innerHTML =
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:2px">Registos</div>' +
      '<div style="font-size:11px;color:var(--text4)">Auditoria de alterações, dados reais</div>' +
    '</div>' +
    chipsHtml +
    listHtml;

  refreshIcons(wrap);
}

window._mlSetRegistosFilter = function(key) {
  _mlRegistosFilter = key;
  var wrap = document.getElementById("multilojas-content");
  if (wrap) _mlRenderRegistosList(wrap);
};

// ── RESUMO — TODAS AS LOJAS ────────────────────────────────────────────

function _mlDrawResumoAgregado(wrap, data) {
  var multiStore = data.storeCount > 1;

  wrap.innerHTML =
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:2px">Vendas agregadas</div>' +
      '<div style="font-size:12px;color:var(--text3)">' + data.storeCount + ' loja' + (data.storeCount !== 1 ? 's' : '') + ' · últimos 30 dias</div>' +
    '</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px 12px 8px;margin-bottom:20px;height:200px"><canvas id="ml-trend-canvas"></canvas></div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">' +
      _statCard({ label: "Total geral", value: fmt(data.grandTotal), sub: "últimos 30 dias", color: "var(--primary)", icon: "banknote" }) +
      _statCard({ label: "Lojas ativas", value: data.storeCount, sub: "na empresa", color: "var(--info,#2563eb)", icon: "store" }) +
    '</div>' +

    _liveStatusHtml() +

    (multiStore ? (
      '<div class="hist-mov-card">' +
        '<div class="hist-day-label--inset" style="padding-top:14px"><i data-lucide="trophy" style="width:13px;height:13px"></i>Ranking de lojas</div>' +
        '<div style="padding:2px 16px 14px">' +
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
        '</div>' +
      '</div>'
    ) : (
      '<div style="font-size:12px;color:var(--text4);text-align:center;padding:12px">A tua licença está associada a uma única loja. O ranking aparece quando a empresa tiver mais do que uma.</div>'
    ));

  refreshIcons(wrap);
  _renderTrendChart(data.trend.days, data.trend.values);
}

async function _renderResumoAgregado(wrap) {
  var _token = _mlRenderToken;
  var cacheKey = _mlCacheKey("resumo", "all");
  var cached = _mlCacheGet(cacheKey);

  if (cached) {
    _mlDrawResumoAgregado(wrap, cached.data);
    if (cached.isFresh) return;
  } else {
    wrap.innerHTML =
      '<div class="skel-line skel-line--title" style="margin-bottom:6px;width:45%"></div>' +
      '<div class="skel-line skel-line--sub" style="margin-bottom:20px;width:30%"></div>' +
      '<div class="hist-mov-card hist-skel" style="margin-bottom:20px;height:200px"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">' +
        '<div class="prod-stat-card hist-skel" style="height:96px"></div>' +
        '<div class="prod-stat-card hist-skel" style="height:96px"></div>' +
      '</div>' +
      '<div class="hist-mov-card hist-skel" style="margin-bottom:24px">' +
        '<div style="padding:14px 16px 0"><div class="skel-line skel-line--label" style="width:110px"></div></div>' +
        '<div class="hist-mov-item hist-mov-item--compact hist-skel">' +'<div class="skel-circle" style="width:32px;height:32px;margin-right:0"></div>' +'<div style="flex:1;min-width:0;padding-left:12px">' +'<div class="skel-line skel-line--title" style="width:60%"></div>' +'<div class="skel-line skel-line--sub" style="width:35%"></div>' +'</div>' +'<div class="skel-line skel-line--price"></div>' +'</div>' +
        '<div class="hist-mov-item hist-mov-item--compact hist-skel">' +'<div class="skel-circle" style="width:32px;height:32px;margin-right:0"></div>' +'<div style="flex:1;min-width:0;padding-left:12px">' +'<div class="skel-line skel-line--title" style="width:60%"></div>' +'<div class="skel-line skel-line--sub" style="width:35%"></div>' +'</div>' +'<div class="skel-line skel-line--price"></div>' +'</div>' +
      '</div>' +
      '<div class="hist-mov-card hist-skel">' +
        '<div style="padding:14px 16px 0"><div class="skel-line skel-line--label" style="width:90px"></div></div>' +
        '<div style="padding:8px 16px 14px">' +
          '<div class="skel-line skel-line--title" style="margin-bottom:8px"></div>' +
          '<div class="skel-line skel-line--sub" style="margin-bottom:14px"></div>' +
          '<div class="skel-line skel-line--title" style="margin-bottom:8px"></div>' +
          '<div class="skel-line skel-line--sub"></div>' +
        '</div>' +
      '</div>';
    await _mlMinDelay(280);
    if (_token !== _mlRenderToken) return;
  }

  var res;
  try {
    res = await _mlAuthFetch("/reports/multi-store/summary?days=30");
  } catch (e) {
    if (_token !== _mlRenderToken) return;
    if (!cached) wrap.innerHTML = _errorHtml("Sem ligação à internet. Verifica a rede e tenta novamente.");
    return;
  }
  if (_token !== _mlRenderToken) return;

  if (res.status === 401) { loadMultilojas(); return; }

  if (!res.ok) {
    var errData = await res.json().catch(function() { return {}; });
    if (_token !== _mlRenderToken) return;
    if (!cached) wrap.innerHTML = _errorHtml(errData.error || "Erro ao carregar o resumo.");
    return;
  }

  var data = await res.json();
  if (_token !== _mlRenderToken) return;
  if (!data || !data.success) {
    if (!cached) wrap.innerHTML = _errorHtml("Resposta inválida do servidor.");
    return;
  }

  _mlCacheSet(cacheKey, data);
  _mlDrawResumoAgregado(wrap, data);
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

  return '<div class="hist-mov-card" style="margin-bottom:24px">' +
    '<div class="hist-day-label--inset" style="padding-top:14px"><i data-lucide="activity" style="width:13px;height:13px"></i>Atividade das lojas</div>' +
    '<div style="font-size:11px;color:var(--text4);padding:0 16px 10px">Aproximado pela última sincronização — não é o estado real do turno</div>' +
    '<div style="padding:2px 16px 14px">' +
      _mlStoresCache.map(function(s, i) {
        var isRecent = s.liveStatus === 'recent';
        var dotColor = isRecent ? 'var(--success,#16a34a)' : '#d4d4d8';
        var label = s.lastSeenAt ? _relativeTime(s.lastSeenAt) : 'nunca sincronizada';
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
    '</div>' +
  '</div>';
}

// ── RESUMO — UMA LOJA ───────────────────────────────────────────────────

// ── ESTADO OPERACIONAL ───────────────────────────────────────────────────
// 4 sinais reais (sync, stock, caixa, conflitos); backup e fiados ainda
// sem sincronização nenhuma, marcados como indisponíveis em vez de mocados.
function _mlOperationalSignals(store, stock, session, conflicts, backup) {
  var minsAgo = store.lastSeenAt ? (Date.now() - new Date(store.lastSeenAt).getTime()) / 60000 : Infinity;

  var backupAvailable = backup && backup.available;
  var backupHoursAgo = backupAvailable ? (Date.now() - new Date(backup.lastBackupAt).getTime()) / 3600000 : Infinity;
  var backupOk = backupAvailable && backupHoursAgo <= 48;
  var backupDetail = backupAvailable
    ? ("último backup " + _relativeTime(backup.lastBackupAt))
    : "Sem backups enviados ao Console ainda";

  var stockAvailable = stock && stock.available;
  var lowStockCount = stockAvailable ? stock.lowStockCount : 0;
  var stockDetail = stockAvailable
    ? (lowStockCount === 0 ? "Sem produtos abaixo do mínimo" : lowStockCount + " produto" + (lowStockCount !== 1 ? "s" : "") + " abaixo do stock mínimo")
    : "Sem dados de stock sincronizados";

  var sessionAvailable = session && session.available;
  var cashDiff = sessionAvailable ? session.cashDiff : null;
  var caixaOk = cashDiff === null || cashDiff === undefined ? null : cashDiff === 0;
  var caixaDetail = !sessionAvailable
    ? "Sem sessões sincronizadas"
    : (cashDiff === null || cashDiff === undefined
        ? "Sem conferência de caixa no último turno"
        : (cashDiff === 0 ? "Sem divergências no último fecho" : "Divergência de " + fmt(cashDiff) + " no último turno"));

  var conflictsAvailable = conflicts && conflicts.available;
  var conflictCount = conflictsAvailable ? conflicts.count : 0;

  return [
    { key: "sync",      label: "Última sincronização", available: true, ok: minsAgo <= 30, detail: isFinite(minsAgo) ? _relativeTime(store.lastSeenAt) : "nunca sincronizada" },
    { key: "stock",     label: "Stock consistente",    available: stockAvailable, ok: stockAvailable ? lowStockCount === 0 : false, detail: stockDetail },
    { key: "caixa",     label: "Caixa reconciliado",   available: sessionAvailable && caixaOk !== null, ok: !!caixaOk, detail: caixaDetail },
    { key: "conflicts", label: "Sem conflitos de dados", available: conflictsAvailable, ok: conflictsAvailable ? conflictCount === 0 : false, detail: conflictsAvailable ? (conflictCount === 0 ? "Nenhum conflito detetado" : conflictCount + " conflito" + (conflictCount !== 1 ? "s" : "") + " de storeId registado" + (conflictCount !== 1 ? "s" : "")) : "Sem dados de conflitos" },
    { key: "backup",    label: "Backup atualizado",    available: backupAvailable, ok: backupOk, detail: backupDetail },
    { key: "fiados",    label: "Crédito em dia",       available: false, ok: false, detail: "Sem dados disponíveis" },
  ];
}

function _computeHealthScore(signals) {
  var available = signals.filter(function(s) { return s.available; });
  if (!available.length) return 0;
  var okCount = available.filter(function(s) { return s.ok; }).length;
  return Math.round((okCount / available.length) * 100);
}

// Aba dona de cada sinal, para o link de acao no card de atencao —
// nunca criar um destino novo, reaproveitar a navegacao existente.
var SIGNAL_ACTION_TAB = {
  sync:      { tab: "escritorio",  label: "Ver sincronização" },
  caixa:     { tab: "escritorio",  label: "Ver turno" },
  conflicts: { tab: "incidentes",  label: "Resolver" },
};

function _healthScoreHtml(store, stock, session, conflicts, backup) {
  var signals = _mlOperationalSignals(store, stock, session, conflicts, backup);
  var score = _computeHealthScore(signals);
  var scoreColor = score >= 85 ? "var(--success,#16a34a)" : score >= 60 ? "var(--warning,#d97706)" : "var(--danger,#dc2626)";

  var needsAttention = signals.filter(function(s) { return s.available && !s.ok; });
  var allGood = signals.filter(function(s) { return s.available && s.ok; });
  var noData = signals.filter(function(s) { return !s.available; });

  function signalRow(s, actionable) {
    var action = actionable ? SIGNAL_ACTION_TAB[s.key] : null;
    var icon = !s.available ? "minus-circle" : (s.ok ? "check-circle-2" : "alert-triangle");
    var color = !s.available ? "var(--text4)" : (s.ok ? "var(--success,#16a34a)" : "var(--warning,#d97706)");
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<i data-lucide="' + icon + '" style="width:14px;height:14px;color:' + color + ';flex-shrink:0"></i>' +
      '<div style="flex:1;min-width:0">' +
        '<span style="font-size:12.5px;color:var(--text2)">' + s.label + '</span>' +
        '<span style="font-size:11px;color:var(--text4)"> — ' + s.detail + '</span>' +
      '</div>' +
      (action ? '<button onclick="window._mlSwitchTab(\'' + action.tab + '\')" style="font-size:11px;font-weight:700;color:var(--primary,#5b21b6);background:none;border:none;cursor:pointer;font-family:inherit;flex-shrink:0;padding:2px 0">' + action.label + ' →</button>' : '') +
    '</div>';
  }

  return '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">Estado operacional</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px;margin-bottom:24px">' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">' +
        '<div style="width:56px;height:56px;border-radius:50%;border:4px solid ' + scoreColor + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<span style="font-size:16px;font-weight:800;color:' + scoreColor + '">' + score + '</span>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:var(--text)">' + (score >= 85 ? "Saudável" : score >= 60 ? "Precisa de atenção" : "Requer ação") + '</div>' +
          '<div style="font-size:11px;color:var(--text4)">Pontuação de 0 a 100, com base nos sinais disponíveis</div>' +
        '</div>' +
      '</div>' +

      (needsAttention.length ? (
        '<div style="font-size:10.5px;font-weight:700;color:var(--warning,#d97706);text-transform:uppercase;letter-spacing:.3px;margin-bottom:8px">Requer atenção</div>' +
        '<div style="display:flex;flex-direction:column;gap:9px;margin-bottom:16px">' +
          needsAttention.map(function(s) { return signalRow(s, true); }).join("") +
        '</div>'
      ) : '') +

      (allGood.length ? (
        '<div style="font-size:10.5px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.3px;margin-bottom:8px">Tudo OK</div>' +
        '<div style="display:flex;flex-direction:column;gap:9px' + (noData.length ? ';margin-bottom:16px' : '') + '">' +
          allGood.map(function(s) { return signalRow(s, false); }).join("") +
        '</div>'
      ) : '') +

      (noData.length ? (
        '<div style="font-size:10.5px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.3px;margin-bottom:8px">Sem dados ainda</div>' +
        '<div style="display:flex;flex-direction:column;gap:9px">' +
          noData.map(function(s) { return signalRow(s, false); }).join("") +
        '</div>'
      ) : '') +
    '</div>';
}


// ── BI — CONSOLIDADO MULTI-LOJA ──────────────────────────────────────────
// Produtos mais vendidos e métodos de pagamento cobrem toda a receita do
// período. O lucro bruto só cobre itens gravados após catalogId/
// costPrice/subtotal existirem na venda — ver profit.coveragePct.

var PAYMENT_METHOD_LABELS = {
  dinheiro: "Dinheiro", transferencia: "Transferência",
  multicaixa: "Multicaixa", fiado: "Fiado",
};

var PAYMENT_METHOD_ICONS = {
  dinheiro: "wallet", transferencia: "building-2",
  multicaixa: "credit-card", fiado: "clock",
};

function _mlPaymentLabel(method) {
  return PAYMENT_METHOD_LABELS[method] || method;
}

function _mlPaymentIcon(method) {
  return PAYMENT_METHOD_ICONS[method] || "banknote";
}

function _mlBiSkeletonRow() {
  return '<div class="hist-mov-item hist-mov-item--compact hist-skel">' +
    '<div class="skel-circle" style="width:40px;height:40px;margin-right:0"></div>' +
    '<div style="flex:1;min-width:0;padding-left:12px">' +
      '<div class="skel-line skel-line--title" style="width:55%"></div>' +
      '<div class="skel-line skel-line--sub" style="width:30%"></div>' +
    '</div>' +
    '<div class="skel-line skel-line--price"></div>' +
  '</div>';
}

async function _renderBI(wrap) {
  var _token = _mlRenderToken;
  wrap.innerHTML =
    '<div class="skel-line skel-line--sub" style="width:35%;margin-bottom:16px"></div>' +
    '<div class="hist-section-label hist-skel" style="width:70px;height:12px;border-radius:6px;margin-bottom:10px"></div>' +
    '<div class="hist-mov-card hist-skel" style="height:96px;margin-bottom:24px"></div>' +
    '<div class="hist-section-label hist-skel" style="width:140px;height:12px;border-radius:6px;margin-bottom:10px"></div>' +
    '<div class="hist-mov-card">' + _mlBiSkeletonRow() + _mlBiSkeletonRow() + _mlBiSkeletonRow() + '</div>';

  if (!_mlStoresCache || !_mlStoresCache.length) {
    wrap.innerHTML = _errorHtml("Sem lojas para mostrar.");
    return;
  }

  var res;
  try {
    res = await _mlAuthFetch("/reports/multi-store/bi?days=30");
  } catch (e) {
    if (_token !== _mlRenderToken) return;
    wrap.innerHTML = _errorHtml("Sem ligação à internet. Verifica a rede e tenta novamente.");
    return;
  }
  if (_token !== _mlRenderToken) return;
  if (res.status === 401) { loadMultilojas(); return; }
  if (!res.ok) {
    var errData = await res.json().catch(function() { return {}; });
    if (_token !== _mlRenderToken) return;
    wrap.innerHTML = _errorHtml(errData.error || "Erro ao carregar BI.");
    return;
  }

  var data = await res.json();
  if (_token !== _mlRenderToken) return;
  if (!data || !data.success) { wrap.innerHTML = _errorHtml("Resposta inválida do servidor."); return; }

  var profit = data.profit;
  var maxPaymentTotal = data.paymentMethods.length ? data.paymentMethods[0].total : 1;

  wrap.innerHTML =
    '<div style="font-size:12.5px;font-weight:600;color:var(--text3);margin-bottom:16px">Últimos ' + data.days + ' dias</div>' +

    (profit.available ? (
      '<div class="hist-mov-card" style="margin-bottom:8px">' +
        '<div class="hist-day-label--inset" style="padding-top:14px"><i data-lucide="percent" style="width:13px;height:13px"></i>Lucro bruto</div>' +
        '<div style="padding:4px 14px 16px">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">' +
            '<div>' +
              '<div style="font-size:10.5px;color:var(--text4);margin-bottom:2px">Margem</div>' +
              '<div style="font-size:18px;font-weight:800;color:var(--success,#16a34a)">' + profit.margemPct + '%</div>' +
            '</div>' +
            '<div>' +
              '<div style="font-size:10.5px;color:var(--text4);margin-bottom:2px">Lucro</div>' +
              '<div style="font-size:18px;font-weight:800;color:var(--text)">' + fmt(profit.receita - profit.custo) + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--text4)">Receita: ' + fmt(profit.receita) + ' · Custo: ' + fmt(profit.custo) + '</div>' +
        '</div>' +
      '</div>' +
      (profit.coveragePct < 100
        ? '<div style="font-size:11px;color:var(--text4);margin-bottom:24px">Baseado em ' + profit.coveragePct + '% da receita do período — vendas mais antigas ainda não têm dados de custo por item.</div>'
        : '<div style="margin-bottom:24px"></div>')
    ) : (
      '<div class="hist-mov-card" style="margin-bottom:24px">' +
        '<div class="hist-day-label--inset" style="padding-top:14px"><i data-lucide="percent" style="width:13px;height:13px"></i>Lucro bruto</div>' +
        '<div style="padding:4px 16px 18px;text-align:center">' +
          '<div style="font-size:12.5px;color:var(--text3)">Sem dados de custo suficientes neste período ainda.</div>' +
          '<div style="font-size:11px;color:var(--text4);margin-top:4px">O lucro bruto passa a aparecer à medida que novas vendas forem sincronizadas.</div>' +
        '</div>' +
      '</div>'
    )) +

    (data.topProducts.length
      ? '<div class="hist-mov-card" style="margin-bottom:24px">' +
        '<div class="hist-day-label--inset"><i data-lucide="package" style="width:13px;height:13px"></i>Produtos mais vendidos</div>' +
        data.topProducts.map(function(p, i) {
          var rankColors = ["#d97706", "#71717a", "#b45309"];
          var rankBg = ["#fef3c7", "#f4f4f5", "#fed7aa"];
          var color = i < 3 ? rankColors[i] : "var(--text4)";
          var bg = i < 3 ? rankBg[i] : "var(--border2)";
          return '<div class="hist-mov-item hist-mov-item--compact">' +
            '<div class="hist-mov-icon" style="background:' + bg + ';color:' + color + ';font-weight:800;font-size:13px">' + (i + 1) + '</div>' +
            '<div style="flex:1;min-width:0">' +
              '<div class="hist-mov-name">' + p.name + '</div>' +
              '<div class="hist-mov-meta">' + p.qty + ' un. vendidas</div>' +
            '</div>' +
            '<div style="text-align:right;flex-shrink:0">' +
              '<div class="hist-mov-qty" style="color:var(--text)">' + fmt(p.receita) + '</div>' +
            '</div>' +
          '</div>';
        }).join("") +
        '</div>'
      : '<div class="hist-mov-card" style="margin-bottom:24px"><div class="hist-day-label--inset"><i data-lucide="package" style="width:13px;height:13px"></i>Produtos mais vendidos</div><div style="padding:16px;text-align:center;font-size:12px;color:var(--text4)">Sem vendas registadas neste período.</div></div>') +

    (data.paymentMethods.length
      ? '<div class="hist-mov-card">' +
        '<div class="hist-day-label--inset"><i data-lucide="credit-card" style="width:13px;height:13px"></i>Métodos de pagamento</div>' +
        data.paymentMethods.map(function(m, i) {
          var pct = Math.round((m.total / maxPaymentTotal) * 100);
          return '<div class="hist-mov-item hist-mov-item--compact" style="flex-direction:column;align-items:stretch;gap:8px">' +
            '<div style="display:flex;align-items:center;gap:12px">' +
              '<div class="hist-mov-icon" style="background:var(--primary-light);color:var(--primary,#5b21b6)"><i data-lucide="' + _mlPaymentIcon(m.method) + '" style="width:18px;height:18px"></i></div>' +
              '<div style="flex:1;min-width:0">' +
                '<div class="hist-mov-name">' + _mlPaymentLabel(m.method) + '</div>' +
                '<div class="hist-mov-meta">' + m.count + ' venda' + (m.count !== 1 ? 's' : '') + '</div>' +
              '</div>' +
              '<div class="hist-mov-qty" style="color:var(--text)">' + fmt(m.total) + '</div>' +
            '</div>' +
            '<div style="height:6px;background:var(--border2);border-radius:3px;overflow:hidden;margin-left:52px">' +
              '<div style="height:100%;width:' + pct + '%;background:var(--primary,#5b21b6);border-radius:3px"></div>' +
            '</div>' +
          '</div>';
        }).join("") +
        '</div>'
      : '<div class="hist-mov-card"><div class="hist-day-label--inset"><i data-lucide="credit-card" style="width:13px;height:13px"></i>Métodos de pagamento</div><div style="padding:16px;text-align:center;font-size:12px;color:var(--text4)">Sem vendas registadas neste período.</div></div>');

  refreshIcons(wrap);
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

function _mlMinDelay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function _mlDrawResumoLoja(wrap, storeId, data) {
  var totalVendas = data.sales.reduce(function(a, s) { return a + (s.total || 0); }, 0);

  var freshMins = data.store.lastSeenAt ? (Date.now() - new Date(data.store.lastSeenAt).getTime()) / 60000 : Infinity;
  var freshColor = freshMins <= 30 ? "var(--success,#16a34a)" : freshMins <= 180 ? "var(--warning,#d97706)" : "var(--text4)";

  wrap.innerHTML =
    '<div style="display:inline-flex;align-items:center;gap:6px;background:var(--bg,#f4f4f5);padding:4px 10px;border-radius:20px;margin-bottom:18px">' +
      '<span style="width:6px;height:6px;border-radius:50%;background:' + freshColor + '"></span>' +
      '<span style="font-size:11.5px;font-weight:700;color:var(--text3)">' + (data.store.lastSeenAt ? _relativeTime(data.store.lastSeenAt) : "nunca sincronizada") + '</span>' +
    '</div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">' +
      _statCard({ label: "Vendas", value: fmt(totalVendas), sub: "últimos registos", color: "var(--primary)", icon: "shopping-bag" }) +
      _statCard({ label: "Transações", value: data.sales.length, sub: "sincronizadas", color: "var(--info,#2563eb)", icon: "receipt" }) +
    '</div>' +

    _healthScoreHtml(data.store, data.stock, data.session, data.conflicts, data.backup) +

    '<div class="hist-mov-card" style="margin-bottom:24px">' +
      '<div class="hist-day-label--inset" style="padding-top:14px"><i data-lucide="database" style="width:13px;height:13px"></i>Outros dados</div>' +
      '<div style="padding:2px 16px 14px;display:flex;flex-direction:column;gap:10px">' +
        _pendingRow("Produtos", data.products.available ? (data.products.count + " sincronizados") : data.products.message) +
        _pendingRow("Stock", data.stock.available ? (data.stock.lowStockCount + " abaixo do mínimo") : data.stock.message) +
        _pendingRow("Clientes", data.customers.message) +
        _pendingRow("Despesas", data.expenses.message) +
      '</div>' +
    '</div>' +

    (data.sales.length
      ? '<div class="hist-mov-card">' +
        '<div class="hist-day-label--inset"><i data-lucide="receipt" style="width:13px;height:13px"></i>Histórico de vendas</div>' +
        data.sales.slice(0, 5).map(function(s, i) {
          return '<div style="padding:12px 16px;' + (i < Math.min(data.sales.length, 5) - 1 ? 'border-bottom:1px solid #f4f4f5;' : '') + 'display:flex;justify-content:space-between;align-items:center">' +
            '<div>' +
              '<div style="font-size:13px;font-weight:700;color:var(--text)">' + (s.clientName || "Cliente não identificado") + '</div>' +
              '<div style="font-size:11px;color:var(--text4)">' + (s.date ? new Date(s.date).toLocaleDateString("pt-AO") : "") + ' · ' + (s.payMethod || "") + '</div>' +
            '</div>' +
            '<div style="font-size:13px;font-weight:700;color:var(--text2)">' + fmt(s.total) + '</div>' +
          '</div>';
        }).join("") +
        '</div>' +
        (data.sales.length > 5
          ? '<button onclick="window._mlShowFullHistory()" style="width:100%;text-align:center;padding:12px;font-size:12.5px;font-weight:700;color:var(--primary,#5b21b6);background:none;border:none;cursor:pointer;font-family:inherit;margin-bottom:24px">Ver histórico completo →</button>'
          : '<div style="margin-bottom:24px"></div>')
      : '<div class="hist-mov-card"><div class="hist-day-label--inset"><i data-lucide="receipt" style="width:13px;height:13px"></i>Histórico de vendas</div><div style="padding:16px;text-align:center;font-size:12px;color:var(--text4)">Sem vendas registadas ainda.</div></div>');

  _mlResumoSalesCache = data.sales;
  _mlResumoStoreName = data.store.name;

  refreshIcons(wrap);
}

async function _renderResumoLoja(wrap, storeId) {
  var _token = _mlRenderToken;
  var cacheKey = _mlCacheKey("resumo", storeId);
  var cached = _mlCacheGet(cacheKey);

  if (cached) {
    _mlDrawResumoLoja(wrap, storeId, cached.data);
    if (cached.isFresh) return;
  } else {
    wrap.innerHTML =
      '<div class="skel-line skel-line--title" style="margin-bottom:6px;width:50%"></div>' +
      '<div class="skel-line skel-line--sub" style="margin-bottom:20px;width:30%"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">' +
        '<div class="prod-stat-card hist-skel" style="height:96px"></div>' +
        '<div class="prod-stat-card hist-skel" style="height:96px"></div>' +
      '</div>' +
      '<div class="hist-mov-card hist-skel" style="margin-bottom:24px">' +
        '<div class="skel-line skel-line--title" style="margin-bottom:12px"></div>' +
        '<div class="skel-line skel-line--sub" style="margin-bottom:10px"></div>' +
        '<div class="skel-line skel-line--sub" style="margin-bottom:10px"></div>' +
        '<div class="skel-line skel-line--sub"></div>' +
      '</div>' +
      '<div class="skel-line skel-line--title" style="margin-bottom:10px;width:40%"></div>' +
      '<div class="hist-sale-card hist-skel"><div class="skel-circle"></div><div style="flex:1"><div class="skel-line skel-line--title"></div><div class="skel-line skel-line--sub"></div></div><div class="skel-line skel-line--price"></div></div>' +
      '<div class="hist-sale-card hist-skel"><div class="skel-circle"></div><div style="flex:1"><div class="skel-line skel-line--title"></div><div class="skel-line skel-line--sub"></div></div><div class="skel-line skel-line--price"></div></div>' +
      '<div class="hist-sale-card hist-skel"><div class="skel-circle"></div><div style="flex:1"><div class="skel-line skel-line--title"></div><div class="skel-line skel-line--sub"></div></div><div class="skel-line skel-line--price"></div></div>';
    await _mlMinDelay(280);
    if (_token !== _mlRenderToken) return;
  }

  var res;
  try {
    res = await _mlAuthFetch("/reports/multi-store/store/" + encodeURIComponent(storeId));
  } catch (e) {
    if (_token !== _mlRenderToken) return;
    if (!cached) wrap.innerHTML = _errorHtml("Sem ligação à internet. Verifica a rede e tenta novamente.");
    return;
  }
  if (_token !== _mlRenderToken) return;

  if (res.status === 401) { loadMultilojas(); return; }

  if (!res.ok) {
    var errData = await res.json().catch(function() { return {}; });
    if (_token !== _mlRenderToken) return;
    if (!cached) wrap.innerHTML = _errorHtml(errData.error || "Erro ao carregar a loja.");
    return;
  }

  var data = await res.json();
  if (_token !== _mlRenderToken) return;
  if (!data || !data.success) {
    if (!cached) wrap.innerHTML = _errorHtml("Resposta inválida do servidor.");
    return;
  }

  _mlCacheSet(cacheKey, data);
  _mlDrawResumoLoja(wrap, storeId, data);
}

function _mlSaleRowHtml(s, isLast) {
  return '<div style="padding:12px 16px;' + (isLast ? '' : 'border-bottom:1px solid #f4f4f5;') + 'display:flex;justify-content:space-between;align-items:center">' +
    '<div>' +
      '<div style="font-size:13px;font-weight:700;color:var(--text)">' + (s.clientName || "Cliente não identificado") + '</div>' +
      '<div style="font-size:11px;color:var(--text4)">' + (s.date ? new Date(s.date).toLocaleDateString("pt-AO") : "") + ' · ' + (s.payMethod || "") + '</div>' +
    '</div>' +
    '<div style="font-size:13px;font-weight:700;color:var(--text2)">' + fmt(s.total) + '</div>' +
  '</div>';
}

window._mlShowFullHistory = function() {
  var sales = _mlResumoSalesCache || [];
  openModal("Histórico — " + (_mlResumoStoreName || "loja"),
    '<div style="max-height:65vh;overflow-y:auto;margin:-4px -20px 0;border-top:1px solid #f4f4f5">' +
      sales.map(function(s, i) { return _mlSaleRowHtml(s, i === sales.length - 1); }).join("") +
    '</div>'
  );
  refreshIcons(document.getElementById("modal-box") || document.body);
};

function _pendingRow(label, message) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px">' +
    '<span style="color:var(--text3)">' + label + '</span>' +
    '<span style="color:var(--text4);font-size:11px">' + message + '</span>' +
  '</div>';
}
