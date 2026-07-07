import { loadDashboard }      from "./dashboard.js";
import { loadConfiguracoes }  from "./configuracoes.js";
import { loadClientes }       from "./clientes.js";
import { loadDespesas }       from "./despesas.js";
import { loadSeguranca }   from "./seguranca.js";
import { loadTurno } from "./turno.js";
import { loadFornecedores } from "./fornecedores.js";
import { loadEscritorio } from "./escritorio.js";
import { db }                    from "../db.js";
import { el, val, refreshIcons } from "../utils.js";
import { toast }                 from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { generateInvite } from "../invite.js";
import { getUser, logout, changePasswordAuth, createUser } from "../auth.js";
import { getLicense, loadLicense, activateLicense, PLANS, showUpgradeBanner } from "../license.js";
import { gerarRelatorioPDF } from "./extras.js";
import { addStockMovement, getStock } from "../services.js";

export async function initPerfil() {
  const user  = getUser();
  const store = (await db.get("settings", "store")) || {};

  var avatarEl = el("perfil-avatar");
  var nameEl   = el("perfil-name");
  var roleEl   = el("perfil-role");

  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role === "admin" ? "Administrador" : "Operador de Caixa";

  var chipEl = el("perfil-plan-chip");
  if (chipEl) {
    var lic = getLicense();
    var planInfo = PLANS[lic.plan] || PLANS.basic;
    chipEl.textContent = planInfo.name + (store.name ? " · " + store.name : "");
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
    // ── Operações diárias ──
    { label: "Meu Turno",         sub: "Abrir, fechar e exportar turno", icon: "clock",          color: "#ede9fe", iconColor: "#5b21b6", page: "turno",         group: "Operações"  },
    { label: "Despesas",          sub: "Renda, salários e outros custos",icon: "receipt",        color: "#fee2e2", iconColor: "#dc2626", page: "despesas",      group: "Operações"  },
    { label: "Clientes",          sub: "Fichas e histórico de compras",  icon: "users",          color: "#dbeafe", iconColor: "#2563eb", page: "clientes",      group: "Operações"  },
    // ── Gestão ──
    { label: "Escritório",        sub: "Importar e confirmar turnos",    icon: "archive",        color: "#ede9fe", iconColor: "#5b21b6", page: "escritorio",    group: "Gestão"     },
    { label: "Contabilidade",     sub: "Receitas, lucros e despesas",    icon: "bar-chart-2",    color: "#dcfce7", iconColor: "#16a34a", page: "contabilidade", group: "Gestão"     },
    { label: "Gestão de Stock",   sub: "Produtos e inventário",          icon: "package",        color: "#ede9fe", iconColor: "#5b21b6", page: "stock",         group: "Gestão"     },
    { label: "Fornecedores",      sub: "Compras e fornecedores",         icon: "truck",          color: "#fef3c7", iconColor: "#d97706", page: "fornecedores",  group: "Gestão"     },
    { label: "Equipa",            sub: "Funcionários e acessos",         icon: "users-2",        color: "#dbeafe", iconColor: "#2563eb", page: "equipa",        group: "Gestão"     },
    { label: "Incidentes",        sub: "Divergências de stock",          icon: "alert-triangle", color: "#fef3c7", iconColor: "#d97706", page: "incidentes",    group: "Gestão"     },
    // ── Sistema ──
    { label: "Dados da Loja",     sub: "Nome, logo, endereço e IVA",     icon: "store",          color: "#dcfce7", iconColor: "#16a34a", page: "loja",          group: "Sistema"    },
    { label: "Segurança",         sub: "Chave HMAC e auditoria",         icon: "shield",         color: "#fee2e2", iconColor: "#dc2626", page: "seguranca",     group: "Sistema"    },
    { label: "Configurações",     sub: "Backup, logs e dados",           icon: "settings",       color: "#f4f4f5", iconColor: "#71717a", page: "configuracoes", group: "Sistema"    },
  ];

  const caixaItems = [
    { label: "Meu Turno",         sub: "Abrir, fechar e exportar turno", icon: "clock",          color: "#ede9fe", iconColor: "#5b21b6", page: "turno",         group: "Operações"  },
    { label: "Clientes",          sub: "Fichas e histórico de compras",  icon: "users",          color: "#dbeafe", iconColor: "#2563eb", page: "clientes",      group: "Operações"  },
    { label: "Escritório",        sub: "Importar ficheiros de turno",    icon: "archive",        color: "#ede9fe", iconColor: "#5b21b6", page: "escritorio",    group: "Operações"  },
    { label: "Segurança",         sub: "Chave HMAC e auditoria",         icon: "shield",         color: "#fee2e2", iconColor: "#dc2626", page: "seguranca",     group: "Operações"  },
  ];

  const commonItems = [
    { label: "Alterar PIN",       sub: "Mudar PIN de acesso",            icon: "lock",           color: "#f4f4f5", iconColor: "#5b21b6", page: "senha",         group: "Sistema"    },
    { label: "Assinatura",        sub: "Licença e plano activo",         icon: "award",          color: "#ede9fe", iconColor: "#5b21b6", page: "assinatura",    group: "Sistema"    },
    { label: "Ajuda",             sub: "Perguntas frequentes e como usar",icon: "help-circle",   color: "#dbeafe", iconColor: "#2563eb", page: "ajuda",         group: "Sistema"    },
    { label: "Contactos",         sub: "Suporte Introxeer Technology",   icon: "headphones",     color: "#dbeafe", iconColor: "#2563eb", page: "contactos",     group: "Sistema"    },
    { label: "Sobre",             sub: "Termos, ajuda e versão",         icon: "info",           color: "#f4f4f5", iconColor: "#71717a", page: "sobre",         group: "Sistema"    },
    { label: "Terminar Sessão",   sub: "",                               icon: "log-out",        color: "#fee2e2", iconColor: "#dc2626", page: "logout",        group: null         },
  ];

  const items = [...(user.role === "admin" ? adminItems : caixaItems), ...commonItems];

  function renderItem(item) {
    return '<button class="perfil-menu-item" id="' + (item.page==="incidentes"?"perfil-menu-incidentes":"") + '" onclick="window._perfilNav(\'' + item.page + '\')">' +
      '<div class="perfil-menu-item-left">' +
      '<div class="perfil-menu-icon" style="background:' + item.color + '">' +
      '<i data-lucide="' + item.icon + '" style="color:' + item.iconColor + '"></i>' +
      '</div><div>' +
      '<div style="font-size:15px;font-weight:600">' + item.label + '</div>' +
      (item.sub ? '<div style="font-size:12px;color:#71717a;margin-top:2px">' + item.sub + '</div>' : '') +
      '</div></div>' +
      '<span class="perfil-menu-chevron">›</span>' +
      '</button>';
  }

  var grouped = items.filter(function(i) { return i.group; });
  var ungrouped = items.filter(function(i) { return !i.group; });

  var groupOrder = [];
  grouped.forEach(function(i) {
    if (groupOrder.indexOf(i.group) === -1) groupOrder.push(i.group);
  });

  var html = groupOrder.map(function(groupName) {
    var groupItems = grouped.filter(function(i) { return i.group === groupName; });
    return '<div class="perfil-group-label">' + groupName + '</div>' +
      '<div class="perfil-group">' +
      groupItems.map(renderItem).join("") +
      '</div>';
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
  ["stock","incidentes","equipa","loja","senha","dashboard","clientes",
   "despesas","contabilidade","assinatura","contactos","configuracoes",
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
    showSubpage(null);
    var prodNav = document.querySelector('.nav-item[data-page="produtos"]');
    if (prodNav) prodNav.click();
    return;
  }
  if (page === "incidentes") await loadIncidentes();
  if (page === "ajuda") await loadAjuda();
  if (page === "equipa")     await loadEquipa();
  if (page === "loja")       await loadLoja();
  if (page === "configuracoes")  await loadConfiguracoesPage();
  if (page === "contabilidade")  await loadContabilidadePage();
  if (page === "assinatura")     await loadAssinaturaPage();
  if (page === "contactos")      await loadContactosPage();
  if (page === "seguranca")    await loadSegurancaPage();
  if (page === "turno")        await loadTurnoPage();
  if (page === "fornecedores") await loadFornecedoresPage();
  if (page === "clientes")     await loadClientesPage();
  if (page === "despesas")     await loadDespesasPage();
  if (page === "senha")        loadSenhaPage();
  if (page === "sobre")        loadSobre();
  if (page === "escritorio")   await loadEscritorioPage();
  if (page === "notificacoes") await loadNotificacoesPage();
};

function showSubpage(name) {
  const subpages = ["stock","incidentes","equipa","loja","senha","dashboard","fornecedores","turno","seguranca","configuracoes","contabilidade","clientes","despesas","assinatura","contactos","escritorio","sobre","ajuda","notificacoes"];
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

  wrap.innerHTML = order.map(function(cat){
    var group = byCategory[cat];
    return '<div style="display:flex;align-items:center;gap:8px;margin:18px 0 10px">' +
        '<i data-lucide="' + group.icon + '" style="width:16px;height:16px;color:var(--primary)"></i>' +
        '<div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">' + cat + '</div>' +
      '</div>' +
      group.items.map(function(a){
        return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow-sm)">' +
          '<div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:6px">' + a.title + '</div>' +
          '<div style="font-size:13px;color:var(--text2);line-height:1.6">' + a.body + '</div>' +
        '</div>';
      }).join("");
  }).join("");

  refreshIcons(wrap);
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

  var filtersHtml =
    segmentedControl("status", _incFilterStatus, [
      { value:"open",     label:"Abertos (" + openCount + ")" },
      { value:"resolved", label:"Resolvidos (" + resolvedCount + ")" },
      { value:"archived", label:"Arquivados (" + archivedCount + ")" },
      { value:"all",      label:"Todos" },
    ]) +
    chipRow("type", _incFilterType, [
      { value:"all",   label:"Todos os tipos" },
      { value:"stock", label:"Stock" },
      { value:"caixa", label:"Caixa" },
    ]);

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
  if (filtersWrap) { filtersWrap.innerHTML = filtersHtml; refreshIcons(filtersWrap); }

  var clearBtn = document.getElementById("btn-clear-resolved-inc");
  if (!clearBtn) {
    var wrap = document.getElementById("subpage-incidentes");
    var header = wrap ? wrap.querySelector(".page-inner") : null;
    if (header) {
      clearBtn = document.createElement("button");
      clearBtn.id = "btn-clear-resolved-inc";
      clearBtn.style.cssText = "width:100%;padding:11px;background:var(--primary-light);color:var(--primary);border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px";
      clearBtn.onclick = window._clearResolvedIncidents;
      var listEl = document.getElementById("inc-list");
      if (listEl) header.insertBefore(clearBtn, listEl);
    }
  }
  if (clearBtn) {
    clearBtn.innerHTML = '<i data-lucide="archive" style="width:14px;height:14px"></i> Arquivar ' + resolvedCount + ' incidente(s) resolvido(s)';
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

  el("inc-list").innerHTML = !filtered.length
    ? '<div class="empty-state"><div class="empty-state-title">Sem incidentes' + ((_incFilterStatus!=="all"||_incFilterType!=="all") ? " com este filtro" : "") + '</div></div>'
    : filtered.map(function(i) {
        var isOpen        = i.status === "open";
        var canResolve     = isOpen && getUser().role === "admin";
        var resolverName   = (i.resolvedBy != null && usersById[i.resolvedBy]) ? usersById[i.resolvedBy].name : null;
        var diffColor      = (i.diff||0) < 0 ? "var(--danger)" : "var(--success)";
        var accentColor    = isOpen ? "var(--danger)" : "#d4d4d8";

        return '<div style="display:flex;background:#fff;border-radius:var(--radius-lg);margin-bottom:10px;box-shadow:var(--shadow-sm);overflow:hidden">' +
          '<div style="width:4px;flex-shrink:0;background:' + accentColor + '"></div>' +
          '<div style="flex:1;padding:14px 16px;min-width:0">' +

            '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px">' +
              '<div style="display:flex;align-items:center;gap:9px;min-width:0">' +
                '<div style="width:30px;height:30px;border-radius:50%;background:' + typeBg(i._type) + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
                  '<i data-lucide="' + typeIcon(i._type) + '" style="width:14px;height:14px;color:' + typeColor(i._type) + '"></i>' +
                '</div>' +
                '<div style="min-width:0">' +
                  '<div style="font-size:9.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:' + typeColor(i._type) + '">' + typeLabel(i._type) + '</div>' +
                  '<div style="font-weight:700;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + i.productName + '</div>' +
                '</div>' +
              '</div>' +
              (canResolve
                ? '<button onclick="window._openResolveModal(' + i.id + ')" style="flex-shrink:0;display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:var(--radius-sm);border:1px solid var(--success);background:var(--success-light);color:var(--success);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">' +
                    '<i data-lucide="check-circle" style="width:13px;height:13px"></i>Resolver</button>'
                : (isOpen
                    ? '<span style="flex-shrink:0;font-size:10.5px;color:var(--danger);font-weight:700;background:var(--danger-light);padding:4px 10px;border-radius:var(--radius-sm)">Pendente</span>'
                    : '<span style="flex-shrink:0;display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--success);font-weight:700"><i data-lucide="check" style="width:12px;height:12px"></i>Resolvido</span>')) +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;background:#fafafa;border-radius:var(--radius-sm);padding:10px 4px;margin-bottom:10px">' +
              '<div style="text-align:center"><div style="font-size:9.5px;color:var(--text4);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Esperado</div><div style="font-size:13px;font-weight:700;color:var(--text2)">' + (i.expected||0) + '</div></div>' +
              '<div style="text-align:center;border-left:1px solid #ececee;border-right:1px solid #ececee"><div style="font-size:9.5px;color:var(--text4);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Encontrado</div><div style="font-size:13px;font-weight:700;color:var(--text2)">' + (i.found||0) + '</div></div>' +
              '<div style="text-align:center"><div style="font-size:9.5px;color:var(--text4);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Diferença</div><div style="font-size:13px;font-weight:800;color:' + diffColor + '">' + ((i.diff||0) > 0 ? "+" : "") + (i.diff||0) + '</div></div>' +
            '</div>' +

            '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:3px">' +
              '<i data-lucide="user" style="width:12px;height:12px;color:var(--text4);flex-shrink:0;margin-top:1px"></i>' +
              '<span style="font-size:11.5px;color:var(--text3);line-height:1.4">' + turnoInfo(i) + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:flex-start;gap:6px">' +
              '<i data-lucide="clock" style="width:12px;height:12px;color:var(--text4);flex-shrink:0;margin-top:1px"></i>' +
              '<span style="font-size:11.5px;color:var(--text3);line-height:1.4">' + _fmtDateLocal(i.createdAt) + (i.note ? " · " + i.note : "") + '</span>' +
            '</div>' +

            (!isOpen && i.resolvedNote
              ? '<div style="margin-top:10px;padding:9px 11px;background:var(--success-light);border-radius:var(--radius-sm);font-size:12px;color:var(--text2);line-height:1.4"><strong style="color:var(--success)">' + (resolverName||"Admin") + ':</strong> ' + i.resolvedNote + '</div>'
              : '') +
          '</div>' +
        '</div>';
      }).join("");
  refreshIcons(el("inc-list"));
}

window._clearResolvedIncidents = async function() {
  if (!confirm("Arquivar todos os incidentes resolvidos? Saem desta lista mas continuam guardados em \"Arquivados\" para auditoria.")) return;
  const all = await db.getAll("incidents");
  const resolved = all.filter(function(i){ return i.status==="resolved" && !i.archived; });
  for (var i=0;i<resolved.length;i++) {
    await db.put("incidents", Object.assign({}, resolved[i], { archived:true, archivedAt:new Date().toISOString() }));
  }
  toast(resolved.length + " incidente(s) arquivado(s).", "success");
  await loadIncidentes();
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
        const actual = await getStock(i.productId, "shop");
        const delta = novoStock - actual;
        if (delta !== 0) {
          await addStockMovement({
            productId: i.productId, productName: p.name,
            type: "incident_resolution", location: "shop", qty: delta,
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

function openInviteDevice() {
  window._inviteRole = "caixa";
  openModal("Convidar Operador",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div style="font-size:13px;color:#71717a;line-height:1.5">Cria um código curto para o teu funcionário usar noutro telemóvel.</div>' +
    '<div class="field"><label>Função do Operador *</label>' +
    '<div class="role-toggle">' +
    '<button type="button" class="role-toggle-btn active" id="inv-role-caixa" onclick="window._setInviteRole(\'caixa\')">' +
    '<i data-lucide="shopping-bag"></i> Caixa</button>' +
    '<button type="button" class="role-toggle-btn" id="inv-role-admin" onclick="window._setInviteRole(\'admin\')">' +
    '<i data-lucide="shield"></i> Admin</button>' +
    '</div></div>' +
    '<div class="field"><label>Código de Convite *</label><input id="inv-code" placeholder="Ex: MERC2026" style="text-transform:uppercase"/></div>' +
    '<button class="btn btn-primary btn-full" onclick="window._generateInviteQR()">' +
    '<i data-lucide="qr-code"></i> Gerar QR</button>' +
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
  if (!code) { alert("Insere um código de convite."); return; }

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
    '<div class="field"><label>Perfil</label>' +
    '<div class="role-toggle">' +
    '<button type="button" class="role-toggle-btn active" id="uf-role-caixa" onclick="window._setUfRole(\'caixa\')">' +
    '<i data-lucide="shopping-bag"></i> Caixa</button>' +
    '<button type="button" class="role-toggle-btn" id="uf-role-admin" onclick="window._setUfRole(\'admin\')">' +
    '<i data-lucide="shield"></i> Admin</button>' +
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
  if (!confirm("Eliminar " + u.name + "? Esta acção é irreversível. O histórico de vendas e sessões deste funcionário será mantido para auditoria, mas ele deixará de poder entrar no sistema.")) return;
  await db.delete("users", id);
  toast("Funcionário eliminado.", "success");
  loadEquipa();
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

  var upload = document.getElementById("logo-upload");
  if (upload) {
    upload.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
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
    toast("PIN alterado com sucesso.", "success");
    el("pw-cur").value = ""; el("pw-new").value = ""; el("pw-conf").value = "";
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
  await loadDashboard();
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

async function loadContabilidade() {
  var wrap = document.getElementById("contabilidade-content");
  if (!wrap) return;

  var sales    = await db.getAll("sales");
  var purchases= await db.getAll("purchases");
  var products = await db.getAll("products");
  var fiados   = await db.getAll("fiado");
  var archive  = await db.getAll("accountingArchive");

  var now   = new Date();
  var mes   = now.toISOString().slice(0,7);
  var hoje  = now.toISOString().slice(0,10);
  var ano   = now.getFullYear().toString();

  // Receitas
  var vendasMes  = sales.filter(function(s){ return (s.date||"").startsWith(mes); });
  var vendasAno  = sales.filter(function(s){ return (s.date||"").startsWith(ano); });
  var vendasHoje = sales.filter(function(s){ return (s.date||"").startsWith(hoje); });

  // Receita = só vendas pagas (exclui fiados em aberto)
  // Receita total = todas as vendas (fiado é receita pendente)
  var receitaMes  = vendasMes.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var receitaAno  = vendasAno.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var receitaHoje = vendasHoje.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  // Fiado recebido = fiados pagos no mês
  var receitaFiadoMes = fiados.filter(function(f){ return f.status==="paid" && (f.paidAt||"").startsWith(mes); })
    .reduce(function(a,f){ return a+(f.amount||0); },0);
  // Fiado pendente = fiados em aberto
  var fiadoPendenteMes = fiados.filter(function(f){ return f.status==="open"; })
    .reduce(function(a,f){ return a+(f.amount||0); },0);

  // Custo das vendas (COGS)
  var prodMap = {};
  products.forEach(function(p){ prodMap[p.id]=p; });

  // COGS = custo dos produtos vendidos menos devoluções
  var cogsMes = vendasMes.reduce(function(a,s){
    var custoVenda = (s.items||[]).reduce(function(b,i){
      var p = prodMap[i.id];
      return b + (p ? (p.costPrice||0)*i.qty : 0);
    },0);
    // Desconto proporcional de devoluções
    var propDev = s.total > 0 ? (s.totalDevolvido||0)/s.total : 0;
    return a + custoVenda * (1 - propDev);
  },0);

  var cogsAno = vendasAno.reduce(function(a,s){
    var custoVenda = (s.items||[]).reduce(function(b,i){
      var p = prodMap[i.id];
      return b + (p ? (p.costPrice||0)*i.qty : 0);
    },0);
    var propDev = s.total > 0 ? (s.totalDevolvido||0)/s.total : 0;
    return a + custoVenda * (1 - propDev);
  },0);

  // Lucro bruto
  var lucroMes = receitaMes - cogsMes;
  var lucroAno = receitaAno - cogsAno;
  var margemMes = receitaMes > 0 ? ((lucroMes/receitaMes)*100).toFixed(1) : "0.0";

  // Compras a fornecedores
  var comprasMes = purchases.filter(function(p){ return (p.date||"").startsWith(mes); })
    .reduce(function(a,p){ return a+(p.total||0); },0);

  var allExpenses = await db.getAll("expenses");
  var despesasMes = allExpenses.filter(function(e){ return (e.date||"").startsWith(mes); })
    .reduce(function(a,e){ return a+(e.amount||0); },0);
  var lucroLiquido = lucroMes - despesasMes;

  // Fiados em aberto
  var fiadoAberto = fiados.filter(function(f){ return f.status==="open"; })
    .reduce(function(a,f){ return a+(f.amount||0); },0);
  var fiadoRecebido = fiados.filter(function(f){ return f.status==="paid"; })
    .reduce(function(a,f){ return a+(f.amount||0); },0);

  // Top produtos por receita
  var prodReceita = {};
  vendasMes.forEach(function(s){
    (s.items||[]).forEach(function(i){
      prodReceita[i.id] = (prodReceita[i.id]||{name:i.name,total:0,qty:0});
      prodReceita[i.id].total += i.price*i.qty;
      prodReceita[i.id].qty   += i.qty;
    });
  });
  var topProd = Object.values(prodReceita).sort(function(a,b){ return b.total-a.total; }).slice(0,5);

  // Vendas por método de pagamento
  var porMetodo = {};
  vendasMes.forEach(function(s){
    porMetodo[s.payMethod] = (porMetodo[s.payMethod]||0) + s.total;
  });

  // Devoluções do mês
  var devMes = vendasMes.reduce(function(a,s){ return a+(s.totalDevolvido||0); },0);

  wrap.innerHTML =
    // ── HERO — resultado do mês ──
    '<div class="conta-hero" style="background:' + (lucroLiquido>=0?'linear-gradient(135deg,#059669,#10b981)':'linear-gradient(135deg,#dc2626,#ef4444)') + '">' +
    '<div class="conta-hero-label">Resultado do mês</div>' +
    '<div class="conta-hero-val">' + fmt(lucroLiquido) + '</div>' +
    '<div class="conta-hero-sub">' + (lucroLiquido>=0?'▲ Lucro':'▼ Prejuízo') + ' · ' + vendasMes.length + ' vendas · margem ' + margemMes + '%</div>' +
    '</div>' +

    // ── KPIs em grid ──
    '<div class="conta-section-label">Resumo do mês</div>' +
    '<div class="conta-grid">' +
    contaKpi("Receita", fmt(receitaMes), "#16a34a", "trending-up") +
    contaKpi("Custo vendas", fmt(cogsMes), "#d97706", "package") +
    contaKpi("Lucro bruto", fmt(lucroMes), lucroMes>=0?"#16a34a":"#dc2626", "dollar-sign") +
    contaKpi("Despesas", fmt(despesasMes), "#dc2626", "receipt") +
    contaKpi("Compras", fmt(comprasMes), "#6b7280", "shopping-cart") +
    contaKpi("Devoluções", fmt(devMes), devMes>0?"#d97706":"#16a34a", "rotate-ccw") +
    '</div>' +

    // ── Fiados ──
    '<div class="conta-section-label">Fiados</div>' +
    '<div class="conta-card">' +
    contaRow("Fiado recebido este mês", fmt(receitaFiadoMes), "#16a34a") +
    contaRow("Fiado pendente total", fmt(fiadoPendenteMes||0), "#d97706") +
    contaRow("Fiado em aberto", fmt(fiadoAberto), "#dc2626") +
    '</div>' +

    // Receitas por período
    '<div class="conta-section-label">Receitas por período</div>' +
    '<div class="conta-card">' +
    contaRow("Hoje", fmt(receitaHoje), "#16a34a", vendasHoje.length+" "+(vendasHoje.length===1?"venda":"vendas")) +
    contaRow("Este mês", fmt(receitaMes), "#16a34a", vendasMes.length+" vendas") +
    contaRow("Este ano", fmt(receitaAno), "#16a34a", vendasAno.length+" vendas") +
    contaRow("Fiado recebido", fmt(receitaFiadoMes), "#5b21b6", fiados.filter(function(f){return f.status==="paid";}).length+" pagos") +
    '</div>' +

    // Top produtos
    (topProd.length ?
    '<div class="conta-section-label">Top produtos do mês</div>' +
    '<div class="conta-card" style="padding:14px">' +
    topProd.map(function(p,i){
      var pct = receitaMes>0?Math.round((p.total/receitaMes)*100):0;
      var medals = ["🥇","🥈","🥉","4.","5."];
      return '<div style="margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
        '<span style="font-size:16px">' + medals[i] + '</span>' +
        '<span style="font-size:13px;font-weight:700;color:var(--text)">' + p.name + '</span>' +
        '</div>' +
        '<span style="font-size:13px;font-weight:700;color:var(--success)">' + fmt(p.total) + '</span>' +
        '</div>' +
        '<div style="height:5px;background:var(--border2);border-radius:3px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:var(--primary);border-radius:3px;transition:width .5s"></div>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--text4);margin-top:3px">' + p.qty + ' un · ' + pct + '% da receita</div>' +
        '</div>';
    }).join("") +
    '</div>' : "") +

    // Por método de pagamento
    '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;border:1px solid #f4f4f5">' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Por método de pagamento</div>' +
    Object.entries(porMetodo).map(function(e){
      var pct = receitaMes>0?Math.round((e[1]/receitaMes)*100):0;
      var colors = {dinheiro:"#16a34a",transferencia:"#2563eb",multicaixa:"#d97706",fiado:"#dc2626"};
      var color  = colors[e[0]]||"#71717a";
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f4f4f5">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<div style="width:10px;height:10px;border-radius:50%;background:'+color+'"></div>' +
        '<span style="font-size:13px;font-weight:600;text-transform:capitalize">'+e[0]+'</span>' +
        '</div>' +
        '<div style="text-align:right">' +
        '<div style="font-size:13px;font-weight:700;color:'+color+'">'+fmt(e[1])+'</div>' +
        '<div style="font-size:11px;color:#a1a1aa">'+pct+'%</div>' +
        '</div></div>';
    }).join("") +
    '</div>';

  // Relatorio por funcionario
  var users = await db.getAll("users");
  var funcSection = document.createElement("div");
  funcSection.style.cssText = "margin-bottom:14px";
  funcSection.innerHTML =
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Relatório por funcionário</div>' +
    '<div class="vender-card" style="display:flex;flex-direction:column;gap:10px">' +
    '<select id="func-select" style="width:100%;padding:10px;border:1.5px solid #e4e4e7;border-radius:8px;font-family:inherit;font-size:14px">' +
    users.map(function(u){ return '<option value="'+u.id+'">'+u.name+'</option>'; }).join("") +
    '</select>' +
    '<button onclick="window._gerarRelatorioFuncionario()" style="width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px"><i data-lucide="user-check" style="width:15px;height:15px"></i> Gerar relatório do funcionário</button>' +
    '</div>';
  wrap.appendChild(funcSection);
  refreshIcons(funcSection);

  // Botão exportar PDF
  var pdfBtn = document.createElement("button");
  pdfBtn.style.cssText = "width:100%;padding:14px;background:#dc2626;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:8px";
  pdfBtn.innerHTML = '<i data-lucide="file-text" style="width:16px;height:16px"></i> Exportar Relatório PDF';
  pdfBtn.onclick = gerarRelatorioPDF;
  wrap.appendChild(pdfBtn);

  refreshIcons(wrap);
}

function contaKpi(label, value, color, icon) {
  return '<div class="conta-kpi">' +
    '<div class="conta-kpi-icon" style="color:' + color + ';background:' + color + '20">' +
    '<i data-lucide="' + icon + '" style="width:14px;height:14px"></i></div>' +
    '<div class="conta-kpi-val" style="color:' + color + '">' + value + '</div>' +
    '<div class="conta-kpi-label">' + label + '</div>' +
    '</div>';
}

function contaRow(label, value, color, sub) {
  return '<div class="conta-row">' +
    '<div>' +
    '<div class="conta-row-label">' + label + '</div>' +
    (sub ? '<div class="conta-row-sub">' + sub + '</div>' : '') +
    '</div>' +
    '<div class="conta-row-val" style="color:' + color + '">' + value + '</div>' +
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
  var maxProd = plan.maxProducts >= 999999 ? "∞" : plan.maxProducts;
  var maxUser = plan.maxUsers >= 999999 ? "∞" : plan.maxUsers;
  var maxDev  = plan.maxDevices >= 999999 ? "∞" : plan.maxDevices;
  limitsEl.innerHTML =
    '<div class="lic-limit-item"><div class="lic-limit-val">' + maxProd + '</div><div class="lic-limit-label">Produtos</div></div>' +
    '<div class="lic-limit-item"><div class="lic-limit-val">' + maxUser + '</div><div class="lic-limit-label">Utilizadores</div></div>' +
    '<div class="lic-limit-item"><div class="lic-limit-val">' + maxDev + '</div><div class="lic-limit-label">Dispositivos</div></div>';
  wrap.appendChild(limitsEl);

  // ── Estado da licença ──
  var statusCard = document.createElement("div");
  statusCard.className = "lic-status-card";

  var sk = await db.get("settings","storeKey");
  var hasKey = !!(sk && sk.value);

  var expDate = lic.expiresAt
    ? new Date(lic.expiresAt).toLocaleDateString("pt-PT",{day:"2-digit",month:"long",year:"numeric"})
    : isTrial ? "30 dias de avaliação" : "—";

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
      '<input class="lic-code-input" id="activation-code" placeholder="KTKI-XXXX-XXXX-XXXXXXXX" maxlength="27"/>' +
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
    { key:"basic",      features:["Vendas e stock","Fiados e clientes","Recuperação de PIN","Histórico e dashboard"] },
    { key:"standard",   features:["Tudo do Basic","Contabilidade","Fornecedores","Backup e relatórios"] },
    { key:"pro",        features:["Tudo do Standard","PDF de contabilidade","Recibo com QR","Logotipo","Equipa"] },
    { key:"enterprise", features:["Tudo do Pro","Suporte dedicado"] },
  ];

  planDefs.forEach(function(pd) {
    var p       = PLANS[pd.key];
    var isActive = lic.plan === pd.key;
    var maxProd  = p.maxProducts >= 999999 ? "∞" : p.maxProducts;
    var maxUser  = p.maxUsers >= 999999 ? "∞" : p.maxUsers;
    var maxDev   = p.maxDevices >= 999999 ? "∞" : p.maxDevices;

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
        '<div class="plan-card-limit">' + maxUser + ' utilizador' + (p.maxUsers!==1?'es':'') + '</div>' +
        '<div class="plan-card-limit">' + maxDev + ' dispositivo' + (p.maxDevices!==1?'s':'') + '</div>' +
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
  contactEl.style.cssText = "text-align:center;padding:12px 0 20px;font-size:12px;color:var(--text4);line-height:1.6";
  contactEl.innerHTML =
    'Para adquirir ou renovar um plano,<br>contacta a <strong style="color:var(--primary)">Introxeer</strong> via ' +
    '<a href="https://wa.me/244900000000" style="color:var(--primary);font-weight:700;text-decoration:none">WhatsApp</a>.';
  wrap.appendChild(contactEl);

  refreshIcons(wrap);
}

function formatLicenseCodeInput() {
  var raw = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  var groups = [4, 4, 4, 8];
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
    '<div style="font-size:13px;color:#ddd6fe;margin-top:4px">Introxeer Technology · Angola</div>' +
    '</div>' +

    contactCard("WhatsApp", "Suporte técnico rápido", "message-circle", "#25D366", "https://wa.me/244900000000") +
    contactCard("Email", "info@introxeer.co.ao", "mail", "#5b21b6", "mailto:info@introxeer.co.ao") +
    contactCard("GitHub", "github.com/samuelfranckarnaldo/kontaki", "github", "#18181b", "https://github.com/samuelfranckarnaldo/kontaki") +

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
  var mes = now.toISOString().slice(0,7);
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


async function loadClientesPage() {
  var btn = document.getElementById("btn-back-clientes");
  if (btn) btn.onclick = function() { showSubpage(null); };
  window._showSubpage = showSubpage;
  await loadClientes();
}

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
    { label: "Termos do Consumidor",          icon: "file-text",    action: "window._showTermos()" },
    { label: "Política de Privacidade",       icon: "shield-check", action: "window._showPrivacidade()" },
    { label: "Política de Uso Aceitável",     icon: "file-text",    action: "window._showPlaceholderDoc('Política de Uso Aceitável')" },
    { label: "Licença de Utilização (EULA)",  icon: "award",        action: "window._showLicencaEula()" },
    { label: "Ajuda",                         icon: "help-circle",  action: "window._showAjudaFAQ()" },
    { label: "Documentação",                  icon: "book-open",    action: "window._showPlaceholderDoc('Documentação')" },
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
  footer.innerHTML = "Kontaki v1.0.0-beta<br/>Introxeer Technology · Angola";
  wrap.appendChild(footer);

  refreshIcons(wrap);
}

window._showPlaceholderDoc = function(title) {
  openModal(title,
    '<div style="font-size:13px;color:var(--text3);line-height:1.6;margin-bottom:16px">' +
    'Este documento está em preparação. Contacta a Introxeer Technology para mais informações.' +
    '</div>' +
    '<a href="https://wa.me/244900000000" target="_blank" class="btn btn-primary btn-full" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px">' +
    '<i data-lucide="message-circle"></i> Falar via WhatsApp</a>' +
    '<button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="window._closeModal()">Fechar</button>');
  refreshIcons(el("modal-box"));
};

window._showAjudaFAQ = function() {
  var faqs = [
    ["Como funciona o Kontaki sem internet?", "O Kontaki funciona totalmente offline. Todos os dados ficam guardados no teu dispositivo, e a sincronização entre Escritório e Caixa é feita por ficheiro, sem depender de ligação permanente à internet."],
    ["Esqueci o meu PIN, o que faço?", "Pede a um administrador da tua loja para repor o teu PIN em Equipa. Se és o único administrador, contacta o suporte da Introxeer."],
    ["Como faço backup dos meus dados?", "Vai a Configurações → Backup para exportar uma cópia dos teus dados. Recomendamos fazer isto regularmente."],
    ["O que acontece se a avaliação expirar?", "Após o período de avaliação, algumas funcionalidades ficam bloqueadas até activares um plano em Assinatura."],
    ["Posso usar o Kontaki em mais de um dispositivo?", "Depende do teu plano. O número de dispositivos permitido está indicado em Assinatura."],
    ["Como contacto o suporte?", "Vai a Contactos, no menu do Perfil, para falar com a Introxeer Technology via WhatsApp."]
  ];
  var body = faqs.map(function(f) {
    return '<div style="margin-bottom:14px">' +
      '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">' + f[0] + '</div>' +
      '<div style="font-size:12px;color:var(--text3);line-height:1.5">' + f[1] + '</div>' +
      '</div>';
  }).join("");
  openModal("Ajuda", body + '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>');
  refreshIcons(el("modal-box"));
};

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
