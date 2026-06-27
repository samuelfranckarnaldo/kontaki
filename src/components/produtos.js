import { db } from "../db.js";
import { addStockMovement, getStock } from "../services.js";
import { fmt, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser } from "../auth.js";

let products = [];
let viewMode = "loja";
let filterMode = "all";

export async function initProdutos() {
  products = await db.getAll("products");
  el("produtos-search").oninput = () => { filterMode="all"; renderList(); };
  renderStats();
  renderList();
}

export function openProductForm(p = {}) {
  const cats = ["Alimentacao","Bebidas","Higiene","Limpeza","Outro"];
  openModal(p.id ? "Editar Produto" : "Novo Produto",
    `<div style="display:flex;flex-direction:column;gap:14px">` +
    `<div class="field"><label>Nome *</label><input id="pf-name" value="${p.name||""}" placeholder="Ex: Arroz 1kg"/></div>` +
    `<div class="field-row">` +
    `<div class="field"><label>Preco Venda (Kz) *</label><input type="number" id="pf-price" value="${p.price||""}" placeholder="0"/></div>` +
    `<div class="field"><label>Preco Custo (Kz)</label><input type="number" id="pf-cost" value="${p.costPrice||""}" placeholder="Opcional"/></div>` +
    `</div>` +
    `<div class="field"><label>Unidade</label><input id="pf-unit" value="${p.unit||"unid"}" placeholder="unid"/></div>` +
    `<div style="background:#ede9fe;border-radius:12px;padding:14px">` +
    `<div style="font-size:12px;font-weight:700;color:#5b21b6;margin-bottom:10px">STOCK</div>` +
    `<div class="field-row">` +
    `<div class="field"><label>Stock Loja</label><input type="number" id="pf-stock" value="${p.stock||0}"/></div>` +
    `<div class="field"><label>Stock Armazem</label><input type="number" id="pf-warehouse" value="${p.warehouseStock||0}"/></div>` +
    `</div>` +
    `<div class="field" style="margin-top:10px"><label>Stock Minimo (alerta)</label><input type="number" id="pf-minstock" value="${p.minStock||5}"/></div>` +
    `</div>` +
    `<div class="field-row">` +
    `<div class="field"><label>Categoria</label><select id="pf-cat">${cats.map(c=>`<option ${p.category===c?"selected":""}>${c}</option>`).join("")}</select></div>` +
    `<div class="field"><label>Codigo Barras (unidade)</label><input id="pf-bar" value="${p.barcode||""}" placeholder="GTIN da unidade"/></div>` +
    `<div class="field"><label>Codigo Embalagem Mae (opcional)</label><input id="pf-bar-mae" value="${p.masterBarcode||""}" placeholder="GTIN da caixa/fardo"/></div>` +
    `</div></div>` +
    `<div class="form-actions">` +
    `<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>` +
    `<button class="btn btn-primary btn-full" onclick="window._saveProduto(${p.id||0})"><i data-lucide="save"></i> ${p.id?"Actualizar":"Adicionar"}</button>` +
    `</div>`);
  refreshIcons(el("modal-box"));
}

function renderStats() {
  const active  = products.filter(p => p.active);
  const total   = active.length;
  const low     = active.filter(p => (p.stock||0)>0 && (p.stock||0)<=(p.minStock||5)).length;
  const zero    = active.filter(p => (p.stock||0)===0).length;
  const lojaQty = active.reduce((a,p)=>a+(p.stock||0),0);
  const armQty  = active.reduce((a,p)=>a+(p.warehouseStock||0),0);
  const lojaVal = active.reduce((a,p)=>a+(p.stock||0)*p.price,0);
  const armVal  = active.reduce((a,p)=>a+(p.warehouseStock||0)*p.price,0);

  const s = el("produtos-stats");
  s.style.gridTemplateColumns = "1fr 1fr 1fr";
  s.style.gap = "8px";

  s.innerHTML =
    // Linha 1 — 3 cards de alerta
    _statCard({ label:"Produtos", value:total, sub:"activos", color:"var(--primary)", icon:"package", filter:"all", clickable:true }) +
    _statCard({ label:"Stock baixo", value:low, sub:"a repor", color:"var(--warning)", icon:"alert-triangle", filter:"low", clickable:low>0 }) +
    _statCard({ label:"Esgotados", value:zero, sub:"sem stock", color:"var(--danger)", icon:"x-circle", filter:"zero", clickable:zero>0 }) +
    // Linha 2 — 2 cards de stock
    `<div class="prod-stat-wide">` +
    `<div class="prod-stat-wide-row">` +
    `<div><div class="prod-stat-wide-label">Loja</div><div class="prod-stat-wide-val">${lojaQty.toLocaleString("pt-AO")} <span>un</span></div><div class="prod-stat-wide-sub">${fmt(lojaVal)}</div></div>` +
    `<div style="text-align:right"><div class="prod-stat-wide-label">Armazém</div><div class="prod-stat-wide-val" style="color:var(--info)">${armQty.toLocaleString("pt-AO")} <span>un</span></div><div class="prod-stat-wide-sub">${fmt(armVal)}</div></div>` +
    `</div>` +
    `<div class="prod-stat-total-row">` +
    `<span class="prod-stat-total-label">Total combinado</span>` +
    `<span class="prod-stat-total-val">${(lojaQty+armQty).toLocaleString("pt-AO")} un · ${fmt(lojaVal+armVal)}</span>` +
    `</div></div>`;

  refreshIcons(s);
}

function _statCard({label, value, sub, color, icon, filter, clickable}) {
  return `<div class="prod-stat-card${clickable?" prod-stat-clickable":""}" ${clickable?`onclick="window._filterProd('${filter}')"`:""}>`+
    `<div class="prod-stat-icon" style="background:${color}20;color:${color}"><i data-lucide="${icon}"></i></div>`+
    `<div class="prod-stat-val2" style="color:${color}">${value}</div>`+
    `<div class="prod-stat-label2">${label}</div>`+
    `<div class="prod-stat-sub">${sub}</div>`+
    `</div>`;
}

window._filterProd = (mode) => {
  filterMode = mode;
  el("produtos-search").value = "";
  renderList();
};

function renderList() {
  const q    = ((el("produtos-search") ? el("produtos-search").value : "") || "").toLowerCase();
  let list   = products.filter(p => p.active);

  if (filterMode === "low")  list = list.filter(p => (p.stock||0)>0 && (p.stock||0)<=(p.minStock||5));
  else if (filterMode === "zero") list = list.filter(p => (p.stock||0)===0);
  else if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||"").includes(q));

  list.sort((a,b) => (a.stock||0) - (b.stock||0));

  const filterLabel = filterMode==="low" ? "Stock Baixo" : filterMode==="zero" ? "Esgotados" : "";

  el("produtos-list").innerHTML = "";

  if (filterLabel) {
    const banner = document.createElement("div");
    banner.style.cssText = "padding:10px 14px;background:#fef3c7;font-size:12px;font-weight:700;color:#d97706;display:flex;justify-content:space-between;align-items:center";
    banner.innerHTML = `<span>Filtro: ${filterLabel} (${list.length})</span><button onclick="window._filterProd('all')" style="background:none;border:none;color:#d97706;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700">✕ Limpar</button>`;
    el("produtos-list").appendChild(banner);
  }

  if (!list.length) {
    el("produtos-list").innerHTML += `<div class="empty-state"><i data-lucide="package" style="width:36px;height:36px;color:#a1a1aa;margin-bottom:10px"></i><div class="empty-state-title">Nenhum produto</div><div class="empty-state-sub">Clica no + para adicionar o primeiro produto.</div></div>`;
    refreshIcons(el("produtos-list")); return;
  }

  let html = "";
  for (const p of list) {
    const qty = p.stock || 0;
    const arm = p.warehouseStock || 0;
    const min = p.minStock || 5;
    const sc  = qty===0 ? "#dc2626" : qty<=min ? "#d97706" : "#16a34a";
    const bg  = qty===0 ? "#fff5f5" : qty<=min ? "#fffbeb" : "#fff";
    const tag = qty===0 ? "Esgotado" : qty<=min ? "Stock baixo" : "";
    html +=
      `<div class="produto-item ${qty===0?"produto-item-zero":qty<=min?"produto-item-low":"produto-item-ok"}">` +
      `<div style="flex:1;min-width:0">` +
      `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">` +
      `<div class="produto-name">${p.name}</div>` +
      (tag ? `<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${qty===0?"#fee2e2":"#fef3c7"};color:${sc}">${tag}</span>` : "") +
      `</div>` +
      `<div class="produto-meta">${p.barcode?p.barcode+" · ":""}${p.category}</div>` +
      `<div style="display:flex;gap:10px;margin-top:3px;font-size:11px">` +
      `<span class="produto-stock-ok">Loja: ${qty} ${p.unit}</span>` +
      `<span class="produto-stock-arm">Arm: ${arm} ${p.unit}</span>` +
      `<span class="produto-stock-total">Total: ${qty+arm} ${p.unit}</span>` +
      `</div></div>` +
      `<div class="produto-right">` +
      `<div class="produto-label">Preco venda</div>` +
      `<div style="font-size:14px;font-weight:700;color:#18181b">${fmt(p.price)}</div>` +
      `</div>` +
      `<button class="produto-menu-btn" onclick="window._openProdMenu(${p.id})">` +
      `<i data-lucide="more-vertical"></i>` +
      `</button></div>`;
  }
  el("produtos-list").innerHTML += html;
  refreshIcons(el("produtos-list"));
}

window._openProdMenu = (id) => {
  const p = products.find(x => x.id === id);
  const user = getUser();
  if (!p) return;
  const shopS = p.stock || 0;
  const whS   = p.warehouseStock || 0;
  const margin= p.costPrice ? Math.round(((p.price-p.costPrice)/p.price)*100) : null;
  const cColor= {"Alimentacao":"#f97316","Bebidas":"#3b82f6","Higiene":"#ec4899","Limpeza":"#10b981","Outro":"#6b7280"}[p.category]||"#6b7280";

  openModal(p.name,
    // Header do produto
    `<div class="prod-modal-header">
      <div class="prod-modal-avatar" style="background:${cColor}20;color:${cColor}">${(p.name||"P").charAt(0).toUpperCase()}</div>
      <div>
        <div class="prod-modal-name">${p.name}</div>
        <div class="prod-modal-cat" style="background:${cColor}15;color:${cColor}">${p.category||"Outro"}</div>
      </div>
      <div class="prod-modal-price">${fmt(p.price)}</div>
    </div>` +

    // Stock cards
    `<div class="prod-modal-stock">
      <div class="prod-modal-stock-card" style="background:var(--primary-light)">
        <div class="prod-modal-stock-label">Loja</div>
        <div class="prod-modal-stock-val" style="color:var(--primary)">${shopS}</div>
        <div class="prod-modal-stock-unit">${p.unit||"un"}</div>
      </div>
      <div class="prod-modal-stock-card" style="background:var(--info-light)">
        <div class="prod-modal-stock-label">Armazém</div>
        <div class="prod-modal-stock-val" style="color:var(--info)">${whS}</div>
        <div class="prod-modal-stock-unit">${p.unit||"un"}</div>
      </div>
      <div class="prod-modal-stock-card" style="background:var(--border2)">
        <div class="prod-modal-stock-label">Total</div>
        <div class="prod-modal-stock-val" style="color:var(--text)">${shopS+whS}</div>
        <div class="prod-modal-stock-unit">${p.unit||"un"}</div>
      </div>
    </div>` +

    // Info detalhes
    `<div class="prod-modal-info">` +
    (p.costPrice ? `<div class="prod-modal-info-row"><span>Preço custo</span><span>${fmt(p.costPrice)}</span></div>` : "") +
    (margin!==null ? `<div class="prod-modal-info-row"><span>Margem</span><span style="color:var(--success);font-weight:700">${fmt(p.price-p.costPrice)} (${margin}%)</span></div>` : "") +
    `<div class="prod-modal-info-row"><span>Stock mínimo</span><span>${p.minStock||5} ${p.unit||"un"}</span></div>` +
    (p.barcode ? `<div class="prod-modal-info-row"><span>Código de barras</span><span style="font-family:monospace">${p.barcode}</span></div>` : "") +
    `</div>` +

    // Acções
    (user.role==="admin" ?
      `<div class="prod-modal-actions">
        <button class="btn btn-primary btn-full" onclick="window._editProd(${p.id})">
          <i data-lucide="edit-3"></i> Editar produto
        </button>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-ghost btn-full" onclick="window._openTransfer(${p.id})">
            <i data-lucide="arrow-right-left"></i> Transferir
          </button>
          <button class="btn btn-ghost btn-full" onclick="window._openAdjustProd(${p.id})">
            <i data-lucide="refresh-cw"></i> Ajustar
          </button>
        </div>
        <button class="btn btn-ghost btn-full" onclick="window._closeModal()" style="color:var(--text3)">
          Fechar
        </button>
        <button onclick="window._deactivateProd(${p.id})"
          style="background:none;border:none;color:var(--danger);font-size:12px;
                 cursor:pointer;font-family:inherit;padding:4px;text-align:center;width:100%">
          Desativar produto
        </button>
      </div>` :
      `<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>`
    ));
  refreshIcons(el("modal-box"));
};

window._editProd = async (id) => { closeModal(); const p = await db.get("products",id); openProductForm(p); };

window._deactivateProd = async (id) => {
  if (!confirm("Desativar este produto?")) return;
  const p = await db.get("products",id);
  await db.put("products",{...p,active:false});
  toast("Produto desativado.","success");
  closeModal();
  products = await db.getAll("products");
  renderStats(); renderList();
};

window._openTransfer = async (id) => {
  const p = await db.get("products", id);
  if (!p) return;
  const shopStock = p.stock || 0;
  const whStock   = p.warehouseStock || 0;
  openModal("Transferir Stock — " + p.name,
    "<div style='margin-bottom:14px'>" +
    "<div style='display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px'>" +
    "<div class='stat-card' style='border-left:3px solid #5b21b6;text-align:center'>" +
    "<div style='font-size:11px;color:#5b21b6;font-weight:700'>LOJA</div>" +
    "<div style='font-size:20px;font-weight:700;color:#5b21b6'>" + shopStock + "</div>" +
    "<div style='font-size:11px;color:#71717a'>" + p.unit + "</div></div>" +
    "<div class='stat-card' style='border-left:3px solid #d97706;text-align:center'>" +
    "<div style='font-size:11px;color:#d97706;font-weight:700'>ARMAZÉM</div>" +
    "<div style='font-size:20px;font-weight:700;color:#d97706'>" + whStock + "</div>" +
    "<div style='font-size:11px;color:#71717a'>" + p.unit + "</div></div>" +
    "</div>" +
    "<div class='field' style='margin-bottom:12px'>" +
    "<label>Direcção da transferência</label>" +
    "<select id='tr-dir' style='width:100%;padding:10px;border:1.5px solid #e4e4e7;border-radius:8px;font-family:inherit;font-size:14px'>" +
    "<option value='wh-to-shop'>Armazém → Loja</option>" +
    "<option value='shop-to-wh'>Loja → Armazém</option>" +
    "</select></div>" +
    "<div class='field'><label>Quantidade</label>" +
    "<input type='number' id='tr-qty' min='1' value='1' style='width:100%;padding:10px;border:1.5px solid #e4e4e7;border-radius:8px;font-family:inherit;font-size:14px;box-sizing:border-box'/>" +
    "</div></div>" +
    "<div class='form-actions'>" +
    "<button class='btn btn-ghost btn-full' onclick='window._closeModal()'>Cancelar</button>" +
    "<button class='btn btn-primary btn-full' onclick='window._applyTransfer(" + id + ")'>Transferir</button>" +
    "</div>");
  refreshIcons(el("modal-box"));
};

window._applyTransfer = async (id) => {
  const qty = parseInt(el("tr-qty").value) || 0;
  const dir = el("tr-dir") ? el("tr-dir").value : "wh-to-shop";
  if (qty <= 0) { toast("Quantidade inválida.", "error"); return; }
  const from = dir === "wh-to-shop" ? "warehouse" : "shop";
  const to   = dir === "wh-to-shop" ? "shop"      : "warehouse";
  try {
    const curFrom = await getStock(id, from);
    if (qty > curFrom) { toast("Stock insuficiente em " + (from==="shop"?"loja":"armazém") + ": apenas " + curFrom + " disponíveis.", "error"); return; }
    await addStockMovement({ productId:id, productName:"", type:"transfer_out", location:from, qty:-qty, reference:"transfer", note:from+" → "+to, sessionId:null });
    await addStockMovement({ productId:id, productName:"", type:"transfer_in",  location:to,   qty:+qty, reference:"transfer", note:from+" → "+to, sessionId:null });
    toast("Transferência realizada com sucesso.", "success");
    closeModal();
    await initProdutos();
  } catch(err) {
    toast("Erro: " + err.message, "error");
  }
};



window._openAdjustProd = async (id) => {
  const p = await db.get("products",id);
  closeModal();
  const curShopAdj = p.stock || 0;
  const curWhAdj   = p.warehouseStock || 0;
  openModal("Ajustar Stock — " + p.name,
    `<div class="adj-stock-grid">
      <div class="adj-stock-card">
        <div class="adj-stock-label">Loja actual</div>
        <div class="adj-stock-cur" style="color:var(--primary)">${curShopAdj}</div>
        <div class="adj-stock-unit">${p.unit||"un"}</div>
      </div>
      <div class="adj-stock-card">
        <div class="adj-stock-label">Armazém actual</div>
        <div class="adj-stock-cur" style="color:var(--info)">${curWhAdj}</div>
        <div class="adj-stock-unit">${p.unit||"un"}</div>
      </div>
    </div>
    <div class="adj-stock-fields">
      <div class="field">
        <label>Novo stock — Loja</label>
        <input type="number" id="adj-stock" value="${curShopAdj}" min="0"
          style="font-size:20px;font-weight:700;text-align:center;padding:14px"/>
      </div>
      <div class="field">
        <label>Novo stock — Armazém</label>
        <input type="number" id="adj-warehouse" value="${curWhAdj}" min="0"
          style="font-size:20px;font-weight:700;text-align:center;padding:14px"/>
      </div>
    </div>
    <div class="field" style="margin-bottom:16px">
      <label>Razão do ajuste</label>
      <input id="adj-reason" placeholder="Ex: Entrada de mercadoria, inventário..."/>
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
  const p  = await db.get("products",id);
  const ns = Number(el("adj-stock").value);
  const nw = Number(el("adj-warehouse").value);
  if (isNaN(ns)||ns<0||isNaN(nw)||nw<0) { toast("Valores invalidos.","error"); return; }
  const reason = (el("adj-reason") ? el("adj-reason").value : "")||"Ajuste manual";

  const curShop = await getStock(id, "shop");
  const curWh   = await getStock(id, "warehouse");
  const diffShop = ns - curShop;
  const diffWh   = nw - curWh;

  if (diffShop !== 0) {
    await addStockMovement({ productId:id, productName:p.name, type:"adjustment", location:"shop", qty:diffShop, reference:"adjust", note:reason, sessionId:null });
  }
  if (diffWh !== 0) {
    await addStockMovement({ productId:id, productName:p.name, type:"adjustment", location:"warehouse", qty:diffWh, reference:"adjust", note:reason, sessionId:null });
  }

  toast("Stock ajustado.","success");
  closeModal();
  products = await db.getAll("products");
  renderStats(); renderList();
};

window._saveProduto = async (id) => {
  const name  = (el("pf-name") ? el("pf-name").value.trim() : "");
  const price = Number((el("pf-price") ? el("pf-price").value : ""));
  const cost  = Number((el("pf-cost") ? el("pf-cost").value : "")||0);
  if (!name)  { toast("O nome e obrigatorio.","error"); return; }
  if (!price) { toast("O preco e obrigatorio.","error"); return; }

  const baseData = {
    name, barcode:(el("pf-bar") ? el("pf-bar").value.trim() : "")||"",
    masterBarcode:(el("pf-bar-mae") ? el("pf-bar-mae").value.trim() : "")||"",
    price,
    costPrice: cost,
    minStock:Number((el("pf-minstock") ? el("pf-minstock").value : "")||5),
    category:(el("pf-cat") ? el("pf-cat").value : "")||"Alimentacao",
    unit:(el("pf-unit") ? el("pf-unit").value : "")||"unid",
    active:true,
  };

  if (id) {
    // EDITAR — nunca mexe no stock aqui, so dados do produto
    const ex = await db.get("products", id);
    await db.put("products", { ...ex, ...baseData });
    toast("Produto actualizado.","success");
  } else {
    // Verifica limite do plano antes de criar
    const allProducts = await db.getAll("products");
    const activeCount = allProducts.filter(function(p){ return p.active; }).length;
    const store2 = (await db.get("settings","store")) || {};
    const planLimit = store2.planLimit || 99999;
    if (activeCount >= planLimit) {
      toast("Limite de " + planLimit + " produtos atingido para o teu plano. Contacta o suporte para upgrade.", "error");
      return;
    }
    // CRIAR — stock inicial gera StockMovement real
    const initialShop = Number((el("pf-stock") ? el("pf-stock").value : "")||0);
    const initialWh    = Number((el("pf-warehouse") ? el("pf-warehouse").value : "")||0);
    const newId = await db.add("products", { ...baseData, stock:0, warehouseStock:0, createdAt:new Date().toISOString() });
    if (initialShop > 0) {
      await addStockMovement({ productId:newId, productName:name, type:"purchase", location:"shop", qty:initialShop, reference:"create", note:"Stock inicial", sessionId:null });
    }
    if (initialWh > 0) {
      await addStockMovement({ productId:newId, productName:name, type:"purchase", location:"warehouse", qty:initialWh, reference:"create", note:"Stock inicial armazem", sessionId:null });
    }
    toast("Produto adicionado!","success");
  }
  closeModal();
  products = await db.getAll("products");
  renderStats(); renderList();
};

window._closeModal = closeModal;
