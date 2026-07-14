import { db } from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { productService } from "../services.js";
import { getUser } from "../auth.js";
import { openModal, closeModal } from "../modal.js";
import { toast } from "../toast.js";

var typeLabels = {
  sale:"Venda", purchase:"Compra", transfer_in:"Entrada", transfer_out:"Saída",
  adjustment:"Ajuste", session_open:"Sessão", session_close:"Sessão",
  incident:"Incidente", incident_resolved:"Incidente resolvido", incident_resolution:"Incidente resolvido",
  initial_count:"Inventário inicial"
};
var typeColors = {
  sale:"var(--danger)", purchase:"var(--success)", transfer_in:"var(--info)", transfer_out:"var(--warning)",
  adjustment:"var(--primary-mid)", session_open:"var(--text4)", session_close:"var(--text4)",
  incident:"var(--danger)", incident_resolved:"var(--success)", incident_resolution:"var(--success)",
  initial_count:"var(--info)"
};
var typeIcons = {
  sale:"shopping-cart", purchase:"package-plus", transfer_in:"arrow-down-to-line", transfer_out:"arrow-up-from-line",
  adjustment:"sliders-horizontal", session_open:"log-in", session_close:"log-out",
  incident:"alert-triangle", incident_resolved:"check-circle", incident_resolution:"check-circle",
  initial_count:"clipboard-list"
};
var typeBg = {
  sale:"var(--danger-light)", purchase:"var(--success-light)", transfer_in:"var(--info-light)", transfer_out:"var(--warning-light)",
  adjustment:"var(--primary-light)", session_open:"var(--border2)", session_close:"var(--border2)",
  incident:"var(--danger-light)", incident_resolved:"var(--success-light)", incident_resolution:"var(--success-light)",
  initial_count:"var(--info-light)"
};

function abbrevQty(n) {
  function fmtAbbrev(v) {
    var s = v.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  }
  var abs = Math.abs(n);
  var sign = n < 0 ? "-" : "";
  if (abs < 1000) return sign + abs;
  if (abs < 1e6)  return sign + fmtAbbrev(abs/1e3) + "K";
  if (abs < 1e9)  return sign + fmtAbbrev(abs/1e6) + "M";
  return sign + fmtAbbrev(abs/1e9) + "B";
}

let allProducts = [];
let filterMode = "all";

function categoryColor(cat) {
  return {"Alimentacao":"#f97316","Bebidas":"#3b82f6","Higiene":"#ec4899","Limpeza":"#10b981","Outro":"#6b7280"}[cat] || "#6b7280";
}

export async function loadEstoquePage() {
  allProducts = await db.getAll("products");
  filterMode = "all";
  const search = el("estoque-search");
  if (search) {
    search.value = "";
    search.oninput = () => renderEstoqueList();
  }
  renderEstoqueStats();
  renderEstoqueList();
}

function _estStatCard({label, value, sub, color, icon, filter, clickable, isAlert}) {
  const active = isAlert && value > 0;
  const style = active ? `border-color:${color};background:${color}0d` : "";
  return `<div class="prod-stat-card${clickable?" prod-stat-clickable":""}" style="${style}" ${clickable?`onclick="window._filterEstoque('${filter}')"`:""}>`+
    `<div class="prod-stat-icon" style="background:${color}20;color:${color}"><i data-lucide="${icon}"></i></div>`+
    `<div class="prod-stat-val2${String(value).length>=13?" prod-stat-val2--xs":String(value).length>9?" prod-stat-val2--sm":""}" style="color:${color}">${value}</div>`+
    `<div class="prod-stat-label2">${label}</div>`+
    `<div class="prod-stat-sub">${sub}</div>`+
    `</div>`;
}

function renderEstoqueStats() {
  const active  = allProducts.filter(p => p.active);
  const total   = active.length;
  const low     = active.filter(p => (p.stock||0)>0 && (p.stock||0)<=(p.minStock||5)).length;
  const zero    = active.filter(p => (p.stock||0)===0).length;
  const lojaQty = active.reduce((a,p)=>a+(p.stock||0),0);
  const armQty  = active.reduce((a,p)=>a+(p.warehouseStock||0),0);
  const lojaVal = active.reduce((a,p)=>a+(p.stock||0)*p.price,0);
  const armVal  = active.reduce((a,p)=>a+(p.warehouseStock||0)*p.price,0);

  const s = el("estoque-stats");
  if (!s) return;
  s.style.gridTemplateColumns = "1fr 1fr 1fr";
  s.style.gap = "8px";

  s.innerHTML =
    `<div class="hist-hero" style="grid-column:span 3">` +
    `<div class="hist-hero-label">Valor total em stock</div>` +
    `<div class="hist-hero-val">${fmt(lojaVal+armVal)}</div>` +
    `<div class="hist-hero-sub" style="margin-top:10px;display:flex;gap:18px">` +
      `<span><strong>${lojaQty.toLocaleString("pt-AO")}</strong> un na loja</span>` +
      `<span><strong>${armQty.toLocaleString("pt-AO")}</strong> un no armazém</span>` +
    `</div>` +
    `</div>` +
    `<div style="grid-column:span 3;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">` +
    _estStatCard({ label:"Produtos", value:total, sub:"activos", color:"var(--primary)", icon:"package", filter:"all", clickable:true }) +
    _estStatCard({ label:"Stock baixo", value:low, sub:"a repor", color:"var(--warning)", icon:"alert-triangle", filter:"low", clickable:low>0, isAlert:true }) +
    _estStatCard({ label:"Esgotados", value:zero, sub:"sem stock", color:"var(--danger)", icon:"x-circle", filter:"zero", clickable:zero>0, isAlert:true }) +
    `</div>`;

  refreshIcons(s);
}

window._filterEstoque = (mode) => {
  filterMode = mode;
  const search = el("estoque-search");
  if (search) search.value = "";
  renderEstoqueList();
  const listEl = el("estoque-list");
  if (listEl) setTimeout(function(){ listEl.scrollIntoView({behavior:"smooth",block:"start"}); }, 100);
};

function renderEstoqueList() {
  const searchEl = el("estoque-search");
  const q = ((searchEl ? searchEl.value : "") || "").toLowerCase();
  let list = allProducts.filter(p => p.active);

  if (filterMode === "low")  list = list.filter(p => (p.stock||0)>0 && (p.stock||0)<=(p.minStock||5));
  else if (filterMode === "zero") list = list.filter(p => (p.stock||0)===0);
  else if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||"").includes(q));

  list.sort((a,b) => (a.stock||0) - (b.stock||0));

  const FILTER_LABELS = { low:"Stock Baixo", zero:"Esgotados" };
  const filterLabel = FILTER_LABELS[filterMode] || "";

  const listContainer = el("estoque-list");
  if (!listContainer) return;
  listContainer.innerHTML = "";

  if (filterLabel) {
    const banner = document.createElement("div");
    banner.style.cssText = "padding:10px 14px;background:#fef3c7;font-size:12px;font-weight:700;color:#d97706;display:flex;justify-content:space-between;align-items:center";
    banner.innerHTML = `<span>Filtro: ${filterLabel} (${list.length})</span><button onclick="window._filterEstoque('all')" style="background:none;border:none;color:#d97706;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700">✕ Limpar</button>`;
    listContainer.appendChild(banner);
  }

  if (!list.length) {
    listContainer.innerHTML += `<div class="empty-state"><i data-lucide="package" style="width:36px;height:36px;color:#a1a1aa;margin-bottom:10px"></i><div class="empty-state-title">Nenhum produto</div><div class="empty-state-sub">Sem produtos para mostrar.</div></div>`;
    refreshIcons(listContainer);
    return;
  }

  let html = "";
  for (const p of list) {
    const qty = p.stock || 0;
    const arm = p.warehouseStock || 0;
    const min = p.minStock || 5;
    const badgeClass = qty===0 ? "produto-badge-zero" : qty<=min ? "produto-badge-low" : "";
    const tag = qty===0 ? "Esgotado" : qty<=min ? "Stock baixo" : "";
    const cColor = categoryColor(p.category);
    const initial = (p.name||"P").charAt(0).toUpperCase();
    const avatarHTML = p.imageData
      ? `<div class="produto-avatar" style="background-image:url(${p.imageData});background-size:cover;background-position:center"></div>`
      : `<div class="produto-avatar" style="background:${cColor}20;color:${cColor}">${initial}</div>`;
    html +=
      `<div class="produto-item ${qty===0?"produto-item-zero":qty<=min?"produto-item-low":""}">` +
      avatarHTML +
      `<div style="flex:1;min-width:0">` +
      `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">` +
      `<div class="produto-name">${p.name}</div>` +
      (tag ? `<span class="produto-badge ${badgeClass}">${tag}</span>` : "") +
      `</div>` +
      `<div class="produto-meta">${p.barcode?p.barcode+" · ":""}${p.category}</div>` +
      `<div class="produto-stock-line">` +
      `<span><span class="produto-stock-label">Loja</span> ${qty}</span>` +
      `<span><span class="produto-stock-label">Arm.</span> ${arm}</span>` +
      `<span><strong>${qty+arm} ${p.unit}</strong></span>` +
      `</div>` +
      `<div class="produto-price" style="margin-top:4px">${fmt(p.price)}</div>` +
      `</div>` +
      `<button class="produto-menu-btn" onclick="window._openEstoqueItem(${p.id})" title="Editar produto">` +
      `<i data-lucide="pencil"></i>` +
      `</button>` +
      `</div>` +
      _estActionsBar(p) +
      `</div>`;
  }
  listContainer.innerHTML += html;
  refreshIcons(listContainer);
}

function _estActionsBar(p) {
  const user = getUser();
  const isAdmin = user && user.role === "admin";
  let btns = `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._estHistory(${p.id})"><i data-lucide="history"></i> Histórico</button>`;
  if (isAdmin) {
    btns =
      `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._estAdjust(${p.id})"><i data-lucide="sliders-horizontal"></i> Ajustar</button>` +
      `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._estTransfer(${p.id})"><i data-lucide="arrow-left-right"></i> Transferir</button>` +
      btns;
  }
  return `<div style="display:flex;gap:6px;padding:8px 14px 12px 14px;border-top:1px solid var(--border2)">${btns}</div>`;
}

window._estAdjust = (id) => {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  openModal("Ajustar Stock — " + p.name,
    `<div style="display:flex;gap:10px;margin-bottom:14px">
      <div style="flex:1">
        <label style="font-size:12px;color:var(--text3);font-weight:700">Loja</label>
        <input type="number" id="est-adj-shop" value="${p.stock||0}" min="0" class="input"/>
      </div>
      <div style="flex:1">
        <label style="font-size:12px;color:var(--text3);font-weight:700">Armazém</label>
        <input type="number" id="est-adj-wh" value="${p.warehouseStock||0}" min="0" class="input"/>
      </div>
    </div>
    <label style="font-size:12px;color:var(--text3);font-weight:700">Motivo</label>
    <input type="text" id="est-adj-reason" placeholder="Ex: contagem física, quebra..." class="input" style="margin-bottom:14px"/>
    <button class="btn btn-primary btn-full" onclick="window._estAdjustSave(${id})">Guardar Ajuste</button>`
  );
}

window._estAdjustSave = async (id) => {
  const newShop = parseInt(el("est-adj-shop").value, 10);
  const newWh   = parseInt(el("est-adj-wh").value, 10);
  const reason  = el("est-adj-reason").value.trim();
  if (isNaN(newShop) || isNaN(newWh) || newShop < 0 || newWh < 0) {
    toast("Valores inválidos.", "error"); return;
  }
  try {
    await productService.adjustStock(id, newShop, newWh, reason);
    closeModal();
    toast("Stock ajustado.", "success");
    await loadEstoquePage();
  } catch (e) {
    toast(e.message || "Erro ao ajustar stock.", "error");
  }
}

window._estTransfer = (id) => {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  openModal("Transferir Stock — " + p.name,
    `<div style="display:flex;gap:10px;margin-bottom:14px">
      <button class="btn btn-outline btn-sm" style="flex:1" id="est-tr-dir-lw" onclick="window._estTrDir('lw')">Loja → Armazém</button>
      <button class="btn btn-outline btn-sm" style="flex:1" id="est-tr-dir-wl" onclick="window._estTrDir('wl')">Armazém → Loja</button>
    </div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px">Loja: ${p.stock||0} · Armazém: ${p.warehouseStock||0}</div>
    <label style="font-size:12px;color:var(--text3);font-weight:700">Quantidade a transferir</label>
    <input type="number" id="est-tr-qty" value="0" min="0" class="input" style="margin-bottom:14px"/>
    <button class="btn btn-primary btn-full" onclick="window._estTransferSave(${id})">Confirmar Transferência</button>`
  );
  window._estTrDirection = "lw";
}

window._estTrDir = (dir) => {
  window._estTrDirection = dir;
  const lw = el("est-tr-dir-lw"), wl = el("est-tr-dir-wl");
  if (lw) lw.classList.toggle("btn-primary", dir === "lw");
  if (wl) wl.classList.toggle("btn-primary", dir === "wl");
}

window._estTransferSave = async (id) => {
  const qty = parseInt(el("est-tr-qty").value, 10);
  if (isNaN(qty) || qty <= 0) { toast("Quantidade inválida.", "error"); return; }
  const from = window._estTrDirection === "wl" ? "warehouse" : "shop";
  const to   = window._estTrDirection === "wl" ? "shop" : "warehouse";
  try {
    await productService.transfer(id, qty, from, to);
    closeModal();
    toast("Transferência concluída.", "success");
    await loadEstoquePage();
  } catch (e) {
    toast(e.message || "Erro na transferência.", "error");
  }
}

window._estHistory = async (id) => {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const users = await db.getAll("users");
  const usersById = {};
  users.forEach(u => { usersById[u.id] = u; });

  const moves = await db.getByIndex("stockMovements", "productId", id);
  moves.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  function renderMovItem(m) {
    const color = typeColors[m.type] || "#9ca3af";
    const bg    = typeBg[m.type]    || "#f3f4f6";
    const label = typeLabels[m.type] || m.type;
    const sign  = m.qty > 0 ? "+" : "";
    const autor = (m.userId != null && usersById[m.userId]) ? usersById[m.userId].name : "Desconhecido";
    return '<div class="hist-mov-item" style="border-left:3px solid ' + color + '">' +
      '<div class="hist-mov-icon" style="background:' + bg + ';color:' + color + '"><i data-lucide="' + (typeIcons[m.type]||"circle") + '" style="width:18px;height:18px"></i></div>' +
      '<div style="flex:1;min-width:0">' +
      '<span class="hist-mov-tag" style="background:' + bg + ';color:' + color + '">' + label + '</span>' +
      '<div class="hist-mov-meta">' + fmtDate(m.createdAt) + '</div>' +
      '<div class="hist-mov-meta hist-mov-meta--autor"><strong>' + autor + '</strong></div>' +
      (m.note ? '<div class="hist-mov-meta">' + m.note + '</div>' : '') +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div class="hist-mov-qty" style="color:' + color + '" title="' + sign + m.qty + '">' + sign + abbrevQty(m.qty) + '</div>' +
      '<div class="hist-mov-range"><span class="hist-mov-range-label">Stock</span> ' + (m.qtyBefore||0) + ' <i data-lucide="arrow-right" style="width:9px;height:9px;vertical-align:middle"></i> <strong>' + (m.qtyAfter||0) + '</strong></div>' +
      '</div></div>';
  }

  const html = moves.length
    ? moves.map(renderMovItem).join("")
    : '<div class="empty-state"><i data-lucide="history" style="width:36px;height:36px;color:#a1a1aa;margin-bottom:10px"></i><div class="empty-state-title">Sem movimentos</div><div class="empty-state-sub">Ainda não há histórico para este produto.</div></div>';

  openModal("Histórico — " + p.name, html);
  refreshIcons(document.querySelector(".modal-body") || document.body);
}

window._openEstoqueItem = async (id) => {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const mod = await import("./produtos.js");
  mod.openProductForm(p);
};

window._estoqueAddProduct = async () => {
  const mod = await import("./produtos.js");
  mod.openProductForm({});
};

window._estComprar = async () => {
  const mod = await import("./fornecedores.js");
  mod.openCompraForm();
};

window._estInventario = async () => {
  const active = allProducts.filter(p => p.active);
  const rowsHtml = active.map(function(p) {
    const esperado = p.stock || 0;
    return '<div class="est-inv-row" data-product-id="' + p.id + '" data-expected="' + esperado + '" ' +
      'style="display:flex;align-items:center;gap:8px;padding:10px 8px;border-bottom:1px solid var(--border2);border-left:3px solid transparent;transition:background .15s">' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + p.name + '</div>' +
      '<div style="font-size:11px;color:var(--text3)">Esperado: <strong>' + esperado + '</strong> ' + (p.unit||"un") + '</div>' +
      '</div>' +
      '<input type="number" class="est-inv-input" min="0" value="' + esperado + '" data-default="' + esperado + '" ' +
      'oninput="window._estInvRowChanged(this)" ' +
      'style="width:70px;padding:7px;border:1.5px solid var(--border2);border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit"/>' +
      '</div>';
  }).join("");

  openModal("Inventário Periódico",
    '<div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.5">Confirma a contagem física de cada produto. Divergências criam um incidente para revisão de admin — o stock só muda depois de resolvido.</div>' +
    '<div style="max-height:60vh;overflow-y:auto">' + rowsHtml + '</div>' +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal ? window._closeModal() : null">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._estInvConfirm()"><i data-lucide="check"></i> Confirmar Contagem</button>' +
    '</div>'
  );
  refreshIcons(document.getElementById("modal-box") || document.body);
};

window._estInvRowChanged = function(input) {
  const row = input.closest(".est-inv-row");
  const changed = input.value !== input.getAttribute("data-default");
  row.style.background = changed ? "var(--primary-light)" : "transparent";
  row.style.borderLeftColor = changed ? "var(--primary)" : "transparent";
};

window._estInvConfirm = async () => {
  const user = getUser();
  const rows = document.querySelectorAll(".est-inv-row");
  let diffs = [];
  rows.forEach(function(row) {
    const pid = Number(row.getAttribute("data-product-id"));
    const expected = Number(row.getAttribute("data-expected"));
    const input = row.querySelector(".est-inv-input");
    const found = Number(input.value || 0);
    if (found !== expected) diffs.push({ pid, expected, found });
  });

  if (!diffs.length) {
    toast("Sem divergências — contagem confere.", "success");
    closeModal();
    return;
  }

  for (const d of diffs) {
    const p = allProducts.find(x => x.id === d.pid);
    await db.add("incidents", {
      productId: d.pid, productName: p ? p.name : "",
      expected: d.expected, found: d.found, diff: d.found - d.expected,
      sessionId: user && user.sessionId || null, responsibleSessionId: null,
      foundBy: user ? user.id : null, responsible: null,
      status: "open", type: "stock",
      note: "Divergência no Inventário Periódico",
      createdAt: new Date().toISOString(),
    });
  }

  closeModal();
  toast(diffs.length + " divergência(s) registada(s) como incidente.", "success");
};

window._estGoToIncidents = () => {
  window._closeEstoque();
  window._perfilNav("incidentes").then(() => {
    if (window._setIncFilter) window._setIncFilter("type", "stock");
  });
};

window._closeEstoque = () => {
  const sub = el("subpage-stock"); if (sub) sub.style.display = "none";
  const menu = el("perfil-menu"); if (menu) menu.style.display = "block";
  const header = el("perfil-header"); if (header) header.style.display = "flex";
};
