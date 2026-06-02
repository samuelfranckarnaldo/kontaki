import { db } from "../db.js";
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
    `<div class="field"><label>Preco (Kz) *</label><input type="number" id="pf-price" value="${p.price||""}" placeholder="0"/></div>` +
    `<div class="field"><label>Unidade</label><input id="pf-unit" value="${p.unit||"unid"}" placeholder="unid"/></div>` +
    `</div>` +
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
    `<div class="field"><label>Codigo Barras</label><input id="pf-bar" value="${p.barcode||""}" placeholder="GTIN..."/></div>` +
    `</div></div>` +
    `<div class="form-actions">` +
    `<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>` +
    `<button class="btn btn-primary btn-full" onclick="window._saveProduto(${p.id||0})"><i data-lucide="save"></i> ${p.id?"Actualizar":"Adicionar"}</button>` +
    `</div>`);
  refreshIcons(el("modal-box"));
}

function renderStats() {
  const active = products.filter(p => p.active);
  const total  = active.length;
  const low    = active.filter(p => (p.stock||0)>0 && (p.stock||0)<=(p.minStock||5)).length;
  const zero   = active.filter(p => (p.stock||0)===0).length;
  const lojaQty= active.reduce((a,p)=>a+(p.stock||0),0);
  const armQty = active.reduce((a,p)=>a+(p.warehouseStock||0),0);
  const lojaVal= active.reduce((a,p)=>a+(p.stock||0)*p.price,0);
  const armVal = active.reduce((a,p)=>a+(p.warehouseStock||0)*p.price,0);

  el("produtos-stats").innerHTML =
    `<div class="stat-card" style="border-left:3px solid #5b21b6;cursor:pointer" onclick="window._filterProd('all')">` +
    `<div class="stat-label" style="color:#5b21b6">Total produtos</div>` +
    `<div class="stat-val" style="color:#5b21b6">${total}</div>` +
    `<div style="font-size:10px;color:#7c3aed;margin-top:4px">Ver todos</div>` +
    `</div>` +
    `<div class="stat-card" style="border-left:3px solid #d97706;cursor:pointer" onclick="window._filterProd('low')">` +
    `<div class="stat-label" style="color:#d97706">Stock baixo</div>` +
    `<div class="stat-val" style="color:#d97706">${low}</div>` +
    `<div style="font-size:10px;color:#d97706;margin-top:4px">Ver lista</div>` +
    `</div>` +
    `<div class="stat-card" style="border-left:3px solid #dc2626;cursor:pointer" onclick="window._filterProd('zero')">` +
    `<div class="stat-label" style="color:#dc2626">Esgotados</div>` +
    `<div class="stat-val" style="color:#dc2626">${zero}</div>` +
    `<div style="font-size:10px;color:#dc2626;margin-top:4px">Ver lista</div>` +
    `</div>` +
    `<div class="stat-card" style="grid-column:span 1;border-left:3px solid #16a34a">` +
    `<div class="stat-label" style="color:#16a34a">Stock Loja</div>` +
    `<div class="stat-val" style="color:#16a34a;font-size:15px">${lojaQty.toLocaleString("pt-AO")}</div>` +
    `<div style="font-size:10px;color:#71717a;margin-top:2px">${fmt(lojaVal)}</div>` +
    `</div>` +
    `<div class="stat-card" style="grid-column:span 1;border-left:3px solid #5b21b6">` +
    `<div class="stat-label" style="color:#5b21b6">Stock Armazem</div>` +
    `<div class="stat-val" style="color:#5b21b6;font-size:15px">${armQty.toLocaleString("pt-AO")}</div>` +
    `<div style="font-size:10px;color:#71717a;margin-top:2px">${fmt(armVal)}</div>` +
    `</div>` +
    `<div class="stat-card" style="grid-column:span 2;border-left:3px solid #2563eb">` +
    `<div class="stat-label" style="color:#2563eb">Total combinado</div>` +
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">` +
    `<div class="stat-val" style="color:#2563eb;font-size:15px">${(lojaQty+armQty).toLocaleString("pt-AO")} un</div>` +
    `<div style="font-size:12px;font-weight:700;color:#2563eb">${fmt(lojaVal+armVal)}</div>` +
    `</div></div>`;

  el("produtos-stats").style.gridTemplateColumns = "repeat(3,1fr)";
  refreshIcons(el("produtos-stats"));
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
      `<div class="produto-item" style="background:${bg};border-left:3px solid ${qty<=min?sc:"transparent"}">` +
      `<div style="flex:1;min-width:0">` +
      `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">` +
      `<div class="produto-name">${p.name}</div>` +
      (tag ? `<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${qty===0?"#fee2e2":"#fef3c7"};color:${sc}">${tag}</span>` : "") +
      `</div>` +
      `<div class="produto-meta">${p.barcode?p.barcode+" · ":""}${p.category}</div>` +
      `<div style="display:flex;gap:10px;margin-top:3px;font-size:11px">` +
      `<span style="color:#16a34a;font-weight:600">Loja: ${qty} ${p.unit}</span>` +
      `<span style="color:#5b21b6;font-weight:600">Arm: ${arm} ${p.unit}</span>` +
      `<span style="color:#2563eb;font-weight:600">Total: ${qty+arm} ${p.unit}</span>` +
      `</div></div>` +
      `<div class="produto-right" style="margin-right:6px">` +
      `<div class="produto-label">Preco venda</div>` +
      `<div style="font-size:14px;font-weight:700;color:#18181b">${fmt(p.price)}</div>` +
      `</div>` +
      `<button class="produto-menu-btn" onclick="window._openProdMenu(${p.id})">` +
      `<i data-lucide="more-vertical" style="width:17px;height:17px;color:#a1a1aa"></i>` +
      `</button></div>`;
  }
  el("produtos-list").innerHTML += html;
  refreshIcons(el("produtos-list"));
}

window._openProdMenu = (id) => {
  const p = products.find(x => x.id === id);
  const user = getUser();
  if (!p) return;
  const rows = [
    ["Preco", fmt(p.price), ""],
    ["Stock Loja", (p.stock||0)+" "+p.unit, p.stock<=0?"#dc2626":p.stock<=(p.minStock||5)?"#d97706":"#16a34a"],
    ["Stock Armazem", (p.warehouseStock||0)+" "+p.unit, "#5b21b6"],
    ["Total combinado", ((p.stock||0)+(p.warehouseStock||0))+" "+p.unit, "#2563eb"],
    ["Stock Min.", (p.minStock||5)+" "+p.unit, "#71717a"],
    ["Preco venda", fmt(p.price), ""],
        ...(p.costPrice ? [["Preco custo", fmt(p.costPrice), "#71717a"], ["Margem", fmt(p.price-p.costPrice)+" ("+Math.round(((p.price-p.costPrice)/p.price)*100)+"%)", "#16a34a"]] : []),
        ["Categoria", p.category, ""],
    ...(p.barcode?[["GTIN",p.barcode,""]]:[] ),
  ];
  openModal(p.name,
    `<div style="margin-bottom:14px">` +
    rows.map(([k,v,c]) =>
      `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f4f4f5">` +
      `<span style="color:#71717a;font-size:13px">${k}</span>` +
      `<span style="font-weight:700;font-size:14px;color:${c||"#18181b"}">${v}</span>` +
      `</div>`).join("") +
    `</div>` +
    (user.role==="admin" ?
      `<div style="display:flex;flex-direction:column;gap:8px">` +
      `<button class="btn btn-outline btn-full" onclick="window._editProd(${p.id})"><i data-lucide="edit-3"></i> Editar</button>` +
      `<button class="btn btn-ghost btn-full" onclick="window._openTransfer(${p.id})"><i data-lucide="arrow-right-left"></i> Armazem → Loja</button>` +
      `<button class="btn btn-ghost btn-full" onclick="window._openAdjustProd(${p.id})"><i data-lucide="refresh-cw"></i> Ajustar stock</button>` +
      `<button class="btn btn-danger btn-full" style="margin-top:4px" onclick="window._deactivateProd(${p.id})"><i data-lucide="trash-2"></i> Desativar</button>` +
      `</div>` : "") +
    `<button class="btn btn-ghost btn-full" onclick="window._closeModal()" style="margin-top:8px">Fechar</button>`);
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
  const p = await db.get("products",id);
  closeModal();
  openModal("Armazem para Loja",
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">` +
    `<div style="background:#ede9fe;border-radius:10px;padding:12px;text-align:center"><div style="font-size:11px;color:#7c3aed;font-weight:700;margin-bottom:4px">ARMAZEM</div><div style="font-size:22px;font-weight:700;color:#5b21b6">${p.warehouseStock||0}</div><div style="font-size:11px;color:#7c3aed">${p.unit}</div></div>` +
    `<div style="background:#dcfce7;border-radius:10px;padding:12px;text-align:center"><div style="font-size:11px;color:#16a34a;font-weight:700;margin-bottom:4px">LOJA</div><div style="font-size:22px;font-weight:700;color:#16a34a">${p.stock||0}</div><div style="font-size:11px;color:#16a34a">${p.unit}</div></div>` +
    `</div>` +
    `<div class="field" style="margin-bottom:16px"><label>Quantidade a transferir (max: ${p.warehouseStock||0})</label><input type="number" id="tr-qty" placeholder="0" min="1"/></div>` +
    `<div class="form-actions">` +
    `<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>` +
    `<button class="btn btn-primary btn-full" onclick="window._applyTransfer(${id})"><i data-lucide="arrow-right-left"></i> Transferir</button>` +
    `</div>`);
  refreshIcons(el("modal-box"));
};

window._applyTransfer = async (id) => {
  const p   = await db.get("products",id);
  const qty = Number(el("tr-qty").value);
  if (!qty||qty<=0) { toast("Quantidade invalida.","error"); return; }
  if (qty>(p.warehouseStock||0)) { toast("Superior ao armazem.","error"); return; }
  await db.put("products",{...p,stock:(p.stock||0)+qty,warehouseStock:(p.warehouseStock||0)-qty});
  await db.add("transfers",{productId:id,productName:p.name,qty,userId:getUser().id,date:new Date().toISOString()});
  toast(qty+" "+p.unit+" transferidos para a loja.","success");
  closeModal();
  products = await db.getAll("products");
  renderStats(); renderList();
};

window._openAdjustProd = async (id) => {
  const p = await db.get("products",id);
  closeModal();
  openModal("Ajustar Stock",
    `<div style="font-size:15px;font-weight:700;margin-bottom:14px">${p.name}</div>` +
    `<div class="field-row" style="margin-bottom:14px">` +
    `<div class="field"><label>Stock Loja</label><input type="number" id="adj-stock" value="${p.stock||0}" min="0"/></div>` +
    `<div class="field"><label>Stock Armazem</label><input type="number" id="adj-warehouse" value="${p.warehouseStock||0}" min="0"/></div>` +
    `</div>` +
    `<div class="field" style="margin-bottom:16px"><label>Razao</label><input id="adj-reason" placeholder="Ex: Entrada de mercadoria..."/></div>` +
    `<div class="form-actions">` +
    `<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>` +
    `<button class="btn btn-primary btn-full" onclick="window._applyAdjust(${id})"><i data-lucide="check"></i> Aplicar</button>` +
    `</div>`);
  refreshIcons(el("modal-box"));
};

window._applyAdjust = async (id) => {
  const p  = await db.get("products",id);
  const ns = Number(el("adj-stock").value);
  const nw = Number(el("adj-warehouse").value);
  if (isNaN(ns)||ns<0||isNaN(nw)||nw<0) { toast("Valores invalidos.","error"); return; }
  await db.put("products",{...p,stock:ns,physicalStock:ns,warehouseStock:nw});
  await db.add("adjustments",{productId:id,productName:p.name,fromStock:p.stock,toStock:ns,reason:el("adj-reason").value||"Ajuste manual",userId:getUser().id,date:new Date().toISOString()});
  toast("Stock ajustado.","success");
  closeModal();
  products = await db.getAll("products");
  renderStats(); renderList();
};

window._saveProduto = async (id) => {
  const name  = (el("pf-name") ? el("pf-name").value.trim() : "");
  const price = Number((el("pf-price") ? el("pf-price").value : ""));
  if (!name)  { toast("O nome e obrigatorio.","error"); return; }
  if (!price) { toast("O preco e obrigatorio.","error"); return; }
  const data = {
    name, barcode:(el("pf-bar") ? el("pf-bar").value.trim() : "")||"", price,
    stock:Number((el("pf-stock") ? el("pf-stock").value : "")||0),
    warehouseStock:Number((el("pf-warehouse") ? el("pf-warehouse").value : "")||0),
    minStock:Number((el("pf-minstock") ? el("pf-minstock").value : "")||5),
    physicalStock:Number((el("pf-stock") ? el("pf-stock").value : "")||0),
    category:(el("pf-cat") ? el("pf-cat").value : "")||"Alimentacao",
    unit:(el("pf-unit") ? el("pf-unit").value : "")||"unid",
    active:true,
  };
  if (id) { const ex=await db.get("products",id); await db.put("products",{...ex,...data}); toast("Produto actualizado.","success"); }
  else { await db.add("products",{...data,createdAt:new Date().toISOString()}); toast("Produto adicionado!","success"); }
  closeModal();
  products = await db.getAll("products");
  renderStats(); renderList();
};

window._closeModal = closeModal;
