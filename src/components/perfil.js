import { loadDashboard }      from "./dashboard.js";
import { loadConfiguracoes }  from "./configuracoes.js";
import { loadClientes }       from "./clientes.js";
import { loadDespesas }       from "./despesas.js";
import { loadSeguranca }   from "./seguranca.js";
import { loadTurno } from "./turno.js";
import { loadFornecedores } from "./fornecedores.js";
import { db }                    from "../db.js";
import { el, val, refreshIcons } from "../utils.js";
import { toast }                 from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser, logout, changePasswordAuth, createUser } from "../auth.js";
import { getLicense, loadLicense, activateLicense, PLANS, showUpgradeBanner } from "../license.js";
import { gerarRelatorioPDF } from "./extras.js";

export async function initPerfil() {
  const user  = getUser();
  const store = (await db.get("settings", "store")) || {};

  var avatarEl = el("perfil-avatar");
  var nameEl   = el("perfil-name");
  var roleEl   = el("perfil-role");

  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role === "admin" ? "Administrador" : "Operador de Caixa";

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
  renderVersionFooter();
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

function renderVersionFooter() {
  var existing = document.getElementById("perfil-version-footer");
  if (existing) existing.remove();
  var pg = el("pg-perfil");
  if (!pg) return;
  var div = document.createElement("div");
  div.id = "perfil-version-footer";
  div.style.cssText = "padding:16px;text-align:center;border-top:1px solid #f4f4f5;margin-top:8px";
  div.innerHTML =
    '<div style="font-size:12px;color:#a1a1aa;line-height:1.8">' +
    'Kontaki v1.0.0-beta<br/>' +
    'Introxeer Technology · Angola<br/>' +
    '<button onclick="window._showTermos()" style="background:none;border:none;color:#5b21b6;' +
    'font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline">Termos</button>' +
    ' · ' +
    '<button onclick="window._showPrivacidade()" style="background:none;border:none;color:#5b21b6;' +
    'font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline">Privacidade</button>' +
    '</div>';
  pg.appendChild(div);
}

function renderMenu() {
  const user = getUser();

  const adminItems = [
    // ── Operações diárias ──
    { label: "Meu Turno",         sub: "Abrir, fechar e exportar turno", icon: "clock",          color: "#ede9fe", iconColor: "#5b21b6", page: "turno",         group: "Operações"  },
    { label: "Despesas",          sub: "Renda, salários e outros custos",icon: "receipt",        color: "#fee2e2", iconColor: "#dc2626", page: "despesas",      group: "Operações"  },
    { label: "Clientes",          sub: "Fichas e histórico de compras",  icon: "users",          color: "#dbeafe", iconColor: "#2563eb", page: "clientes",      group: "Operações"  },
    // ── Gestão ──
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
  ];

  const commonItems = [
    { label: "Alterar PIN",       sub: "Mudar PIN de acesso",            icon: "lock",           color: "#f4f4f5", iconColor: "#5b21b6", page: "senha",         group: "Sistema"    },
    { label: "Assinatura",        sub: "Licença e plano activo",         icon: "award",          color: "#ede9fe", iconColor: "#5b21b6", page: "assinatura",    group: "Sistema"    },
    { label: "Contactos",         sub: "Suporte Introxeer Technology",   icon: "headphones",     color: "#dbeafe", iconColor: "#2563eb", page: "contactos",     group: "Sistema"    },
    { label: "Terminar Sessão",   sub: "",                               icon: "log-out",        color: "#fee2e2", iconColor: "#dc2626", page: "logout",        group: null         },
  ];

  const items = [...(user.role === "admin" ? adminItems : caixaItems), ...commonItems];

  el("perfil-menu").innerHTML =
    '<div class="perfil-menu-wrap">' +
    items.map(function(item) {
      return '<button class="perfil-menu-item" onclick="window._perfilNav(\'' + item.page + '\')">' +
        '<div class="perfil-menu-item-left">' +
        '<div class="perfil-menu-icon" style="background:' + item.color + '">' +
        '<i data-lucide="' + item.icon + '" style="color:' + item.iconColor + '"></i>' +
        '</div><div>' +
        '<div style="font-size:15px;font-weight:600">' + item.label + '</div>' +
        (item.sub ? '<div style="font-size:12px;color:#71717a;margin-top:2px">' + item.sub + '</div>' : '') +
        '</div></div>' +
        '<span class="perfil-menu-chevron">›</span>' +
        '</button>';
    }).join("") +
    '</div>';

  refreshIcons(el("perfil-menu"));
}

function setupSubpageButtons() {
  ["stock","incidentes","equipa","loja","senha","dashboard","clientes",
   "despesas","contabilidade","assinatura","contactos","configuracoes",
   "seguranca","turno","fornecedores"].forEach(function(name) {
    var btn = document.getElementById("btn-back-" + name);
    if (btn) btn.onclick = function() { window._perfilBack(); };
  });

  const pwBtn   = el("btn-change-pw");
  const lojaBtn = el("btn-save-loja");
  const userBtn = el("btn-user-add");
  if (pwBtn)   pwBtn.onclick   = changePassword;
  if (lojaBtn) lojaBtn.onclick = saveStoreSettings;
  if (userBtn) userBtn.onclick = openUserAdd;
}

window._perfilBack = function() {
  showSubpage(null);
};

window._perfilNav = async (page) => {
  if (page === "logout") { logout(); return; }
  showSubpage(page);
  if (page === "stock") {
    showSubpage(null);
    var prodNav = document.querySelector('.nav-item[data-page="produtos"]');
    if (prodNav) prodNav.click();
    return;
  }
  if (page === "incidentes") await loadIncidentes();
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
};

function showSubpage(name) {
  const subpages = ["stock","incidentes","equipa","loja","senha","dashboard","fornecedores","turno","seguranca","configuracoes","contabilidade","clientes","despesas","assinatura","contactos"];
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

async function loadIncidentes() {
  const allList = (await db.getAll("incidents")).reverse();
  const resolvedCount = allList.filter(function(i){ return i.status==="resolved"; }).length;
  const list = allList;

  var clearBtn = document.getElementById("btn-clear-resolved-inc");
  if (!clearBtn) {
    var wrap = document.getElementById("subpage-incidentes");
    var header = wrap ? wrap.querySelector(".page-inner") : null;
    if (header) {
      clearBtn = document.createElement("button");
      clearBtn.id = "btn-clear-resolved-inc";
      clearBtn.style.cssText = "width:100%;padding:11px;background:#f4f4f5;color:#71717a;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px";
      clearBtn.onclick = window._clearResolvedIncidents;
      var listEl = document.getElementById("inc-list");
      if (listEl) header.insertBefore(clearBtn, listEl);
    }
  }
  if (clearBtn) {
    clearBtn.innerHTML = '<i data-lucide="trash-2" style="width:14px;height:14px"></i> Limpar ' + resolvedCount + ' incidente(s) resolvido(s)';
    clearBtn.style.display = resolvedCount > 0 ? "flex" : "none";
    refreshIcons(clearBtn);
  }

  el("inc-list").innerHTML = !list.length
    ? `<div class="empty-state"><div class="empty-state-title">Sem incidentes</div></div>`
    : list.map(i => `
        <div style="padding:14px;border:1px solid ${i.status === "resolved" ? "#e4e4e7" : "#fde68a"};
                    border-radius:12px;margin-bottom:10px;
                    background:${i.status === "resolved" ? "#fff" : "#fef3c7"}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div>
              <div style="font-weight:700;font-size:14px;margin-bottom:4px">${i.productName}</div>
              <div style="font-size:12px;color:#71717a">
                Esperado: <strong>${i.expected||0}</strong> ·
                Encontrado: <strong>${i.found||0}</strong> ·
                Diferença: <strong style="color:${(i.diff||0) < 0 ? "#dc2626" : "#16a34a"}">${(i.diff||0) > 0 ? "+" : ""}${i.diff||0}</strong>
              </div>
            </div>
            ${i.status === "open" && getUser().role === "admin"
              ? `<button class="btn btn-success btn-sm" onclick="window._resolveInc(${i.id})">
                   <i data-lucide="check"></i> Resolver
                 </button>`
              : `<span style="font-size:12px;color:#16a34a;font-weight:600">✓ Resolvido</span>`}
          </div>
        </div>`).join("");
  refreshIcons(el("inc-list"));
}

window._clearResolvedIncidents = async function() {
  if (!confirm("Eliminar todos os incidentes resolvidos? O stock já foi corrigido, isto so limpa a lista.")) return;
  const all = await db.getAll("incidents");
  const resolved = all.filter(function(i){ return i.status==="resolved"; });
  for (var i=0;i<resolved.length;i++) await db.delete("incidents", resolved[i].id);
  toast(resolved.length + " incidente(s) removido(s).", "success");
  await loadIncidentes();
};

window._resolveInc = async (id) => {
  const i = await db.get("incidents", id);
  await db.put("incidents", { ...i, status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: getUser().id });
  const p = await db.get("products", i.productId);
  if (p) await db.put("products", { ...p, stock: i.countedStock, physicalStock: i.countedStock });
  toast("Incidente resolvido.", "success");
  loadIncidentes();
};

async function loadEquipa() {
  const [users, sessions] = await Promise.all([db.getAll("users"), db.getAll("sessions")]);
  el("users-list").innerHTML = users.map(u => {
    const ns = sessions.filter(s => s.userId === u.id).length;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:14px 16px;border-bottom:1px solid #f4f4f5;gap:10px">
        <div>
          <div style="font-weight:700;font-size:14px">${u.name}</div>
          <div style="font-size:12px;color:#71717a">@${u.username} · ${u.role} · ${ns} sessões</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;
                       background:${u.active ? "#dcfce7" : "#fee2e2"};
                       color:${u.active ? "#16a34a" : "#dc2626"}">
            ${u.active ? "Ativo" : "Inativo"}
          </span>
          ${u.id !== getUser().id
            ? `<button class="btn btn-ghost btn-sm" onclick="window._toggleUser(${u.id})">${u.active ? "Desativar" : "Ativar"}</button>`
            : ""}
        </div>
      </div>`;
  }).join("");
}

function openUserAdd() {
  openModal("Novo Funcionário", `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label>Nome Completo *</label><input id="uf-name"/></div>
      <div class="field"><label>Username *</label><input id="uf-user"/></div>
      <div class="field"><label>Senha *</label><input type="password" id="uf-pass"/></div>
      <div class="field"><label>Perfil</label>
        <select id="uf-role">
          <option value="caixa">Caixa</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._saveUser()">
        <i data-lucide="user-plus"></i> Adicionar
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
}

window._saveUser = async () => {
  const name     = el("uf-name").value.trim();
  const username = el("uf-user").value.trim();
  const password = el("uf-pass").value;
  const role     = el("uf-role").value;
  if (!name || !username || !password) { toast("Preencha todos os campos.", "error"); return; }
  try {
    await createUser(name, username, password, role);
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
  toast(u.active ? "Desativado." : "Ativado.", "success");
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
  if (!cur || !nw) { toast("Preencha todos os campos.", "error"); return; }
  if (nw !== conf)  { toast("As senhas não coincidem.", "error"); return; }
  try {
    await changePasswordAuth(cur, nw);
    toast("Senha alterada com sucesso.", "success");
    el("pw-cur").value = ""; el("pw-new").value = ""; el("pw-conf").value = "";
  } catch(err) {
    toast(err.message, "error");
  }
}

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
  var plan  = PLANS[lic.plan] || PLANS.solo;
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
    '<div class="lic-hero-sub">Introxeer · Kontaki v1.0.0</div>' +
    '<div class="lic-hero-badge">' +
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
    '<div class="field" style="margin-bottom:12px">' +
      '<input class="lic-code-input" id="activation-code" placeholder="KTKI-XXXX-XXXX-XXXX" maxlength="19"/>' +
    '</div>' +
    '<button class="btn btn-primary btn-full btn-lg" onclick="window._activarLicenca()">' +
      '<i data-lucide="zap"></i> Activar licença' +
    '</button>';
  wrap.appendChild(actCard);

  // ── Lista de planos ──
  var plansLabel = document.createElement("div");
  plansLabel.className = "desp-section-label";
  plansLabel.style.marginTop = "8px";
  plansLabel.textContent = "Planos disponíveis";
  wrap.appendChild(plansLabel);

  var planDefs = [
    { key:"solo",       features:["Vendas e stock","Fiados e clientes","Contabilidade","Recuperação de PIN","Suporte: documentação"] },
    { key:"team",       features:["Tudo do Solo","Scanner QR de produtos","Suporte WhatsApp"] },
    { key:"business",   features:["Tudo do Team","Verificação de recibo por QR"] },
    { key:"pro",        features:["Tudo do Business","Suporte prioritário"] },
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
window._uploadLogo = function(input) {
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

function loadSenhaPage() {
  var wrap = document.getElementById("subpage-senha");
  if (!wrap) return;
  var btn = document.getElementById("btn-back-senha");
  if (btn) btn.onclick = function() { window._perfilBack(); };
}
