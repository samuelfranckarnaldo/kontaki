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

function _abbrevUnit(unit) {
  if (!unit) return "un";
  const map = {
    "Unidade": "un", "Litro": "L", "Mililitro": "ml", "Quilograma": "kg",
    "Grama": "g", "Caixa": "cx", "Pacote": "pct", "Fardo": "fd",
    "Grade": "gd", "Garrafa": "gf", "Saco": "sc", "Rolo": "rl",
  };
  if (map[unit]) return map[unit];
  return unit.length > 4 ? unit.slice(0, 3) + "." : unit;
}

function categoryColor(cat) {
  return {"Alimentacao":"#f97316","Bebidas":"#3b82f6","Higiene":"#ec4899","Limpeza":"#10b981","Outro":"#6b7280"}[cat] || "#6b7280";
}

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  var diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / 86400000);
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

  const expiring = active.filter(p => p.expiryDate && daysUntil(p.expiryDate) <= 30 && daysUntil(p.expiryDate) >= 0).length;
  const expired   = active.filter(p => p.expiryDate && daysUntil(p.expiryDate) < 0).length;
  const hasExpiryTracking = active.some(p => p.expiryDate);

  s.innerHTML =
    `<div class="hist-hero" style="grid-column:span 3">` +
    `<div class="hist-hero-label">Valor total em stock</div>` +
    `<div class="hist-hero-val${String(fmt(lojaVal+armVal)).length>=16?" hist-hero-val--xs":String(fmt(lojaVal+armVal)).length>=13?" hist-hero-val--sm":""}">${fmt(lojaVal+armVal)}</div>` +
    `<div class="hist-hero-sub" style="margin-top:10px;display:flex;gap:18px">` +
      `<span><strong>${lojaQty.toLocaleString("pt-AO")}</strong> un na loja</span>` +
      `<span><strong>${armQty.toLocaleString("pt-AO")}</strong> un no armazém</span>` +
    `</div>` +
    `</div>` +
    `<div style="grid-column:span 3;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">` +
    _estStatCard({ label:"Produtos", value:total, sub:"activos", color:"var(--primary)", icon:"package", filter:"all", clickable:true }) +
    _estStatCard({ label:"Stock baixo", value:low, sub:"a repor", color:"var(--warning)", icon:"alert-triangle", filter:"low", clickable:low>0, isAlert:true }) +
    _estStatCard({ label:"Esgotados", value:zero, sub:"sem stock", color:"var(--danger)", icon:"x-circle", filter:"zero", clickable:zero>0, isAlert:true }) +
    `</div>` +
    (hasExpiryTracking ?
      `<div style="grid-column:span 3;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">` +
      _estStatCard({ label:"A vencer", value:expiring, sub:"nos próx. 30 dias", color:"var(--warning)", icon:"clock", filter:"expiring", clickable:expiring>0, isAlert:true }) +
      _estStatCard({ label:"Vencidos", value:expired, sub:"fora do prazo", color:"var(--danger)", icon:"calendar-x", filter:"expired", clickable:expired>0, isAlert:true }) +
      `</div>` : "");

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
  else if (filterMode === "expiring") list = list.filter(p => p.expiryDate && daysUntil(p.expiryDate) <= 30 && daysUntil(p.expiryDate) >= 0);
  else if (filterMode === "expired")  list = list.filter(p => p.expiryDate && daysUntil(p.expiryDate) < 0);
  else if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||"").includes(q));

  if (filterMode === "expiring" || filterMode === "expired") {
    list.sort((a,b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate));
  } else {
    list.sort((a,b) => (a.stock||0) - (b.stock||0));
  }

  const FILTER_LABELS = { low:"Stock Baixo", zero:"Esgotados", expiring:"A Vencer", expired:"Vencidos" };
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

    let expiryTag = "";
    let expiryBadgeClass = "";
    if (p.expiryDate) {
      const d = daysUntil(p.expiryDate);
      if (d < 0) { expiryTag = "Vencido"; expiryBadgeClass = "produto-badge-zero"; }
      else if (d <= 30) { expiryTag = "Vence em " + d + "d"; expiryBadgeClass = "produto-badge-low"; }
    }
    const batchMeta = p.batchNumber ? ` · Lote ${p.batchNumber}` : "";

    html +=
      `<div class="produto-item ${qty===0?"produto-item-zero":qty<=min?"produto-item-low":""}">` +
      avatarHTML +
      `<div style="flex:1;min-width:0">` +
      `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">` +
      `<div class="produto-name">${p.name}</div>` +
      (tag ? `<span class="produto-badge ${badgeClass}">${tag}</span>` : "") +
      (expiryTag ? `<span class="produto-badge ${expiryBadgeClass}">${expiryTag}</span>` : "") +
      `</div>` +
      `<div class="produto-meta">${p.barcode?p.barcode+" · ":""}${p.category}${batchMeta}</div>` +
      `<div class="produto-stock-line" style="white-space:normal;overflow:visible;text-overflow:clip">` +
      `<span><span class="produto-stock-label">Loja</span> ${abbrevQty(qty)}</span>` +
      `<span><span class="produto-stock-label">Arm.</span> ${abbrevQty(arm)}</span>` +
      `<span><strong>${abbrevQty(qty+arm)} ${_abbrevUnit(p.unit)}</strong></span>` +
      `</div>` +
      `<div class="produto-price" style="margin-top:4px">${fmt(p.price)}</div>` +
      `</div>` +
      `<div style="display:flex;gap:2px;align-self:flex-start;flex-shrink:0">` +
      `<button class="produto-menu-btn" onclick="window._estViewInfo(${p.id})" title="Ver informação">` +
      `<i data-lucide="info"></i>` +
      `</button>` +
      `<button class="produto-menu-btn" onclick="window._openEstoqueItem(${p.id})" title="Editar produto">` +
      `<i data-lucide="pencil"></i>` +
      `</button>` +
      `</div>` +
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
  const qty = p.stock || 0;
  const min = p.minStock || 5;
  const isLow = qty <= min;

  let btns = `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._estHistory(${p.id})"><i data-lucide="history"></i> Histórico</button>`;
  if (isAdmin) {
    btns =
      `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._estAdjust(${p.id})"><i data-lucide="sliders-horizontal"></i> Ajustar</button>` +
      `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._estTransfer(${p.id})"><i data-lucide="arrow-left-right"></i> Transferir</button>` +
      btns;
  }

  let reporBtn = "";
  if (isAdmin && isLow) {
    reporBtn = `<button class="btn btn-primary btn-sm" style="flex:1" onclick="window._estRepor(${p.id})"><i data-lucide="package-plus"></i> Repor</button>`;
  }

  return `<div style="display:flex;gap:6px;padding:8px 14px 12px 14px;border-top:1px solid var(--border2)">${btns}</div>` +
    (reporBtn ? `<div style="display:flex;gap:6px;padding:0 14px 12px 14px">${reporBtn}</div>` : "");
}

window._estRepor = async (id) => {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const qty = p.stock || 0;
  const min = p.minStock || 5;
  const suggestedQty = Math.max(min - qty, 1);

  const mod = await import("./fornecedores.js");
  mod.openCompraForm({ productId: id, qty: suggestedQty, dest: "shop" });
};

window._estAdjust = (id) => {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const curShop = p.stock || 0;
  const curWh   = p.warehouseStock || 0;

  openModal("Ajustar Stock — " + p.name,
    `<div style="display:flex;flex-direction:column;gap:var(--space-3);margin-bottom:var(--space-4)">
      <div style="display:flex;align-items:center;gap:var(--space-3);background:var(--bg);border-radius:var(--radius);padding:var(--space-3) var(--space-4)">
        <div style="flex:1;text-align:center">
          <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Loja — Atual</div>
          <div style="font-size:22px;font-weight:800;color:var(--text3)">${curShop}</div>
        </div>
        <i data-lucide="arrow-right" style="width:18px;height:18px;color:var(--text4);flex-shrink:0"></i>
        <div style="flex:1">
          <div style="font-size:10px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;text-align:center">Novo</div>
          <input type="number" id="est-adj-shop" value="${curShop}" min="0"
            style="font-size:22px;font-weight:800;text-align:center;padding:10px;color:var(--primary);border-color:var(--primary)"/>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-3);background:var(--bg);border-radius:var(--radius);padding:var(--space-3) var(--space-4)">
        <div style="flex:1;text-align:center">
          <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Armazém — Atual</div>
          <div style="font-size:22px;font-weight:800;color:var(--text3)">${curWh}</div>
        </div>
        <i data-lucide="arrow-right" style="width:18px;height:18px;color:var(--text4);flex-shrink:0"></i>
        <div style="flex:1">
          <div style="font-size:10px;font-weight:700;color:var(--info);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;text-align:center">Novo</div>
          <input type="number" id="est-adj-wh" value="${curWh}" min="0"
            style="font-size:22px;font-weight:800;text-align:center;padding:10px;color:var(--info);border-color:var(--info)"/>
        </div>
      </div>
    </div>
    <div class="field" style="margin-bottom:16px">
      <label style="text-transform:none;font-weight:600;letter-spacing:0;font-size:12px;color:var(--text2)">Razão do ajuste *</label>
      <input id="est-adj-reason" placeholder="Ex: contagem física, quebra..."/>
    </div>
    <div style="margin-top:var(--space-3);display:flex;flex-direction:column;gap:var(--space-1)">
      <button class="btn btn-primary btn-full" onclick="window._estAdjustSave(${id})">
        <i data-lucide="check"></i> Aplicar
      </button>
      <button onclick="window._closeModal()" style="width:100%;padding:10px;background:none;border:none;color:var(--text3);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
        Cancelar
      </button>
    </div>`);
  refreshIcons(document.getElementById("modal-box") || document.body);
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
  const shopStock = p.stock || 0;
  const whStock = p.warehouseStock || 0;

  openModal("Transferir Stock — " + p.name,
    `<div style="margin-bottom:var(--space-4)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-4)">
        <div class="stat-card" style="border-left:3px solid #5b21b6;text-align:center">
          <div style="font-size:var(--text-xs);color:#5b21b6;font-weight:var(--weight-strong)">LOJA</div>
          <div style="font-size:var(--text-lg);font-weight:var(--weight-strong);color:#5b21b6">${shopStock}</div>
          <div style="font-size:var(--text-xs);color:#71717a">${_abbrevUnit(p.unit)}</div>
        </div>
        <div class="stat-card" style="border-left:3px solid #d97706;text-align:center">
          <div style="font-size:var(--text-xs);color:#d97706;font-weight:var(--weight-strong)">ARMAZÉM</div>
          <div style="font-size:var(--text-lg);font-weight:var(--weight-strong);color:#d97706">${whStock}</div>
          <div style="font-size:var(--text-xs);color:#71717a">${_abbrevUnit(p.unit)}</div>
        </div>
      </div>
      <div class="field" style="margin-bottom:var(--space-3)">
        <label style="text-transform:none;font-weight:600;letter-spacing:0;font-size:12px;color:var(--text2)">Direcção da transferência</label>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-outline btn-sm" style="flex:1" id="est-tr-dir-lw" onclick="window._estTrDir('lw')">Loja → Armazém</button>
          <button type="button" class="btn btn-outline btn-sm" style="flex:1" id="est-tr-dir-wl" onclick="window._estTrDir('wl')">Armazém → Loja</button>
        </div>
      </div>
      <div class="field">
        <label style="text-transform:none;font-weight:600;letter-spacing:0;font-size:12px;color:var(--text2)">Quantidade</label>
        <input type="number" id="est-tr-qty" min="1" value="1" style="width:100%;padding:10px;border:1.5px solid #e4e4e7;border-radius:8px;font-family:inherit;font-size:14px;box-sizing:border-box"/>
      </div>
    </div>
    <div style="margin-top:var(--space-3);display:flex;flex-direction:column;gap:var(--space-1)">
      <button class="btn btn-primary btn-full" onclick="window._estTransferSave(${id})">
        <i data-lucide="check"></i> Transferir
      </button>
      <button onclick="window._closeModal()" style="width:100%;padding:10px;background:none;border:none;color:var(--text3);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
        Cancelar
      </button>
    </div>`
  );
  refreshIcons(document.getElementById("modal-box") || document.body);
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

window._estViewInfo = (id) => {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const user = getUser();
  const cColor = categoryColor(p.category);
  const shopS = p.stock || 0;
  const whS   = p.warehouseStock || 0;
  const margin = (user.role === "admin" && p.costPrice) ? Math.round(((p.price-p.costPrice)/p.price)*100) : null;

  openModal("",
    `<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <div style="width:52px;height:52px;border-radius:14px;flex-shrink:0;
        background:linear-gradient(135deg, ${cColor}, ${cColor}cc);
        display:flex;align-items:center;justify-content:center;
        font-size:20px;font-weight:800;color:#fff;box-shadow:0 4px 12px ${cColor}40">
        ${(p.name||"P").charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:17px;font-weight:800;color:var(--text);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${p.category||"Outro"}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:19px;font-weight:800;color:var(--primary)">${fmt(p.price)}</div>
      </div>
    </div>` +

    `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px">
      <div style="background:var(--primary-light);border-radius:10px;padding:12px;text-align:center;min-width:0">
        <div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px">Loja</div>
        <div style="font-size:${String(shopS).length>5?"13px":"18px"};font-weight:800;color:var(--primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${shopS}">${shopS}</div>
        <div style="font-size:10.5px;color:var(--text3)">${_abbrevUnit(p.unit)}</div>
      </div>
      <div style="background:var(--info-light);border-radius:10px;padding:12px;text-align:center;min-width:0">
        <div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px">Armazém</div>
        <div style="font-size:${String(whS).length>5?"13px":"18px"};font-weight:800;color:var(--info);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${whS}">${whS}</div>
        <div style="font-size:10.5px;color:var(--text3)">${_abbrevUnit(p.unit)}</div>
      </div>
      <div style="background:var(--border2);border-radius:10px;padding:12px;text-align:center;min-width:0">
        <div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px">Total</div>
        <div style="font-size:${String(shopS+whS).length>5?"13px":"18px"};font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${shopS+whS}">${shopS+whS}</div>
        <div style="font-size:10.5px;color:var(--text3)">${_abbrevUnit(p.unit)}</div>
      </div>
    </div>` +

    `<div style="background:var(--bg);border-radius:12px;padding:2px 16px">` +
    (user.role==="admin" && p.costPrice ? `<div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border2);font-size:13px"><span style="color:var(--text3)">Preço custo</span><span style="font-weight:700;color:var(--text)">${fmt(p.costPrice)}</span></div>` : "") +
    (margin!==null ? `<div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border2);font-size:13px"><span style="color:var(--text3)">Margem</span><span style="font-weight:700;color:${margin<0?"var(--danger)":"var(--success)"}">${fmt(p.price-p.costPrice)} (${margin}%)</span></div>` : "") +
    `<div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border2);font-size:13px"><span style="color:var(--text3)">Stock mínimo</span><span style="font-weight:700;color:var(--text)">${p.minStock||5} ${p.unit||"un"}</span></div>` +
    (p.barcode ? `<div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border2);font-size:13px"><span style="color:var(--text3)">Código de barras</span><span style="font-family:monospace;font-weight:700;color:var(--text)">${p.barcode}</span></div>` : "") +
    (p.purchaseUnit ? `<div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border2);font-size:13px"><span style="color:var(--text3)">Unidade de compra</span><span style="font-weight:700;color:var(--text)">${p.purchaseUnit}${p.conversionFactor?" ("+p.conversionFactor+"x)":""}</span></div>` : "") +
    (p.expiryDate ? `<div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border2);font-size:13px"><span style="color:var(--text3)">Validade</span><span style="font-weight:700;color:var(--text)">${new Date(p.expiryDate+"T00:00:00").toLocaleDateString("pt-AO",{day:"2-digit",month:"long",year:"numeric"})}</span></div>` : "") +
    (p.batchNumber ? `<div style="display:flex;justify-content:space-between;padding:11px 0;font-size:13px"><span style="color:var(--text3)">Lote</span><span style="font-weight:700;color:var(--text)">${p.batchNumber}</span></div>` : "") +
    `</div>`
  );
  refreshIcons(document.getElementById("modal-box") || document.body);
};

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

let _invDraft = {};

window._estInventario = async () => {
  const active = allProducts.filter(p => p.active);
  const hasDraft = Object.keys(_invDraft).length > 0;

  const rowsHtml = active.map(function(p) {
    const espLoja = p.stock || 0;
    const espArm  = p.warehouseStock || 0;
    const draft = _invDraft[p.id];
    const valLoja = draft && draft.loja != null ? draft.loja : espLoja;
    const valArm  = draft && draft.arm  != null ? draft.arm  : espArm;
    const rowChanged = (valLoja !== espLoja) || (valArm !== espArm);
    return '<div class="est-inv-row" data-product-id="' + p.id + '" data-exp-loja="' + espLoja + '" data-exp-arm="' + espArm + '" ' +
      'style="padding:10px 8px;border-bottom:1px solid var(--border2);border-left:3px solid ' + (rowChanged?"var(--primary)":"transparent") + ';background:' + (rowChanged?"var(--primary-light)":"transparent") + ';transition:background .15s">' +
      '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px">' + p.name + '</div>' +
      '<div style="display:flex;gap:8px">' +
      '<div style="flex:1">' +
      '<div style="font-size:10.5px;color:var(--text3);margin-bottom:3px">Loja (esp. ' + espLoja + ' ' + _abbrevUnit(p.unit) + ')</div>' +
      '<input type="number" class="est-inv-input-loja" min="0" value="' + valLoja + '" data-default="' + espLoja + '" ' +
      'oninput="window._estInvRowChanged(this)" ' +
      'style="width:100%;padding:7px;border:1.5px solid var(--border2);border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit"/>' +
      '</div>' +
      '<div style="flex:1">' +
      '<div style="font-size:10.5px;color:var(--text3);margin-bottom:3px">Armazém (esp. ' + espArm + ' ' + _abbrevUnit(p.unit) + ')</div>' +
      '<input type="number" class="est-inv-input-arm" min="0" value="' + valArm + '" data-default="' + espArm + '" ' +
      'oninput="window._estInvRowChanged(this)" ' +
      'style="width:100%;padding:7px;border:1.5px solid var(--border2);border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit"/>' +
      '</div>' +
      '</div>' +
      '</div>';
  }).join("");

  openModal("Inventário Periódico",
    (hasDraft ?
      '<div style="display:flex;justify-content:space-between;align-items:center;background:var(--primary-light);border-radius:8px;padding:8px 12px;margin-bottom:10px">' +
      '<span style="font-size:11.5px;color:var(--primary);font-weight:600">A continuar contagem anterior</span>' +
      '<button onclick="window._estInvReset()" style="background:none;border:none;color:var(--primary);font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit">Recomeçar</button>' +
      '</div>' : "") +
    '<div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.5">Confirma a contagem física de loja e armazém para cada produto. Divergências criam um incidente para revisão de admin — o stock só muda depois de resolvido. Podes fechar e continuar mais tarde — o progresso fica guardado.</div>' +
    '<div style="max-height:60vh;overflow-y:auto">' + rowsHtml + '</div>' +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal ? window._closeModal() : null">Fechar (guarda progresso)</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._estInvConfirm()"><i data-lucide="check"></i> Confirmar Contagem</button>' +
    '</div>'
  );
  refreshIcons(document.getElementById("modal-box") || document.body);
};

window._estInvRowChanged = function(input) {
  const row = input.closest(".est-inv-row");
  const pid = Number(row.getAttribute("data-product-id"));
  const loja = row.querySelector(".est-inv-input-loja");
  const arm  = row.querySelector(".est-inv-input-arm");
  const changed = loja.value !== loja.getAttribute("data-default") || arm.value !== arm.getAttribute("data-default");
  row.style.background = changed ? "var(--primary-light)" : "transparent";
  row.style.borderLeftColor = changed ? "var(--primary)" : "transparent";

  _invDraft[pid] = { loja: Number(loja.value || 0), arm: Number(arm.value || 0) };
};

window._estInvReset = () => {
  _invDraft = {};
  window._estInventario();
};

window._estInvConfirm = async () => {
  const user = getUser();
  const rows = document.querySelectorAll(".est-inv-row");
  let diffs = [];
  rows.forEach(function(row) {
    const pid = Number(row.getAttribute("data-product-id"));
    const expLoja = Number(row.getAttribute("data-exp-loja"));
    const expArm  = Number(row.getAttribute("data-exp-arm"));
    const foundLoja = Number(row.querySelector(".est-inv-input-loja").value || 0);
    const foundArm  = Number(row.querySelector(".est-inv-input-arm").value || 0);
    if (foundLoja !== expLoja) diffs.push({ pid, location: "shop", locationLabel: "Loja", expected: expLoja, found: foundLoja });
    if (foundArm !== expArm)  diffs.push({ pid, location: "warehouse", locationLabel: "Armazém", expected: expArm, found: foundArm });
  });

  if (!diffs.length) {
    toast("Sem divergências — contagem confere.", "success");
    _invDraft = {};
    closeModal();
    return;
  }

  for (const d of diffs) {
    const p = allProducts.find(x => x.id === d.pid);
    await db.add("incidents", {
      productId: d.pid, productName: p ? p.name : "",
      expected: d.expected, found: d.found, diff: d.found - d.expected,
      location: d.location,
      sessionId: user && user.sessionId || null, responsibleSessionId: null,
      foundBy: user ? user.id : null, responsible: null,
      status: "open", type: "stock",
      note: "Divergência no Inventário Periódico (" + d.locationLabel + ")",
      createdAt: new Date().toISOString(),
    });
  }

  _invDraft = {};
  closeModal();
  toast(diffs.length + " divergência(s) registada(s) como incidente.", "success");
};

window._estGoToIncidents = () => {
  window._closeEstoque();
  window._perfilNav("incidentes").then(() => {
    if (window._setIncFilter) window._setIncFilter("type", "stock");
  });
};

window._estOpenMoreMenu = () => {
  const items = [
    { icon: "package-plus", label: "Comprar", desc: "Registar nova compra e actualizar stock", iconClass: "hist-export-icon--csv", action: "window._estComprar()" },
    { icon: "clipboard-list", label: "Inventário Periódico", desc: "Recontar o catálogo e apanhar divergências", iconClass: "hist-export-icon--edit", action: "window._estInventario()" },
    { icon: "alert-triangle", label: "Incidentes de Stock", desc: "Divergências à espera de revisão de admin", iconClass: "hist-export-icon--pdf", action: "window._estGoToIncidents()" },
    { icon: "bar-chart-3", label: "Relatórios", desc: "Parados, rotatividade e análise ABC", iconClass: "hist-export-icon--cancel", action: "window._estOpenReports()" },
  ];
  openModal("Mais opções",
    '<div class="hist-export-options">' +
    items.map(function(it) {
      return '<button class="hist-export-option" onclick="window._closeModal();' + it.action + '">' +
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
  refreshIcons(document.getElementById("modal-box") || document.body);
};

window._estOpenReports = async () => {
  const [sales, allProds] = await Promise.all([
    db.getAll("sales"),
    Promise.resolve(allProducts.filter(p => p.active)),
  ]);

  openModal("Relatórios de Stock",
    `<div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto">
      <button class="produto-filter-chip produto-filter-chip--active" id="rep-tab-parados" onclick="window._estRepTab('parados')">Parados</button>
      <button class="produto-filter-chip" id="rep-tab-rotatividade" onclick="window._estRepTab('rotatividade')">Rotatividade</button>
      <button class="produto-filter-chip" id="rep-tab-abc" onclick="window._estRepTab('abc')">Análise ABC</button>
    </div>
    <div id="rep-content"></div>`
  );
  refreshIcons(document.getElementById("modal-box") || document.body);

  window._estReportsData = { sales, products: allProds };
  window._estRepTab("parados");
};

window._estRepTab = (tab) => {
  ["parados","rotatividade","abc"].forEach(function(t) {
    const btn = document.getElementById("rep-tab-" + t);
    if (btn) btn.classList.toggle("produto-filter-chip--active", t === tab);
  });
  const content = document.getElementById("rep-content");
  if (!content) return;

  if (tab === "parados") content.innerHTML = _estRenderParados();
  else if (tab === "rotatividade") content.innerHTML = _estRenderRotatividade();
  else if (tab === "abc") content.innerHTML = _estRenderABC();

  refreshIcons(content);
};

function _estRenderParados() {
  const { sales, products } = window._estReportsData;
  const now = new Date();
  const cutoff = 30;

  const lastSaleByProduct = {};
  sales.forEach(function(s) {
    (s.items || []).forEach(function(it) {
      const d = new Date(s.date);
      if (!lastSaleByProduct[it.id] || d > lastSaleByProduct[it.id]) lastSaleByProduct[it.id] = d;
    });
  });

  const parados = products.map(function(p) {
    const last = lastSaleByProduct[p.id] || null;
    const daysSince = last ? Math.floor((now - last) / 86400000) : null;
    return { p, last, daysSince };
  }).filter(function(x) {
    return x.daysSince === null || x.daysSince >= cutoff;
  }).sort(function(a, b) {
    if (a.daysSince === null) return -1;
    if (b.daysSince === null) return 1;
    return b.daysSince - a.daysSince;
  });

  if (!parados.length) {
    return '<div class="empty-state"><div class="empty-state-title">Sem produtos parados</div><div class="empty-state-sub">Todos os produtos tiveram venda nos últimos 30 dias.</div></div>';
  }

  return '<div style="font-size:12px;color:var(--text3);margin-bottom:10px">Produtos sem venda há 30+ dias (ou nunca vendidos):</div>' +
    parados.map(function(x) {
      const label = x.daysSince === null ? "Nunca vendido" : x.daysSince + " dias sem venda";
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border2)">' +
        '<div><div style="font-size:13px;font-weight:600">' + x.p.name + '</div>' +
        '<div style="font-size:11px;color:var(--text3)">' + (x.p.category||"Outro") + '</div></div>' +
        '<div style="font-size:12px;font-weight:700;color:' + (x.daysSince === null ? "var(--danger)" : "var(--warning)") + '">' + label + '</div>' +
        '</div>';
    }).join("");
}

function _estRenderRotatividade() {
  const { sales, products } = window._estReportsData;

  const soldByProduct = {};
  sales.forEach(function(s) {
    (s.items || []).forEach(function(it) {
      soldByProduct[it.id] = (soldByProduct[it.id] || 0) + it.qty;
    });
  });

  const rows = products.map(function(p) {
    const sold = soldByProduct[p.id] || 0;
    const stock = p.stock || 0;
    const ratio = stock > 0 ? sold / stock : (sold > 0 ? Infinity : 0);
    return { p, sold, stock, ratio };
  }).sort(function(a, b) { return b.ratio - a.ratio; });

  return '<div style="font-size:12px;color:var(--text3);margin-bottom:10px">Vendido (total) ÷ Stock actual — maior número, mais rápido gira:</div>' +
    rows.map(function(x) {
      const ratioLabel = x.ratio === Infinity ? "∞" : x.ratio.toFixed(1) + "x";
      const color = x.ratio === 0 ? "var(--text3)" : x.ratio >= 3 ? "var(--success)" : x.ratio >= 1 ? "var(--warning)" : "var(--danger)";
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border2)">' +
        '<div><div style="font-size:13px;font-weight:600">' + x.p.name + '</div>' +
        '<div style="font-size:11px;color:var(--text3)">' + x.sold + ' vendidos · ' + x.stock + ' em stock</div></div>' +
        '<div style="font-size:14px;font-weight:800;color:' + color + '">' + ratioLabel + '</div>' +
        '</div>';
    }).join("");
}

function _estRenderABC() {
  const { sales, products } = window._estReportsData;

  const revenueByProduct = {};
  sales.forEach(function(s) {
    (s.items || []).forEach(function(it) {
      revenueByProduct[it.id] = (revenueByProduct[it.id] || 0) + (it.qty * it.price);
    });
  });

  const rows = products
    .map(function(p) { return { p, revenue: revenueByProduct[p.id] || 0 }; })
    .filter(function(x) { return x.revenue > 0; })
    .sort(function(a, b) { return b.revenue - a.revenue; });

  const total = rows.reduce(function(a, x) { return a + x.revenue; }, 0);
  let cumulative = 0;

  const classified = rows.map(function(x) {
    cumulative += x.revenue;
    const pct = total > 0 ? (cumulative / total) * 100 : 0;
    const klass = pct <= 80 ? "A" : pct <= 95 ? "B" : "C";
    return { ...x, pct, klass };
  });

  const klassColor = { A: "var(--success)", B: "var(--warning)", C: "var(--text3)" };
  const klassBg    = { A: "var(--success-light)", B: "var(--warning-light)", C: "var(--border2)" };

  if (!classified.length) {
    return '<div class="empty-state"><div class="empty-state-title">Sem dados de venda</div><div class="empty-state-sub">Ainda não há vendas suficientes para classificar.</div></div>';
  }

  return '<div style="font-size:12px;color:var(--text3);margin-bottom:10px">Classificação por receita — A: top 80%, B: próximos 15%, C: restantes 5%</div>' +
    classified.map(function(x) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border2)">' +
        '<div style="width:26px;height:26px;border-radius:50%;background:' + klassBg[x.klass] + ';color:' + klassColor[x.klass] + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0">' + x.klass + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + x.p.name + '</div></div>' +
        '<div style="text-align:right;flex-shrink:0"><div style="font-size:13px;font-weight:700">' + fmt(x.revenue) + '</div></div>' +
        '</div>';
    }).join("");
}

window._closeEstoque = () => {
  const sub = el("subpage-stock"); if (sub) sub.style.display = "none";
  const menu = el("perfil-menu"); if (menu) menu.style.display = "block";
  const header = el("perfil-header"); if (header) header.style.display = "flex";
};
