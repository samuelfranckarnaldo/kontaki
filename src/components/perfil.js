import { loadDashboard }      from "./dashboard.js";
import { loadConfiguracoes }  from "./configuracoes.js";
import { loadSeguranca }   from "./seguranca.js";
import { loadTurno } from "./turno.js";
import { loadFornecedores } from "./fornecedores.js";
import { db }                    from "../db.js";
import { el, val, refreshIcons } from "../utils.js";
import { toast }                 from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser, logout, changePasswordAuth, createUser } from "../auth.js";

export async function initPerfil() {
  const user = getUser();
  el("perfil-avatar").textContent = user.name.charAt(0).toUpperCase();
  el("perfil-name").textContent   = user.name;
  el("perfil-role").textContent   = user.role === "admin" ? "Administrador" : "Operador de Caixa";

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
  const user  = getUser();
  const items = [
    ...(user.role === "admin" ? [
      { label: "Fecho de Turno", sub: "Fechar turno e gerar .ktk", icon: "clock", color: "#ede9fe", iconColor: "#5b21b6", page: "turno" },
      { label: "Fornecedores",     sub: "Compras e fornecedores",   icon: "truck",         color: "#fef3c7", iconColor: "#d97706", page: "fornecedores"},
      { label: "Configurações",   sub: "Loja, backup e logs",       icon: "settings",      color: "#f4f4f5", iconColor: "#71717a", page: "configuracoes"},
      { label: "Segurança",          sub: "Chave HMAC e auditoria",   icon: "shield",        color: "#fee2e2", iconColor: "#dc2626", page: "seguranca"   },
      { label: "Dashboard",          sub: "Resumo do negócio",        icon: "bar-chart-2",   color: "#dcfce7", iconColor: "#16a34a", page: "dashboard"  },
      { label: "Gestão de Stock",   sub: "Produtos e inventário",   icon: "package",       color: "#ede9fe", iconColor: "#5b21b6", page: "stock"      },
      { label: "Incidentes",        sub: "Divergências de stock",   icon: "alert-triangle", color: "#fef3c7", iconColor: "#d97706", page: "incidentes" },
      { label: "Equipa",            sub: "Funcionários e acessos",  icon: "users",          color: "#dbeafe", iconColor: "#2563eb", page: "equipa"     },
      { label: "Dados da Loja",     sub: "Nome, endereço, contacto",icon: "store",          color: "#dcfce7", iconColor: "#16a34a", page: "loja"       },
    ] : []),
    { label: "Alterar Senha",       sub: "Mudar senha de acesso",   icon: "lock",           color: "#f4f4f5", iconColor: "#71717a", page: "senha"      },
    { label: "Terminar Sessão",     sub: "",                        icon: "log-out",        color: "#fee2e2", iconColor: "#dc2626", page: "logout"     },
  ];

  el("perfil-menu").innerHTML = `
    <div class="perfil-menu-wrap">
      ${items.map(item => `
        <button class="perfil-menu-item" onclick="window._perfilNav('${item.page}')">
          <div class="perfil-menu-item-left">
            <div class="perfil-menu-icon" style="background:${item.color}">
              <i data-lucide="${item.icon}" style="color:${item.iconColor}"></i>
            </div>
            <div>
              <div style="font-size:15px;font-weight:600">${item.label}</div>
              ${item.sub ? `<div style="font-size:12px;color:#71717a;margin-top:2px">${item.sub}</div>` : ""}
            </div>
          </div>
          <span class="perfil-menu-chevron">›</span>
        </button>`).join("")}
    </div>`;

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
  const prodBtn = el("btn-prod-add");
  if (pwBtn)   pwBtn.onclick   = changePassword;
  if (lojaBtn) lojaBtn.onclick = saveStoreSettings;
  if (userBtn) userBtn.onclick = openUserAdd;
  if (prodBtn) prodBtn.onclick = openProductAdd;
}

window._perfilNav = async (page) => {
  if (page === "logout") { logout(); return; }
  showSubpage(page);
  if (page === "stock")      await loadStock();
  if (page === "incidentes") await loadIncidentes();
  if (page === "equipa")     await loadEquipa();
  if (page === "loja")       await loadLoja();
  if (page === "configuracoes") await loadConfiguracoesPage();
  if (page === "seguranca")    await loadSegurancaPage();
  if (page === "turno")        await loadTurnoPage();
  if (page === "fornecedores") await loadFornecedoresPage();
  if (page === "dashboard")  await loadDashboardPage();
};

function showSubpage(name) {
  const subpages = ["stock","incidentes","equipa","loja","senha","dashboard","fornecedores","turno","seguranca","configuracoes"];
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

async function loadStock() {
  var invMode = false;
  var counts  = {};

  async function render() {
    const products = await db.getAll("products");
    const q = ((el("stock-search") && el("stock-search").value) || "").toLowerCase();
    const list = products.filter(function(p) {
      return p.active && p.name.toLowerCase().includes(q);
    });

    var invBtn = el("btn-inv-toggle");
    if (invBtn) {
      invBtn.textContent = invMode ? "Terminar Inventário" : "Modo Inventário";
      invBtn.style.background = invMode ? "#fee2e2" : "#ede9fe";
      invBtn.style.color      = invMode ? "#dc2626" : "#5b21b6";
      invBtn.style.border     = "none";
      invBtn.style.borderRadius = "10px";
      invBtn.style.padding    = "10px 16px";
      invBtn.style.fontWeight = "700";
      invBtn.style.cursor     = "pointer";
      invBtn.style.width      = "100%";
      invBtn.style.marginBottom = "10px";
      invBtn.style.fontFamily = "inherit";
    }

    el("stock-list").innerHTML = list.map(function(p) {
      var stockColor = p.stock <= p.minStock ? "#d97706" : "#16a34a";
      var invField = invMode
        ? '<input type="number" placeholder="Contagem" min="0" value="' + (counts[p.id] !== undefined ? counts[p.id] : "") + '" ' +
          'style="width:80px;padding:6px 8px;border:1.5px solid #ddd6fe;border-radius:8px;text-align:center;font-size:14px;font-weight:700" ' +
          'onchange="window._invCount(' + p.id + ',this.value)"/>'
        : '<button class="btn btn-ghost btn-sm" onclick="window._openAdjust(' + p.id + ')">Ajustar</button>';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #f4f4f5">' +
        '<div>' +
        '<div style="font-size:14px;font-weight:600">' + p.name + '</div>' +
        '<div style="font-size:12px;color:#71717a">' + p.category + ' · ' + p.price.toLocaleString("pt-AO") + ' Kz</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<span style="font-size:15px;font-weight:700;color:' + stockColor + '">' + p.stock + '</span>' +
        invField +
        '</div></div>';
    }).join("");

    if (invMode) {
      var saveBtn = document.getElementById("inv-save-btn");
      if (!saveBtn) {
        saveBtn = document.createElement("button");
        saveBtn.id = "inv-save-btn";
        saveBtn.style.cssText = "width:100%;padding:14px;background:#5b21b6;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:10px";
        saveBtn.textContent = "Gerar incidentes com contagem";
        saveBtn.onclick = window._finalizarInventario;
        el("stock-list").appendChild(saveBtn);
      }
    } else {
      var old = document.getElementById("inv-save-btn");
      if (old) old.remove();
    }

    var search = el("stock-search");
    if (search) search.oninput = render;
    refreshIcons(el("subpage-stock"));
  }

  window._invCount = function(id, val) {
    counts[id] = parseInt(val) || 0;
  };

  window._finalizarInventario = async function() {
    const products = await db.getAll("products");
    var incidentes = 0;
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      if (!p.active) continue;
      if (counts[p.id] === undefined) continue;
      var found    = counts[p.id];
      var expected = p.stock;
      var diff     = found - expected;
      if (diff !== 0) {
        await db.add("incidents", {
          productId:   p.id,
          productName: p.name,
          expected:    expected,
          found:       found,
          diff:        diff,
          sessionId:   getUser().sessionId || null,
          responsibleSessionId: null,
          foundBy:     getUser().id,
          status:      "open",
          note:        "Inventário físico",
          createdAt:   new Date().toISOString(),
        });
        incidentes++;
      }
    }
    toast(incidentes + " incidente(s) gerado(s).", incidentes > 0 ? "error" : "success");
    counts = {};
    invMode = false;
    await render();
  };

  var invBtn = el("btn-inv-toggle");
  if (invBtn) {
    invBtn.onclick = function() {
      invMode = !invMode;
      counts = {};
      render();
    };
  }

  await render();
}

function openProductAdd() {
  const cats = ["Alimentação","Bebidas","Higiene","Limpeza","Outro"];
  openModal("Novo Produto", `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label>Nome *</label><input id="pf-name"/></div>
      <div class="field-row">
        <div class="field"><label>Preço (Kz) *</label><input type="number" id="pf-price"/></div>
        <div class="field"><label>Stock</label><input type="number" id="pf-stock" value="0"/></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Categoria</label>
          <select id="pf-cat">${cats.map(c => `<option>${c}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Unidade</label><input id="pf-unit" value="unid"/></div>
      </div>
      <div class="field"><label>Código de Barras (GTIN)</label><input id="pf-bar"/></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._saveProd(0)">
        <i data-lucide="save"></i> Guardar
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
}

window._saveProd = async (id) => {
  const name  = el("pf-name").value.trim();
  const price = Number(el("pf-price").value);
  if (!name || !price) { toast("Nome e preço são obrigatórios.", "error"); return; }
  const data = {
    name, barcode: el("pf-bar").value, price,
    stock: Number(el("pf-stock").value || 0),
    physicalStock: Number(el("pf-stock").value || 0),
    category: el("pf-cat").value,
    unit: el("pf-unit").value, active: true,
  };
  if (id) { const p = await db.get("products", id); await db.put("products", { ...p, ...data }); }
  else await db.add("products", { ...data, createdAt: new Date().toISOString() });
  toast(id ? "Produto actualizado." : "Produto adicionado.", "success");
  closeModal();
  loadStock();
};

window._openAdjust = async (id) => {
  const p = await db.get("products", id);
  openModal(`Ajustar Stock · ${p.name}`, `
    <div style="background:#f4f4f5;border-radius:10px;padding:14px;margin-bottom:16px;
                display:flex;justify-content:space-between;align-items:center">
      <span style="color:#71717a;font-size:13px">Stock actual</span>
      <span style="font-weight:700;font-size:20px">${p.stock} ${p.unit}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label>Novo Stock</label><input type="number" id="adj-stock" value="${p.stock}" min="0"/></div>
      <div class="field"><label>Razão</label><input id="adj-reason" placeholder="Ex: Rutura, dano..."/></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._applyAdjust(${id})">
        <i data-lucide="check"></i> Aplicar
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._applyAdjust = async (id) => {
  const p  = await db.get("products", id);
  const ns = Number(el("adj-stock").value);
  await db.put("products", { ...p, stock: ns, physicalStock: ns });
  await db.add("adjustments", {
    productId: id, productName: p.name,
    fromStock: p.stock, toStock: ns,
    reason: el("adj-reason").value,
    userId: getUser().id, date: new Date().toISOString(),
  });
  toast("Stock ajustado.", "success");
  closeModal();
  loadStock();
};

async function loadIncidentes() {
  const list = (await db.getAll("incidents")).reverse();
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
                Esperado: <strong>${i.expectedStock}</strong> ·
                Contagem: <strong>${i.countedStock}</strong> ·
                Diferença: <strong style="color:${i.difference < 0 ? "#dc2626" : "#16a34a"}">${i.difference > 0 ? "+" : ""}${i.difference}</strong>
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
  el("ss-name").value  = s.name    || "";
  el("ss-addr").value  = s.address || "";
  el("ss-phone").value = s.phone   || "";
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
