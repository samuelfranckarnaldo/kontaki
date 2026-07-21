import { loadDashboard }      from "./dashboard.js";
import { loadBI }             from "./bi.js";
import { loadConfiguracoes }  from "./configuracoes.js";
import { loadDespesas }       from "./despesas.js";
import { loadSeguranca }   from "./seguranca.js";
import { loadTurno } from "./turno.js";
import { loadTesouraria } from "./tesouraria.js";
import { getShortcutDates, getPeriodLabel } from "./historico.js";
import { loadFornecedores } from "./fornecedores.js";
import { loadEscritorio } from "./escritorio.js";
import { db }                    from "../db.js";
import { CHART_OF_ACCOUNTS, closeAccountingPeriod, isPeriodClosed } from "../pgc.js";
import { el, val, refreshIcons } from "../utils.js";
import { toast }                 from "../toast.js";
import { openModal, closeModal, confirmDialog } from "../modal.js";
import { openPicker } from "../picker.js";
import { generateInvite } from "../invite.js";
import { getUser, logout, changePasswordAuth, createUser, resetUserPin } from "../auth.js";
import { generateCodesForUser } from "../recovery-codes.js";
import { showRecoveryCodesScreen } from "../setup.js";
import { getLicense, loadLicense, activateLicense, PLANS, showUpgradeBanner } from "../license.js";
import { gerarRelatorioPDF } from "./extras.js";
import { addStockMovement, getStock } from "../services.js";

export async function initPerfil() {
  const user  = getUser();
  const store = (await db.get("settings", "store")) || {};

  var avatarEl = el("perfil-avatar");
  var nameEl   = el("perfil-name");

  if (nameEl) nameEl.textContent = user.name;

  var lic = getLicense();
  var planInfo = PLANS[lic.plan] || PLANS.basic;

  var badgeEl = el("perfil-plan-badge");
  if (badgeEl) badgeEl.textContent = planInfo.name;

  var sublineEl = el("perfil-subline");
  if (sublineEl) {
    var roleLabel = user.role === "admin" ? "Administrador" : "Operador de Caixa";
    var parts = [roleLabel];
    if (store.name) parts.push(store.name);
    sublineEl.textContent = parts.join(" · ");
  }

  startLicenseCountdown(lic);

  var crownBtn = el("perfil-crown-btn");
  if (crownBtn) {
    crownBtn.onclick = function() { window._perfilNav("assinatura"); };
  }

  if (avatarEl) {
    if (store.logo) {
      avatarEl.innerHTML = "";
      avatarEl.className = "perfil-avatar perfil-avatar--logo";
      var img = document.createElement("img");
      img.src = store.logo;
      img.className = "perfil-avatar-logo-img";
      img.alt = store.name || "Logo";
      avatarEl.appendChild(img);
    } else {
      avatarEl.className = "perfil-avatar";
      avatarEl.textContent = user.name.charAt(0).toUpperCase();
    }
  }

  renderMenu();
  setupSubpageButtons();
  renderPwaButton();
}

function renderPwaButton() {
  var wrap = el("perfil-menu");
  if (!wrap) return;
  var existing = document.getElementById("pwa-install-wrap");
  if (existing) existing.remove();
  var div = document.createElement("div");
  div.id = "pwa-install-wrap";
  div.style.cssText = "padding:0 0 12px";
  div.innerHTML =
    '<button class="btn-install-pwa" onclick="window._installPWA()" ' +
    'style="display:none;width:100%;padding:14px;background:linear-gradient(135deg,#5b21b6,#7c3aed);' +
    'color:#fff;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;' +
    'font-family:inherit;align-items:center;justify-content:center;gap:10px;margin-bottom:8px">' +
    '<i data-lucide="download" style="width:18px;height:18px"></i>' +
    'Instalar Kontaki no dispositivo</button>';
  wrap.parentNode.insertBefore(div, wrap);
  refreshIcons(div);
}


function renderMenu() {
  const user = getUser();

  const adminItems = [
    // ── Gestão ──
    { label: "Meu Turno",         sub: "Abrir, fechar e exportar turno", icon: "clock",          color: "#ede9fe", iconColor: "#5b21b6", page: "turno",         group: "Gestão"     },
    { label: "Tesouraria",        sub: "Caixa, banco e capital",         icon: "wallet",         color: "#fef3c7", iconColor: "#d97706", page: "tesouraria",    group: "Gestão"     },
    { label: "Contabilidade",     sub: "Receitas, lucros e despesas",    icon: "bar-chart-2",    color: "#dcfce7", iconColor: "#16a34a", page: "contabilidade", group: "Gestão"     },
    { label: "Business Intelligence", sub: "Tendências, comparações e análise", icon: "line-chart", color: "#fce7f3", iconColor: "#be185d", page: "dashboard",     group: "Gestão"     },
    { label: "Gestão de Stock",   sub: "Produtos e inventário",          icon: "package",        color: "#ede9fe", iconColor: "#5b21b6", page: "stock",         group: "Gestão"     },
    { label: "Fornecedores",      sub: "Compras e fornecedores",         icon: "truck",          color: "#fef3c7", iconColor: "#d97706", page: "fornecedores",  group: "Gestão"     },
    { label: "Despesas",          sub: "Renda, salários e outros custos",icon: "receipt",        color: "#fee2e2", iconColor: "#dc2626", page: "despesas",      group: "Gestão"     },
    { label: "Escritório",        sub: "Importar e confirmar turnos",    icon: "archive",        color: "#ede9fe", iconColor: "#5b21b6", page: "escritorio",    group: "Gestão"     },
    { label: "Incidentes",        sub: "Divergências de stock",          icon: "alert-triangle", color: "#fef3c7", iconColor: "#d97706", page: "incidentes",    group: "Gestão"     },
    { label: "Equipa",            sub: "Funcionários e acessos",         icon: "users-2",        color: "#dbeafe", iconColor: "#2563eb", page: "equipa",        group: "Gestão"     },
    { label: "Dados da Loja",     sub: "Nome, logo, endereço e IVA",     icon: "store",          color: "#dcfce7", iconColor: "#16a34a", page: "loja",          group: "Gestão"     },
    // ── Sistema ──
    { label: "Segurança",         sub: "Chave HMAC e auditoria",         icon: "shield",         color: "#fee2e2", iconColor: "#dc2626", page: "seguranca",     group: "Sistema"    },
    { label: "Configurações",     sub: "Backup, logs e dados",           icon: "settings",       color: "#f4f4f5", iconColor: "#71717a", page: "configuracoes", group: "Sistema"    },
  ];

  const caixaItems = [
    { label: "Meu Turno",         sub: "Abrir, fechar e exportar turno", icon: "clock",          color: "#ede9fe", iconColor: "#5b21b6", page: "turno",         group: "Gestão"     },
    { label: "Tesouraria",        sub: "Sangria, reforço e ajustes",     icon: "wallet",         color: "#fef3c7", iconColor: "#d97706", page: "tesouraria",    group: "Gestão"     },
    { label: "Escritório",        sub: "Importar ficheiros de turno",    icon: "archive",        color: "#ede9fe", iconColor: "#5b21b6", page: "escritorio",    group: "Gestão"     },
    { label: "Segurança",         sub: "Chave HMAC e auditoria",         icon: "shield",         color: "#fee2e2", iconColor: "#dc2626", page: "seguranca",     group: "Gestão"     },
  ];

  const commonItems = [
    { label: "Alterar PIN",       sub: "Mudar PIN de acesso",            icon: "lock",           color: "#f4f4f5", iconColor: "#5b21b6", page: "senha",         group: "Sistema"    },
    { label: "Assinatura",        sub: "Licença e plano activo",         icon: "award",          color: "#ede9fe", iconColor: "#5b21b6", page: "assinatura",    group: "Sistema"    },
    { label: "Ajuda",             sub: "Perguntas frequentes e como usar",icon: "help-circle",   color: "#dbeafe", iconColor: "#2563eb", page: "ajuda",         group: "Sobre"      },
    { label: "Contactos",         sub: "Suporte Introxeer Technology",   icon: "headphones",     color: "#dbeafe", iconColor: "#2563eb", page: "contactos",     group: "Sobre"      },
    { label: "Sobre",             sub: "Termos, ajuda e versão",         icon: "info",           color: "#f4f4f5", iconColor: "#71717a", page: "sobre",         group: "Sobre"      },
    { label: "Terminar Sessão",   sub: "",                               icon: "log-out",        color: "#f4f4f5", iconColor: "#71717a", page: "logout",        group: null         },
  ];

  const items = [...(user.role === "admin" ? adminItems : caixaItems), ...commonItems];

  function renderGridItem(item) {
    var isIncidentes = item.page === "incidentes";
    return '<button class="perfil-grid-item" id="' + (isIncidentes?"perfil-menu-incidentes":"") + '" onclick="window._perfilNav(\'' + item.page + '\')">' +
      '<div class="perfil-grid-icon" style="background:' + item.color + ';position:relative">' +
      '<i data-lucide="' + item.icon + '" style="color:' + item.iconColor + '"></i>' +
      (isIncidentes ? '<span id="inc-count-badge" style="display:none;position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;min-width:17px;height:17px;border-radius:9px;align-items:center;justify-content:center;padding:0 4px;border:2px solid #fff"></span>' : '') +
      '</div>' +
      '<div class="perfil-grid-label">' + item.label + '</div>' +
      '</button>';
  }

  var grouped = items.filter(function(i) { return i.group; });
  var ungrouped = items.filter(function(i) { return !i.group; });

  var groupOrder = [];
  grouped.forEach(function(i) {
    if (groupOrder.indexOf(i.group) === -1) groupOrder.push(i.group);
  });

  var groupIcons = { "Gestão": "briefcase", "Sistema": "settings", "Sobre": "info" };

  var html = groupOrder.map(function(groupName) {
    var groupItems = grouped.filter(function(i) { return i.group === groupName; });
    var icon = groupIcons[groupName] || "circle";
    return '<div class="perfil-group-label"><i data-lucide="' + icon + '"></i>' + groupName + '</div>' +
      '<div class="perfil-grid-card"><div class="perfil-grid">' +
      groupItems.map(renderGridItem).join("") +
      '</div></div>';
  }).join("");

  html += ungrouped.map(function(item) {
    return '<button class="perfil-menu-item perfil-logout-btn" onclick="window._perfilNav(\'' + item.page + '\')">' +
      '<div class="perfil-menu-item-left">' +
      '<div class="perfil-menu-icon" style="background:' + item.color + '">' +
      '<i data-lucide="' + item.icon + '" style="color:' + item.iconColor + '"></i>' +
      '</div><div>' +
      '<div style="font-size:15px;font-weight:600;color:' + item.iconColor + '">' + item.label + '</div>' +
      '</div></div>' +
      '</button>';
  }).join("");

  el("perfil-menu").innerHTML = '<div class="perfil-menu-wrap">' + html + '</div>';

  refreshIcons(el("perfil-menu"));
}

function setupSubpageButtons() {
  ["stock","incidentes","equipa","loja","senha","dashboard","despesas","contabilidade","assinatura","contactos","configuracoes",
   "seguranca","turno","fornecedores","escritorio","sobre","ajuda","notificacoes"].forEach(function(name) {
    var btn = document.getElementById("btn-back-" + name);
    if (btn) btn.onclick = function() { window._perfilBack(); };
  });

  const pwBtn   = el("btn-change-pw");
  const lojaBtn = el("btn-save-loja");
  const userBtn = el("btn-user-add");
  if (pwBtn)   pwBtn.onclick   = changePassword;
  if (lojaBtn) lojaBtn.onclick = saveStoreSettings;
  if (userBtn) userBtn.onclick = openUserAdd;
  var inviteBtn = el("btn-invite-device");
  if (inviteBtn) inviteBtn.onclick = openInviteDevice;
  ["pw-cur","pw-new","pw-conf"].forEach(function(id) {
    var inp = document.getElementById(id);
    if (inp) inp.oninput = function() { this.value = this.value.replace(/\D/g,"").slice(0,6); };
  });
}

window._perfilBack = function() {
  showSubpage(null);
};

var PAGE_FEATURE = {
  contabilidade: "contabilidade",
  fornecedores:  "fornecedores",
  equipa:        "equipe",
  turno:         "historico",
};

window._perfilNav = async (page) => {
  if (page === "logout") { logout(); return; }

  if (PAGE_FEATURE[page]) {
    var mod = await import("../license.js");
    if (!mod.hasFeature(PAGE_FEATURE[page])) {
      mod.showUpgradeBanner("Esta função requer um plano superior. Contacta a Introxeer para fazer upgrade.");
      return;
    }
  }

  showSubpage(page);
  if (page === "stock") {
    var estMod = await import("./estoque.js");
    await estMod.loadEstoquePage();
    return;
  }
  if (page === "incidentes") await loadIncidentes();
  if (page === "ajuda") await loadAjuda();
  if (page === "equipa")     await loadEquipa();
  if (page === "loja")       await loadLoja();
  if (page === "configuracoes")  await loadConfiguracoesPage();
  if (page === "contabilidade")  await loadContabilidadePage();
  if (page === "dashboard")      await loadDashboardPage();
  if (page === "assinatura")     await loadAssinaturaPage();
  if (page === "contactos")      await loadContactosPage();
  if (page === "seguranca")    await loadSegurancaPage();
  if (page === "turno")        await loadTurnoPage();
  if (page === "tesouraria")   await loadTesourariaPage();
  if (page === "fornecedores") await loadFornecedoresPage();
  if (page === "despesas")     await loadDespesasPage();
  if (page === "senha")        loadSenhaPage();
  if (page === "sobre")        loadSobre();
  if (page === "escritorio")   await loadEscritorioPage();
  if (page === "notificacoes") await loadNotificacoesPage();
};

var SUBPAGE_TITLES = {
  stock: "Stock", incidentes: "Incidentes", equipa: "Equipa", loja: "Loja",
  senha: "Senha", dashboard: "Business Intelligence", fornecedores: "Fornecedores",
  turno: "Turno", tesouraria: "Tesouraria", seguranca: "Segurança", configuracoes: "Configurações",
  contabilidade: "Contabilidade", despesas: "Despesas", assinatura: "Assinatura",
  contactos: "Contactos", escritorio: "Escritório", sobre: "Sobre",
  ajuda: "Ajuda", notificacoes: "Notificações",
};

function showSubpage(name) {
  const subpages = ["stock","incidentes","equipa","loja","senha","dashboard","fornecedores","turno","tesouraria","seguranca","configuracoes","contabilidade","despesas","assinatura","contactos","escritorio","sobre","ajuda","notificacoes"];
  subpages.forEach(s => {
    const node = el("subpage-" + s);
    if (node) node.style.display = "none";
  });
  const menu   = el("perfil-menu");
  const header = el("perfil-header");
  if (menu)   menu.style.display   = name ? "none" : "block";
  if (header) header.style.display = name ? "none" : "flex";
  if (name) {
    const node = el("subpage-" + name);
    if (node) node.style.display = "block";
  }
  const dashBtn = document.getElementById("btn-topbar-dashboard");
  if (dashBtn) {
    if (name) {
      if (!dashBtn.dataset.origOnclick) dashBtn.dataset.origOnclick = "1"; // marcador simples
      dashBtn.innerHTML = '<i data-lucide="arrow-left"></i>';
      dashBtn.onclick = function() { window._perfilBack(); };
    } else {
      dashBtn.innerHTML = '<i data-lucide="layout-dashboard"></i>';
      dashBtn.onclick = function() { window._openDashboard(); };
    }
    refreshIcons(dashBtn);
  }

  const titleEl = el("topbar-title");
  if (titleEl) {
    titleEl.textContent = name ? (SUBPAGE_TITLES[name] || name) : "Perfil";
  }
}

// loadStock removido — Gestao de Stock agora usa a aba Produtos directamente

// openProductAdd removido

// window._saveProd removido — usa produtos.js

// window._openAdjust removido — usa produtos.js

// window._applyAdjust removido daqui — definido apenas em produtos.js agora

function _fmtDateLocal(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return d.toLocaleDateString("pt-PT") + " " + d.toLocaleTimeString("pt-PT", {hour:"2-digit",minute:"2-digit"});
}

var _incFilterType   = "all";
var _incFilterStatus = "open";
var _incShowArchived = false;

window._setIncFilter = function(kind, value) {
  if (kind === "type")   _incFilterType   = value;
  if (kind === "status") { _incFilterStatus = value; _incShowArchived = (value === "archived"); }
  loadIncidentes();
};

var _ajudaLoaded = false;

function _ajudaMatch(article, q) {
  if (!q) return true;
  q = q.toLowerCase();
  if (article.title.toLowerCase().indexOf(q) !== -1) return true;
  if (article.body.toLowerCase().indexOf(q) !== -1) return true;
  return article.keywords.some(function(k){ return k.toLowerCase().indexOf(q) !== -1; });
}

function _truncateAjuda(text, max) {
  if (text.length <= max) return text;
  var cut = text.slice(0, max);
  var lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 40) cut = cut.slice(0, lastSpace);
  return cut + "…";
}

function _renderAjuda(query) {
  var wrap = document.getElementById("ajuda-content");
  if (!wrap) return;
  var articles = window._helpArticles || [];
  var results = articles.filter(function(a){ return _ajudaMatch(a, query); });

  if (!results.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-state-title">Nada encontrado para "' + query + '"</div><div style="font-size:12px;color:#71717a;margin-top:4px">Tenta outra palavra, ex: "turno", "incidente", "fiado"</div></div>';
    return;
  }

  var byCategory = {};
  var order = [];
  results.forEach(function(a){
    if (!byCategory[a.category]) { byCategory[a.category] = { icon:a.categoryIcon, items:[] }; order.push(a.category); }
    byCategory[a.category].items.push(a);
  });

  var PREVIEW_LEN = 110;

  wrap.innerHTML = order.map(function(cat){
    var group = byCategory[cat];
    return '<div style="display:flex;align-items:center;gap:8px;margin:18px 0 10px">' +
        '<div style="width:28px;height:28px;border-radius:8px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<i data-lucide="' + group.icon + '" style="width:15px;height:15px;color:var(--primary)"></i>' +
        '</div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">' + cat + '</div>' +
      '</div>' +
      group.items.map(function(a){
        return '<div class="ajuda-card" data-id="' + a.id + '" style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow-sm)">' +
          '<div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:6px">' + a.title + '</div>' +
          '<div class="ajuda-card-body" style="font-size:13px;color:var(--text2);line-height:1.6"></div>' +
          '<button type="button" class="ajuda-readmore" style="border:none;background:none;color:var(--primary);font-size:12px;font-weight:700;padding:8px 0 0;cursor:pointer">Ler mais</button>' +
        '</div>';
      }).join("");
  }).join("");

  refreshIcons(wrap);

  wrap.querySelectorAll(".ajuda-card").forEach(function(cardEl){
    var id = cardEl.getAttribute("data-id");
    var article = results.find(function(a){ return a.id === id; });
    var bodyEl = cardEl.querySelector(".ajuda-card-body");
    var btnEl = cardEl.querySelector(".ajuda-readmore");
    if (!article || !bodyEl) return;

    if (article.body.length <= PREVIEW_LEN) {
      bodyEl.textContent = article.body;
      if (btnEl) btnEl.style.display = "none";
      return;
    }

    bodyEl.textContent = _truncateAjuda(article.body, PREVIEW_LEN);
    if (btnEl) {
      btnEl.onclick = function(){
        var expanded = cardEl.getAttribute("data-expanded") === "true";
        bodyEl.textContent = expanded ? _truncateAjuda(article.body, PREVIEW_LEN) : article.body;
        btnEl.textContent = expanded ? "Ler mais" : "Mostrar menos";
        cardEl.setAttribute("data-expanded", expanded ? "false" : "true");
      };
    }
  });
}

async function loadAjuda() {
  if (!_ajudaLoaded) {
    var mod = await import("../help/index.js");
    window._helpArticles = mod.helpArticles;
    _ajudaLoaded = true;
  }
  var searchInput = document.getElementById("ajuda-search");
  if (searchInput && !searchInput._wired) {
    searchInput.oninput = function() { _renderAjuda(this.value.trim()); };
    searchInput._wired = true;
  }
  _renderAjuda(searchInput ? searchInput.value.trim() : "");
}

async function loadIncidentes() {
  const [allList, sessions, users] = await Promise.all([
    db.getAll("incidents"), db.getAll("sessions"), db.getAll("users")
  ]);
  allList.reverse();

  const sessionsById = {};
  sessions.forEach(function(s){ sessionsById[s.id] = s; });
  const usersById = {};
  users.forEach(function(u){ usersById[u.id] = u; });

  const withType = allList.map(function(i){ return Object.assign({}, i, { _type: i.type || "stock" }); });

  const filtered = withType.filter(function(i){
    if (_incFilterType !== "all" && i._type !== _incFilterType) return false;
    if (_incFilterStatus === "archived") return !!i.archived;
    if (!!i.archived) return false;
    if (_incFilterStatus !== "all" && i.status !== _incFilterStatus) return false;
    return true;
  });

  const resolvedCount  = allList.filter(function(i){ return i.status==="resolved" && !i.archived; }).length;
  const openCount      = allList.filter(function(i){ return i.status==="open"; }).length;
  const archivedCount  = allList.filter(function(i){ return !!i.archived; }).length;

  function segmentedControl(kind, current, options) {
    return '<div style="display:flex;background:var(--primary-light);border-radius:var(--radius-xl);padding:3px;margin-bottom:10px;gap:2px">' +
      options.map(function(o){
        var active = current === o.value;
        return '<button onclick="window._setIncFilter(\'' + kind + '\',\'' + o.value + '\')" style="flex:1;padding:8px 10px;border-radius:calc(var(--radius-xl) - 3px);border:none;background:' + (active?"#fff":"transparent") + ';color:' + (active?"var(--primary)":"var(--text3)") + ';font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:' + (active?"var(--shadow-sm)":"none") + ';transition:all .15s ease">' + o.label + '</button>';
      }).join("") +
      '</div>';
  }

  function chipRow(kind, current, options) {
    return '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">' +
      options.map(function(o){
        var active = current === o.value;
        return '<button onclick="window._setIncFilter(\'' + kind + '\',\'' + o.value + '\')" style="padding:6px 12px;border-radius:var(--radius-sm);border:1px solid ' + (active?"var(--primary)":"#e4e4e7") + ';background:' + (active?"var(--primary-light)":"#fff") + ';color:' + (active?"var(--primary)":"var(--text3)") + ';font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">' + o.label + '</button>';
      }).join("") +
      '</div>';
  }

  var typeOptions = [
    { value:"all",   label:"Todos os tipos" },
    { value:"stock", label:"Stock" },
    { value:"caixa", label:"Caixa" },
  ];
  var currentTypeLabel = (typeOptions.find(function(o){ return o.value===_incFilterType; }) || typeOptions[0]).label;

  var filtersHtml =
    segmentedControl("status", _incFilterStatus, [
      { value:"open",     label:"Abertos (" + openCount + ")" },
      { value:"resolved", label:"Resolvidos (" + resolvedCount + ")" },
      { value:"archived", label:"Arquivados (" + archivedCount + ")" },
      { value:"all",      label:"Todos" },
    ]) +
    '<button id="inc-type-filter-btn" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:9px 12px;margin-bottom:12px;background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-sm);cursor:pointer;font-family:inherit">' +
      '<span style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--text2)">' +
        '<i data-lucide="filter" style="width:13px;height:13px;color:var(--text3)"></i>' + currentTypeLabel +
      '</span>' +
      '<i data-lucide="chevron-down" style="width:14px;height:14px;color:var(--text3)"></i>' +
    '</button>';

  var filtersWrap = document.getElementById("inc-filters");
  if (!filtersWrap) {
    var wrap0 = document.getElementById("subpage-incidentes");
    var header0 = wrap0 ? wrap0.querySelector(".page-inner") : null;
    var listEl0 = document.getElementById("inc-list");
    if (header0 && listEl0) {
      filtersWrap = document.createElement("div");
      filtersWrap.id = "inc-filters";
      header0.insertBefore(filtersWrap, listEl0);
    }
  }
  if (filtersWrap) {
    filtersWrap.innerHTML = filtersHtml;
    refreshIcons(filtersWrap);
    var typeBtn = document.getElementById("inc-type-filter-btn");
    if (typeBtn) {
      typeBtn.onclick = function() {
        openPicker(
          "Filtrar por tipo",
          typeOptions.map(function(o){ return o.label; }),
          currentTypeLabel,
          function(chosenLabel) {
            var chosen = typeOptions.find(function(o){ return o.label === chosenLabel; });
            if (chosen) window._setIncFilter("type", chosen.value);
          }
        );
      };
    }
  }

  var clearBtn = document.getElementById("btn-clear-resolved-inc");
  if (!clearBtn) {
    var wrap = document.getElementById("subpage-incidentes");
    var header = wrap ? wrap.querySelector(".page-inner") : null;
    if (header) {
      clearBtn = document.createElement("button");
      clearBtn.id = "btn-clear-resolved-inc";
      clearBtn.style.cssText = "width:100%;padding:12px 14px;background:#fff;border:1.5px solid var(--primary-light);border-radius:var(--radius-lg);cursor:pointer;font-family:inherit;margin-bottom:12px;display:flex;align-items:center;gap:10px;text-align:left";
      clearBtn.onclick = window._clearResolvedIncidents;
      var listEl = document.getElementById("inc-list");
      if (listEl) header.insertBefore(clearBtn, listEl);
    }
  }
  if (clearBtn) {
    clearBtn.innerHTML =
      '<div style="width:32px;height:32px;border-radius:9px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
      '<i data-lucide="archive" style="width:15px;height:15px;color:var(--primary)"></i></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:13.5px;font-weight:700;color:var(--text)">Arquivar incidentes resolvidos</div>' +
      '<div style="font-size:11.5px;color:var(--text3)">' + resolvedCount + ' saem desta lista, continuam na auditoria</div>' +
      '</div>' +
      '<i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text4);flex-shrink:0"></i>';
    clearBtn.style.display = resolvedCount > 0 ? "flex" : "none";
    refreshIcons(clearBtn);
  }

  function typeIcon(t)  { return t === "caixa" ? "wallet" : "package"; }
  function typeColor(t) { return t === "caixa" ? "#5b21b6" : "#d97706"; }
  function typeBg(t)    { return t === "caixa" ? "#ede9fe" : "#fef3c7"; }
  function typeLabel(t) { return t === "caixa" ? "Caixa" : "Stock"; }

  function turnoInfo(i) {
    var s    = i.sessionId != null ? sessionsById[i.sessionId] : null;
    var resp = i.responsibleSessionId != null ? sessionsById[i.responsibleSessionId] : null;
    if (resp) {
      return 'Detectado no turno de <strong>' + (s?s.userName:"?") + '</strong> — responsabilidade do turno anterior: <strong>' + resp.userName + '</strong> (fechou ' + _fmtDateLocal(resp.closedAt) + ')';
    }
    if (s) {
      return 'Turno: <strong>' + s.userName + '</strong> · ' + (s.status==="open" ? "em curso" : "fechado " + _fmtDateLocal(s.closedAt));
    }
    return 'Sem turno associado';
  }

  function relTime(iso) {
    if (!iso) return "";
    var diffMs = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diffMs/60000);
    if (mins < 1) return "agora mesmo";
    if (mins < 60) return "há " + mins + " min";
    var hours = Math.floor(mins/60);
    if (hours < 24) return "há " + hours + (hours===1?" hora":" horas");
    var days = Math.floor(hours/24);
    if (days < 30) return "há " + days + (days===1?" dia":" dias");
    return _fmtDateLocal(iso);
  }

  el("inc-list").innerHTML = !filtered.length
    ? '<div class="empty-state"><div class="empty-state-title">Sem incidentes' + ((_incFilterStatus!=="all"||_incFilterType!=="all") ? " com este filtro" : "") + '</div></div>'
    : filtered.map(function(i) {
        var isOpen        = i.status === "open";
        var canResolve     = isOpen && getUser().role === "admin";
        var resolverName   = (i.resolvedBy != null && usersById[i.resolvedBy]) ? usersById[i.resolvedBy].name : null;
        var diff           = i.diff||0;
        var diffColor      = diff < 0 ? "var(--danger)" : diff > 0 ? "var(--success)" : "var(--text3)";
        var accentColor    = isOpen ? "var(--danger)" : "#d4d4d8";
        var timeLabel      = isOpen ? "Detectado " + relTime(i.createdAt) : "Resolvido " + relTime(i.resolvedAt||i.createdAt);

        return '<div class="inc-card" onclick="window._toggleIncDetails(' + i.id + ')" style="background:#fff;border-radius:var(--radius-lg);margin-bottom:9px;box-shadow:var(--shadow-sm);padding:12px 14px;cursor:pointer">' +

          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
            '<div style="display:flex;align-items:center;gap:7px;min-width:0">' +
              '<span style="width:7px;height:7px;border-radius:50%;background:' + accentColor + ';flex-shrink:0"></span>' +
              '<i data-lucide="' + typeIcon(i._type) + '" style="width:13px;height:13px;color:' + typeColor(i._type) + ';flex-shrink:0"></i>' +
              '<span style="font-weight:700;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + i.productName + '</span>' +
            '</div>' +
            '<i id="inc-chevron-' + i.id + '" data-lucide="chevron-down" style="width:15px;height:15px;color:var(--text4);flex-shrink:0;transition:transform .2s"></i>' +
          '</div>' +

          '<div style="font-size:12.5px;color:var(--text3);margin-top:7px">' +
            'Diferença: <strong style="color:' + diffColor + '">' + (diff > 0 ? "+" : "") + diff + ' unidade' + (Math.abs(diff)===1?"":"s") + '</strong>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--text4);margin-top:2px">' +
            'Esperado: <strong style="color:var(--text2)">' + (i.expected||0) + '</strong> → Encontrado: <strong style="color:var(--text2)">' + (i.found||0) + '</strong>' +
          '</div>' +

          '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:9px">' +
            '<span style="font-size:11px;color:var(--text4)">' + timeLabel + '</span>' +
            (canResolve
              ? '<button onclick="event.stopPropagation();window._openResolveModal(' + i.id + ')" style="flex-shrink:0;display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:var(--radius-sm);border:1px solid var(--success);background:var(--success-light);color:var(--success);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">' +
                  '<i data-lucide="check-circle" style="width:11px;height:11px"></i>Resolver</button>'
              : (isOpen
                  ? '<span style="flex-shrink:0;font-size:10px;color:var(--danger);font-weight:700">Pendente</span>'
                  : '<span style="flex-shrink:0;display:flex;align-items:center;gap:3px;font-size:10px;color:var(--success);font-weight:700"><i data-lucide="check" style="width:11px;height:11px"></i>Resolvido</span>')) +
          '</div>' +

          '<div id="inc-details-' + i.id + '" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border2)" onclick="event.stopPropagation()">' +
            '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:3px">' +
              '<i data-lucide="user" style="width:12px;height:12px;color:var(--text4);flex-shrink:0;margin-top:1px"></i>' +
              '<span style="font-size:11.5px;color:var(--text3);line-height:1.4">' + turnoInfo(i) + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:flex-start;gap:6px">' +
              '<i data-lucide="clock" style="width:12px;height:12px;color:var(--text4);flex-shrink:0;margin-top:1px"></i>' +
              '<span style="font-size:11.5px;color:var(--text3);line-height:1.4">' + _fmtDateLocal(i.createdAt) + (i.note ? " · " + i.note : "") + '</span>' +
            '</div>' +
            (!isOpen && i.resolvedNote
              ? '<div style="display:flex;align-items:flex-start;gap:6px;margin-top:3px">' +
                  '<i data-lucide="check-circle" style="width:12px;height:12px;color:var(--success);flex-shrink:0;margin-top:1px"></i>' +
                  '<span style="font-size:11.5px;color:var(--text3);line-height:1.4">Resolvido por <strong style="color:var(--text2)">' + (resolverName||"Admin") + '</strong>: ' + i.resolvedNote + '</span>' +
                '</div>'
              : '') +
          '</div>' +

        '</div>';
      }).join("");
  refreshIcons(el("inc-list"));
}

window._toggleIncDetails = function(id) {
  var details = document.getElementById("inc-details-" + id);
  var chevron = document.getElementById("inc-chevron-" + id);
  if (!details) return;
  var isOpen = details.style.display !== "none";
  details.style.display = isOpen ? "none" : "block";
  if (chevron) chevron.style.transform = isOpen ? "rotate(0deg)" : "rotate(180deg)";
};

window._clearResolvedIncidents = function() {
  confirmDialog(
    "Arquivar todos os incidentes resolvidos? Saem desta lista mas continuam guardados em \"Arquivados\" para auditoria.",
    async () => {
      const all = await db.getAll("incidents");
      const resolved = all.filter(function(i){ return i.status==="resolved" && !i.archived; });
      for (var i=0;i<resolved.length;i++) {
        await db.put("incidents", Object.assign({}, resolved[i], { archived:true, archivedAt:new Date().toISOString() }));
      }
      toast(resolved.length + " incidente(s) arquivado(s).", "success");
      await loadIncidentes();
    },
    { title: "Arquivar incidentes", confirmText: "Arquivar", icon: "archive" }
  );
};

window._openResolveModal = function(id) {
  if (!getUser() || getUser().role !== "admin") { toast("Só administradores podem resolver incidentes.", "error"); return; }
  openModal("Resolver Incidente",
    '<div style="font-size:13px;color:#71717a;margin-bottom:12px;line-height:1.5">Escreve uma justificação antes de marcar como resolvido — isto fica gravado na auditoria.</div>' +
    '<div class="field"><label>Justificação *</label>' +
    '<textarea id="resolve-note" rows="3" placeholder="Ex: confirmado com o funcionário, valor entregue ao caixa central." style="width:100%;padding:10px;border:1.5px solid #ddd6fe;border-radius:8px;font-family:inherit;font-size:13px;resize:vertical"></textarea>' +
    '</div>' +
    '<div class="form-actions" style="margin-top:14px">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-success btn-full" onclick="window._confirmResolveInc(' + id + ')"><i data-lucide="check"></i> Confirmar resolução</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._confirmResolveInc = async function(id) {
  var noteEl = document.getElementById("resolve-note");
  var note = noteEl ? noteEl.value.trim() : "";
  if (!note) { toast("Escreve uma justificação antes de resolver.", "error"); return; }
  if (!getUser() || getUser().role !== "admin") { toast("Só administradores podem resolver incidentes.", "error"); return; }

  const i = await db.get("incidents", id);
  await db.put("incidents", Object.assign({}, i, {
    status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: getUser().id, resolvedNote: note
  }));
  if (i.productId != null) {
    const novoStock = (i.countedStock != null) ? i.countedStock : i.found;
    if (novoStock != null) {
      const p = await db.get("products", i.productId);
      if (p) {
        const loc = i.location || "shop";
        const actual = await getStock(i.productId, loc);
        const delta = novoStock - actual;
        if (delta !== 0) {
          await addStockMovement({
            productId: i.productId, productName: p.name,
            type: "incident_resolution", location: loc, qty: delta,
            reference: "incident#" + id, note: note,
            userId: getUser().id, createdAt: new Date().toISOString(),
          });
        }
      }
    }
  }
  closeModal();
  toast("Incidente resolvido.", "success");
  loadIncidentes();
};

async function loadEquipa() {
  const [users, sessions] = await Promise.all([db.getAll("users"), db.getAll("sessions")]);
  const me = getUser();
  el("users-list").innerHTML = users.map(function(u) {
    const ns = sessions.filter(function(s){ return s.userId === u.id; }).length;
    const isMe = u.id === me.id;
    return (
      '<div class="team-card">' +
      '<div class="team-card-avatar team-card-avatar--' + (u.role==="admin"?"admin":"caixa") + '">' + u.name.charAt(0).toUpperCase() + '</div>' +
      '<div class="team-card-info">' +
      '<div class="team-card-name">' + u.name + (isMe ? ' <span class="team-card-you">(tu)</span>' : '') + '</div>' +
      '<div class="team-card-meta">@' + u.username + ' · ' + (u.role==="admin"?"Administrador":"Caixa") + ' · ' + ns + ' sessões</div>' +
      '</div>' +
      '<div class="team-card-actions">' +
      '<span class="badge-status" style="background:' + (u.active?"#dcfce7":"#fee2e2") + ';color:' + (u.active?"var(--success)":"var(--danger)") + '">' + (u.active?"Activo":"Inactivo") + '</span>' +
      (!isMe ?
        (u.role === "caixa" ?
          '<button class="team-card-btn" onclick="window._abrirResetPin(' + u.id + ')" title="Repor PIN">' +
          '<i data-lucide="key"></i></button>'
          : '') +
        '<button class="team-card-btn" onclick="window._toggleUser(' + u.id + ')" title="' + (u.active?"Desactivar":"Activar") + '">' +
        '<i data-lucide="' + (u.active?"user-x":"user-check") + '"></i></button>' +
        '<button class="team-card-btn team-card-btn--danger" onclick="window._deleteUser(' + u.id + ')" title="Eliminar">' +
        '<i data-lucide="trash-2"></i></button>'
        : '') +
      '</div></div>'
    );
  }).join("");
  refreshIcons(el("users-list"));
}

window._abrirResetPin = function(userId) {
  window._resetPinTargetId = userId;
  openModal("Repor PIN",
    '<div style="font-size:13px;color:#71717a;margin-bottom:14px;line-height:1.5">Define um novo PIN para este funcionário. Ele não precisa de saber o PIN antigo.</div>' +
    '<div class="field"><label>Novo PIN (6 dígitos)</label>' +
    '<div class="pin-input-wrap">' +
    '<input type="password" id="rp-new-pin" inputmode="numeric" maxlength="6" pattern="[0-9]*" placeholder="••••••"/>' +
    '<button type="button" class="pin-eye-btn" onclick="window._toggleRpPin(this,\'rp-new-pin\')"><i data-lucide="eye"></i></button>' +
    '</div></div>' +
    '<div class="field"><label>O teu PIN de administrador (confirmação)</label>' +
    '<div class="pin-input-wrap">' +
    '<input type="password" id="rp-admin-pin" inputmode="numeric" maxlength="6" pattern="[0-9]*" placeholder="••••••"/>' +
    '<button type="button" class="pin-eye-btn" onclick="window._toggleRpPin(this,\'rp-admin-pin\')"><i data-lucide="eye"></i></button>' +
    '</div></div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmResetPin()">Repor PIN</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._toggleRpPin = function(btn, inputId) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  btn.innerHTML = '<i data-lucide="' + (isHidden?"eye-off":"eye") + '"></i>';
  refreshIcons(btn.parentElement);
};

window._confirmResetPin = async function() {
  var newPin   = el("rp-new-pin") ? el("rp-new-pin").value.trim() : "";
  var adminPin = el("rp-admin-pin") ? el("rp-admin-pin").value.trim() : "";
  try {
    await resetUserPin(window._resetPinTargetId, newPin, adminPin);
    toast("PIN reposto com sucesso.", "success");
    closeModal();
    loadEquipa();
  } catch(err) {
    toast(err.message, "error");
  }
};

function openInviteDevice() {
  window._inviteRole = "caixa";
  openModal("Convidar Operador",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div style="font-size:13px;color:#71717a;line-height:1.5">Cria um código curto para o teu funcionário usar noutro telemóvel.</div>' +

    '<div class="field"><label>Código de Convite *</label><input id="inv-code" placeholder="Ex: MERC2026" style="text-transform:uppercase"/></div>' +
    '<button class="btn btn-primary btn-full" onclick="window._generateInviteQR()">' +
    '<i data-lucide="qr-code"></i> Gerar Convite</button>' +
    '<div id="inv-qr-wrap" style="display:none;flex-direction:column;align-items:center;gap:12px;padding-top:8px">' +
    '<div id="inv-qr-box" style="padding:12px;background:#fff;border-radius:14px;border:1.5px solid #e4e4e7"></div>' +
    '<div id="inv-code-display" style="font-size:13px;color:#71717a;text-align:center"></div>' +
    '<button class="btn btn-outline btn-full" onclick="window._downloadInviteFile()">' +
    '<i data-lucide="download"></i> Descarregar ficheiro</button>' +
    '</div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
}

window._setInviteRole = function(r) {
  window._inviteRole = r;
  var caixaBtn = document.getElementById("inv-role-caixa");
  var adminBtn = document.getElementById("inv-role-admin");
  if (caixaBtn) caixaBtn.classList.toggle("active", r === "caixa");
  if (adminBtn) adminBtn.classList.toggle("active", r === "admin");
};

window._generateInviteQR = async function() {
  var codeInput = document.getElementById("inv-code");
  var code = codeInput ? codeInput.value.trim() : "";
  if (!code) { toast("Insere um código de convite.", "error"); return; }

  try {
    var payload = await generateInvite(code, window._inviteRole);
    window._currentInvitePayload = payload;

    var qrWrap = document.getElementById("inv-qr-wrap");
    var qrBox = document.getElementById("inv-qr-box");
    var codeDisplay = document.getElementById("inv-code-display");

    if (qrWrap) qrWrap.style.display = "flex";
    if (codeDisplay) codeDisplay.textContent = "Código: " + payload.inviteCode;

    var { generateQR } = await import("../utils.js");
    generateQR(JSON.stringify(payload), qrBox, 180);
  } catch (err) {
    alert(err.message || "Erro ao gerar convite.");
  }
};

window._downloadInviteFile = function() {
  var payload = window._currentInvitePayload;
  if (!payload) return;
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "convite-" + payload.inviteCode + ".ktkinvite";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

function openUserAdd() {
  openModal("Novo Funcionário",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Nome Completo *</label><input id="uf-name" placeholder="Ex: Maria Silva"/></div>' +
    '<div class="field"><label>Username *</label><input id="uf-user" placeholder="Ex: maria"/></div>' +
    '<div class="field"><label>PIN (6 dígitos) *</label>' +
    '<div class="pin-input-wrap">' +
    '<input type="password" id="uf-pin" inputmode="numeric" maxlength="6" pattern="[0-9]*" placeholder="••••••"/>' +
    '<button type="button" class="pin-eye-btn" onclick="window._toggleUfPin(this)"><i data-lucide="eye"></i></button>' +
    '</div></div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._saveUser()">' +
    '<i data-lucide="user-plus"></i> Adicionar</button>' +
    '</div>');
  window._ufRole = "caixa";
  refreshIcons(el("modal-box"));
}

window._toggleUfPin = function(btn) {
  var input = document.getElementById("uf-pin");
  if (!input) return;
  var isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  btn.innerHTML = '<i data-lucide="' + (isHidden?"eye-off":"eye") + '"></i>';
  refreshIcons(btn.parentElement);
};

window._setUfRole = function(role) {
  window._ufRole = role;
  var caixaBtn = document.getElementById("uf-role-caixa");
  var adminBtn = document.getElementById("uf-role-admin");
  if (caixaBtn) caixaBtn.classList.toggle("active", role==="caixa");
  if (adminBtn) adminBtn.classList.toggle("active", role==="admin");
};

window._saveUser = async () => {
  const name     = el("uf-name").value.trim();
  const username = el("uf-user").value.trim();
  const pin      = el("uf-pin").value.trim();
  const role     = window._ufRole || "caixa";
  if (!name || !username || !pin) { toast("Preencha todos os campos.", "error"); return; }
  if (!/^\d{6}$/.test(pin)) { toast("O PIN deve ter exactamente 6 dígitos.", "error"); return; }
  try {
    await createUser(name, username, pin, role);
    toast("Funcionário adicionado.", "success");
    closeModal();
    loadEquipa();
  } catch(err) {
    toast(err.message, "error");
  }
};

window._toggleUser = async (id) => {
  const u = await db.get("users", id);
  await db.put("users", { ...u, active: !u.active });
  toast(u.active ? "Desactivado." : "Activado.", "success");
  loadEquipa();
};

window._deleteUser = async (id) => {
  const u = await db.get("users", id);
  if (!u) return;
  confirmDialog(
    "Eliminar " + u.name + "? Esta ação é irreversível. O histórico de vendas e sessões deste funcionário será mantido para auditoria, mas ele deixará de poder entrar no sistema.",
    async () => {
      await db.delete("users", id);
      toast("Funcionário eliminado.", "success");
      loadEquipa();
    },
    { title: "Eliminar funcionário", confirmText: "Eliminar", danger: true, icon: "user-x" }
  );
};

async function loadLoja() {
  const s = (await db.get("settings", "store")) || {};
  var fields = {
    "ss-name":     s.name     || "",
    "ss-addr":     s.address  || "",
    "ss-phone":    s.phone    || "",
    "ss-province": s.province || "",
    "ss-nif":      s.nif      || "",
    "ss-email":    s.email    || "",
    "ss-iva":      s.iva !== undefined ? String(s.iva) : "",
  };
  Object.entries(fields).forEach(function([id, val]) {
    var el2 = document.getElementById(id);
    if (el2) el2.value = val;
  });
  if (s.logo) renderLogoPreview(s.logo);

  var PROVINCIAS = ["Bengo","Benguela","Bié","Cabinda","Cuando","Cuanza Norte","Cuanza Sul","Cubango","Cunene","Huambo","Huíla","Icolo e Bengo","Luanda","Lunda Norte","Lunda Sul","Malanje","Moxico","Moxico Leste","Namibe","Uíge","Zaire"];
  var provSel = document.getElementById("ss-province");
  var provBtn = document.getElementById("ss-province-btn");
  var provLabel = document.getElementById("ss-province-label");
  if (provSel && provBtn && provLabel) {
    provLabel.textContent = provSel.value || "Seleccionar...";
    provBtn.onclick = function() {
      openPicker(
        "Selecionar província",
        PROVINCIAS,
        provSel.value,
        function(chosen) {
          provSel.value = chosen;
          provLabel.textContent = chosen;
        }
      );
    };
  }

  var upload = document.getElementById("logo-upload");
  if (upload) {
    upload.onchange = async function(e) {
      var licMod = await import("../license.js");
      if (!licMod.hasFeature("logotipo")) {
        licMod.showUpgradeBanner("Logotipo da loja disponível a partir do plano Pro. Contacta a Introxeer para upgrade.");
        e.target.value = "";
        return;
      }
      var file = e.target.files[0];
      if (!file) return;
      var maxBytes = 2 * 1024 * 1024; // 2MB — o mesmo limite já anunciado no ecrã
      if (file.size > maxBytes) {
        toast("Imagem demasiado grande. Máximo 2MB.", "error");
        e.target.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = async function(ev) {
        var dataUrl = ev.target.result;
        var existing = (await db.get("settings", "store")) || {};
        await db.put("settings", Object.assign({}, existing, { key: "store", logo: dataUrl }));
        renderLogoPreview(dataUrl);
        toast("Logo guardado.", "success");
      };
      reader.readAsDataURL(file);
    };
  }

  var removeBtn = document.getElementById("btn-remove-logo");
  if (removeBtn) {
    removeBtn.onclick = window._removeLogo;
  }
}

async function saveStoreSettings() {
  var existing = (await db.get("settings", "store")) || {};
  var ivaRaw = val("ss-iva").replace(",", ".");
  var ivaVal = parseFloat(ivaRaw);
  await db.put("settings", Object.assign({}, existing, {
    key:      "store",
    name:     val("ss-name"),
    address:  val("ss-addr"),
    phone:    val("ss-phone"),
    province: val("ss-province"),
    nif:      val("ss-nif"),
    email:    val("ss-email"),
    iva:      isNaN(ivaVal) ? 0 : ivaVal
  }));
  toast("Dados guardados.", "success");
}

async function changePassword() {
  const cur = val("pw-cur"), nw = val("pw-new"), conf = val("pw-conf");
  if (!cur || !nw || !conf) { toast("Preencha todos os campos.", "error"); return; }
  if (!/^\d{6}$/.test(nw)) { toast("O novo PIN deve ter exactamente 6 dígitos numéricos.", "error"); return; }
  if (nw !== conf) { toast("Os PINs não coincidem.", "error"); return; }
  try {
    await changePasswordAuth(cur, nw);
    el("pw-cur").value = ""; el("pw-new").value = ""; el("pw-conf").value = "";

    // PIN mudou -> códigos de recuperação antigos deixam de fazer
    // sentido (associados ao PIN anterior); regenera automaticamente.
    const user = getUser();
    const codes = await generateCodesForUser(user.id);
    showRecoveryCodesScreen(codes, function() {
      toast("PIN alterado. Novos códigos de recuperação gerados.", "success");
    });
  } catch(err) {
    toast(err.message, "error");
  }
}

window._togglePinField = function(id, btn) {
  var input = document.getElementById(id);
  if (!input) return;
  var isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  btn.innerHTML = '<i data-lucide="' + (isHidden?"eye-off":"eye") + '"></i>';
  refreshIcons(btn.parentElement);
};

window._closeModal = closeModal;

async function loadDashboardPage() {
  const btn = document.getElementById("btn-back-dashboard");
  if (btn) btn.onclick = () => showSubpage(null);
  await loadBI();
}

async function loadFornecedoresPage() {
  const btn = document.getElementById("btn-back-fornecedores");
  if (btn) btn.onclick = () => showSubpage(null);
  window._showSubpage = showSubpage;
  await loadFornecedores();
}

async function loadTurnoPage() {
  const btn = document.getElementById("btn-back-turno");
  if (btn) btn.onclick = () => showSubpage(null);
  window._showSubpage = showSubpage;
  await loadTurno();
}

async function loadTesourariaPage() {
  const btn = document.getElementById("btn-back-tesouraria");
  if (btn) btn.onclick = () => showSubpage(null);
  window._showSubpage = showSubpage;
  await loadTesouraria();
}

async function loadIncidentesPage() {
  const btn = document.getElementById("btn-back-incidentes");
  if (btn) btn.onclick = () => showSubpage(null);
  window._showSubpage = showSubpage;
  await loadIncidentes();
}

async function loadSegurancaPage() {
  const btn = document.getElementById("btn-back-seguranca");
  if (btn) btn.onclick = () => showSubpage(null);
  window._showSubpage = showSubpage;
  await loadSeguranca();
}

async function loadConfiguracoesPage() {
  const btn = document.getElementById("btn-back-configuracoes");
  if (btn) btn.onclick = () => showSubpage(null);
  window._showSubpage = showSubpage;
  await loadConfiguracoes();
}


async function loadContabilidadePage() {
  var btn = document.getElementById("btn-back-contabilidade");
  if (btn) btn.onclick = function(){ showSubpage(null); };
  window._showSubpage = showSubpage;
  await loadContabilidade();
}

async function loadAssinaturaPage() {
  var btn = document.getElementById("btn-back-assinatura");
  if (btn) btn.onclick = function(){ showSubpage(null); };
  window._showSubpage = showSubpage;
  await loadAssinatura();
}

async function loadContactosPage() {
  var btn = document.getElementById("btn-back-contactos");
  if (btn) btn.onclick = function(){ showSubpage(null); };
  window._showSubpage = showSubpage;
  await loadContactos();
}

var activeContaTab = "resumo";

var CONTA_TAB_ORDER = ["resumo", "razao", "balancete", "demonstracoes"];
var CONTA_TAB_LABELS = { resumo:"Resumo", razao:"Razão", balancete:"Balancete", demonstracoes:"Demonstrações" };

function renderContaTabs() {
  var wrap = document.getElementById("contabilidade-tabs");
  if (!wrap) return;
  wrap.innerHTML = CONTA_TAB_ORDER.map(function(id) {
    return '<button class="ct-tab' + (activeContaTab===id?" active":"") + '" data-tab="' + id + '" onclick="window._contaTab(\'' + id + '\')">' + CONTA_TAB_LABELS[id] + '</button>';
  }).join("") + '<div class="ct-tab-indicator" id="conta-tab-indicator"></div>';
  setupContaSwipe();
}

function setupContaSwipe() {
  var container = document.querySelector("#subpage-contabilidade .page-inner");
  var tabbar = document.getElementById("contabilidade-tabs");
  var indicator = document.getElementById("conta-tab-indicator");
  if (!container || !tabbar || !indicator) return;

  // Largura base fixa de 1px — o tamanho real vem de scaleX (só transform, sem reflow)
  indicator.style.width = "1px";
  indicator.style.transformOrigin = "left center";
  indicator.style.willChange = "transform";

  function computeRects() {
    return CONTA_TAB_ORDER.map(function(t) {
      var btn = tabbar.querySelector('.ct-tab[data-tab="' + t + '"]');
      return btn ? { left: btn.offsetLeft, width: btn.offsetWidth } : { left:0, width:0 };
    });
  }
  var rects = computeRects();

  function setIndicator(idx, animate) {
    var r = rects[idx];
    if (!r) return;
    indicator.style.transition = animate ? "transform .25s ease" : "none";
    indicator.style.transform = "translateX(" + r.left + "px) scaleX(" + r.width + ")";
  }
  setIndicator(CONTA_TAB_ORDER.indexOf(activeContaTab), false);

  if (container.dataset.ctaSwipeBound) return;
  container.dataset.ctaSwipeBound = "1";

  var startX = 0, startY = 0, tracking = false, curIdx = 0;

  container.addEventListener("touchstart", function(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    curIdx = CONTA_TAB_ORDER.indexOf(activeContaTab);
    rects = computeRects();
  }, { passive: true });

  container.addEventListener("touchmove", function(e) {
    if (!tracking) return;
    var dx = e.touches[0].clientX - startX;
    var dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
    var targetIdx = dx < 0 ? curIdx + 1 : curIdx - 1;
    if (targetIdx < 0 || targetIdx > CONTA_TAB_ORDER.length - 1) targetIdx = curIdx;
    var cur = rects[curIdx], tgt = rects[targetIdx];
    var tabWidth = cur.width || 100;
    var progress = Math.min(Math.abs(dx) / tabWidth, 1);
    var interpLeft  = cur.left + (tgt.left - cur.left) * progress;
    var interpWidth = cur.width + (tgt.width - cur.width) * progress;
    indicator.style.transition = "none";
    indicator.style.transform = "translateX(" + interpLeft + "px) scaleX(" + interpWidth + ")";
  }, { passive: true });

  container.addEventListener("touchend", function(e) {
    if (!tracking) return;
    tracking = false;
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) >= 60 && Math.abs(dx) >= Math.abs(dy) * 1.2) {
      if (dx < 0 && curIdx < CONTA_TAB_ORDER.length - 1) {
        window._contaTab(CONTA_TAB_ORDER[curIdx + 1]);
        return;
      } else if (dx > 0 && curIdx > 0) {
        window._contaTab(CONTA_TAB_ORDER[curIdx - 1]);
        return;
      }
    }
    setIndicator(curIdx, true);
  }, { passive: true });
}

window._contaTab = async function(tab) {
  activeContaTab = tab;
  renderContaTabs();
  await loadContabilidade();
};

async function loadContabilidade() {
  var wrap = document.getElementById("contabilidade-content");
  if (!wrap) return;
  wrap.classList.add("ct-fade-panel");
  wrap.classList.remove("ct-fade-in");

  // Contabilidade expõe COGS, margens e accountingArchive — dados
  // operacional-confidenciais (ver docs/architecture/
  // 04-data-classification.md). Só admin. Ver Threat Model, Cenário 3.
  var _user = getUser();
  if (!_user || _user.role !== "admin") {
    wrap.innerHTML =
      '<div style="text-align:center;padding:48px 20px;color:#a1a1aa">' +
      '<div style="font-size:14px;font-weight:600">Acesso restrito</div>' +
      '<div style="font-size:13px;margin-top:6px">Esta secção está disponível apenas para administradores.</div>' +
      '</div>';
    return;
  }

  renderContaTabs();

  // Skeleton instantâneo — a troca de aba nunca fica "congelada" esperando dados
  wrap.innerHTML =
    '<div class="conta-skel-block"></div><div class="conta-skel-block"></div>' +
    '<div class="conta-skel-block"></div><div class="conta-skel-block"></div>';
  void wrap.offsetWidth;
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { wrap.classList.add("ct-fade-in"); });
  });

  if (activeContaTab === "resumo")     await loadContaResumo(wrap);
  else if (activeContaTab === "razao")      await loadContaRazao(wrap);
  else if (activeContaTab === "balancete")      await loadContaBalancete(wrap);
  else if (activeContaTab === "demonstracoes")  await loadContaDemonstracoes(wrap);
}

function accountBalance(entries, code) {
  var acc = CHART_OF_ACCOUNTS.find(function(c){ return c.code === code; });
  if (!acc) return 0;
  var d = 0, c = 0;
  entries.forEach(function(e) {
    (e.lines||[]).forEach(function(l) {
      if (l.account === code) { d += l.debit||0; c += l.credit||0; }
    });
  });
  return acc.natureza === "devedora" ? (d - c) : (c - d);
}

async function loadContaResumo(wrap) {
  var sales     = await db.getAll("sales");
  var purchases = await db.getAll("purchases");
  var products  = await db.getAll("products");
  var allExpenses = await db.getAll("expenses");
  var entries   = await db.getAll("journalEntries");
  var suppliers = await db.getAll("suppliers");
  var suppliersById = {};
  suppliers.forEach(function(s){ suppliersById[s.id] = s; });
  var hasOverduePayable = purchases.some(function(p){
    if (p.archived === true) return false;
    var saldo = (p.total||0) - (p.amountPaid||0);
    if (saldo <= 0) return false;
    var supp = suppliersById[p.supplierId];
    if (!supp || !supp.paymentTermDays) return false;
    var due = new Date(p.date);
    due.setDate(due.getDate() + supp.paymentTermDays);
    return new Date() > due;
  });

  var now       = new Date();
  var mes       = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
  var hoje      = now.toISOString().slice(0,10);
  var mesAnteriorDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  var mesAnterior = mesAnteriorDate.getFullYear() + "-" + String(mesAnteriorDate.getMonth()+1).padStart(2,"0");

  function calcMes(mesStr) {
    var vendasM  = sales.filter(function(s){ return (s.date||"").startsWith(mesStr); });
    var receitaM = vendasM.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
    var prodMap = {};
    products.forEach(function(p){ prodMap[p.id]=p; });
    var cogsM = vendasM.reduce(function(a,s){
      var custoVenda = (s.items||[]).reduce(function(b,i){
        var p = prodMap[i.id];
        return b + (p ? (p.costPrice||0)*i.qty : 0);
      },0);
      var propDev = s.total > 0 ? (s.totalDevolvido||0)/s.total : 0;
      return a + custoVenda * (1 - propDev);
    },0);
    var despesasM = allExpenses.filter(function(e){ return (e.date||"").startsWith(mesStr) && e.countsInAccounting !== false; })
      .reduce(function(a,e){ return a+(e.amount||0); },0);
    return { vendas:vendasM, receita:receitaM, cogs:cogsM, despesas:despesasM, lucroBruto:receitaM-cogsM, lucroLiquido:receitaM-cogsM-despesasM };
  }

  var atual    = calcMes(mes);
  var anterior = calcMes(mesAnterior);
  var vendasHoje  = sales.filter(function(s){ return (s.date||"").startsWith(hoje); });
  var receitaHoje = vendasHoje.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);

  var margemLiquidaMes = atual.receita > 0 ? ((atual.lucroLiquido/atual.receita)*100).toFixed(1) : "0.0";

  var trendPct = anterior.lucroLiquido !== 0
    ? Math.round(((atual.lucroLiquido - anterior.lucroLiquido) / Math.abs(anterior.lucroLiquido)) * 100)
    : null;

  // Contexto vs mês anterior (mesmo padrão do Histórico)
  var contextPhrase = "";
  if (atual.vendas.length === 0) {
    contextPhrase = "Sem vendas neste mês";
  } else if (trendPct !== null) {
    if (trendPct > 20)        contextPhrase = "Muito acima do mês passado";
    else if (trendPct > 2)    contextPhrase = "Melhor que o mês passado";
    else if (trendPct >= -2)  contextPhrase = "Igual ao mês passado";
    else if (trendPct >= -20) contextPhrase = "Abaixo do mês passado";
    else                       contextPhrase = "Muito abaixo do mês passado";
  }

  // Recorde — melhor resultado líquido dos últimos 6 meses
  var melhorDosUltimos6 = true;
  for (var mi = 1; mi <= 5; mi++) {
    var dPast = new Date(now.getFullYear(), now.getMonth()-mi, 1);
    var mesPast = dPast.toISOString().slice(0,7);
    var resPast = calcMes(mesPast).lucroLiquido;
    if (resPast > atual.lucroLiquido) { melhorDosUltimos6 = false; break; }
  }
  var isRecord = melhorDosUltimos6 && atual.vendas.length > 0 && atual.lucroLiquido > 0;
  var recordHtml = isRecord ? '<div class="hist-hero-record"><i data-lucide="award"></i>Melhor mês dos últimos 6 meses!</div>' : '';

  var comprasMes = purchases.filter(function(p){ return (p.date||"").startsWith(mes); })
    .reduce(function(a,p){ return a+(p.total||0); },0);
  var devMes = atual.vendas.reduce(function(a,s){ return a+(s.totalDevolvido||0); },0);

  // ── Posição financeira (fonte: livro razão) ──
  var saldoCaixaBanco = accountBalance(entries, "45") + accountBalance(entries, "43") + accountBalance(entries, "44") + accountBalance(entries, "42") + accountBalance(entries, "41");
  var contasAReceber  = accountBalance(entries, "31");
  var contasAPagar    = accountBalance(entries, "32");
  var ivaAPagar       = accountBalance(entries, "34");

  // Top produtos
  var prodReceita = {};
  atual.vendas.forEach(function(s){
    (s.items||[]).forEach(function(i){
      prodReceita[i.id] = (prodReceita[i.id]||{name:i.name,total:0,qty:0});
      prodReceita[i.id].total += i.price*i.qty;
      prodReceita[i.id].qty   += i.qty;
    });
  });
  var topProd = Object.values(prodReceita).sort(function(a,b){ return b.total-a.total; }).slice(0,5);

  // Por método de pagamento
  var porMetodo = {};
  atual.vendas.forEach(function(s){
    porMetodo[s.payMethod] = (porMetodo[s.payMethod]||0) + s.total;
  });
  var metodoLabels = { dinheiro:"Dinheiro", transferencia:"Transferência", multicaixa:"Multicaixa", fiado:"Venda a Crédito" };

  var trendHtml = trendPct === null ? "" :
    '<div class="hist-hero-trend hist-hero-trend--corner ' + (trendPct>=0?'hist-hero-trend--up':'hist-hero-trend--down') + '">' +
    (trendPct>=0?'▲ ':'▼ ') + Math.abs(trendPct) + '%</div>';

  function wfRow(label, value, variant) {
    var cls = "conta-wf-row" + (variant ? " conta-wf-row--" + variant : "");
    return '<div class="' + cls + '"><div class="conta-wf-label">' + label + '</div><div class="conta-wf-val">' + value + '</div></div>';
  }

  function iconRow(icon, color, bg, label, sub, valueFmt, valColor) {
    return '<div class="hist-mov-item hist-mov-item--compact" style="border-left:3px solid ' + color + '">' +
      '<div class="hist-mov-icon" style="background:' + bg + ';color:' + color + '">' +
      '<i data-lucide="' + icon + '" style="width:18px;height:18px"></i></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div class="hist-mov-name">' + label + '</div>' +
      (sub ? '<div class="hist-mov-meta">' + sub + '</div>' : '') +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div class="hist-mov-qty" style="color:' + (valColor||"var(--text)") + '">' + valueFmt + '</div>' +
      '</div></div>';
  }

  wrap.innerHTML =
    // ── HERO ──
    (function() {
      var heroValStr = fmt(atual.lucroLiquido);
      var sizeClass = heroValStr.length >= 16 ? " hist-hero-val--xs" : heroValStr.length >= 13 ? " hist-hero-val--sm" : "";
      return '<div class="hist-hero" style="margin-bottom:16px;background:' + (atual.lucroLiquido>=0?'linear-gradient(135deg,var(--primary),var(--primary-mid))':'var(--gradient-danger)') + '">' +
        trendHtml +
        '<div class="hist-hero-label">Resultado líquido do mês</div>' +
        '<div class="hist-hero-val' + sizeClass + '">' + heroValStr + '</div>' +
        '<div class="hist-hero-sub">' + (atual.lucroLiquido>=0?'Lucro':'Prejuízo') + ' · ' + atual.vendas.length + ' vendas · margem líquida ' + margemLiquidaMes + '%</div>' +
        '<div class="hist-hero-sub" style="margin-top:4px;opacity:.85">Hoje: ' + fmt(receitaHoje) + '</div>' +
        '</div>';
    })() +

    '<div class="hist-mov-card" style="margin-bottom:14px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
    '<div class="hist-chart-title" style="margin-bottom:0">Resultado líquido</div>' +
    '<div id="conta-chart-tabs" style="display:flex;gap:4px;background:var(--bg);border-radius:8px;padding:3px"></div>' +
    '</div>' +
    '<div style="position:relative;height:150px"><canvas id="conta-chart-canvas"></canvas></div>' +
    '</div>' +

    // ── Posição financeira ──
    '<div class="hist-mov-card">' +
    '<div class="hist-day-label--inset"><i data-lucide="landmark" style="width:13px;height:13px"></i>Posição financeira</div>' +
    iconRow("wallet", "var(--info)", "var(--info-light)", "Caixa + Banco", "Dinheiro disponível agora", fmt(saldoCaixaBanco), "var(--text)") +
    iconRow("arrow-down-left", "var(--warning)", "var(--warning-light)", "A receber (vendas a crédito)", null, fmt(contasAReceber), contasAReceber>0?"var(--warning)":"var(--text)") +
    iconRow("arrow-up-right", "var(--danger-muted)", "var(--danger-muted-light)", "A pagar (fornecedores)", hasOverduePayable?"Há valores vencidos":null, fmt(contasAPagar), hasOverduePayable?"var(--danger)":"var(--text)") +
    iconRow("landmark", "var(--danger-muted)", "var(--danger-muted-light)", "IVA a pagar ao Estado", null, fmt(ivaAPagar), ivaAPagar>0?"var(--danger)":"var(--text)") +

    // ── Composição do resultado (waterfall) ──
    '<div class="conta-section-label">Composição do resultado</div>' +
    '<div class="conta-waterfall">' +
    wfRow("Receita", fmt(atual.receita)) +
    wfRow("Custo das vendas", "−" + fmt(atual.cogs), "sub") +
    wfRow("Lucro bruto", fmt(atual.lucroBruto), "subtotal") +
    wfRow("Despesas operacionais", "−" + fmt(atual.despesas), "sub") +
    wfRow("Resultado líquido", fmt(atual.lucroLiquido), "total") +
    '</div>' +

    // ── Outros indicadores ──
    '<div class="hist-day-label--inset"><i data-lucide="list-checks" style="width:13px;height:13px"></i>Outros indicadores</div>' +
    iconRow("package-plus", "var(--success)", "var(--success-light)", "Compras do mês", null, fmt(comprasMes), "var(--text)") +
    iconRow("rotate-ccw", "var(--warning)", "var(--warning-light)", "Devoluções do mês", null, fmt(devMes), devMes>0?"var(--warning)":"var(--text)") +

    // Top produtos
    (topProd.length ?
    '<div class="hist-day-label--inset"><i data-lucide="trophy" style="width:13px;height:13px"></i>Top produtos do mês</div>' +
    topProd.map(function(p,i){
      var pct = atual.receita>0?Math.round((p.total/atual.receita)*100):0;
      return '<div class="hist-mov-item hist-mov-item--compact" style="border-left:3px solid var(--primary);align-items:center">' +
        '<div class="hist-mov-icon" style="background:var(--primary-light);color:var(--primary);font-weight:800;font-size:13px">' + (i+1) + '</div>' +
        '<div style="flex:1;min-width:0">' +
        '<div class="hist-mov-name">' + p.name + '</div>' +
        '<div style="height:5px;background:var(--border2);border-radius:3px;overflow:hidden;margin-top:6px">' +
        '<div style="height:100%;width:' + pct + '%;background:var(--primary);border-radius:3px;transition:width .5s"></div>' +
        '</div>' +
        '<div class="hist-mov-meta" style="margin-top:4px">' + p.qty + ' un · ' + pct + '% da receita</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
        '<div class="hist-mov-qty">' + fmt(p.total) + '</div>' +
        '</div></div>';
    }).join("") : "") +

    // Por método de pagamento
    '<div class="hist-day-label--inset"><i data-lucide="credit-card" style="width:13px;height:13px"></i>Por método de pagamento</div>' +
    Object.entries(porMetodo).map(function(e){
      var pct = atual.receita>0?Math.round((e[1]/atual.receita)*100):0;
      var label = metodoLabels[e[0]] || e[0];
      var metodoIcon  = { dinheiro:"banknote", transferencia:"arrow-left-right", multicaixa:"credit-card", fiado:"users" };
      var metodoColor = { dinheiro:"var(--success)", transferencia:"var(--info)", multicaixa:"var(--primary-mid)", fiado:"var(--warning)" };
      var icon  = metodoIcon[e[0]] || "circle";
      var color = metodoColor[e[0]] || "var(--text3)";
      return iconRow(icon, color, color.replace("var(--","var(--").replace(")","-light)"), label, pct + "% da receita", fmt(e[1]), "var(--text)");
    }).join("") +
    '</div>';

  // Relatorio por funcionario
  var users = await db.getAll("users");
  var funcSection = document.createElement("div");
  funcSection.style.cssText = "margin-top:16px";
  funcSection.innerHTML =
    '<div class="conta-section-label" style="margin-top:0">Relatório por funcionário</div>' +
    '<div class="conta-card" style="padding:14px;display:flex;flex-direction:column;gap:10px">' +
    '<select id="func-select" style="display:none">' +
    users.map(function(u){ return '<option value="'+u.id+'">'+u.name+'</option>'; }).join("") +
    '</select>' +
    '<button id="func-picker-btn" class="conta-picker-btn" type="button">' +
    '<span id="func-picker-label">' + (users[0] ? users[0].name : "Selecionar funcionário") + '</span>' +
    '<i data-lucide="chevron-down" style="width:16px;height:16px;flex-shrink:0;color:var(--text3)"></i>' +
    '</button>' +
    '<button onclick="window._gerarRelatorioFuncionario()" class="btn btn-primary btn-full"><i data-lucide="user-check" style="width:15px;height:15px"></i> Gerar relatório do funcionário</button>' +
    '</div>';
  wrap.appendChild(funcSection);
  refreshIcons(funcSection);

  var funcSel = funcSection.querySelector("#func-select");
  var funcBtn = funcSection.querySelector("#func-picker-btn");
  var funcLabel = funcSection.querySelector("#func-picker-label");
  var userLabels = users.map(function(u){ return u.name; });
  funcBtn.onclick = function() {
    openPicker(
      "Selecionar funcionário",
      userLabels,
      funcLabel.textContent,
      function(chosenLabel) {
        var chosenUser = users.find(function(u){ return u.name === chosenLabel; });
        if (chosenUser) {
          funcSel.value = chosenUser.id;
          funcLabel.textContent = chosenUser.name;
        }
      }
    );
  };

  // Botão exportar PDF — ação neutra, não usa vermelho (reservado para perigo/exclusão)
  var pdfBtn = document.createElement("button");
  pdfBtn.className = "btn btn-full";
  pdfBtn.style.cssText = "background:var(--bg2);color:var(--text);border:1.5px solid var(--border);margin-top:12px";
  pdfBtn.innerHTML = '<i data-lucide="file-text" style="width:16px;height:16px;color:var(--primary)"></i> Exportar Relatório PDF';
  pdfBtn.onclick = gerarRelatorioPDF;
  wrap.appendChild(pdfBtn);

  // ── Fecho de exercício (mensal, admin) — secção sempre visível com os últimos meses ──
  var userForClosure = getUser();
  if (userForClosure && userForClosure.role === "admin") {
    var closureSection = document.createElement("div");
    closureSection.style.cssText = "margin-top:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px";
    closureSection.innerHTML = '<div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Fecho de Exercício</div><div id="closure-list"></div>';
    wrap.appendChild(closureSection);

    var closureListHtml = "";
    for (var cli = 0; cli <= 5; cli++) {
      var dCl = new Date(now.getFullYear(), now.getMonth()-cli, 1);
      var periodCl = dCl.getFullYear() + "-" + String(dCl.getMonth()+1).padStart(2,"0");
      var labelCl = dCl.toLocaleDateString("pt-AO", { month: "long", year: "numeric" });
      var isCurrentCl = cli === 0;
      var fechadoCl = !isCurrentCl && await isPeriodClosed(periodCl);

      var statusHtml, actionHtml;
      if (isCurrentCl) {
        statusHtml = '<span style="font-size:11px;color:var(--text3)">Mês em curso</span>';
        actionHtml = '<span style="font-size:11px;color:var(--text4);font-style:italic">Disponível a partir de ' + new Date(now.getFullYear(), now.getMonth()+1, 1).toLocaleDateString("pt-AO",{day:"2-digit",month:"2-digit"}) + '</span>';
      } else if (fechadoCl) {
        statusHtml = '<span style="font-size:11px;color:var(--success);font-weight:700"><i data-lucide="lock" style="width:11px;height:11px;vertical-align:middle;margin-right:2px"></i>Fechado</span>';
        actionHtml = "";
      } else {
        statusHtml = '<span style="font-size:11px;color:var(--warning);font-weight:700">Aberto</span>';
        actionHtml = '<button onclick="window._prepFecharMes(\'' + periodCl + '\')" style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">Fechar</button>';
      }

      closureListHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0' + (cli<5?';border-bottom:1px solid var(--border2)':'') + '">' +
        '<div><div style="font-size:13px;font-weight:600;color:var(--text);text-transform:capitalize">' + labelCl + '</div>' + statusHtml + '</div>' +
        actionHtml +
        '</div>';
    }

    var closureListEl = document.getElementById("closure-list");
    if (closureListEl) closureListEl.innerHTML = closureListHtml;

  }

  // ── Gráfico: Resultado líquido, período seleccionável ──
  var chartTabsWrap = document.getElementById("conta-chart-tabs");
  if (chartTabsWrap) {
    var periodos = [3, 6, 12];
    chartTabsWrap.innerHTML = periodos.map(function(p) {
      var active = p === _contaChartMeses;
      return '<button onclick="window._contaSetChartPeriod(' + p + ')" style="padding:5px 10px;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;background:' + (active?"#fff":"transparent") + ';color:' + (active?"var(--primary)":"var(--text3)") + ';box-shadow:' + (active?"0 1px 3px rgba(0,0,0,.08)":"none") + '">' + p + 'M</button>';
    }).join("");
  }

  window._contaCalcMes = calcMes;
  window._contaRenderChart(_contaChartMeses);

  refreshIcons(wrap);
}
window._prepFecharMes = function(period) {
  if (!window._contaCalcMes) { toast("Erro ao calcular o mês — tenta recarregar a página.", "error"); return; }
  var m = window._contaCalcMes(period);
  window._openFecharMesConfirm(period, m.receita, m.cogs, m.despesas, m.lucroLiquido);
};

window._openFecharMesConfirm = function(period, receita, cogs, despesas, resultado) {
  var lucroBruto = receita - cogs;
  var mesLabel = new Date(period + "-15").toLocaleDateString("pt-AO", { month: "long", year: "numeric" });

  openModal("Fechar " + mesLabel,
    '<div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:16px">' +
    'Isto vai zerar as contas de Proveitos e Custos deste mês, transferindo o resultado para a conta 88 (Resultados líquidos do exercício). ' +
    '<strong>Depois de fechar, este mês fica bloqueado</strong> — nenhuma venda, despesa ou lançamento poderá ter data dentro dele, nem para editar nem para apagar.' +
    '</div>' +
    '<div style="background:var(--bg);border-radius:10px;padding:2px 14px;margin-bottom:16px">' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border2);font-size:13px"><span style="color:var(--text3)">Receita</span><span style="font-weight:700">' + fmt(receita) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border2);font-size:13px"><span style="color:var(--text3)">Custo das vendas</span><span style="font-weight:700">-' + fmt(cogs) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border2);font-size:13px"><span style="color:var(--text3)">Despesas</span><span style="font-weight:700">-' + fmt(despesas) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px"><span style="font-weight:700">Resultado líquido</span><span style="font-weight:800;color:' + (resultado>=0?"var(--success)":"var(--danger)") + '">' + fmt(resultado) + '</span></div>' +
    '</div>' +
    '<div style="margin-top:var(--space-3);display:flex;flex-direction:column;gap:var(--space-1)">' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmFecharMes(\'' + period + '\')">' +
    '<i data-lucide="lock"></i> Confirmar e Fechar (irreversível)' +
    '</button>' +
    '<button onclick="window._closeModal()" style="width:100%;padding:10px;background:none;border:none;color:var(--text3);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">' +
    'Cancelar' +
    '</button>' +
    '</div>'
  );
  refreshIcons(document.getElementById("modal-box") || document.body);
};

window._confirmFecharMes = async function(period) {
  var user = getUser();
  if (!user || user.role !== "admin") { toast("Apenas administradores podem fechar o mês.", "error"); return; }
  try {
    var result = await closeAccountingPeriod(period, user.id);
    closeModal();
    toast("Mês " + period + " fechado com sucesso.", "success");
    await loadContabilidade();
  } catch (e) {
    toast(e.message || "Erro ao fechar o mês.", "error");
  }
};

function contaKpi(label, value, color, icon) {
  var isAccent = color && color !== "var(--text)";
  var iconStyle = isAccent ? ('style="color:' + color + ';background:' + color + '20"') : '';
  var valStyle  = isAccent ? (' style="color:' + color + '"') : '';
  return '<div class="conta-kpi">' +
    '<div class="conta-kpi-icon" ' + iconStyle + '>' +
    '<i data-lucide="' + icon + '" style="width:14px;height:14px"></i></div>' +
    '<div class="conta-kpi-val"' + valStyle + '>' + value + '</div>' +
    '<div class="conta-kpi-label">' + label + '</div>' +
    '</div>';
}

function contaRow(label, value, color, sub) {
  var isAccent = color && color !== "var(--text)";
  var valStyle = isAccent ? (' style="color:' + color + '"') : '';
  return '<div class="conta-row">' +
    '<div>' +
    '<div class="conta-row-label">' + label + '</div>' +
    (sub ? '<div class="conta-row-sub">' + sub + '</div>' : '') +
    '</div>' +
    '<div class="conta-row-val"' + valStyle + '>' + value + '</div>' +
    '</div>';
}

function kpi(label, value, color, icon) {
  return '<div class="stat-card" style="border-left:3px solid '+color+'">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
    '<div class="stat-label" style="color:'+color+';font-size:11px">'+label+'</div>' +
    '<i data-lucide="'+icon+'" style="width:14px;height:14px;color:'+color+';opacity:.6"></i>' +
    '</div>' +
    '<div class="stat-val" style="color:'+color+';font-size:15px;margin-top:4px">'+value+'</div>' +
    '</div>';
}

function row(label, value, sub) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f4f4f5">' +
    '<div><div style="font-size:13px;font-weight:600">'+label+'</div>' +
    (sub?'<div style="font-size:11px;color:#a1a1aa">'+sub+'</div>':'')+
    '</div>' +
    '<div style="font-size:14px;font-weight:700">'+value+'</div>' +
    '</div>';
}

function fmt(v) {
  return (v||0).toLocaleString("pt-AO") + " Kz";
}


// ── LIVRO RAZÃO ────────────────────────────────────────────────────────────────
var _razaoContaSel = null;
var _razaoPeriodoSel = "todos";
var _razaoPeriodoCustom = null;
var _contaChartMeses = 6;
var _contaChartInstance = null;

window._contaSetChartPeriod = function(meses) {
  _contaChartMeses = meses;
  var chartTabsWrap = document.getElementById("conta-chart-tabs");
  if (chartTabsWrap) {
    [3,6,12].forEach(function(p) {
      var btn = chartTabsWrap.children[[3,6,12].indexOf(p)];
      if (!btn) return;
      var active = p === meses;
      btn.style.background = active ? "#fff" : "transparent";
      btn.style.color = active ? "var(--primary)" : "var(--text3)";
      btn.style.boxShadow = active ? "0 1px 3px rgba(0,0,0,.08)" : "none";
    });
  }
  window._contaRenderChart(meses);
};

window._contaRenderChart = function(meses) {
  if (!window._contaCalcMes) return;
  var now = new Date();
  var chartMonths = [];
  var chartValues = [];
  for (var cmi = meses-1; cmi >= 0; cmi--) {
    var dChart = new Date(now.getFullYear(), now.getMonth()-cmi, 1);
    var mesChart = dChart.getFullYear() + "-" + String(dChart.getMonth()+1).padStart(2, "0");
    chartMonths.push(dChart.toLocaleDateString("pt-AO", { month: "short" }));
    chartValues.push(window._contaCalcMes(mesChart).lucroLiquido);
  }

  var contaChartCanvas = document.getElementById("conta-chart-canvas");
  if (!contaChartCanvas || typeof Chart === "undefined") return;

  // Se o canvas guardado ja nao e o mesmo elemento no DOM (pagina foi
  // recarregada/renderizada de novo sem reload completo), o grafico antigo
  // ficou orfao e tem de ser destruido antes de criar um novo.
  if (_contaChartInstance && _contaChartInstance.canvas !== contaChartCanvas) {
    _contaChartInstance.destroy();
    _contaChartInstance = null;
  }

  if (_contaChartInstance) {
    _contaChartInstance.data.labels = chartMonths;
    _contaChartInstance.data.datasets[0].data = chartValues;
    _contaChartInstance.update();
    return;
  }

  var ctxConta = contaChartCanvas.getContext("2d");
  var gradientConta = ctxConta.createLinearGradient(0, 0, 0, 140);
  gradientConta.addColorStop(0, "rgba(124,58,237,0.28)");
  gradientConta.addColorStop(1, "rgba(124,58,237,0)");

  _contaChartInstance = new Chart(ctxConta, {
    type: "line",
    data: {
      labels: chartMonths,
      datasets: [{
        data: chartValues,
        borderColor: "#5b21b6",
        backgroundColor: gradientConta,
        borderWidth: 2.5,
        pointBackgroundColor: "#7c3aed",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function(c) { return fmt(c.parsed.y); } } }
      },
      scales: {
        y: { display: false },
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#a1a1aa" } }
      }
    }
  });
};

async function loadContaRazao(wrap) {
  var entries = await db.getAll("journalEntries");

  var comMovimento = {};
  entries.forEach(function(e) {
    (e.lines||[]).forEach(function(l) { comMovimento[l.account] = true; });
  });
  var contasComMov = CHART_OF_ACCOUNTS.filter(function(c) { return comMovimento[c.code]; });

  if (!contasComMov.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#a1a1aa">' +
      '<div style="font-size:14px;font-weight:600">Sem lançamentos ainda</div>' +
      '<div style="font-size:13px;margin-top:6px">O livro razão preenche-se à medida que houver vendas.</div>' +
      '</div>';
    return;
  }

  if (!_razaoContaSel || !comMovimento[_razaoContaSel]) {
    _razaoContaSel = contasComMov[0].code;
  }

  var contaAtual = contasComMov.find(function(c) { return c.code === _razaoContaSel; });

  wrap.innerHTML =
    '<div id="razao-hero"></div>' +
    '<div style="display:flex;gap:8px;margin-bottom:16px">' +
    '<button id="razao-conta-btn" class="conta-picker-btn" style="flex:1">' +
    '<span>' + contaAtual.code + ' — ' + contaAtual.name + '</span>' +
    '<i data-lucide="chevron-down" style="width:16px;height:16px;flex-shrink:0;color:var(--text3)"></i>' +
    '</button>' +
    '<button id="razao-periodo-btn" style="background:#f4f4f5;border:none;width:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">' +
    '<i data-lucide="filter" style="width:17px;height:17px;color:#71717a"></i></button>' +
    '</div>' +
    '<div id="razao-lancamentos"></div>';

  refreshIcons();

  var contaLabels = contasComMov.map(function(c) { return c.code + ' — ' + c.name; });
  document.getElementById("razao-conta-btn").onclick = function() {
    openPicker(
      "Selecionar conta",
      contaLabels,
      contaAtual.code + ' — ' + contaAtual.name,
      function(chosenLabel) {
        _razaoContaSel = chosenLabel.split(' — ')[0];
        loadContaRazao(wrap);
      }
    );
  };
  document.getElementById("razao-periodo-btn").onclick = function() {
    openRazaoPeriodoModal(function() { renderRazaoLancamentos(entries); });
  };
  renderRazaoLancamentos(entries);
}

function openRazaoPeriodoModal(onApply) {
  var options = [
    { id:"todos",  label:"Todos os lançamentos" },
    { id:"hoje",   label:"Hoje" },
    { id:"semana", label:"Esta semana" },
    { id:"mes",    label:"Este mês" },
    { id:"ano",    label:"Este ano" },
    { id:"custom", label:"Personalizado" },
  ];

  var customFrom = (_razaoPeriodoCustom && _razaoPeriodoCustom.from) || "";
  var customTo   = (_razaoPeriodoCustom && _razaoPeriodoCustom.to)   || "";

  openModal("Filtrar por período",
    '<div style="display:flex;flex-direction:column;gap:2px;margin-bottom:12px">' +
    options.map(function(o) {
      var active = o.id === _razaoPeriodoSel;
      return '<button data-periodo-id="' + o.id + '" style="display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;background:' +
        (active ? "var(--primary-light)" : "none") + ';border:none;padding:13px 12px;border-radius:10px;font-size:14.5px;color:' +
        (active ? "var(--primary)" : "#18181b") + ';font-weight:' + (active ? "700" : "400") + ';cursor:pointer;font-family:inherit">' +
        o.label + (active ? '<i data-lucide="check" style="width:17px;height:17px"></i>' : '') +
      '</button>';
    }).join('') +
    '</div>' +
    '<div id="razao-periodo-custom" style="display:' + (_razaoPeriodoSel === "custom" ? "flex" : "none") + ';gap:8px;margin-bottom:12px">' +
    '<div class="field" style="flex:1"><label>De</label><input type="date" id="razao-periodo-from" value="' + customFrom + '"/></div>' +
    '<div class="field" style="flex:1"><label>Até</label><input type="date" id="razao-periodo-to" value="' + customTo + '"/></div>' +
    '</div>' +
    '<button class="btn btn-primary btn-full" id="razao-periodo-apply">Aplicar</button>');
  refreshIcons(el("modal-box"));

  var selected = _razaoPeriodoSel;
  document.querySelectorAll("[data-periodo-id]").forEach(function(btn) {
    btn.onclick = function() {
      selected = btn.getAttribute("data-periodo-id");
      document.querySelectorAll("[data-periodo-id]").forEach(function(b) {
        var isSel = b === btn;
        b.style.background = isSel ? "var(--primary-light)" : "none";
        b.style.color = isSel ? "var(--primary)" : "#18181b";
        b.style.fontWeight = isSel ? "700" : "400";
      });
      var customBox = document.getElementById("razao-periodo-custom");
      if (customBox) customBox.style.display = selected === "custom" ? "flex" : "none";
    };
  });

  document.getElementById("razao-periodo-apply").onclick = function() {
    _razaoPeriodoSel = selected;
    if (selected === "custom") {
      var f = (el("razao-periodo-from")||{}).value;
      var t = (el("razao-periodo-to")||{}).value;
      if (!f || !t) { toast("Escolhe as duas datas.", "error"); return; }
      _razaoPeriodoCustom = { from: f, to: t };
    }
    closeModal();
    onApply();
  };
}

function renderRazaoLancamentos(entries) {
  var wrap = document.getElementById("razao-lancamentos");
  if (!wrap) return;
  var conta = CHART_OF_ACCOUNTS.find(function(c){ return c.code === _razaoContaSel; });
  if (!conta) return;

  var linhas = [];
  entries.forEach(function(e) {
    (e.lines||[]).forEach(function(l) {
      if (l.account === _razaoContaSel && (l.debit||l.credit)) {
        linhas.push({ date:e.date, description:e.description, debit:l.debit||0, credit:l.credit||0 });
      }
    });
  });
  // Ordem cronológica primeiro — o saldo acumulado depende desta ordem.
  linhas.sort(function(a,b){ return new Date(a.date) - new Date(b.date); });

  // Intervalo do filtro de período (calculado sobre TODAS as linhas, antes de filtrar,
  // para o saldo acumulado de cada linha continuar correto mesmo com filtro activo).
  var periodoRange = null;
  if (_razaoPeriodoSel === "custom" && _razaoPeriodoCustom) {
    periodoRange = _razaoPeriodoCustom;
  } else if (_razaoPeriodoSel !== "todos") {
    periodoRange = getShortcutDates(_razaoPeriodoSel, 0);
  }

  var razaoTypeColor = { debito: "var(--info)",       credito: "var(--primary-mid)"  };
  var razaoTypeBg     = { debito: "var(--info-light)", credito: "var(--primary-light)" };
  var razaoTypeIcon   = { debito: "arrow-down-left",   credito: "arrow-up-right"       };
  var razaoTypeLabel  = { debito: "Débito",            credito: "Crédito"              };

  var saldo = 0;
  var linhasComSaldo = linhas.map(function(l) {
    saldo += conta.natureza === "devedora" ? (l.debit - l.credit) : (l.credit - l.debit);
    return Object.assign({}, l, { saldoNoMomento: saldo });
  });

  // Filtra DEPOIS de calcular o saldo — cada linha mantém o saldo correto daquele momento.
  var linhasFiltradas = periodoRange
    ? linhasComSaldo.filter(function(l) { var d = l.date.slice(0,10); return d >= periodoRange.from && d <= periodoRange.to; })
    : linhasComSaldo;

  // Mais recentes primeiro na exibição, sem recalcular o saldo.
  var linhasParaExibir = linhasFiltradas.slice().reverse();

  var rows = linhasParaExibir.map(function(l) {
    var tipo  = l.debit ? "debito" : "credito";
    var valor = l.debit ? l.debit : l.credit;
    var color = razaoTypeColor[tipo];
    var bg    = razaoTypeBg[tipo];
    return '<div class="hist-mov-item hist-mov-item--compact" style="border-left:3px solid ' + color + '">' +
      '<div class="hist-mov-icon" style="background:' + bg + ';color:' + color + '">' +
      '<i data-lucide="' + razaoTypeIcon[tipo] + '" style="width:18px;height:18px"></i></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div class="hist-mov-name">' + l.description + '</div>' +
      '<span class="hist-mov-tag" style="background:' + bg + ';color:' + color + '">' + razaoTypeLabel[tipo] + '</span>' +
      '<div class="hist-mov-meta">' + fmtDate(l.date) + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div class="hist-mov-qty" style="color:' + color + '">' + fmt(valor) + '</div>' +
      '<div class="hist-mov-range"><span class="hist-mov-range-label">Saldo</span> <strong style="color:' + (l.saldoNoMomento>=0?"var(--text2)":"var(--danger)") + '">' + fmt(l.saldoNoMomento) + '</strong></div>' +
      '</div></div>';
  }).join("");

  var saldoStr = fmt(saldo);
  var saldoSizeClass = saldoStr.length >= 16 ? " hist-hero-val--xs" : saldoStr.length >= 13 ? " hist-hero-val--sm" : "";

  var heroWrap = document.getElementById("razao-hero");
  if (heroWrap) {
    heroWrap.innerHTML =
      '<div class="hist-hero" style="margin-bottom:16px;background:linear-gradient(135deg,#4c1d95,#7c3aed)">' +
      '<div class="hist-hero-label">Saldo atual</div>' +
      '<div class="hist-hero-val' + saldoSizeClass + '">' + saldoStr + '</div>' +
      '<div class="hist-hero-sub">' + conta.code + ' — ' + conta.name + '</div>' +
      '</div>';
  }

  wrap.innerHTML = '<div class="conta-card">' + rows + '</div>';
  refreshIcons();
}

function fmtDate(iso) {
  var d = new Date(iso);
  return d.toLocaleDateString("pt-AO", { day:"2-digit", month:"2-digit", year:"numeric" });
}

// ── BALANCETE ─────────────────────────────────────────────────────────────────
async function loadContaBalancete(wrap) {
  var entries = await db.getAll("journalEntries");

  var totals = {};
  CHART_OF_ACCOUNTS.forEach(function(c) { totals[c.code] = { debit:0, credit:0 }; });

  entries.forEach(function(e) {
    (e.lines||[]).forEach(function(l) {
      if (!totals[l.account]) return;
      totals[l.account].debit  += l.debit||0;
      totals[l.account].credit += l.credit||0;
    });
  });

  var contasComMov = CHART_OF_ACCOUNTS.filter(function(c) {
    return totals[c.code].debit > 0 || totals[c.code].credit > 0;
  });

  if (!contasComMov.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#a1a1aa">' +
      '<div style="font-size:14px;font-weight:600">Sem lançamentos ainda</div>' +
      '<div style="font-size:13px;margin-top:6px">O balancete preenche-se à medida que houver vendas.</div>' +
      '</div>';
    return;
  }

  var totalDebitGeral = 0, totalCreditGeral = 0;
  var porClasse = {};
  contasComMov.forEach(function(c) {
    porClasse[c.classe] = porClasse[c.classe] || [];
    porClasse[c.classe].push(c);
    totalDebitGeral  += totals[c.code].debit;
    totalCreditGeral += totals[c.code].credit;
  });

  var classeNomes = {
    1:"Meios Fixos e Investimentos", 2:"Existências", 3:"Terceiros", 4:"Meios Monetários",
    5:"Capital e Reservas", 6:"Proveitos por Natureza", 7:"Custos por Natureza", 8:"Resultados",
  };

  var tipoColor = {
    activo:"var(--info)", passivo:"var(--primary-mid)", capital:"var(--primary-mid)",
    proveito:"var(--success)", custo:"var(--danger-muted)", resultado:"var(--primary)"
  };
  var tipoBg = {
    activo:"var(--info-light)", passivo:"var(--primary-light)", capital:"var(--primary-light)",
    proveito:"var(--success-light)", custo:"var(--danger-muted-light)", resultado:"var(--primary-light)"
  };
  var tipoIcon = {
    activo:"wallet", passivo:"receipt", capital:"landmark",
    proveito:"trending-up", custo:"trending-down", resultado:"bar-chart-2"
  };

  var html = '<div class="hist-mov-card">' + Object.keys(porClasse).sort().map(function(classe) {
    var rows = porClasse[classe].map(function(c) {
      var t = totals[c.code];
      var saldo = c.natureza === "devedora" ? (t.debit - t.credit) : (t.credit - t.credit ? 0 : 0) || (c.natureza === "devedora" ? (t.debit - t.credit) : (t.credit - t.debit));
      saldo = c.natureza === "devedora" ? (t.debit - t.credit) : (t.credit - t.debit);
      var borderColor = tipoColor[c.tipo] || "var(--text3)";
      var bg           = tipoBg[c.tipo] || "var(--border2)";
      var icon         = tipoIcon[c.tipo] || "circle";
      var valColor     = saldo < 0 ? "var(--danger)" : "var(--text)";
      return '<div class="hist-mov-item hist-mov-item--compact" style="border-left:3px solid ' + borderColor + '">' +
        '<div class="hist-mov-icon" style="background:' + bg + ';color:' + borderColor + '">' +
        '<i data-lucide="' + icon + '" style="width:18px;height:18px"></i></div>' +
        '<div style="flex:1;min-width:0">' +
        '<div class="hist-mov-name">' + c.code + ' — ' + c.name + '</div>' +
        '<div class="hist-mov-meta">D: ' + fmt(t.debit) + ' · C: ' + fmt(t.credit) + '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
        '<div class="hist-mov-qty" style="color:' + valColor + '">' + fmt(saldo) + '</div>' +
        '</div></div>';
    }).join("");
    return '<div class="hist-day-label--inset"><i data-lucide="folder" style="width:13px;height:13px"></i>Classe ' + classe + ' — ' + classeNomes[classe] + '</div>' + rows;
  }).join("") + '</div>';

  var diff = Math.round((totalDebitGeral - totalCreditGeral) * 100) / 100;
  var bateOK = diff === 0;

  var balanceteStatusBadge =
    '<div class="hist-hero-trend hist-hero-trend--corner ' + (bateOK?'hist-hero-trend--up':'hist-hero-trend--down') + '">' +
    '<i data-lucide="' + (bateOK?'check':'alert-triangle') + '" style="width:12px;height:12px;vertical-align:middle;margin-right:3px"></i>' +
    (bateOK?'Bate certo':'Diferença') + '</div>';

  var debitStr  = fmt(totalDebitGeral);
  var creditStr = fmt(totalCreditGeral);
  var maxLen = Math.max(debitStr.length, creditStr.length);
  var valSize = maxLen >= 16 ? "20px" : maxLen >= 13 ? "24px" : "28px";

  wrap.innerHTML =
    '<div class="hist-hero" style="margin-bottom:16px;background:linear-gradient(135deg, var(--primary), var(--primary-mid))">' +
    balanceteStatusBadge +
    '<div class="hist-hero-label">' + (bateOK?'Balancete equilibrado':'Balancete desequilibrado') + '</div>' +
    '<div style="display:flex;gap:20px;margin-top:6px">' +
    '<div><div style="font-size:11px;opacity:.75;margin-bottom:2px">Débito</div><div style="font-size:' + valSize + ';font-weight:800;font-variant-numeric:tabular-nums">' + debitStr + '</div></div>' +
    '<div><div style="font-size:11px;opacity:.75;margin-bottom:2px">Crédito</div><div style="font-size:' + valSize + ';font-weight:800;font-variant-numeric:tabular-nums">' + creditStr + '</div></div>' +
    '</div>' +
    (bateOK?'':'<div class="hist-hero-sub" style="margin-top:8px">Diferença: '+fmt(diff)+'</div>') +
    '</div>' + html;
  refreshIcons();
}


// ── DEMONSTRAÇÕES FINANCEIRAS ───────────────────────────────────────────────────
async function loadContaDemonstracoes(wrap) {
  var entries = await db.getAll("journalEntries");

  var totals = {};
  CHART_OF_ACCOUNTS.forEach(function(c) { totals[c.code] = { debit:0, credit:0 }; });
  entries.forEach(function(e) {
    (e.lines||[]).forEach(function(l) {
      if (!totals[l.account]) return;
      totals[l.account].debit  += l.debit||0;
      totals[l.account].credit += l.credit||0;
    });
  });

  function saldoConta(c) {
    var t = totals[c.code];
    return c.natureza === "devedora" ? (t.debit - t.credit) : (t.credit - t.debit);
  }
  function contasComMov(tipo) {
    return CHART_OF_ACCOUNTS.filter(function(c) {
      return c.tipo === tipo && (totals[c.code].debit > 0 || totals[c.code].credit > 0);
    });
  }

  if (!entries.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#a1a1aa">' +
      '<div style="font-size:14px;font-weight:600">Sem lançamentos ainda</div>' +
      '<div style="font-size:13px;margin-top:6px">As demonstrações preenchem-se à medida que houver movimento.</div>' +
      '</div>';
    return;
  }

  // ── Demonstração de Resultados ──
  var proveitos = contasComMov("proveito");
  var custos    = contasComMov("custo");
  var totalProveitos = proveitos.reduce(function(a,c){ return a + saldoConta(c); }, 0);
  var totalCustos    = custos.reduce(function(a,c){ return a + saldoConta(c); }, 0);
  var resultado = totalProveitos - totalCustos;

  var tipoColor = {
    activo:"var(--info)", passivo:"var(--primary-mid)", capital:"var(--primary-mid)",
    proveito:"var(--success)", custo:"var(--danger-muted)", resultado:"var(--primary)"
  };
  var tipoBg = {
    activo:"var(--info-light)", passivo:"var(--primary-light)", capital:"var(--primary-light)",
    proveito:"var(--success-light)", custo:"var(--danger-muted-light)", resultado:"var(--primary-light)"
  };
  var tipoIcon = {
    activo:"wallet", passivo:"receipt", capital:"landmark",
    proveito:"trending-up", custo:"trending-down", resultado:"bar-chart-2"
  };

  var classeIcon = {
    1:"factory", 2:"package", 3:"users", 4:"wallet",
    5:"landmark", 6:"trending-up", 7:"trending-down", 8:"bar-chart-2"
  };

  function movRow(c, valorFmt, valColor) {
    var borderColor = tipoColor[c.tipo] || "var(--text3)";
    var bg = tipoBg[c.tipo] || "var(--border2)";
    var icon = classeIcon[c.classe] || tipoIcon[c.tipo] || "circle";
    return '<div class="hist-mov-item hist-mov-item--compact" style="border-left:3px solid ' + borderColor + '">' +
      '<div class="hist-mov-icon" style="background:' + bg + ';color:' + borderColor + '">' +
      '<i data-lucide="' + icon + '" style="width:18px;height:18px"></i></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div class="hist-mov-name">' + c.code + ' — ' + c.name + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div class="hist-mov-qty" style="color:' + valColor + '">' + valorFmt + '</div>' +
      '</div></div>';
  }

  var drRows = proveitos.map(function(c) {
    return movRow(c, fmt(saldoConta(c)), "var(--text)");
  }).join("") + custos.map(function(c) {
    return movRow(c, "-" + fmt(saldoConta(c)), "var(--text)");
  }).join("");

  // ── Balanço ──
  var ativos   = contasComMov("activo");
  var passivos = contasComMov("passivo");
  var capitais = contasComMov("capital");
  var totalAtivo    = ativos.reduce(function(a,c){ return a + saldoConta(c); }, 0);
  var totalPassivo  = passivos.reduce(function(a,c){ return a + saldoConta(c); }, 0);
  var totalCapital  = capitais.reduce(function(a,c){ return a + saldoConta(c); }, 0);
  // Resultado do período ainda não foi encerrado para 81/88 — entra como "plug" do lado do capital
  var totalPassivoCapital = totalPassivo + totalCapital + resultado;

  var ativoRows = ativos.map(function(c) {
    var v = saldoConta(c);
    return movRow(c, fmt(v), v>=0?"var(--text)":"var(--danger)");
  }).join("");
  var passivoRows = passivos.map(function(c) {
    var v = saldoConta(c);
    return movRow(c, fmt(v), v>=0?"var(--text)":"var(--danger)");
  }).join("") + capitais.map(function(c) {
    var v = saldoConta(c);
    return movRow(c, fmt(v), v>=0?"var(--text)":"var(--danger)");
  }).join("") + contaRow("Resultado do período (não encerrado)", fmt(resultado), resultado>=0?"var(--success)":"var(--danger)");

  var diff = Math.round((totalAtivo - totalPassivoCapital) * 100) / 100;
  var bateOK = diff === 0;

  var balancoStatusBadge =
    '<span class="hist-hero-trend hist-hero-trend--corner ' + (bateOK?'hist-hero-trend--up':'hist-hero-trend--down') + '">' +
    '<i data-lucide="' + (bateOK?'check':'alert-triangle') + '" style="width:12px;height:12px;vertical-align:middle;margin-right:3px"></i>' +
    (bateOK?'Bate certo':'Diferença') + '</span>';

  var ativoStr  = fmt(totalAtivo);
  var passivoStr = fmt(totalPassivoCapital);
  var maxLenBal = Math.max(ativoStr.length, passivoStr.length);
  var valSizeBal = maxLenBal >= 14 ? "15px" : maxLenBal >= 11 ? "17px" : "19px";

  var badgeInlineColor = bateOK ? "var(--success)" : "var(--danger)";

  wrap.innerHTML =
    '<div class="hist-hero" style="margin-bottom:10px;background:' + (resultado>=0?'var(--gradient-success)':'var(--gradient-danger)') + '">' +
    '<div class="hist-hero-label">Resultado líquido do período</div>' +
    '<div class="hist-hero-val">' + fmt(resultado) + '</div>' +
    '<div class="hist-hero-sub">' + (resultado>=0?'▲ Lucro':'▼ Prejuízo') + '</div>' +
    '</div>' +

    '<div style="margin-bottom:14px;border:1.5px solid var(--primary);background:var(--primary-light);border-radius:var(--radius-lg);padding:16px;position:relative">' +
    '<div style="position:absolute;top:14px;right:16px;font-size:11px;font-weight:700;color:' + badgeInlineColor + '">' + (bateOK?'✓ Bate certo':'⚠ Diferença') + '</div>' +
    '<div style="font-size:12px;font-weight:600;color:var(--primary);opacity:.85;margin-bottom:4px">' + (bateOK?'Balanço equilibrado':'Balanço desequilibrado') + '</div>' +
    '<div style="display:flex;gap:20px;margin-top:6px">' +
    '<div style="min-width:0"><div style="font-size:11px;color:var(--primary);opacity:.75;margin-bottom:2px">Ativo</div><div style="font-size:' + valSizeBal + ';font-weight:800;font-variant-numeric:tabular-nums;color:var(--primary);white-space:nowrap">' + ativoStr + '</div></div>' +
    '<div style="min-width:0"><div style="font-size:11px;color:var(--primary);opacity:.75;margin-bottom:2px">Passivo+Capital</div><div style="font-size:' + valSizeBal + ';font-weight:800;font-variant-numeric:tabular-nums;color:var(--primary);white-space:nowrap">' + passivoStr + '</div></div>' +
    '</div>' +
    (bateOK?'':'<div style="font-size:12px;color:var(--danger);margin-top:8px">Diferença: '+fmt(diff)+'</div>') +
    '</div>' +

    '<div class="conta-card" style="margin-bottom:14px">' +
    '<div class="conta-wf-row conta-wf-row--subtotal"><span class="conta-wf-label">Total Proveitos</span><span class="conta-wf-val" style="color:var(--success)">' + fmt(totalProveitos) + '</span></div>' +
    '<div class="conta-wf-row conta-wf-row--subtotal"><span class="conta-wf-label">Total Custos</span><span class="conta-wf-val" style="color:var(--danger)">' + fmt(totalCustos) + '</span></div>' +
    '<div class="conta-wf-row conta-wf-row--total"><span class="conta-wf-label">Resultado líquido</span><span class="conta-wf-val" style="color:' + (resultado>=0?"var(--success)":"var(--danger)") + '">' + fmt(resultado) + '</span></div>' +
    '</div>' +

    '<div class="hist-mov-card">' +
    '<div class="hist-day-label--inset"><i data-lucide="file-text" style="width:13px;height:13px"></i>Demonstração de Resultados</div>' +
    drRows +

    '<div class="hist-day-label--inset"><i data-lucide="landmark" style="width:13px;height:13px"></i>Balanço — Ativo</div>' +
    (ativoRows||contaRow("Sem contas de ativo com movimento","","#a1a1aa")) +

    '<div class="hist-day-label--inset"><i data-lucide="landmark" style="width:13px;height:13px"></i>Balanço — Passivo + Capital</div>' +
    passivoRows +
    '</div>';
  refreshIcons();
}

async function loadAssinatura() {
  await loadLicense();
  var lic   = getLicense();
  var plan  = PLANS[lic.plan] || PLANS.basic;
  var wrap  = document.getElementById("assinatura-content");
  if (!wrap) return;

  var isExpired  = lic.status === "expired";
  var isTrial    = lic.status === "trial";
  var daysLeft   = lic.daysLeft || 0;
  var warnExpiry = lic.status === "active" && daysLeft <= 7 && daysLeft > 0;

  wrap.innerHTML = "";

  // ── Hero ──
  var hero = document.createElement("div");
  hero.className = "lic-hero";
  hero.innerHTML =
    '<div class="lic-hero-icon"><i data-lucide="award"></i></div>' +
    '<div class="lic-hero-plan">' + plan.name + '</div>' +
    '<div class="lic-hero-price">' + plan.price.toLocaleString() + ' Kz<span>/mês</span></div>' +
    '<div class="lic-hero-badge lic-hero-badge--' + (isExpired?"expired":isTrial?"trial":"active") + '">' +
      '<i data-lucide="' + (isExpired?"x-circle":isTrial?"clock":"check-circle") + '" style="width:14px;height:14px"></i>' +
      (isExpired ? "Licença expirada" : isTrial ? "Período de avaliação" : "Licença activa") +
    '</div>';
  wrap.appendChild(hero);

  // ── Banner expirado ──
  if (isExpired) {
    var expBanner = document.createElement("div");
    expBanner.className = "lic-expired-banner";
    expBanner.innerHTML =
      '<i data-lucide="alert-circle"></i>' +
      '<div class="lic-expired-text"><strong>Licença expirada.</strong> Renova o teu plano para continuar a usar o Kontaki.</div>';
    wrap.appendChild(expBanner);
  }

  // ── Aviso de expiração próxima ──
  if (warnExpiry) {
    var warnEl = document.createElement("div");
    warnEl.className = "lic-expiry-warn";
    warnEl.innerHTML =
      '<i data-lucide="clock" style="width:16px;height:16px;color:#d97706;flex-shrink:0"></i>' +
      'A tua licença expira em <strong style="margin:0 3px">' + daysLeft + '</strong> dia' + (daysLeft!==1?"s":"") + '. Renova para não perder acesso.';
    wrap.appendChild(warnEl);
  }

  // ── Limites do plano ──
  var limitsEl = document.createElement("div");
  limitsEl.className = "lic-limits";
  var maxProd = plan.maxProducts === -1 ? "∞" : plan.maxProducts;
  var maxUser = plan.maxUsers === -1 ? "∞" : plan.maxUsers;
  var maxClie = plan.maxClients === -1 ? "∞" : plan.maxClients;
  limitsEl.innerHTML =
    '<div class="lic-limit-item"><div class="lic-limit-val">' + maxProd + '</div><div class="lic-limit-label">Produtos</div></div>' +
    '<div class="lic-limit-item"><div class="lic-limit-val">' + maxUser + '</div><div class="lic-limit-label">Utilizadores</div></div>' +
    '<div class="lic-limit-item"><div class="lic-limit-val">' + maxClie + '</div><div class="lic-limit-label">Clientes</div></div>';
  wrap.appendChild(limitsEl);

  // ── Estado da licença ──
  var statusCard = document.createElement("div");
  statusCard.className = "lic-status-card";

  var sk = await db.get("settings","storeKey");
  var hasKey = !!(sk && sk.value);

  var expDate = lic.expiresAt
    ? new Date(lic.expiresAt).toLocaleDateString("pt-PT",{day:"2-digit",month:"long",year:"numeric"})
    : isTrial ? "7 dias de avaliação" : "—";

  statusCard.innerHTML =
    '<div class="lic-status-title">Estado da licença</div>' +
    licRow("Plano", plan.name + " · " + plan.price.toLocaleString() + " Kz/mês", "var(--primary)") +
    licRow("Estado", isExpired?"Expirada":isTrial?"Avaliação":"Activa", isExpired?"var(--danger)":isTrial?"var(--warning)":"var(--success)") +
    licRow("Validade", expDate, isExpired?"var(--danger)":warnExpiry?"var(--warning)":"var(--text)") +
    licRow("Chave HMAC", hasKey?"Configurada":"Não configurada", hasKey?"var(--success)":"var(--danger)") +
    licRow("Armazenamento", "Local (offline)", "var(--primary)") +
    (lic.code ? licRow("Código", lic.code.slice(0,9)+"···", "var(--text3)") : "");
  wrap.appendChild(statusCard);

  // ── Activar / Renovar licença ──
  var actCard = document.createElement("div");
  actCard.className = "lic-activate-card";
  actCard.innerHTML =
    '<div class="lic-activate-title">' + (lic.code ? "Renovar licença" : "Activar licença") + '</div>' +
    '<div class="lic-activate-sub">Recebeste um código da Introxeer? Insere aqui para activar ou renovar o teu plano.</div>' +
    '<div class="field lic-activate-field">' +
      '<input class="lic-code-input" id="activation-code" placeholder="KTKI-XXXX-XXXX-XXXXXXXXXXXX" maxlength="35"/>' +
    '</div>' +
    '<button class="btn btn-primary btn-full btn-lg" onclick="window._activarLicenca()">' +
      '<i data-lucide="zap"></i> Activar licença' +
    '</button>';
  wrap.appendChild(actCard);

  var codeInputEl = document.getElementById("activation-code");
  if (codeInputEl) codeInputEl.oninput = formatLicenseCodeInput;

  // ── Lista de planos ──
  var plansLabel = document.createElement("div");
  plansLabel.className = "planos-section-title";
  plansLabel.textContent = "Planos disponíveis";
  wrap.appendChild(plansLabel);

  var planDefs = [
    { key:"basic",    features:["Vendas, stock e fiados","Fatura PDF e partilha WhatsApp","Histórico e dashboard"] },
    { key:"standard", features:["Tudo do Básico","Contabilidade","Fornecedores","Relatórios e exportação (PDF/CSV)"] },
    { key:"pro",      features:["Tudo do Standard","Equipa e permissões","Logotipo e dados da loja","Backup automático"] },
  ];

  planDefs.forEach(function(pd) {
    var p        = PLANS[pd.key];
    var isActive = lic.plan === pd.key;
    var maxProd  = p.maxProducts === -1 ? "∞" : p.maxProducts;
    var maxClie  = p.maxClients === -1 ? "∞" : p.maxClients;
    var maxUser  = p.maxUsers === -1 ? "∞" : p.maxUsers;

    var card = document.createElement("div");
    card.className = "plan-card" + (isActive ? " plan-active" : "");
    card.innerHTML =
      '<div class="plan-card-header">' +
        '<div>' +
          '<div class="plan-card-name">' + p.name + (isActive ? ' <span class="plan-card-badge">Actual</span>' : '') + '</div>' +
        '</div>' +
        '<div class="plan-card-price">' + p.price.toLocaleString() + ' Kz<span>/mês</span></div>' +
      '</div>' +
      '<div class="plan-card-limits">' +
        '<div class="plan-card-limit">' + maxProd + ' produtos</div>' +
        '<div class="plan-card-limit">' + maxClie + ' clientes</div>' +
        '<div class="plan-card-limit">' + maxUser + ' utilizador' + (p.maxUsers!==1?'es':'') + '</div>' +
      '</div>' +
      '<div class="plan-card-features">' +
        pd.features.map(function(f) {
          return '<div class="plan-card-feature"><i data-lucide="check"></i>' + f + '</div>';
        }).join('') +
      '</div>';
    wrap.appendChild(card);
  });

  // ── Contacto ──
  var contactEl = document.createElement("div");
  contactEl.style.cssText = "text-align:center;padding:16px 0 20px";
  contactEl.innerHTML =
    '<div style="font-size:12px;color:var(--text4);margin-bottom:12px;line-height:1.5">Para adquirir ou renovar um plano,<br>contacta a <strong style="color:var(--primary)">Introxeer</strong>:</div>' +
    '<a href="https://wa.me/244900000000" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;font-weight:700;font-size:13.5px;padding:12px 24px;border-radius:999px;text-decoration:none;box-shadow:0 6px 18px rgba(37,211,102,.32)">' +
      '<i data-lucide="message-circle" style="width:16px;height:16px"></i> Falar no WhatsApp' +
    '</a>';
  wrap.appendChild(contactEl);
  refreshIcons(wrap);

  refreshIcons(wrap);
}

function formatLicenseCodeInput() {
  var raw = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Últimos 3 segmentos são sempre 4 (KTKI, plano, ano); o segmento
  // final é o código aleatório em si, cujo comprimento já mudou uma
  // vez (8 -> 12 caracteres, ver ADR de licenças/CSPRNG) -- por isso
  // não tem tamanho fixo aqui, absorve o resto do que for digitado.
  var groups = [4, 4, 4, Infinity];
  var out = "";
  var pos = 0;
  for (var g = 0; g < groups.length; g++) {
    if (pos >= raw.length) break;
    if (out) out += "-";
    out += raw.slice(pos, pos + groups[g]);
    pos += groups[g];
  }
  this.value = out;
}

function licRow(label, value, color) {
  return '<div class="lic-status-row">' +
    '<span class="lic-status-label">' + label + '</span>' +
    '<span class="lic-status-val" style="color:' + color + '">' + value + '</span>' +
    '</div>';
}


window._activarLicenca = async function() {
  var input = document.getElementById("activation-code");
  if (!input || !input.value.trim()) { toast("Insere o código de activação.", "error"); return; }
  var btn = document.querySelector("#assinatura-content .btn-primary");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader"></i> A validar...'; refreshIcons(btn); }
  try {
    var result = await activateLicense(input.value.trim());
    toast("Plano " + result.planName + " activado!", "success");
    await loadAssinatura();
  } catch(err) {
    toast(err.message, "error");
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="zap"></i> Activar licença'; refreshIcons(btn); }
  }
};

async function loadContactos() {
  var wrap = document.getElementById("contactos-content");
  if (!wrap) return;

  wrap.innerHTML =
    '<div style="background:linear-gradient(135deg,#5b21b6,#7c3aed);border-radius:16px;padding:20px;color:#fff;text-align:center;margin-bottom:16px">' +
    '<i data-lucide="headphones" style="width:40px;height:40px;color:#ddd6fe;margin-bottom:10px"></i>' +
    '<div style="font-size:18px;font-weight:700">Suporte Kontaki</div>' +
    '<div style="font-size:13px;color:#ddd6fe;margin-top:4px">Introxeer · Angola</div>' +
    '</div>' +

    contactCard("WhatsApp", "Suporte técnico rápido", "message-circle", "#25D366", "https://wa.me/244934923166") +
    contactCard("Facebook", "Introxeer", "facebook", "#1877F2", "https://www.facebook.com/profile.php?id=61591298607073") +
    contactCard("Instagram", "@introxeer", "instagram", "#E1306C", "https://instagram.com/introxeer") +

    '<div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #f4f4f5;margin-top:12px">' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Reportar problema</div>' +
    '<div class="field" style="margin-bottom:10px"><label>Descrição do problema</label><textarea id="report-msg" rows="4" style="width:100%;padding:10px;border:1.5px solid #e4e4e7;border-radius:8px;font-family:inherit;font-size:13px;resize:none" placeholder="Descreve o problema que encontraste..."></textarea></div>' +
    '<button onclick="window._reportarProblema()" style="width:100%;padding:13px;background:#5b21b6;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Enviar relatório</button>' +
    '</div>';

  refreshIcons(wrap);
}

function contactCard(title, sub, icon, color, href) {
  return '<a href="'+href+'" target="_blank" style="display:flex;align-items:center;gap:14px;padding:14px;background:#fff;border-radius:12px;border:1px solid #f4f4f5;margin-bottom:8px;text-decoration:none">' +
    '<div style="width:44px;height:44px;background:'+color+';border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
    '<i data-lucide="'+icon+'" style="width:20px;height:20px;color:#fff"></i></div>' +
    '<div><div style="font-size:14px;font-weight:700;color:#18181b">'+title+'</div>' +
    '<div style="font-size:12px;color:#71717a;margin-top:2px">'+sub+'</div></div>' +
    '<i data-lucide="chevron-right" style="width:16px;height:16px;color:#a1a1aa;margin-left:auto"></i>' +
    '</a>';
}

window._reportarProblema = function() {
  var msg = document.getElementById("report-msg");
  if (!msg||!msg.value.trim()) { toast("Descreve o problema primeiro.","error"); return; }
  var text = "Kontaki Bug Report:\n\n"+msg.value.trim();
  var wa = "https://wa.me/244900000000?text="+encodeURIComponent(text);
  window.open(wa,"_blank");
};



window._gerarRelatorioFuncionario = async function() {
  var sel = document.getElementById("func-select");
  if (!sel) return;
  var userId = Number(sel.value);
  var user = await db.get("users", userId);
  var sales = await db.getAll("sales");
  var mySales = sales.filter(function(s){ return s.userId === userId; });

  var now = new Date();
  var mes = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
  var mySalesMes = mySales.filter(function(s){ return (s.date||"").startsWith(mes); });
  var totalMes = mySalesMes.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var totalGeral = mySales.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);

  var store = (await db.get("settings","store")) || {};

  var html = "<!DOCTYPE html><html lang='pt'><head><meta charset='UTF-8'/><title>Relatório " + user.name + "</title>" +
    "<style>body{font-family:Arial,sans-serif;padding:20mm;font-size:13px}h1{font-size:20px}" +
    "table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#5b21b6;color:#fff;padding:8px;text-align:left;font-size:11px}" +
    "td{padding:7px;border-bottom:1px solid #eee;font-size:12px}</style></head><body>" +
    "<h1>" + (store.name||"Kontaki") + "</h1>" +
    "<div style='color:#71717a;margin-bottom:16px'>Relatório de Funcionário · " + new Date().toLocaleDateString("pt-AO") + "</div>" +
    "<div style='background:#f8f8f8;border-radius:8px;padding:16px;margin-bottom:20px'>" +
    "<div style='font-size:18px;font-weight:700'>" + user.name + "</div>" +
    "<div style='color:#71717a'>" + (user.role==="admin"?"Administrador":"Operador de Caixa") + "</div>" +
    "<div style='margin-top:10px;display:flex;gap:20px'>" +
    "<div><div style='font-size:11px;color:#71717a'>Vendas este mês</div><div style='font-size:16px;font-weight:700;color:#16a34a'>" + totalMes.toLocaleString("pt-AO") + " Kz</div></div>" +
    "<div><div style='font-size:11px;color:#71717a'>Vendas total</div><div style='font-size:16px;font-weight:700;color:#5b21b6'>" + totalGeral.toLocaleString("pt-AO") + " Kz</div></div>" +
    "<div><div style='font-size:11px;color:#71717a'>Nº transacções</div><div style='font-size:16px;font-weight:700'>" + mySales.length + "</div></div>" +
    "</div></div>" +
    "<table><thead><tr><th>Data</th><th>Total</th><th>Pagamento</th></tr></thead><tbody>" +
    mySales.slice(-50).reverse().map(function(s){
      return "<tr><td>" + new Date(s.date).toLocaleString("pt-AO") + "</td><td>" + (s.total||0).toLocaleString("pt-AO") + " Kz</td><td>" + s.payMethod + "</td></tr>";
    }).join("") +
    "</tbody></table>" +
    "<div style='margin-top:30px;text-align:center;font-size:11px;color:#a1a1aa'>Kontaki · Introxeer Technology</div>" +
    "</body></html>";

  var win = window.open("","_blank","width=900,height=700");
  win.document.write(html);
  win.document.close();
  setTimeout(function(){ win.print(); }, 400);
};


async function loadDespesasPage() {
  var btn = document.getElementById("btn-back-despesas");
  if (btn) btn.onclick = function() { showSubpage(null); };
  window._showSubpage = showSubpage;
  await loadDespesas();
}

// ── LOGOTIPO DA LOJA ──────────────────────────────────────────────────────────
window._uploadLogo = async function(input) {
  const licMod = await import("../license.js");
  if (!licMod.hasFeature("logotipo")) {
    licMod.showUpgradeBanner("Logotipo da loja disponível a partir do plano Pro. Contacta a Introxeer para upgrade.");
    input.value = "";
    return;
  }
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxSize = 200;
      var scale = Math.min(maxSize/img.width, maxSize/img.height, 1);
      var canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var dataUrl = canvas.toDataURL("image/png", 0.85);

      db.get("settings","store").then(function(s){
        s = s || {};
        return db.put("settings", Object.assign({}, s, { key:"store", logo: dataUrl }));
      }).then(function(){
        toast("Logótipo guardado.","success");
        renderLogoPreview(dataUrl);
      });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = "";
};

function renderLogoPreview(dataUrl) {
  var prev        = document.getElementById("logo-preview");
  var img         = document.getElementById("logo-img");
  var placeholder = document.getElementById("logo-placeholder");

  if (dataUrl) {
    if (img)         { img.src = dataUrl; }
    if (prev)        { prev.style.display = "block"; }
    if (placeholder) { placeholder.style.display = "none"; }
  } else {
    if (img)         { img.src = ""; }
    if (prev)        { prev.style.display = "none"; }
    if (placeholder) { placeholder.style.display = "flex"; }
  }
}

window._removeLogo = async function() {
  var s = (await db.get("settings","store")) || {};
  await db.put("settings", Object.assign({}, s, { logo: null }));
  renderLogoPreview(null);
  toast("Logótipo removido.","success");
};

function loadSobre() {
  var wrap = document.getElementById("sobre-content");
  if (!wrap) return;
  wrap.innerHTML = "";

  var items = [
    { label: "Termos do Consumidor",          icon: "file-text",    action: "window.open('https://introxeer.vercel.app/legal/documents/consumer-terms/','_blank')" },
    { label: "Política de Privacidade",       icon: "shield-check", action: "window.open('https://introxeer.vercel.app/legal/documents/privacy-policy/','_blank')" },
    { label: "Licença de Utilização (EULA)",  icon: "award",        action: "window.open('https://introxeer.vercel.app/legal/documents/consumer-terms/#cap-ii','_blank')" },
  ];

  var list = document.createElement("div");
  list.className = "perfil-group";
  items.forEach(function(item) {
    var btn = document.createElement("button");
    btn.className = "perfil-menu-item";
    btn.setAttribute("onclick", item.action);
    btn.innerHTML =
      '<div class="perfil-menu-item-left">' +
      '<div class="perfil-menu-icon" style="background:#f4f4f5">' +
      '<i data-lucide="' + item.icon + '" style="color:#71717a"></i>' +
      '</div><div>' +
      '<div style="font-size:15px;font-weight:600">' + item.label + '</div>' +
      '</div></div>' +
      '<span class="perfil-menu-chevron">›</span>';
    list.appendChild(btn);
  });
  wrap.appendChild(list);

  var footer = document.createElement("div");
  footer.className = "sobre-footer";
  footer.innerHTML = "Kontaki Versão 1.0.0<br/><strong style=\"color:var(--primary);font-size:13px\">Edição Dolphin</strong><br/>Introxeer · Angola";
  wrap.appendChild(footer);

  refreshIcons(wrap);
}

window._showLicencaEula = function() {
  var text =
    '<div style="font-size:12px;color:var(--text3);line-height:1.6;max-height:50vh;overflow-y:auto;padding-right:4px">' +
    '<p><strong>1. Objecto.</strong> Este Acordo de Licença de Utilizador Final ("EULA") rege o uso do software Kontaki, propriedade da Introxeer Technology.</p>' +
    '<p><strong>2. Concessão de Licença.</strong> A Introxeer Technology concede ao utilizador uma licença não exclusiva, intransmissível e limitada para usar o Kontaki de acordo com o plano de assinatura activo, indicado na secção Assinatura.</p>' +
    '<p><strong>3. Restrições.</strong> É proibido copiar, modificar, descompilar ou redistribuir o software sem autorização escrita da Introxeer Technology.</p>' +
    '<p><strong>4. Dados.</strong> Os dados inseridos no Kontaki (vendas, stock, clientes) pertencem ao utilizador. O armazenamento é local e offline, salvo quando o utilizador optar por sincronização ou backup manual.</p>' +
    '<p><strong>5. Limitação de Responsabilidade.</strong> O software é fornecido "tal como está". A Introxeer Technology não garante disponibilidade ininterrupta nem se responsabiliza por perdas decorrentes de uso indevido ou falhas do dispositivo do utilizador.</p>' +
    '<p><strong>6. Vigência.</strong> Esta licença vigora enquanto a assinatura estiver activa. O não pagamento pode resultar em suspensão de funcionalidades, conforme descrito na secção Assinatura.</p>' +
    '<p><strong>7. Lei Aplicável.</strong> Este EULA rege-se pelas leis da República de Angola.</p>' +
    '</div>';
  openModal("Licença de Utilização", text + '<button class="btn btn-ghost btn-full" style="margin-top:14px" onclick="window._closeModal()">Fechar</button>');
};

async function loadNotificacoesPage() {
  const mod = await import("../notification-ui.js");
  const notifMod = await import("../notifications.js");
  const state = await notifMod.buildNotificationState();
  window._notificationsCache = state.alerts;

  const container = el("notificacoes-content");
  if (!container) return;

  if (!state.alerts.length) {
    container.innerHTML =
      '<div class="empty-state">' +
      '<i data-lucide="bell-off" style="width:36px;height:36px;color:#a1a1aa;margin-bottom:10px"></i>' +
      '<div class="empty-state-title">Sem notificações</div>' +
      '<div class="empty-state-sub">Tudo em ordem por agora.</div>' +
      '</div>';
    refreshIcons(container);
    await notifMod.markNotificationsSeen();
    mod.updateNotificationBadge();
    return;
  }

  function sevStyle(sev) {
    if (sev === "danger")  return { bg: "var(--danger-light)",  color: "var(--danger)",  icon: "alert-circle" };
    if (sev === "warning") return { bg: "var(--warning-light)", color: "var(--warning)", icon: "alert-triangle" };
    return { bg: "var(--info-light)", color: "var(--info)", icon: "info" };
  }

  function renderItem(n) {
    var s = sevStyle(n.severity);
    return (
      '<button onclick="window._handleNotificationActionFromPage(\'' + n.id + '\')" ' +
      'style="width:100%;display:flex;align-items:flex-start;gap:12px;padding:14px;' +
      'background:#fff;border-radius:12px;margin-bottom:8px;cursor:pointer;text-align:left;' +
      'font-family:inherit;border:1px solid var(--border2)">' +
        '<div style="width:34px;height:34px;border-radius:10px;background:' + s.bg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<i data-lucide="' + s.icon + '" style="width:17px;height:17px;color:' + s.color + '"></i>' +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13.5px;font-weight:700;color:var(--text)">' + n.title + '</div>' +
          (n.description ? '<div style="font-size:12px;color:var(--text3);margin-top:3px">' + n.description + '</div>' : '') +
        '</div>' +
        '<i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text4);flex-shrink:0;margin-top:8px"></i>' +
      '</button>'
    );
  }

  var byType = { product: [], cash: [], system: [] };
  state.alerts.forEach(function(n){ (byType[n.type] || byType.system).push(n); });

  var html = '';
  if (byType.product.length) {
    html += '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Produtos</div>';
    html += byType.product.map(renderItem).join("");
  }
  if (byType.cash.length) {
    html += '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin:14px 0 6px">Caixa</div>';
    html += byType.cash.map(renderItem).join("");
  }
  if (byType.system.length) {
    html += '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin:14px 0 6px">Sistema</div>';
    html += byType.system.map(renderItem).join("");
  }
  container.innerHTML = html;
  refreshIcons(container);

  await notifMod.markNotificationsSeen();
  mod.updateNotificationBadge();
}

window._handleNotificationActionFromPage = function(id) {
  var n = (window._notificationsCache || []).find(function(x){ return x.id === id; });
  if (!n || !n.action) return;
  if (n.action.page === "perfil" && n.action.subpage) {
    window._perfilNav(n.action.subpage);
    return;
  }
  if (window.router) window.router.go(n.action.page);
  setTimeout(function() {
    if (n.action.filter && window._filterProd) window._filterProd(n.action.filter);
  }, 150);
};

async function loadEscritorioPage() {
  await loadEscritorio();
}

function loadSenhaPage() {
  var wrap = document.getElementById("subpage-senha");
  if (!wrap) return;
  var btn = document.getElementById("btn-back-senha");
  if (btn) btn.onclick = function() { window._perfilBack(); };
}

var _countdownInterval = null;

function startLicenseCountdown(lic) {
  var titleEl = el("perfil-upgrade-title");
  var subEl   = el("perfil-upgrade-sub");
  if (!titleEl || !subEl) return;

  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }

  var isTopPlan = lic.plan === "pro";

  function formatRemaining() {
    if (!lic.expiresAt || lic.daysLeft === 999) return null;
    var diff = new Date(lic.expiresAt).getTime() - Date.now();
    if (diff <= 0) return null;
    var d = Math.ceil(diff / 86400000);
    if (d <= 1) return "Expira hoje";
    return "Expira em " + d + " dias";
  }

  function render() {
    if (lic.status === "expired" || (lic.daysLeft != null && lic.daysLeft <= 0 && lic.expiresAt)) {
      titleEl.textContent = "Licença expirada";
      subEl.textContent = "Toca para renovar";
      if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
      return;
    }

    if (isTopPlan) {
      titleEl.textContent = "Licença activa";
      var remaining = formatRemaining();
      subEl.textContent = remaining ? remaining + " · Plano Enterprise" : "Plano Enterprise";
    } else {
      titleEl.textContent = "Quer mais do Kontaki?";
      subEl.textContent = "Faz upgrade para mais funcionalidades";
    }
  }

  render();
  if (lic.expiresAt && lic.daysLeft !== 999) {
    _countdownInterval = setInterval(render, 3600000);
  }
}