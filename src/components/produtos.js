import { db } from "../db.js";
import { logAudit } from "../logger.js";
import { addStockMovement, getStock } from "../services.js";
import { fmt, el, refreshIcons } from "../utils.js";
import { openPicker } from "../picker.js";
import { saveViewState, restoreViewState } from "../view-state.js";
import { openDatePicker } from "../date-picker.js";

const UNIT_OPTIONS = ["Unidade","Outro (escrever)","Kg","Grama","Litro","Mililitro","Metro","Duzia","Par",
  "Caixa","Fardo","Grade","Pacote","Saco","Garrafa","Lata"];

const UNIT_NO_PLURAL = ["Kg"];
function pluralizeUnit(unit, count) {
  if (!unit) return unit;
  if (count === 1) return unit;
  if (UNIT_NO_PLURAL.includes(unit)) return unit;
  if (/r$/.test(unit)) return unit + "es";
  if (/s$/.test(unit)) return unit;
  return unit + "s";
}
function fmtNum(n) {
  return Number(n).toLocaleString("pt-AO");
}
function fmtKzClean(n) {
  const rounded = Math.round(n);
  const isWhole = Math.abs(n - rounded) < 0.005;
  return isWhole ? `${fmtNum(rounded)} Kz` : fmt(n);
}

const BASE_CATEGORIES = ["Alimentacao","Bebidas","Higiene","Limpeza"];
const CUSTOM_CATEGORY_LABEL = "+ Nova categoria (escrever)";
let customCategories = [];

function getCategoryOptions() {
  return [CUSTOM_CATEGORY_LABEL, ...customCategories, ...BASE_CATEGORIES, "Outro"];
}

window._maybeSaveCustomCategory = async (val) => {
  if (!val) return;
  const known = [...BASE_CATEGORIES, "Outro", ...customCategories].map(c => c.toLowerCase());
  if (known.includes(val.toLowerCase())) return;
  customCategories.push(val);
  await db.put("settings", { key: "customCategories", value: customCategories });
};

function pickerButtonHTML(idPrefix, displayValue) {
  return `
    <button type="button" id="${idPrefix}-btn" onclick="window._openFieldPicker('${idPrefix}')"
      style="width:100%;text-align:left;background:#fff;border:1px solid var(--border2);border-radius:10px;
      padding:10px 12px;font-size:14px;color:#18181b;font-family:inherit;display:flex;justify-content:space-between;align-items:center;cursor:pointer;box-sizing:border-box">
      <span id="${idPrefix}-display">${displayValue}</span>
      <i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3)"></i>
    </button>
    <input type="hidden" id="${idPrefix}-value" value="${displayValue}"/>
  `;
}

function unitSelectHTML(idPrefix, currentValue) {
  return pickerButtonHTML(idPrefix, currentValue || "Unidade");
}

function categorySelectHTML(idPrefix, currentValue) {
  return pickerButtonHTML(idPrefix, currentValue || "Outro");
}

const FIELD_PICKER_CONFIG = {
  unit: { title:"Escolher unidade", options:UNIT_OPTIONS, allowCustom:true, customLabel:"Outro (escrever)" },
};

window._openFieldPicker = (idPrefix) => {
  const kind = idPrefix.includes("cat") ? "category" : "unit";
  const cfg = kind === "category"
    ? { title:"Escolher categoria", options:getCategoryOptions(), allowCustom:true, customLabel:CUSTOM_CATEGORY_LABEL }
    : FIELD_PICKER_CONFIG[kind];
  const current = el(idPrefix + "-value") ? el(idPrefix + "-value").value : cfg.options[0];
  openPicker(cfg.title, cfg.options, current, (val) => {
    el(idPrefix + "-display").textContent = val;
    el(idPrefix + "-value").value = val;
    if (kind === "category") window._maybeSaveCustomCategory(val);
    if (idPrefix === "rc-punit") {
      var ql = el("rc-qty-label");
      if (ql) ql.textContent = "Quantidade comprada (em " + val + ")";
      var pl = el("rc-price-label");
      if (pl) pl.innerHTML = "Preço por <span style=\"color:var(--primary);font-weight:700\">" + val + "</span>";
      var fl = el("rc-pfactor-label");
      (async () => {
        var saleUnit = "unid";
        if (window._rcCurrentId) {
          var prod = await db.get("products", window._rcCurrentId);
          if (prod) saleUnit = prod.unit || "unid";
        }
        if (fl) fl.textContent = "Cada " + val + " contém quantas " + saleUnit + "?";
      })();
      if (window._rcCurrentId) window._updateRegistarCompraCalc(window._rcCurrentId);
    }
    if (idPrefix === "pf-punit") {
      var pfl = el("pf-pfactor-label");
      if (pfl) pfl.textContent = "Cada " + val + " contém quantas " + (window._pfSaleUnit||"unid") + "?";
    }
  }, { allowCustom: cfg.allowCustom, customLabel: cfg.customLabel });
};

window._readUnitValue = (idPrefix) => {
  const v = el(idPrefix + "-value") ? el(idPrefix + "-value").value : "Unidade";
  return v || "Unidade";
};
import { toast } from "../toast.js";
import { openModal, closeModal, confirmDialog } from "../modal.js";
import { getUser } from "../auth.js";
import { initCamera } from "./camera.js";

let products = [];
let viewMode = "loja";
let filterMode = "all";

export async function initProdutos() {
  const savedCats = await db.get("settings", "customCategories");
  customCategories = (savedCats && savedCats.value) ? savedCats.value : [];
  products = await db.getAll("products");

  const saved = restoreViewState("produtos");
  if (saved) {
    if (saved.filterMode) filterMode = saved.filterMode;
    if (saved.searchQuery) el("produtos-search").value = saved.searchQuery;
  }

  el("produtos-search").oninput = () => {
    filterMode = "all";
    saveViewState("produtos", { filterMode, searchQuery: el("produtos-search").value });
    renderList();
  };
  renderStats();
  renderList();
}

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  var diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / 86400000);
}

let _pfOnCreated = null;
let _pfLastOpts = {};

export function openProductForm(p = {}, opts = {}) {
  window._pfSaleUnit = p.unit || "unid";
  const isEdit = !!p.id;
  const hideStock = !!opts.hideStockFields;
  _pfOnCreated = opts.onCreated || null;
  _pfLastOpts = opts;
  openModal(isEdit ? "Editar Produto" : "Novo Produto",
    `<div style="display:flex;flex-direction:column;gap:var(--space-3)">

      <div class="field">
        <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Nome do produto *</label>
        <input id="pf-name" value="${p.name||""}" placeholder="Ex: Arroz 1kg" autocomplete="off"/>
      </div>

      <div class="field-row">
        <div class="field">
          <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Preço de venda *</label>
          <div style="position:relative">
            <input type="number" id="pf-price" value="${p.price||""}" placeholder="0" min="0" style="padding-right:36px"/>
            <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:var(--text-xs);color:var(--text3);font-weight:var(--weight-medium);pointer-events:none">Kz</span>
          </div>
        </div>
        <div class="field">
          <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Preço de custo</label>
          <div style="position:relative">
            <input type="number" id="pf-cost" value="${p.costPrice||""}" placeholder="Ex: 150" min="0" style="padding-right:36px"/>
            <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:var(--text-xs);color:var(--text3);font-weight:var(--weight-medium);pointer-events:none">Kz</span>
          </div>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Unidade</label>
          ${unitSelectHTML("pf-unit", p.unit||"Unidade")}
        </div>
        <div class="field">
          <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Categoria</label>
          ${categorySelectHTML("pf-cat", p.category||"Outro")}
        </div>
      </div>

      <div style="background:rgba(91,33,182,.05);border:1px solid rgba(91,33,182,.12);border-radius:var(--radius);padding:var(--space-4)">
        <div style="font-size:var(--text-xs);font-weight:var(--weight-strong);color:var(--primary);margin-bottom:var(--space-3);text-transform:uppercase;letter-spacing:.4px">Stock</div>
        ${hideStock ? '<div style="font-size:11px;color:var(--text3);margin-bottom:var(--space-3);display:flex;align-items:center;gap:5px"><i data-lucide="info" style="width:12px;height:12px;flex-shrink:0"></i>A quantidade desta compra vai definir o stock.</div>' : `
        <div class="field-row" style="margin-bottom:var(--space-3)">
          <div class="field">
            <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Stock loja</label>
            <input type="number" id="pf-stock" value="${p.stock||0}" min="0" ${isEdit?"disabled":""}
              style="font-size:var(--text-lg);font-weight:var(--weight-strong);text-align:center;padding:var(--space-3)${isEdit?";background:var(--border2);color:var(--text3);cursor:not-allowed":""}"/>
          </div>
          <div class="field">
            <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Stock armazém</label>
            <input type="number" id="pf-warehouse" value="${p.warehouseStock||0}" min="0" ${isEdit?"disabled":""}
              style="font-size:var(--text-lg);font-weight:var(--weight-strong);text-align:center;padding:var(--space-3)${isEdit?";background:var(--border2);color:var(--text3);cursor:not-allowed":""}"/>
          </div>
        </div>
        ${isEdit ? '<div style="font-size:11px;color:var(--text3);margin-bottom:var(--space-3);display:flex;align-items:center;gap:5px"><i data-lucide="lock" style="width:12px;height:12px;flex-shrink:0"></i>Para alterar o stock, usa Ajustar ou Transferir no menu do produto.</div>' : ""}
        `}
        <div class="field">
          <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Stock mínimo (alerta)</label>
          <input type="number" id="pf-minstock" value="${p.minStock||5}" min="0"/>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-2);border-top:1px solid var(--border2);padding-top:var(--space-4)">
        <button type="button" id="pf-conv-toggle-btn" onclick="window._toggleConvConfigForm()" style="background:none;border:none;color:var(--primary);font-weight:var(--weight-strong);font-size:var(--text-xs);cursor:pointer;font-family:inherit;text-align:left;padding:0">
          ${p.purchaseUnit ? "▼" : "▶"} Unidade de compra (grades, fardos, caixas...)
        </button>
        <div id="pf-conv-config" style="display:${p.purchaseUnit?"flex":"none"};flex-direction:column;gap:var(--space-3)">
          <div class="field-row">
            <div class="field">
              <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Unidade de compra</label>
              ${unitSelectHTML("pf-punit", p.purchaseUnit||"")}
            </div>
            <div class="field">
              <label id="pf-pfactor-label" style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Cada ${p.purchaseUnit||"unidade de compra"} contém quantas ${p.unit||"unid"}?</label>
              <input type="number" id="pf-pfactor" value="${p.conversionFactor||""}" min="1" placeholder="Ex: 24"/>
            </div>
          </div>
        </div>
      </div>

      <div class="field" style="margin-top:var(--space-2);border-top:1px solid var(--border2);padding-top:var(--space-4)">
        <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Código de barras (opcional)</label>
        <div style="display:flex;gap:var(--space-2)">
          <input id="pf-bar" value="${p.barcode||""}" placeholder="GTIN da unidade" autocomplete="off" style="flex:1"/>
          <button type="button" onclick="window._scanBarcodeForProd()"
            style="flex-shrink:0;width:44px;background:var(--primary-light);border:1.5px solid var(--border);
                   border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <i data-lucide="camera" style="width:18px;height:18px;color:var(--primary)"></i>
          </button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-2);border-top:1px solid var(--border2);padding-top:var(--space-4)">
        <button type="button" id="pf-exp-toggle-btn" onclick="window._toggleExpConfigForm()" style="background:none;border:none;color:var(--primary);font-weight:var(--weight-strong);font-size:var(--text-xs);cursor:pointer;font-family:inherit;text-align:left;padding:0">
          ${p.expiryDate ? "▼" : "▶"} Validade e lote (produtos perecíveis, medicamentos...)
        </button>
        <div id="pf-exp-config" style="display:${p.expiryDate?"flex":"none"};flex-direction:column;gap:var(--space-3)">
          <div class="field-row">
            <div class="field">
              <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Data de validade</label>
              <button type="button" id="pf-expiry-btn" onclick="window._openExpiryPicker()"
                style="width:100%;text-align:left;background:#fff;border:1px solid var(--border2);border-radius:10px;
                padding:12px;font-size:14px;color:${p.expiryDate?"#18181b":"var(--text4)"};font-family:inherit;display:flex;justify-content:space-between;align-items:center;cursor:pointer">
                <span id="pf-expiry-display">${p.expiryDate ? new Date(p.expiryDate+"T00:00:00").toLocaleDateString("pt-AO",{day:"2-digit",month:"long",year:"numeric"}) : "Selecionar data"}</span>
                <i data-lucide="calendar" style="width:16px;height:16px;color:var(--text3)"></i>
              </button>
              <input type="hidden" id="pf-expiry" value="${p.expiryDate||""}"/>
            </div>
            <div class="field">
              <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Lote (opcional)</label>
              <input id="pf-batch" value="${p.batchNumber||""}" placeholder="Ex: L2026-04"/>
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-2);border-top:1px solid var(--border2);padding-top:var(--space-4)">
        <button type="button" id="pf-more-toggle-btn" onclick="window._toggleMoreConfigForm()" style="background:none;border:none;color:var(--primary);font-weight:var(--weight-strong);font-size:var(--text-xs);cursor:pointer;font-family:inherit;text-align:left;padding:0">
          ${(p.sku || p.imageData) ? "▼" : "▶"} Mais opções (SKU, imagem...)
        </button>
        <div id="pf-more-config" style="display:${(p.sku || p.imageData)?"flex":"none"};flex-direction:column;gap:var(--space-3)">
          <div class="field">
            <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">SKU / código interno</label>
            <input id="pf-sku" value="${p.sku||""}" placeholder="Ex: ARR-1KG-001" autocomplete="off"/>
          </div>
          <div class="field">
            <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Imagem do produto</label>
            <div style="display:flex;align-items:center;gap:var(--space-3)">
              <div id="pf-img-preview" style="width:56px;height:56px;border-radius:var(--radius-sm);background:var(--border2);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;background-image:${p.imageData?`url(${p.imageData})`:"none"};background-size:cover;background-position:center">
                ${!p.imageData ? '<i data-lucide="image" style="width:20px;height:20px;color:var(--text4)"></i>' : ""}
              </div>
              <input type="file" id="pf-img-input" accept="image/*" style="display:none" onchange="window._handleProductImage(event)"/>
              <button type="button" onclick="document.getElementById('pf-img-input').click()" class="btn btn-ghost" style="font-size:var(--text-sm)">
                ${p.imageData ? "Trocar imagem" : "Escolher imagem"}
              </button>
              ${p.imageData ? '<button type="button" onclick="window._removeProductImage()" style="background:none;border:none;color:var(--danger);font-size:var(--text-xs);cursor:pointer;font-family:inherit">Remover</button>' : ""}
            </div>
            <input type="hidden" id="pf-img-data" value="${p.imageData||""}"/>
          </div>
        </div>
      </div>

    </div>
    <div style="margin-top:var(--space-5);display:flex;flex-direction:column;gap:var(--space-1)">
      <button class="btn btn-primary btn-full" onclick="window._saveProduto(${p.id||0})">
        <i data-lucide="save"></i> ${isEdit?"Actualizar":"Adicionar"}
      </button>
      <button onclick="window._closeModal()" style="width:100%;padding:var(--space-2);background:none;border:none;color:var(--text3);font-size:var(--text-sm);font-weight:var(--weight-medium);cursor:pointer;font-family:inherit">
        Cancelar
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
}

window._toggleMoreConfigForm = () => {
  const box = el("pf-more-config");
  const btn = el("pf-more-toggle-btn");
  if (!box) return;
  const opening = box.style.display === "none";
  box.style.display = opening ? "flex" : "none";
  if (btn) btn.textContent = (opening ? "▼ " : "▶ ") + "Mais opções (SKU, imagem...)";
};

function resizeImageToBase64(file, maxSize, callback) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      let w = img.width, h = img.height;
      if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
      else if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

window._handleProductImage = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  resizeImageToBase64(file, 200, function(dataUrl) {
    const preview = el("pf-img-preview");
    const hidden = el("pf-img-data");
    if (preview) {
      preview.style.backgroundImage = `url(${dataUrl})`;
      preview.innerHTML = "";
    }
    if (hidden) hidden.value = dataUrl;
  });
};

window._removeProductImage = () => {
  const preview = el("pf-img-preview");
  const hidden = el("pf-img-data");
  if (preview) {
    preview.style.backgroundImage = "none";
    preview.innerHTML = '<i data-lucide="image" style="width:20px;height:20px;color:var(--text4)"></i>';
    refreshIcons(preview);
  }
  if (hidden) hidden.value = "";
};

window._openExpiryPicker = () => {
  const current = el("pf-expiry") ? el("pf-expiry").value : "";
  openDatePicker("Data de validade", current, (dateStr) => {
    const hidden = el("pf-expiry");
    const display = el("pf-expiry-display");
    if (hidden) hidden.value = dateStr;
    if (display) {
      if (dateStr) {
        display.textContent = new Date(dateStr+"T00:00:00").toLocaleDateString("pt-AO",{day:"2-digit",month:"long",year:"numeric"});
        display.style.color = "#18181b";
      } else {
        display.textContent = "Selecionar data";
        display.style.color = "var(--text4)";
      }
    }
  });
};

function categoryColor(cat) {
  return {"Alimentacao":"#f97316","Bebidas":"#3b82f6","Higiene":"#ec4899","Limpeza":"#10b981","Outro":"#6b7280"}[cat] || "#6b7280";
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
    // Linha 1 — card hero (mesmo padrao visual do Historico: valor grande + contexto)
    `<div class="hist-hero" style="grid-column:span 3">` +
    `<div class="hist-hero-label">Valor total em stock</div>` +
    `<div class="hist-hero-val">${fmt(lojaVal+armVal)}</div>` +
    `<div class="hist-hero-sub" style="margin-top:10px;display:flex;gap:18px">` +
      `<span><strong>${lojaQty.toLocaleString("pt-AO")}</strong> un na loja</span>` +
      `<span><strong>${armQty.toLocaleString("pt-AO")}</strong> un no armazém</span>` +
    `</div>` +
    `</div>` +
    // Linha 2 — 3 cards de alerta
    `<div style="grid-column:span 3;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">` +
    _statCard({ label:"Produtos", value:total, sub:"activos", color:"var(--primary)", icon:"package", filter:"all", clickable:true }) +
    _statCard({ label:"Stock baixo", value:low, sub:"a repor", color:"var(--warning)", icon:"alert-triangle", filter:"low", clickable:low>0, isAlert:true }) +
    _statCard({ label:"Esgotados", value:zero, sub:"sem stock", color:"var(--danger)", icon:"x-circle", filter:"zero", clickable:zero>0, isAlert:true }) +
    `</div>`;

  refreshIcons(s);
}

export function _statCard({label, value, sub, color, icon, filter, clickable, isAlert}) {
  const active = isAlert && value > 0;
  const style = active ? `border-color:${color};background:${color}0d` : "";
  return `<div class="prod-stat-card${clickable?" prod-stat-clickable":""}" style="${style}" ${clickable?`onclick="window._filterProd('${filter}')"`:""}>`+
    `<div class="prod-stat-icon" style="background:${color}20;color:${color}"><i data-lucide="${icon}"></i></div>`+
    `<div class="prod-stat-val2${String(value).length>=13?" prod-stat-val2--xs":String(value).length>9?" prod-stat-val2--sm":""}" style="color:${color}">${value}</div>`+
    `<div class="prod-stat-label2">${label}</div>`+
    `<div class="prod-stat-sub">${sub}</div>`+
    `</div>`;
}

window._filterProd = (mode) => {
  filterMode = mode;
  el("produtos-search").value = "";
  saveViewState("produtos", { filterMode: mode, searchQuery: "" });
  renderList();
  // Scroll para a lista
  var listEl = el("produtos-list");
  if (listEl) setTimeout(function(){ listEl.scrollIntoView({behavior:"smooth",block:"start"}); }, 100);
};

function renderList() {
  const q    = ((el("produtos-search") ? el("produtos-search").value : "") || "").toLowerCase();
  let list   = products.filter(p => p.active);

  if (filterMode === "low")  list = list.filter(p => (p.stock||0)>0 && (p.stock||0)<=(p.minStock||5));
  else if (filterMode === "zero") list = list.filter(p => (p.stock||0)===0);
  else if (filterMode === "expired")  list = list.filter(p => p.expiryDate && daysUntil(p.expiryDate) < 0);
  else if (filterMode === "expiring") list = list.filter(p => p.expiryDate && daysUntil(p.expiryDate) <= 30 && daysUntil(p.expiryDate) >= 0);
  else if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||"").includes(q));

  list.sort((a,b) => (a.stock||0) - (b.stock||0));

  const FILTER_LABELS = { low:"Stock Baixo", zero:"Esgotados", expired:"Vencidos", expiring:"A Vencer" };
  const filterLabel = FILTER_LABELS[filterMode] || "";

  const chipsWrap = el("produtos-filter-chips");
  if (chipsWrap) {
    const chips = [
      { key:"all", label:"Todos" },
      { key:"low", label:"Stock baixo" },
      { key:"zero", label:"Esgotados" },
      { key:"expiring", label:"A vencer" },
      { key:"expired", label:"Vencidos" },
    ];
    chipsWrap.innerHTML = '<div class="produto-filter-chips-wrap" style="display:inline-flex">' +
      chips.map(function(c) {
        const active = filterMode === c.key;
        return `<button class="produto-filter-chip${active?" produto-filter-chip--active":""}" onclick="window._filterProd('${c.key}')">${c.label}</button>`;
      }).join("") +
    '</div>';
  }

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
  const cColor = categoryColor(p.category);

  openModal("",
    // Header do produto — nome, categoria e preco agrupados, sem duplicar o titulo
    `<div class="stagger-item" style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-5);animation-delay:0ms">
      <div style="width:52px;height:52px;border-radius:var(--radius-lg);flex-shrink:0;
        background:linear-gradient(135deg, ${cColor}, ${cColor}cc);
        display:flex;align-items:center;justify-content:center;
        font-size:var(--text-xl);font-weight:var(--weight-strong);color:#fff;box-shadow:0 4px 12px ${cColor}40">
        ${(p.name||"P").charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:var(--text-lg);font-weight:var(--weight-strong);color:var(--text);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">${p.category||"Outro"}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:var(--text-xl);font-weight:var(--weight-strong);color:var(--primary)">${fmt(p.price)}</div>
      </div>
    </div>` +

    // Stock cards
    `<div class="prod-modal-stock stagger-item" style="margin-bottom:var(--space-5);animation-delay:40ms">
      <div class="prod-modal-stock-card" style="background:var(--primary-light);border-radius:10px">
        <div class="prod-modal-stock-label">Loja</div>
        <div class="prod-modal-stock-val" style="color:var(--primary)">${shopS}</div>
        <div class="prod-modal-stock-unit">${p.unit||"un"}</div>
      </div>
      <div class="prod-modal-stock-card" style="background:var(--info-light);border-radius:10px">
        <div class="prod-modal-stock-label">Armazém</div>
        <div class="prod-modal-stock-val" style="color:var(--info)">${whS}</div>
        <div class="prod-modal-stock-unit">${p.unit||"un"}</div>
      </div>
      <div class="prod-modal-stock-card" style="background:var(--border2);border-radius:10px">
        <div class="prod-modal-stock-label">Total</div>
        <div class="prod-modal-stock-val" style="color:var(--text)">${shopS+whS}</div>
        <div class="prod-modal-stock-unit">${p.unit||"un"}</div>
      </div>
    </div>` +

    // Info detalhes
    `<div class="stagger-item" style="background:var(--bg);border-radius:var(--radius-lg);padding:2px var(--space-4);margin-bottom:var(--space-5);animation-delay:80ms">` +
    (user.role==="admin" && p.costPrice ? `<div style="display:flex;justify-content:space-between;padding:var(--space-3) 0;border-bottom:1px solid var(--border2);font-size:var(--text-sm)"><span style="color:var(--text3)">Preço custo</span><span style="font-weight:var(--weight-strong);color:var(--text)">${fmt(p.costPrice)}</span></div>` : "") +
    (user.role==="admin" && margin!==null ? `<div style="display:flex;justify-content:space-between;padding:var(--space-3) 0;border-bottom:1px solid var(--border2);font-size:var(--text-sm)"><span style="color:var(--text3)">Margem</span><span style="font-weight:var(--weight-strong);color:${margin<0?"var(--danger)":"var(--success)"}">${fmt(p.price-p.costPrice)} (${margin}%)</span></div>` : "") +
    `<div style="display:flex;justify-content:space-between;padding:var(--space-3) 0;font-size:var(--text-sm)"><span style="color:var(--text3)">Stock mínimo</span><span style="font-weight:var(--weight-strong);color:var(--text)">${p.minStock||5} ${p.unit||"un"}</span></div>` +
    (p.barcode ? `<div style="display:flex;justify-content:space-between;padding:var(--space-3) 0;border-top:1px solid var(--border2);font-size:var(--text-sm)"><span style="color:var(--text3)">Código de barras</span><span style="font-family:monospace;font-weight:var(--weight-strong);color:var(--text)">${p.barcode}</span></div>` : "") +
    `</div>` +

    // Acções
    (user.role==="admin" ?
      `<div class="prod-modal-actions stagger-item" style="display:flex;flex-direction:column;gap:var(--space-2);animation-delay:120ms">
        <button class="btn btn-full" style="background:var(--success);color:#fff;border-radius:var(--radius);padding:var(--space-4);font-size:var(--text-base);font-weight:var(--weight-strong);box-shadow:none" onclick="window._openRegistarCompra(${p.id})">
          <i data-lucide="shopping-cart" style="width:16px;height:16px"></i> Registar Compra
        </button>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2)">
          <button class="btn btn-full" style="background:#fff;border:1px solid var(--border2);color:var(--text);border-radius:var(--radius);padding:var(--space-3);font-size:var(--text-sm);font-weight:var(--weight-medium)" onclick="window._openTransfer(${p.id})">
            <i data-lucide="arrow-right-left" style="width:15px;height:15px"></i> Transferir
          </button>
          <button class="btn btn-full" style="background:#fff;border:1px solid var(--border2);color:var(--text);border-radius:var(--radius);padding:var(--space-3);font-size:var(--text-sm);font-weight:var(--weight-medium)" onclick="window._openAdjustProd(${p.id})">
            <i data-lucide="refresh-cw" style="width:15px;height:15px"></i> Ajustar
          </button>
        </div>
        <div style="display:flex;justify-content:center;gap:var(--space-5);padding:var(--space-2) 0">
          <button onclick="window._editProd(${p.id})" style="background:none;border:none;color:var(--text3);font-size:var(--text-sm);font-weight:var(--weight-medium);cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:var(--space-1)">
            <i data-lucide="edit-3" style="width:14px;height:14px"></i> Editar
          </button>
          <button onclick="window._closeModal()" style="background:none;border:none;color:var(--text3);font-size:var(--text-sm);font-weight:var(--weight-medium);cursor:pointer;font-family:inherit">
            Fechar
          </button>
        </div>
        <div style="border-top:1px solid var(--border2);margin-top:var(--space-2);padding-top:var(--space-3);text-align:center">
          <button onclick="window._deactivateProd(${p.id})"
            style="background:none;border:none;color:var(--danger);font-size:var(--text-xs);
                   cursor:pointer;font-family:inherit;padding:var(--space-1);text-align:center">
            Desativar produto
          </button>
        </div>
      </div>` :
      `<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>`
    ));
  var mt = document.getElementById("modal-title");
  if (mt && !mt.textContent) mt.style.display = "none";
  refreshIcons(el("modal-box"));
};

window._editProd = async (id) => { const p = await db.get("products",id); closeModal(); setTimeout(function(){ openProductForm(p); }, 50); };

window._deactivateProd = (id) => {
  confirmDialog("Tens a certeza que queres desativar este produto?", async () => {
    const p = await db.get("products",id);
    await db.put("products",{...p,active:false});
    toast("Produto desativado.","success");
    closeModal();
    products = await db.getAll("products");
    renderStats(); renderList();
  }, { title: "Desativar produto", confirmText: "Desativar", danger: true, icon: "trash-2" });
};

window._openTransfer = async (id) => {
  const p = await db.get("products", id);
  if (!p) return;
  const shopStock = p.stock || 0;
  const whStock   = p.warehouseStock || 0;
  openModal("Transferir Stock — " + p.name,
    "<div style='margin-bottom:var(--space-4)'>" +
    "<div style='display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-4)'>" +
    "<div class='stat-card' style='border-left:3px solid #5b21b6;text-align:center'>" +
    "<div style='font-size:var(--text-xs);color:#5b21b6;font-weight:var(--weight-strong)'>LOJA</div>" +
    "<div style='font-size:var(--text-lg);font-weight:var(--weight-strong);color:#5b21b6'>" + shopStock + "</div>" +
    "<div style='font-size:var(--text-xs);color:#71717a'>" + p.unit + "</div></div>" +
    "<div class='stat-card' style='border-left:3px solid #d97706;text-align:center'>" +
    "<div style='font-size:var(--text-xs);color:#d97706;font-weight:var(--weight-strong)'>ARMAZÉM</div>" +
    "<div style='font-size:var(--text-lg);font-weight:var(--weight-strong);color:#d97706'>" + whStock + "</div>" +
    "<div style='font-size:var(--text-xs);color:#71717a'>" + p.unit + "</div></div>" +
    "</div>" +
    "<div class='field' style='margin-bottom:var(--space-3)'>" +
    "<label style='text-transform:none;font-weight:600;letter-spacing:0;font-size:12px;color:var(--text2)'>Direcção da transferência</label>" +
    "<button type='button' id='tr-dir-btn' onclick='window._openTransferDirPicker()' " +
    "style='width:100%;text-align:left;background:#fff;border:1px solid var(--border2);border-radius:10px;" +
    "padding:12px;font-size:14px;color:#18181b;font-family:inherit;display:flex;justify-content:space-between;align-items:center;cursor:pointer'>" +
    "<span id='tr-dir-display'>Armazém → Loja</span>" +
    "<i data-lucide='chevron-down' style='width:16px;height:16px;color:var(--text3)'></i>" +
    "</button>" +
    "<input type='hidden' id='tr-dir-value' value='wh-to-shop'/>" +
    "</div>" +
    "<div class='field'><label style='text-transform:none;font-weight:600;letter-spacing:0;font-size:12px;color:var(--text2)'>Quantidade</label>" +
    "<input type='number' id='tr-qty' min='1' value='1' style='width:100%;padding:10px;border:1.5px solid #e4e4e7;border-radius:8px;font-family:inherit;font-size:14px;box-sizing:border-box'/>" +
    "</div></div>" +
    "<div style='margin-top:var(--space-3);display:flex;flex-direction:column;gap:var(--space-1)'>" +
    "<button class='btn btn-primary btn-full' onclick='window._applyTransfer(" + id + ")'>Transferir</button>" +
    "<button onclick='window._closeModal()' style='width:100%;padding:10px;background:none;border:none;color:var(--text3);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit'>Cancelar</button>" +
    "</div>");
  refreshIcons(el("modal-box"));
};

window._openTransferDirPicker = () => {
  const current = el("tr-dir-value").value === "wh-to-shop" ? "Armazém → Loja" : "Loja → Armazém";
  openPicker("Direcção da transferência", ["Armazém → Loja", "Loja → Armazém"], current, (val) => {
    el("tr-dir-display").textContent = val;
    el("tr-dir-value").value = val === "Armazém → Loja" ? "wh-to-shop" : "shop-to-wh";
  });
};

window._applyTransfer = async (id) => {
  const qty = parseInt(el("tr-qty").value) || 0;
  const dir = el("tr-dir-value") ? el("tr-dir-value").value : "wh-to-shop";
  if (qty <= 0) { toast("Quantidade inválida.", "error"); return; }
  const from = dir === "wh-to-shop" ? "warehouse" : "shop";
  const to   = dir === "wh-to-shop" ? "shop"      : "warehouse";

  const p = await db.get("products", id);
  if (!p) return;

  const curFrom = await getStock(id, from);
  if (qty > curFrom) { toast("Stock insuficiente em " + (from==="shop"?"loja":"armazém") + ": apenas " + curFrom + " disponíveis.", "error"); return; }

  const doTransfer = async () => {
    try {
      await addStockMovement({ productId:id, productName:p.name, type:"transfer_out", location:from, qty:-qty, reference:"transfer", note:from+" → "+to, sessionId:null });
      await addStockMovement({ productId:id, productName:p.name, type:"transfer_in",  location:to,   qty:+qty, reference:"transfer", note:from+" → "+to, sessionId:null });
      toast("Transferência realizada com sucesso.", "success");
      closeModal();
      await initProdutos();
    } catch(err) {
      toast("Erro: " + err.message, "error");
    }
  };

  const fromLabel = from === "shop" ? "Loja" : "Armazém";
  const toLabel   = to   === "shop" ? "Loja" : "Armazém";
  const unit = p.unit || "unid";

  const recapHTML =
    `<div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:10px">Transferir ${qty} ${unit}?</div>` +
    `<div style="font-size:13px;color:var(--text2);line-height:1.6">${fromLabel} → ${toLabel}</div>` +
    `<div style="font-size:12px;color:var(--text3);margin-top:8px;border-top:1px solid var(--border2);padding-top:8px">${fromLabel}: ${curFrom} → <strong style="color:var(--text)">${curFrom-qty}</strong> ${unit}</div>`;

  confirmDialog(recapHTML, doTransfer, { title:"Confirmar transferência", confirmText:"Sim, transferir", icon:"arrow-right-left" });
};



window._openAdjustProd = async (id) => {
  const p = await db.get("products",id);
  closeModal();
  const curShopAdj = p.stock || 0;
  const curWhAdj   = p.warehouseStock || 0;
  openModal("Ajustar Stock — " + p.name,
    `<div style="display:flex;flex-direction:column;gap:var(--space-3);margin-bottom:var(--space-4)">
      <div style="display:flex;align-items:center;gap:var(--space-3);background:var(--bg);border-radius:var(--radius);padding:var(--space-3) var(--space-4)">
        <div style="flex:1;text-align:center">
          <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Loja — Atual</div>
          <div style="font-size:22px;font-weight:800;color:var(--text3)">${curShopAdj}</div>
        </div>
        <i data-lucide="arrow-right" style="width:18px;height:18px;color:var(--text4);flex-shrink:0"></i>
        <div style="flex:1">
          <div style="font-size:10px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;text-align:center">Novo</div>
          <input type="number" id="adj-stock" value="${curShopAdj}" min="0"
            style="font-size:22px;font-weight:800;text-align:center;padding:10px;color:var(--primary);border-color:var(--primary)"/>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-3);background:var(--bg);border-radius:var(--radius);padding:var(--space-3) var(--space-4)">
        <div style="flex:1;text-align:center">
          <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Armazém — Atual</div>
          <div style="font-size:22px;font-weight:800;color:var(--text3)">${curWhAdj}</div>
        </div>
        <i data-lucide="arrow-right" style="width:18px;height:18px;color:var(--text4);flex-shrink:0"></i>
        <div style="flex:1">
          <div style="font-size:10px;font-weight:700;color:var(--info);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;text-align:center">Novo</div>
          <input type="number" id="adj-warehouse" value="${curWhAdj}" min="0"
            style="font-size:22px;font-weight:800;text-align:center;padding:10px;color:var(--info);border-color:var(--info)"/>
        </div>
      </div>
    </div>
    <div class="field" style="margin-bottom:16px">
      <label style="text-transform:none;font-weight:600;letter-spacing:0;font-size:12px;color:var(--text2)">Razão do ajuste *</label>
      <input id="adj-reason" placeholder="Ex: Entrada de mercadoria, inventário..."/>
    </div>
    <div style="margin-top:var(--space-3);display:flex;flex-direction:column;gap:var(--space-1)">
      <button class="btn btn-primary btn-full" onclick="window._applyAdjust(${id})">
        <i data-lucide="check"></i> Aplicar
      </button>
      <button onclick="window._closeModal()" style="width:100%;padding:10px;background:none;border:none;color:var(--text3);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
        Cancelar
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._applyAdjust = async (id) => {
  const p  = await db.get("products",id);
  const ns = Number(el("adj-stock").value);
  const nw = Number(el("adj-warehouse").value);
  if (isNaN(ns)||ns<0||isNaN(nw)||nw<0) { toast("Valores invalidos.","error"); return; }

  const reason = (el("adj-reason") ? el("adj-reason").value.trim() : "");
  if (!reason) {
    toast("Indica a razão do ajuste antes de aplicar.","error");
    if (el("adj-reason")) el("adj-reason").focus();
    return;
  }

  const curShop = await getStock(id, "shop");
  const curWh   = await getStock(id, "warehouse");
  const diffShop = ns - curShop;
  const diffWh   = nw - curWh;

  if (diffShop === 0 && diffWh === 0) {
    toast("Nenhuma alteração para aplicar.","error");
    return;
  }

  const doAdjustOnly = async () => {
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

  const doInitialCount = async () => {
    const { productService } = await import("../services.js");
    try {
      await productService.setInitialCount(id, ns, nw);
      toast("Primeiro Inventário concluído.","success");
      closeModal();
      products = await db.getAll("products");
      renderStats(); renderList();
      const stillPending = (await productService.getPendingInitialCount()).length;
      if (stillPending === 0) toast("Primeiro Inventário concluído para todos os produtos.","success");
    } catch(err) {
      toast("Erro: "+err.message,"error");
    }
  };

  const doApply = async () => {
    if (!p.pendingInitialCount) { await doAdjustOnly(); return; }

    closeModal();
    openModal("Primeiro Inventário pendente",
      `<div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:16px">` +
      `Este produto ainda não possui um Primeiro Inventário. O ajuste que pretende fazer corresponde à primeira contagem física deste produto?` +
      `</div>` +
      `<div style="display:flex;flex-direction:column;gap:8px">` +
      `<button class="btn btn-primary btn-full" onclick="window._applyAdjustAsInitialCount()">Concluir Primeiro Inventário</button>` +
      `<button class="btn btn-ghost btn-full" onclick="window._applyAdjustOnly()">Ajustar Stock Apenas</button>` +
      `<button onclick="window._closeModal()" style="width:100%;padding:10px;background:none;border:none;color:var(--text3);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancelar</button>` +
      `</div>`);
    refreshIcons(el("modal-box"));

    window._applyAdjustAsInitialCount = async () => { await doInitialCount(); };
    window._applyAdjustOnly = async () => {
      toast("O produto continuará pendente de Primeiro Inventário.","info");
      await doAdjustOnly();
    };
  };

  const unit = p.unit || "unid";
  const lines = [];
  if (diffShop !== 0) lines.push(`Loja: ${curShop} → <strong>${ns}</strong> ${unit} (${diffShop>0?"+":""}${diffShop})`);
  if (diffWh   !== 0) lines.push(`Armazém: ${curWh} → <strong>${nw}</strong> ${unit} (${diffWh>0?"+":""}${diffWh})`);

  const recapHTML =
    `<div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:10px">Confirmar ajuste de stock?</div>` +
    `<div style="font-size:13px;color:var(--text2);line-height:1.8;margin-bottom:12px">${lines.join("<br/>")}</div>` +
    `<div style="border-top:1px solid var(--border2);padding-top:10px;font-size:12px;color:var(--text3)">Motivo: <strong style="color:var(--text)">${reason}</strong></div>`;

  confirmDialog(recapHTML, doApply, { title:"Confirmar ajuste", confirmText:"Sim, aplicar ajuste", icon:"refresh-cw" });
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
    category:(el("pf-cat-value") ? el("pf-cat-value").value : "")||"Alimentacao",
    unit: window._readUnitValue("pf-unit"),
    purchaseUnit: (function(){ const v = window._readUnitValue("pf-punit"); return v==="Unidade" ? null : v; })(),
    conversionFactor:Number((el("pf-pfactor") ? el("pf-pfactor").value : "")||0)||null,
    expiryDate:(el("pf-expiry") ? el("pf-expiry").value : "")||null,
    batchNumber:(el("pf-batch") ? el("pf-batch").value.trim() : "")||null,
    sku:(el("pf-sku") ? el("pf-sku").value.trim() : "")||null,
    imageData:(el("pf-img-data") ? el("pf-img-data").value : "")||null,
    active:true,
  };

  if (id) {
    // EDITAR — nunca mexe no stock aqui, so dados do produto
    const ex = await db.get("products", id);

    var trackedFields = { name:"Nome", price:"Preço de venda", costPrice:"Preço de custo" };
    var changes = [];
    Object.keys(trackedFields).forEach(function(field) {
      if (ex[field] !== baseData[field]) {
        changes.push({ field: trackedFields[field], before: ex[field], after: baseData[field] });
      }
    });

    await db.put("products", { ...ex, ...baseData });
    if (changes.length) {
      await logAudit("product", id, "edit", changes);
    }
    toast("Produto actualizado.","success");
  } else {
    const allProducts = await db.getAll("products");

    const dupe = allProducts.find(function(p){
      return p.active && p.name.trim().toLowerCase() === name.trim().toLowerCase();
    });
    if (dupe) {
      const retryOpts = _pfLastOpts;
      confirmDialog(
        'Já existe um produto chamado "' + dupe.name + '". Usar o produto existente em vez de criar um novo?',
        function() {
          closeModal();
          window._pfLastResolvedProductId = dupe.id;
          if (_pfOnCreated) { const cb = _pfOnCreated; _pfOnCreated = null; cb(dupe.id); }
          toast("A usar o produto já existente.", "info");
        },
        {
          title: "Produto já existe", confirmText: "Usar existente", cancelText: "Escolher outro nome",
          onCancel: function() {
            toast("Escolhe outro nome para o produto.", "info");
            openProductForm({}, retryOpts);
          }
        }
      );
      return;
    }

    // Verifica limite do plano antes de criar
    const activeCount = allProducts.filter(function(p){ return p.active; }).length;
    const licMod = await import("../license.js");
    const planLimit = licMod.getPlanLimit("maxProducts");
    if (activeCount >= planLimit) {
      toast("Limite de " + planLimit + " produtos atingido para o teu plano. Contacta a Introxeer para upgrade.", "error");
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

window._scanBarcodeForProd = () => {
  initCamera((rawValue) => {
    const input = el("pf-bar");
    if (input) { input.value = rawValue; input.focus(); }
    toast("Código lido!", "success");
  });
};

window._toggleConvConfigForm = () => {
  const box = el("pf-conv-config");
  const btn = el("pf-conv-toggle-btn");
  if (!box) return;
  const opening = box.style.display === "none";
  box.style.display = opening ? "flex" : "none";
  if (btn) btn.textContent = (opening ? "▼ " : "▶ ") + "Unidade de compra (grades, fardos, caixas...)";
};

window._toggleExpConfigForm = () => {
  const box = el("pf-exp-config");
  const btn = el("pf-exp-toggle-btn");
  if (!box) return;
  const opening = box.style.display === "none";
  box.style.display = opening ? "flex" : "none";
  if (btn) btn.textContent = (opening ? "▼ " : "▶ ") + "Validade e lote (produtos perecíveis, medicamentos...)";
};

window._openRegistarCompra = async (id) => {
  const p = await db.get("products", id);
  if (!p) return;
  const hasConversion = !!(p.purchaseUnit && p.conversionFactor && p.conversionFactor > 0);

  openModal(`Registar Compra — ${p.name}`,
    `<div style="display:flex;flex-direction:column;gap:var(--space-5)">

      ${hasConversion ? `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-2);padding:2px 0;font-size:var(--text-xs);color:var(--text3)">
        <span>${p.purchaseUnit} = ${p.conversionFactor} ${p.unit||"unid"}</span>
        <button onclick="window._toggleConvConfig()" style="background:none;border:none;color:var(--primary);font-weight:var(--weight-medium);cursor:pointer;font-family:inherit;font-size:var(--text-xs)">Alterar</button>
      </div>` : `
      <div style="display:flex;align-items:flex-start;gap:var(--space-2);padding:2px 0;font-size:var(--text-xs);color:var(--text3)">
        <i data-lucide="info" style="width:14px;height:14px;flex-shrink:0;margin-top:1px;color:#d97706"></i>
        <span>Compra em grades, fardos ou caixas? Configure abaixo.</span>
      </div>`}

      <div id="rc-conv-config" style="display:${hasConversion?"none":"flex"};flex-direction:column;gap:var(--space-3)">
        <div class="field-row">
          <div class="field">
            <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Unidade de compra</label>
            ${unitSelectHTML("rc-punit", p.purchaseUnit||"")}
          </div>
          <div class="field">
            <label id="rc-pfactor-label" style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Cada ${p.purchaseUnit||"unidade de compra"} contém quantas ${p.unit||"unid"}?</label>
            <input type="number" id="rc-pfactor" placeholder="Ex: 24" min="1" value="${p.conversionFactor||""}"
              oninput="window._updateRegistarCompraCalc(${p.id})"/>
            <div style="font-size:10px;color:var(--text3);margin-top:var(--space-1)">Este valor fica guardado neste produto e é preenchido automaticamente nas próximas compras.</div>
          </div>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label id="rc-qty-label" style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Quantidade comprada</label>
          <input type="number" id="rc-qty" value="1" min="1" oninput="window._updateRegistarCompraCalc(${id})"
            style="font-size:var(--text-lg);font-weight:var(--weight-strong);text-align:center;padding:var(--space-3)"/>
        </div>
        <div class="field">
          <label id="rc-price-label" style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Preço por <span style="color:var(--primary);font-weight:var(--weight-strong)">${p.purchaseUnit||"unidade de compra"}</span></label>
          <input type="number" id="rc-price" placeholder="0" min="0" oninput="window._updateRegistarCompraCalc(${id})"/>
        </div>
      </div>

      <div id="rc-calc" style="background:#fafafa;border:1px solid var(--border2);border-radius:var(--radius-lg);padding:var(--space-5) var(--space-4);display:flex;flex-direction:column;gap:var(--space-4);box-shadow:var(--shadow-sm)">
        <div style="display:flex;align-items:center;gap:6px;font-size:var(--text-xs);font-weight:var(--weight-strong);color:var(--success)">
          <i data-lucide="check-circle" style="width:13px;height:13px"></i> Cálculo automático
        </div>
        <div style="display:flex;justify-content:space-between">
          <div>
            <div style="font-size:var(--text-xs);font-weight:var(--weight-strong);color:var(--text3)">Stock a adicionar</div>
            <div id="rc-calc-qty" style="font-size:var(--text-xl);font-weight:var(--weight-strong);color:var(--primary);margin-top:3px">—</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:var(--text-xs);font-weight:var(--weight-strong);color:var(--text3)">Custo por ${p.unit||"unid"}</div>
            <div id="rc-calc-cost" style="font-size:var(--text-xl);font-weight:var(--weight-strong);color:var(--text);margin-top:3px">—</div>
          </div>
        </div>
        <div id="rc-calc-formula" style="font-size:var(--text-sm);color:var(--text3);border-top:1px solid var(--border2);padding-top:var(--space-3)">—</div>
        <div id="rc-calc-warn" style="display:none;font-size:var(--text-xs);color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:var(--radius-sm);padding:var(--space-2) var(--space-3)"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--text-sm)">
          <span style="color:var(--text3)">Custo total da compra</span>
          <span id="rc-calc-total" style="font-weight:var(--weight-strong);font-size:var(--text-xl);color:var(--text)">—</span>
        </div>
      </div>

      <div class="field">
        <label style="text-transform:none;font-weight:var(--weight-medium);letter-spacing:0;font-size:var(--text-xs);color:var(--text2)">Adicionar em</label>
        <button type="button" id="rc-dest-btn" onclick="window._openDestPicker()"
          style="width:100%;text-align:left;background:#fff;border:1px solid var(--border2);border-radius:10px;
          padding:10px 12px;font-size:14px;color:#18181b;font-family:inherit;display:flex;justify-content:space-between;align-items:center;cursor:pointer;box-sizing:border-box">
          <span id="rc-dest-display">Loja</span>
          <i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3)"></i>
        </button>
        <input type="hidden" id="rc-dest" value="shop"/>
      </div>

      <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-xs);color:var(--text3);cursor:pointer">
        <input type="checkbox" id="rc-update-cost" checked style="width:16px;height:16px"/>
        Atualizar preço de custo do produto
      </label>

    </div>
    <div style="margin-top:var(--space-5);display:flex;flex-direction:column;gap:var(--space-3)">
      <button class="btn btn-full" style="background:var(--success);color:#fff;font-size:var(--text-lg);padding:14px var(--space-4);box-shadow:0 4px 14px rgba(22,163,74,.25)" onclick="window._confirmCompra(${id})">
        <i data-lucide="check"></i> Confirmar Compra
      </button>
      <button onclick="window._closeModal()" style="background:none;border:none;color:var(--text3);font-size:var(--text-sm);font-weight:var(--weight-medium);cursor:pointer;font-family:inherit;padding:var(--space-2);text-align:center;width:100%">
        Cancelar
      </button>
    </div>`);
  window._rcCurrentId = id;
  refreshIcons(el("modal-box"));
  if (p.purchaseUnit) {
    var ql = el("rc-qty-label");
    if (ql) ql.textContent = "Quantidade comprada (em " + p.purchaseUnit + ")";
    var pl = el("rc-price-label");
    if (pl) pl.innerHTML = "Preço por <span style=\"color:var(--primary);font-weight:var(--weight-strong)\">" + p.purchaseUnit + "</span>";
    var fl = el("rc-pfactor-label");
    if (fl) fl.textContent = "Cada " + p.purchaseUnit + " contém quantas " + (p.unit||"unid") + "?";
  }
  window._updateRegistarCompraCalc(id);
};

window._openDestPicker = () => {
  const current = el("rc-dest").value === "shop" ? "Loja" : "Armazém";
  openPicker("Adicionar em", ["Loja", "Armazém"], current, (val) => {
    el("rc-dest-display").textContent = val;
    el("rc-dest").value = val === "Loja" ? "shop" : "warehouse";
  });
};

window._toggleConvConfig = () => {
  const box = el("rc-conv-config");
  if (box) box.style.display = box.style.display === "none" ? "flex" : "none";
};

window._updateRegistarCompraCalc = async (id) => {
  if (!id) return;
  const p = await db.get("products", id);
  if (!p) return;
  const qty = Number((el("rc-qty")?el("rc-qty").value:"")||0);
  const price = Number((el("rc-price")?el("rc-price").value:"")||0);
  const factorInput = Number((el("rc-pfactor")?el("rc-pfactor").value:"")||0);
  const factor = factorInput>0 ? factorInput : (p.conversionFactor||1);
  const punit = window._readUnitValue("rc-punit");
  const punitLabel = (punit && punit!=="Unidade") ? punit : (p.purchaseUnit||p.unit||"unid");

  const rawTotal = qty * factor;
  const totalUnits = Math.floor(rawTotal);
  const isFraction = rawTotal>0 && rawTotal !== totalUnits;
  const costPerUnit = totalUnits>0 ? (qty*price)/totalUnits : 0;
  const totalCost = qty * price;

  const calcQty = el("rc-calc-qty");
  const calcCost = el("rc-calc-cost");
  const calcFormula = el("rc-calc-formula");
  const calcTotal = el("rc-calc-total");
  const calcWarn = el("rc-calc-warn");

  const saleUnit = p.unit || "unid";
  if (calcQty) calcQty.textContent = totalUnits>0 ? `${fmtNum(totalUnits)} ${pluralizeUnit(saleUnit, totalUnits)}` : "—";
  if (calcCost) calcCost.textContent = costPerUnit>0 ? fmt(costPerUnit) : "—";
  if (calcFormula) calcFormula.textContent = (qty>0 && factor>0)
    ? `${fmtNum(qty)} ${pluralizeUnit(punitLabel, qty)} × ${fmtNum(factor)} ${pluralizeUnit(saleUnit, factor)} = ${fmtNum(rawTotal)} ${pluralizeUnit(saleUnit, rawTotal)}`
    : "—";
  if (calcTotal) calcTotal.textContent = totalCost>0 ? fmt(totalCost) : "—";

  if (calcWarn) {
    if (isFraction) {
      calcWarn.style.display = "block";
      calcWarn.textContent = `O cálculo deu ${fmtNum(rawTotal)} ${pluralizeUnit(p.unit||"unid", rawTotal)} (número quebrado). Vamos arredondar para ${fmtNum(totalUnits)} ${pluralizeUnit(p.unit||"unid", totalUnits)} — nenhum stock extra é criado.`;
    } else {
      calcWarn.style.display = "none";
    }
  }
};

window._confirmCompra = async (id) => {
  const p = await db.get("products", id);
  if (!p) return;

  const qty = Number((el("rc-qty")?el("rc-qty").value:"")||0);
  const price = Number((el("rc-price")?el("rc-price").value:"")||0);
  const dest = el("rc-dest") ? el("rc-dest").value : "shop";
  const updateCost = el("rc-update-cost") ? el("rc-update-cost").checked : false;
  const punitInput = window._readUnitValue("rc-punit") === "Unidade" ? "" : window._readUnitValue("rc-punit");
  const pfactorInput = Number((el("rc-pfactor")?el("rc-pfactor").value:"")||0);

  if (!qty || qty<=0) { toast("Quantidade invalida.","error"); return; }

  const factor = pfactorInput>0 ? pfactorInput : (p.conversionFactor||1);
  if (!factor || factor<=0) { toast("Fator de conversao invalido.","error"); return; }

  const rawTotal = qty * factor;
  const totalUnits = Math.floor(rawTotal);
  const costPerUnit = totalUnits>0 ? (qty*price)/totalUnits : 0;

  const doConfirm = async () => {
    // Se a unidade de compra/fator foi configurada inline, grava no produto
    // ANTES de chamar o servico central, para ele usar o valor certo.
    const updateData = {};
    if (punitInput) updateData.purchaseUnit = punitInput;
    if (pfactorInput>0) updateData.conversionFactor = pfactorInput;
    if (Object.keys(updateData).length) {
      const ex = await db.get("products", id);
      await db.put("products", { ...ex, ...updateData, updatedAt:new Date().toISOString() });
    }

    const { purchaseService } = await import("../services.js");
    await purchaseService.register({
      productId: id, qty, unitCost: price, location: dest,
    });

    if (!updateCost) {
      // O servico ja actualiza costPrice por padrao; se o utilizador
      // desmarcou "Atualizar preco de custo", reverte para o valor anterior.
      const before = await db.get("products", id);
      if (before) await db.put("products", { ...before, costPrice: p.costPrice||0 });
    }

    toast("Compra registada.","success");
    closeModal();
    products = await db.getAll("products");
    renderStats(); renderList();
  };

  const punitLabel = punitInput || p.purchaseUnit || p.unit || "unid";
  const saleUnit = p.unit || "unid";
  const totalCost = qty * price;

  const recapHTML =
    `<div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:8px">Adicionar ${fmtNum(totalUnits)} ${pluralizeUnit(saleUnit,totalUnits)} ao stock?</div>` +
    ((punitInput || p.purchaseUnit) ?
      `<div style="font-size:12px;color:var(--text4);margin-bottom:14px">${fmtNum(qty)} ${pluralizeUnit(punitLabel,qty)} &times; ${fmtNum(factor)} ${pluralizeUnit(saleUnit,factor)} = ${fmtNum(totalUnits)} ${pluralizeUnit(saleUnit,totalUnits)}</div>` : "") +
    `<div style="border-top:1px solid var(--border2);padding-top:12px">
       <div style="font-size:20px;font-weight:800;color:var(--text)">${fmtKzClean(totalCost)}${price===0?" — gratuito/amostra":""}</div>
       <div style="font-size:11px;color:var(--text3);margin-top:2px">Total a pagar</div>
     </div>`;

  confirmDialog(recapHTML, doConfirm, { title:"Confirmar compra", confirmText:"Sim, adicionar ao stock", icon:"package" });
};

