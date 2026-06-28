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
import { getLicense, PLANS, activateLicense } from "../license.js";
import { gerarRelatorioPDF } from "./extras.js";

export async function initPerfil() {
  const user = getUser();
  var avatarEl = el("perfil-avatar");
  var nameEl   = el("perfil-name");
  var roleEl   = el("perfil-role");
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
  if (nameEl)   nameEl.textContent   = user.name;
  if (roleEl)   roleEl.textContent   = user.role === "admin" ? "Administrador" : "Operador de Caixa";

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
  ["stock","incidentes","equipa","loja","senha","dashboard"].forEach(name => {
    const btn = document.getElementById("btn-back-" + name);
    if (btn) btn.onclick = () => showSubpage(null);
  });

  const pwBtn   = el("btn-change-pw");
  const lojaBtn = el("btn-save-loja");
  const userBtn = el("btn-user-add");
  if (pwBtn)   pwBtn.onclick   = changePassword;
  if (lojaBtn) lojaBtn.onclick = saveStoreSettings;
  if (userBtn) userBtn.onclick = openUserAdd;
}

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
  if (header) header.style.display = name ? "none" : "block";
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
}

async function saveStoreSettings() {
  await db.put("settings", { key: "store", name: val("ss-name"), address: val("ss-addr"), phone: val("ss-phone") });
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
  var receitaMes  = vendasMes.filter(function(s){ return s.payMethod!=="fiado"||s.fiadoPago; }).reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var receitaAno  = vendasAno.filter(function(s){ return s.payMethod!=="fiado"||s.fiadoPago; }).reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var receitaHoje = vendasHoje.filter(function(s){ return s.payMethod!=="fiado"||s.fiadoPago; }).reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var receitaFiadoMes = vendasMes.filter(function(s){ return s.payMethod==="fiado"&&!s.fiadoPago; }).reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);

  // Custo das vendas (COGS)
  var prodMap = {};
  products.forEach(function(p){ prodMap[p.id]=p; });

  var cogsMes = vendasMes.reduce(function(a,s){
    return a + (s.items||[]).reduce(function(b,i){
      var p = prodMap[i.id];
      return b + (p ? (p.costPrice||0)*i.qty : 0);
    },0);
  },0);

  var cogsAno = vendasAno.reduce(function(a,s){
    return a + (s.items||[]).reduce(function(b,i){
      var p = prodMap[i.id];
      return b + (p ? (p.costPrice||0)*i.qty : 0);
    },0);
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

  wrap.innerHTML =
    // KPIs principais
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Resumo do Mês</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">' +
    kpi("Receita mensal", fmt(receitaMes), "#16a34a", "trending-up") +
    kpi("Lucro bruto", fmt(lucroMes), lucroMes>=0?"#16a34a":"#dc2626", "dollar-sign") +
    kpi("Margem bruta", margemMes+"%", lucroMes>=0?"#5b21b6":"#dc2626", "percent") +
    kpi("COGS do mês", fmt(cogsMes), "#d97706", "package") +
    kpi("Compras", fmt(comprasMes), "#dc2626", "shopping-bag") +
    kpi("Despesas gerais", fmt(despesasMes), "#dc2626", "receipt") +
    kpi("Lucro Líquido", fmt(lucroLiquido), lucroLiquido>=0?"#16a34a":"#dc2626", "wallet") +
    kpi("Fiado aberto", fmt(fiadoAberto), "#d97706", "credit-card") +
    kpi("Fiado pendente (mês)", fmt(receitaFiadoMes||0), "#d97706", "clock") +
    '</div>' +

    // Receita hoje vs mês vs ano
    '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;border:1px solid #f4f4f5">' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Receitas por período</div>' +
    row("Hoje", fmt(receitaHoje), vendasHoje.length+" vendas") +
    row("Este mês", fmt(receitaMes), vendasMes.length+" vendas") +
    row("Este ano", fmt(receitaAno), vendasAno.length+" vendas") +
    row("Fiado recebido", fmt(fiadoRecebido), fiados.filter(function(f){return f.status==="paid";}).length+" pagos") +
    '</div>' +

    // Top produtos
    (topProd.length ?
    '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;border:1px solid #f4f4f5">' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Top Produtos (mês)</div>' +
    topProd.map(function(p,i){
      var pct = receitaMes>0?Math.round((p.total/receitaMes)*100):0;
      return '<div style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">' +
        '<span style="font-weight:600">'+(i+1)+'. '+p.name+'</span>' +
        '<span style="font-weight:700;color:#16a34a">'+fmt(p.total)+'</span>' +
        '</div>' +
        '<div style="height:6px;background:#f4f4f5;border-radius:3px;overflow:hidden">' +
        '<div style="height:100%;width:'+pct+'%;background:#5b21b6;border-radius:3px"></div>' +
        '</div>' +
        '<div style="font-size:11px;color:#a1a1aa;margin-top:2px">'+p.qty+' unidades · '+pct+'% da receita</div>' +
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
  var wrap = document.getElementById("assinatura-content");
  if (!wrap) return;

  var sk = await db.get("settings","storeKey");
  var hasKey = !!(sk&&sk.value);

  wrap.innerHTML =
    '<div style="background:linear-gradient(135deg,#5b21b6,#7c3aed);border-radius:16px;padding:20px;color:#fff;text-align:center;margin-bottom:16px">' +
    '<i data-lucide="award" style="width:40px;height:40px;color:#ddd6fe;margin-bottom:12px"></i>' +
    '<div style="font-size:18px;font-weight:700;margin-bottom:4px">Kontaki Beta</div>' +
    '<div style="font-size:13px;color:#ddd6fe;margin-bottom:12px">Versão 1.0.0-beta · Introxeer Technology</div>' +
    '<div style="background:rgba(255,255,255,.15);border-radius:10px;padding:10px;font-size:12px;color:#ddd6fe">' +
    'Plano Beta gratuito · Sem limite de vendas · Dados locais seguros' +
    '</div></div>' +

    '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;border:1px solid #f4f4f5">' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Estado da licença</div>' +
    statusRow("Versão", "1.0.0-beta", "#5b21b6") +
    statusRow("Plano", "Beta Gratuito", "#16a34a") +
    statusRow("Chave HMAC", hasKey?"Configurada":"Não configurada", hasKey?"#16a34a":"#dc2626") +
    statusRow("Dados", "Armazenamento local (offline)", "#5b21b6") +
    statusRow("Validade", "Acesso durante período Beta", "#d97706") +
    '</div>' +

    '<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:12px;padding:14px;margin-bottom:12px">' +
    '<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:6px">⚠ Versão Beta</div>' +
    '<div style="font-size:12px;color:#92400e;line-height:1.6">' +
    'Esta é uma versão de teste. Exporta backups regularmente para não perder dados. ' +
    'A versão final terá sincronização cloud e suporte completo.' +
    '</div></div>' +

    '<div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #f4f4f5;margin-bottom:12px">' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Código de activação</div>' +
    '<div style="font-size:13px;color:#71717a;margin-bottom:10px;line-height:1.5">Recebeste um código de activação da Introxeer Technology? Insere aqui:</div>' +
    '<div class="field" style="margin-bottom:10px"><input id="activation-code" placeholder="Ex: KTKI-XXXX-XXXX-XXXX" style="text-align:center;font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase"/></div>' +
    '<button onclick="window._activarLicenca()" style="width:100%;padding:13px;background:#5b21b6;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Activar licença</button>' +
    '</div>';

  refreshIcons(wrap);
}

function statusRow(label, value, color) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f4f4f5">' +
    '<span style="font-size:13px;color:#71717a">'+label+'</span>' +
    '<span style="font-size:13px;font-weight:700;color:'+color+'">'+value+'</span>' +
    '</div>';
}

window._activarLicenca = function() {
  var code = document.getElementById("activation-code");
  if (!code||!code.value.trim()) { toast("Insere o código de activação.","error"); return; }
  toast("Código enviado para validação. Aguarda resposta da Introxeer Technology.","info");
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
  var prev = document.getElementById("logo-preview");
  if (!prev) return;
  if (dataUrl) {
    prev.innerHTML = '<div style="display:flex;align-items:center;gap:10px;background:#f4f4f5;border-radius:10px;padding:8px"><img src="' + dataUrl + '" style="width:48px;height:48px;object-fit:contain;border-radius:8px;background:#fff"/><button onclick="window._removeLogo()" style="background:none;border:none;color:#dc2626;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Remover</button></div>';
  } else {
    prev.innerHTML = "";
  }
}

window._removeLogo = async function() {
  var s = (await db.get("settings","store")) || {};
  await db.put("settings", Object.assign({}, s, { logo: null }));
  renderLogoPreview(null);
  toast("Logótipo removido.","success");
};
