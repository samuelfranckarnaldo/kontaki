import { db } from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal, confirmDialog } from "../modal.js";
import { getUser } from "../auth.js";

async function _refreshStockIfVisible() {
  const stockPage = document.getElementById("subpage-stock");
  const isVisible = stockPage && stockPage.style.display === "block";
  if (isVisible) {
    const mod = await import("./estoque.js");
    if (mod.loadEstoquePage) await mod.loadEstoquePage();
  }
}

let _fornSearchQuery = "";

export async function loadFornecedores() {
  const btn = el("btn-back-fornecedores");
  if (btn) btn.onclick = () => window._showSubpage(null);

  const btnAdd = el("btn-fornecedor-add");
  if (btnAdd) btnAdd.onclick = openFornecedorForm;

  const btnCompra = el("btn-compra-add");
  if (btnCompra) btnCompra.onclick = openCompraForm;

  const searchEl = el("fornecedores-search");
  if (searchEl) {
    searchEl.value = _fornSearchQuery;
    searchEl.oninput = () => {
      _fornSearchQuery = searchEl.value;
      renderFornecedores();
    };
  }

  await renderFornecedores();
}

function _fornStatCard({label, value, sub, color, icon}) {
  return `<div class="prod-stat-card" style="cursor:default">` +
    `<div class="prod-stat-icon" style="background:${color}20;color:${color}"><i data-lucide="${icon}"></i></div>` +
    `<div class="prod-stat-val2${String(value).length>=13?" prod-stat-val2--xs":String(value).length>9?" prod-stat-val2--sm":""}" style="color:${color}">${value}</div>` +
    `<div class="prod-stat-label2">${label}</div>` +
    `<div class="prod-stat-sub">${sub}</div>` +
    `</div>`;
}

async function renderFornecedores() {
  const [allSuppliers, purchases] = await Promise.all([
    db.getAll("suppliers"),
    db.getAll("purchases"),
  ]);
  const q = (_fornSearchQuery || "").trim().toLowerCase();
  const suppliers = allSuppliers.filter(function(s){
    if (s.active === false) return false;
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.phone||"").includes(q) || (s.contact||"").toLowerCase().includes(q);
  });
  const matchedSupplierIds = suppliers.map(function(s){ return s.id; });

  let comprasAtivas = purchases.filter(function(p){ return p.archived !== true; });
  if (q) comprasAtivas = comprasAtivas.filter(function(p){ return matchedSupplierIds.indexOf(p.supplierId) !== -1; });
  const mesAtual      = new Date().toISOString().slice(0,7);
  const comprasMes    = comprasAtivas.filter(p => (p.date || "").startsWith(mesAtual)).reduce((a,p) => a+(p.total||0), 0);

  const saldoTotal = comprasAtivas.reduce(function(a,p){ return a + Math.max((p.total||0)-(p.amountPaid||0), 0); }, 0);

  el("fornecedores-content").innerHTML =
    `<div class="hist-hero" style="margin-bottom:10px">
      <div class="hist-hero-label">Saldo em aberto</div>
      <div class="hist-hero-val${String(fmt(saldoTotal)).length>=16?" hist-hero-val--xs":String(fmt(saldoTotal)).length>=13?" hist-hero-val--sm":""}">${fmt(saldoTotal)}</div>
      <div class="hist-hero-sub" style="margin-top:10px;display:flex;gap:18px">
        <span><strong>${suppliers.length}</strong> fornecedores</span>
        <span><strong>${fmt(comprasMes)}</strong> este mês</span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      ${_fornStatCard({ label:"Fornecedores", value:suppliers.length, sub:"activos", color:"var(--primary)", icon:"truck" })}
      ${_fornStatCard({ label:"Compras (mês)", value:fmt(comprasMes), sub:"total gasto", color:"var(--info)", icon:"shopping-bag" })}
    </div>` +

    // Lista fornecedores
    `<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;
                 letter-spacing:.4px;margin-bottom:8px">Fornecedores</div>` +
    (suppliers.length === 0 ?
      `<div class="empty-state">
        <div class="empty-state-title">Nenhum fornecedor</div>
        <div class="empty-state-sub">Adiciona o primeiro fornecedor.</div>
      </div>` :
      `<div class="list-card" style="margin-bottom:10px">` +
      suppliers.map(s => {
        const comprasSupp = comprasAtivas.filter(p => p.supplierId === s.id);
        const totalSupp   = comprasSupp.reduce((a,p) => a+(p.total||0), 0);
        const saldoSupp   = comprasSupp.reduce((a,p) => a+((p.total||0)-(p.amountPaid||0)), 0);
        return `<div style="padding:13px 14px;border-bottom:1px solid #f4f4f5;
                             display:flex;justify-content:space-between;align-items:center"
                     onclick="window._openSupplierDetail(${s.id})">
          <div>
            <div style="font-size:14px;font-weight:600">${s.name}</div>
            <div style="font-size:11px;color:#71717a;margin-top:2px">
              ${s.phone||""} ${s.contact ? " · "+s.contact : ""}
            </div>
            ${saldoSupp > 0 ? `<div style="font-size:11px;color:#dc2626;font-weight:700;margin-top:2px">Deves ${fmt(saldoSupp)}</div>` : ""}
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:700;color:#5b21b6">${fmt(totalSupp)}</div>
            <div style="font-size:10px;color:#71717a">${comprasSupp.length} compras</div>
          </div>
        </div>`;
      }).join("") +
      `</div>`) +

    // Últimas compras
    `<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;
                 letter-spacing:.4px;margin:10px 0 8px">Últimas compras</div>` +
    (comprasAtivas.length === 0 ?
      `<div style="font-size:13px;color:#a1a1aa;text-align:center;padding:20px">Nenhuma compra registada.</div>` :
      `<div class="list-card">` +
      comprasAtivas.slice(-10).reverse().map(p => {
        const supp = suppliers.find(s => s.id === p.supplierId);
        const saldo = (p.total||0) - (p.amountPaid||0);
        return `<div style="padding:12px 14px;border-bottom:1px solid #f4f4f5">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:13px;font-weight:600">${(supp&&supp.name)||"Fornecedor"}</div>
              <div style="font-size:11px;color:#71717a;margin-top:2px">${fmtDate(p.date)}</div>
              <div style="font-size:11px;color:#71717a;margin-top:2px">
                ${(p.items||[]).map(i => i.productName+"×"+i.qty).join(", ")}
              </div>
              ${saldo > 0 ? `<div style="font-size:11px;color:#dc2626;font-weight:700;margin-top:2px">Falta pagar: ${fmt(saldo)}</div>` : `<div style="font-size:11px;color:#16a34a;font-weight:700;margin-top:2px">Pago</div>`}
            </div>
            <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
              <div style="font-size:14px;font-weight:700;color:${saldo>0?"#dc2626":"var(--primary)"}">${fmt(p.total)}</div>
              <button class="produto-menu-btn" onclick="window._openCompraMenu(${p.id})" title="Mais opções" style="margin-top:2px">
                <i data-lucide="more-vertical"></i>
              </button>
            </div>
          </div>
        </div>`;
      }).join("") +
      `</div>`);

  refreshIcons(el("fornecedores-content"));
}

// ── COMPONENTE: SELECT CUSTOMIZADO (bottom sheet) ────────────────────────────
function ensureCselStyle() {
  if (document.getElementById("csel-style")) return;
  var style = document.createElement("style");
  style.id = "csel-style";
  style.textContent =
    "@keyframes cselFadeIn { from { opacity:0 } to { opacity:1 } }" +
    "@keyframes cselSlideUp { from { transform:translateY(100%) } to { transform:translateY(0) } }" +
    ".csel-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; " +
    "padding:11px 14px; border:1.5px solid #e4e4e7; border-radius:10px; background:#fff; " +
    "font-family:inherit; font-size:14px; color:#18181b; cursor:pointer; text-align:left; }" +
    ".csel-trigger:active { border-color:#5b21b6; background:#fafafa; }" +
    ".csel-trigger .csel-placeholder { color:#a1a1aa; }" +
    ".csel-option:active { background:#f5f3ff !important; }";
  document.head.appendChild(style);
}

function cselField(label, triggerId, placeholder) {
  return `<div class="field">
    <label>${label}</label>
    <button type="button" class="csel-trigger" id="${triggerId}">
      <span class="csel-placeholder">${placeholder}</span>
      <i data-lucide="chevron-down" style="width:16px;height:16px;color:#a1a1aa;flex-shrink:0"></i>
    </button>
  </div>`;
}

function openCselSheet(title, options, onPick) {
  ensureCselStyle();
  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-end;animation:cselFadeIn .2s ease";

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-height:70vh;
                display:flex;flex-direction:column;animation:cselSlideUp .25s ease">
      <div style="padding:16px 20px;border-bottom:1px solid #f4f4f5;display:flex;
                  justify-content:space-between;align-items:center;flex-shrink:0">
        <div style="font-size:15px;font-weight:700;color:#18181b">${title}</div>
        <button id="csel-close" style="background:#f4f4f5;border:none;width:30px;height:30px;
                border-radius:50%;cursor:pointer;color:#71717a;display:flex;align-items:center;
                justify-content:center">
          <i data-lucide="x" style="width:16px;height:16px"></i>
        </button>
      </div>
      <div style="overflow-y:auto;padding:8px 0">
        ${options.map(function(o) {
          return `<button type="button" class="csel-option" data-value="${o.value}"
                  style="width:100%;display:flex;align-items:center;justify-content:space-between;
                  padding:13px 20px;background:none;border:none;cursor:pointer;font-family:inherit;
                  text-align:left;font-size:14px;color:#18181b">
            <span>${o.label}${o.sub ? `<span style="display:block;font-size:11px;color:#a1a1aa;margin-top:1px">${o.sub}</span>` : ""}</span>
          </button>`;
        }).join("")}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  refreshIcons(overlay);

  overlay.querySelector("#csel-close").onclick = function() { overlay.remove(); };
  overlay.querySelectorAll(".csel-option").forEach(function(btn) {
    btn.onclick = function() {
      var opt = options.find(function(o){ return String(o.value) === btn.getAttribute("data-value"); });
      overlay.remove();
      onPick(opt);
    };
  });
}

// ── FORNECEDOR (formulário) ──────────────────────────────────────────────────
function openFornecedorForm(s = {}) {
  openModal(s.id ? "Editar Fornecedor" : "Novo Fornecedor",
    `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label>Nome *</label><input id="sf-name" value="${s.name||""}" placeholder="Ex: Distribuidora ABC"/></div>
      <div class="field"><label>Telefone</label><input id="sf-phone" value="${s.phone||""}" placeholder="923 000 000"/></div>
      <div class="field"><label>Pessoa de Contacto</label><input id="sf-contact" value="${s.contact||""}" placeholder="Ex: João, gerente de vendas"/></div>
      <div class="field"><label>Notas</label><input id="sf-notes" value="${s.notes||""}" placeholder="Opcional..."/></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._saveSupplier(${s.id||0})">
        <i data-lucide="save"></i> Guardar
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
}

window._openSupplierDetail = async (id) => {
  const s = await db.get("suppliers", id);
  const allExpenses = await db.getAll("expenses");
  const despesasLigadas = allExpenses
    .filter(e => e.supplierId === id && !e.archived)
    .sort((a,b) => new Date(b.date) - new Date(a.date));
  const totalDespesas = despesasLigadas.reduce((a,e) => a + (e.amount||0), 0);

  const despesasHtml = despesasLigadas.length
    ? `<div style="max-height:180px;overflow-y:auto;margin-top:4px">` +
        despesasLigadas.slice(0,20).map(e =>
          `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f4f4f5;font-size:12.5px">
            <span style="color:#3f3f46">${e.description} <span style="color:#a1a1aa">· ${fmtDate(e.date)}</span></span>
            <strong style="color:#3f3f46;flex-shrink:0;margin-left:8px">${fmt(e.amount)}</strong>
          </div>`
        ).join("") +
      `</div>`
    : `<div style="font-size:12.5px;color:#a1a1aa;padding:8px 0">Nenhuma despesa ligada a este fornecedor ainda.</div>`;

  openModal(s.name,
    `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${s.phone   ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f4f4f5"><span style="color:#71717a;font-size:13px">Telefone</span><span style="font-weight:600">${s.phone}</span></div>` : ""}
      ${s.contact ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f4f4f5"><span style="color:#71717a;font-size:13px">Pessoa de Contacto</span><span style="font-weight:600">${s.contact}</span></div>` : ""}
      ${s.notes   ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f4f4f5"><span style="color:#71717a;font-size:13px">Notas</span><span style="font-weight:600">${s.notes}</span></div>` : ""}
    </div>
    <div style="background:#fafafa;border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
        <span style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">Despesas ligadas</span>
        <strong style="font-size:15px;color:var(--primary)">${fmt(totalDespesas)}</strong>
      </div>
      ${despesasHtml}
    </div>
    <div class="form-actions">
      <button class="btn btn-primary btn-full" onclick="window._editSupplier(${id})">
        <i data-lucide="edit-3"></i> Editar
      </button>
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>
      <button onclick="window._deleteSupplier(${id})" style="width:100%;background:none;border:none;color:var(--danger);font-size:var(--text-xs);cursor:pointer;font-family:inherit;padding:var(--space-1);text-align:center">
        Eliminar fornecedor
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._editSupplier = async (id) => {
  closeModal();
  const s = await db.get("suppliers", id);
  openFornecedorForm(s);
};

window._saveSupplier = async (id) => {
  const name = (el("sf-name") ? el("sf-name").value.trim() : "");
  if (!name) { toast("O nome é obrigatório.", "error"); return; }
  const data = {
    name,
    phone:   (el("sf-phone") ? el("sf-phone").value.trim() : "")   || "",
    contact: (el("sf-contact") ? el("sf-contact").value.trim() : "") || "",
    notes:   (el("sf-notes") ? el("sf-notes").value.trim() : "")   || "",
  };
  if (id) { const ex = await db.get("suppliers",id); await db.put("suppliers",{...ex,...data}); toast("Fornecedor actualizado.","success"); }
  else    { await db.add("suppliers",{...data,createdAt:new Date().toISOString()}); toast("Fornecedor adicionado.","success"); }
  closeModal();
  renderFornecedores();
};

// ── COMPRA (formulário com selects customizados) ─────────────────────────────
var _cpState = { supplierId: null, dest: "warehouse", payment: "paid", items: [], itemSeq: 0 };
var _cpSuppliers = [];
var _cpProducts = [];

const DEST_OPTIONS = [
  { value: "warehouse", label: "Armazém" },
  { value: "shop",       label: "Loja" },
];
const PAYMENT_OPTIONS = [
  { value: "dinheiro",      label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "multicaixa",    label: "Multicaixa" },
  { value: "credit",        label: "A Crédito" },
];

export async function openCompraForm(prefill) {
  const [suppliers, products] = await Promise.all([
    db.getAll("suppliers"),
    db.getAll("products").then(p => p.filter(x => x.active)),
  ]);

  _cpSuppliers = suppliers;
  _cpProducts  = products;
  _cpState = {
    supplierId: suppliers.length ? suppliers[0].id : null,
    dest: (prefill && prefill.dest) || "warehouse",
    payment: "paid",
    items: [],
    itemSeq: 0,
    dateStr: new Date().toISOString().slice(0,10),
    invoiceRef: "",
    notes: "",
  };

  if (prefill && prefill.productId) {
    const rowId = _cpAddItemRow(prefill.productId);
    const row = _cpState.items.find(function(it){ return it.rowId === rowId; });
    if (row && prefill.qty) row.qty = prefill.qty;
    if (row) {
      const prod = products.find(function(p){ return p.id === prefill.productId; });
      if (prod && prod.costPrice) row.unitCost = prod.costPrice;
    }
  } else {
    _cpAddItemRow(products.length ? products[0].id : null);
  }
  _cpRenderForm();
}

function _cpRenderForm() {
  const suppliers = _cpSuppliers;
  const products  = _cpProducts;

  openModal("Registar Compra",
    `<div style="display:flex;flex-direction:column;gap:14px">
      ${cselField("Fornecedor", "cp-supplier-trigger", suppliers.length ? "Seleccionar fornecedor" : "Sem fornecedor (compra avulsa)")}
      <div class="field-row">
        <div class="field">
          <label>Data da compra</label>
          <input type="date" id="cp-date" value="${_cpState.dateStr}" oninput="window._cpFieldSet('dateStr',this.value)"/>
        </div>
        <div class="field">
          <label>Referência / Factura</label>
          <input id="cp-invoice" placeholder="Opcional..." value="${_cpState.invoiceRef}" oninput="window._cpFieldSet('invoiceRef',this.value)"/>
        </div>
      </div>
      <div>
        <label style="font-size:12px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:8px">Produtos *</label>
        <div id="cp-items-list"></div>
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:8px" onclick="window._cpAddItem()">
          <i data-lucide="plus"></i> Adicionar produto
        </button>
      </div>
      <div style="text-align:right;font-size:15px;font-weight:800;color:var(--primary)" id="cp-total-display">Total: 0,00 Kz</div>
      ${cselField("Destino", "cp-dest-trigger", "Armazém")}
      ${cselField("Forma de Pagamento", "cp-payment-trigger", "Pago no acto")}
      <div class="field" id="cp-paid-wrap" style="display:none">
        <label>Valor já pago (Kz)</label>
        <input type="number" id="cp-paid" placeholder="0" min="0"/>
      </div>
      <div class="field">
        <label>Notas</label>
        <input id="cp-notes" placeholder="Opcional..." value="${_cpState.notes}" oninput="window._cpFieldSet('notes',this.value)"/>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._cpCancelForm()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._saveCompra()">
        <i data-lucide="package-plus"></i> Registar
      </button>
    </div>`);
  refreshIcons(el("modal-box"));

  if (suppliers.length) {
    _setCselLabel("cp-supplier-trigger", suppliers.find(s=>s.id===_cpState.supplierId));
  }
  _setCselLabel("cp-dest-trigger", DEST_OPTIONS[0]);
  _setCselLabel("cp-payment-trigger", PAYMENT_OPTIONS[0]);
  _cpRenderItems();

  var suppTrigger = document.getElementById("cp-supplier-trigger");
  if (suppTrigger) suppTrigger.onclick = function() {
    var opts = [{ value: "", label: "Sem fornecedor (compra avulsa)" }].concat(
      suppliers.map(s => ({ value: s.id, label: s.name }))
    );
    openCselSheet("Fornecedor", opts, function(opt) {
      _cpState.supplierId = opt.value === "" ? null : Number(opt.value);
      _setCselLabelDirect("cp-supplier-trigger", opt.label);
    });
  };

  var destTrigger = document.getElementById("cp-dest-trigger");
  if (destTrigger) destTrigger.onclick = function() {
    openCselSheet("Destino", DEST_OPTIONS, function(opt) {
      _cpState.dest = opt.value;
      _setCselLabelDirect("cp-dest-trigger", opt.label);
    });
  };

  var payTrigger = document.getElementById("cp-payment-trigger");
  if (payTrigger) payTrigger.onclick = function() {
    openCselSheet("Forma de Pagamento", PAYMENT_OPTIONS, function(opt) {
      _cpState.payment = opt.value;
      _setCselLabelDirect("cp-payment-trigger", opt.label);
      var wrap = document.getElementById("cp-paid-wrap");
      if (wrap) wrap.style.display = opt.value === "credit" ? "block" : "none";
    });
  };
}

function _cpAddItemRow(productId) {
  var seq = _cpState.itemSeq++;
  _cpState.items.push({ rowId: seq, productId: productId || null, qty: 1, unitCost: 0 });
  return seq;
}

window._cpAddItem = function() {
  if (!_cpProducts.length) { toast("Nenhum produto disponível.", "error"); return; }
  var used = _cpState.items.map(function(it){ return it.productId; });
  var next = _cpProducts.find(function(p){ return used.indexOf(p.id) === -1; }) || _cpProducts[0];
  _cpAddItemRow(next.id);
  _cpRenderItems();
};

window._cpRemoveItem = function(rowId) {
  if (_cpState.items.length <= 1) { toast("A compra precisa de pelo menos um produto.", "error"); return; }
  _cpState.items = _cpState.items.filter(function(it){ return it.rowId !== rowId; });
  _cpRenderItems();
};

window._cpItemFieldChanged = function(rowId, field, value) {
  var it = _cpState.items.find(function(x){ return x.rowId === rowId; });
  if (!it) return;
  it[field] = field === "productId" ? Number(value) : Number(value) || 0;
  _cpUpdateTotal();
};

window._cpFieldSet = function(field, value) {
  _cpState[field] = value;
};

window._cpCancelForm = function() {
  closeModal();
};

var _cpCreatingProduct = false;

window._cpOpenProductPicker = function(rowId) {
  var opts = [{ value: "__new__", label: "+ Criar novo produto" }].concat(
    _cpProducts.map(function(p){ return { value: p.id, label: p.name }; })
  );
  openCselSheet("Produto", opts, function(opt) {
    if (opt.value === "__new__") {
      if (_cpCreatingProduct) { toast("Já há uma criação de produto em curso.", "info"); return; }
      _cpCreatingProduct = true;
      _cpCreateProductInline(rowId);
      return;
    }
    var it = _cpState.items.find(function(x){ return x.rowId === rowId; });
    if (!it) return;
    it.productId = Number(opt.value);
    _cpRenderItems();
  });
};
function _cpShowProcessing(msg) {
  if (!document.getElementById("cp-spin-style")) {
    var st = document.createElement("style");
    st.id = "cp-spin-style";
    st.textContent = "@keyframes cpSpin { to { transform:rotate(360deg); } }";
    document.head.appendChild(st);
  }
  openModal("",
    '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 0;gap:16px">' +
    '<div style="width:38px;height:38px;border:3px solid var(--border2);border-top-color:var(--primary);border-radius:50%;animation:cpSpin .7s linear infinite"></div>' +
    '<div style="font-size:13.5px;color:var(--text2);font-weight:600">' + msg + '</div>' +
    '</div>'
  );
}

async function _cpCreateProductInline(rowId) {
  const existingIds = _cpProducts.map(function(p){ return p.id; });
  const mod = await import("./produtos.js");
  mod.openProductForm({}, { hideStockFields: true });

  let attempts = 0;
  const poll = setInterval(function() {
    attempts++;
    const overlay = document.getElementById("modal-overlay");
    const stillOpen = overlay && overlay.style.display === "flex";
    if (stillOpen) {
      if (attempts > 600) clearInterval(poll);
      return;
    }
    clearInterval(poll);
    _cpFinishProductCreation(rowId, existingIds);
  }, 300);
}

async function _cpFinishProductCreation(rowId, existingIds) {
  _cpCreatingProduct = false;

  // Mostra logo o "a processar" para nao haver instante parado —
  // tempo minimo visivel de 500ms (tempo estavel observado + margem de seguranca).
  _cpShowProcessing("A criar o produto, aguarde um segundo...");
  const minVisible = new Promise(function(resolve){ setTimeout(resolve, 500); });

  const fetchWork = (async function() {
    const fresh = await db.getAll("products");
    _cpProducts = fresh.filter(function(p){ return p.active; });

    if (window._pfLastResolvedProductId != null) {
      const resolvedId = window._pfLastResolvedProductId;
      window._pfLastResolvedProductId = null;
      return fresh.find(function(p){ return p.id === resolvedId; }) || null;
    }

    return fresh
      .filter(function(p){ return existingIds.indexOf(p.id) === -1 && p.active; })
      .sort(function(a,b){ return new Date(b.createdAt) - new Date(a.createdAt); })[0];
  })();

  const [created] = await Promise.all([fetchWork, minVisible]);

  if (created) {
    const it = _cpState.items.find(function(x){ return x.rowId === rowId; });
    if (it) {
      it.productId = created.id;
      if (created.costPrice) it.unitCost = created.costPrice;
    }
  }
  _cpRenderForm();
  if (created) toast("Produto criado e seleccionado.", "success");
}

function _cpUpdateTotal() {
  var total = _cpState.items.reduce(function(a, it){ return a + (it.qty * it.unitCost); }, 0);
  var disp = document.getElementById("cp-total-display");
  if (disp) disp.textContent = "Total: " + fmt(total);
}

function _cpRenderItems() {
  var wrap = document.getElementById("cp-items-list");
  if (!wrap) return;
  wrap.innerHTML = _cpState.items.map(function(it) {
    var prod = _cpProducts.find(function(p){ return p.id === it.productId; });
    var name = prod ? prod.name : "Seleccionar produto";
    return '<div style="background:var(--bg);border-radius:10px;padding:10px;margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px;margin-bottom:8px">' +
      '<div class="field" style="flex:1;margin-bottom:0">' +
      '<label>Produto</label>' +
      '<button type="button" class="csel-trigger" onclick="window._cpOpenProductPicker(' + it.rowId + ')">' +
      '<span' + (prod ? '' : ' class="csel-placeholder"') + '>' + name + '</span>' +
      '<i data-lucide="chevron-down" style="width:16px;height:16px;color:#a1a1aa;flex-shrink:0"></i>' +
      '</button>' +
      '</div>' +
      (_cpState.items.length > 1 ? '<button type="button" onclick="window._cpRemoveItem(' + it.rowId + ')" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px;flex-shrink:0"><i data-lucide="trash-2" style="width:16px;height:16px"></i></button>' : '') +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Quantidade</label><input type="number" min="1" value="' + it.qty + '" oninput="window._cpItemFieldChanged(' + it.rowId + ',\'qty\',this.value)"/></div>' +
      '<div class="field"><label>Preço unitário (Kz)</label><input type="number" min="0" value="' + it.unitCost + '" oninput="window._cpItemFieldChanged(' + it.rowId + ',\'unitCost\',this.value)"/></div>' +
      '</div>' +
      '</div>';
  }).join("");
  refreshIcons(wrap);
  _cpUpdateTotal();
}

function _setCselLabel(triggerId, obj, isProduct) {
  var trigger = document.getElementById(triggerId);
  if (!trigger || !obj) return;
  var span = trigger.querySelector("span");
  if (span) { span.textContent = obj.name || obj.label; span.classList.remove("csel-placeholder"); }
}

function _setCselLabelDirect(triggerId, text) {
  var trigger = document.getElementById(triggerId);
  if (!trigger) return;
  var span = trigger.querySelector("span");
  if (span) { span.textContent = text; span.classList.remove("csel-placeholder"); }
}

window._saveCompra = async () => {
  const suppId  = _cpState.supplierId;
  const dest    = _cpState.dest;
  const payMethod = _cpState.payment;
  const dateVal = (el("cp-date")||{}).value;
  const invoiceRef = (el("cp-invoice")||{}).value || "";

  const items = _cpState.items;
  for (const it of items) {
    if (!it.productId) { toast("Selecciona o produto em todas as linhas.", "error"); return; }
    if (!it.qty || it.qty <= 0) { toast("Quantidade inválida numa das linhas.", "error"); return; }
    if (!it.unitCost || it.unitCost <= 0) { toast("Preço unitário inválido numa das linhas.", "error"); return; }
  }
  const seen = {};
  for (const it of items) {
    if (seen[it.productId]) { toast("O mesmo produto aparece em mais do que uma linha — junta-o numa só.", "error"); return; }
    seen[it.productId] = true;
  }

  const total = items.reduce((a, it) => a + it.qty * it.unitCost, 0);
  const amountPaid = payMethod === "credit" ? Number((el("cp-paid")||{}).value || 0) : total;
  if (amountPaid > total) { toast("O valor pago não pode ser maior que o total.", "error"); return; }

  const supplier = suppId ? await db.get("suppliers", suppId) : null;
  const { purchaseService } = await import("../services.js");
  const { postPurchaseJournal, postSupplierPaymentJournal } = await import("../pgc.js");

  const purchaseDate = dateVal ? new Date(dateVal + "T12:00:00").toISOString() : new Date().toISOString();

  const result = await purchaseService.register({
    items: items.map(it => ({ productId: it.productId, qty: it.qty, unitCost: it.unitCost })),
    location: dest,
    supplierId: suppId, supplierName: supplier ? supplier.name : "",
    paymentStatus: amountPaid >= total ? "paid" : (amountPaid > 0 ? "partial" : "pending"),
    amountPaid, notes: el("cp-notes").value, invoiceRef, date: purchaseDate,
    userId: getUser().id,
  });

  // Contabilidade — lançamentos de partidas dobradas (PGC)
  try {
    await postPurchaseJournal({
      purchaseId: result.purchaseId,
      date: purchaseDate,
      payMethod: payMethod,
      total: total,
    });
    if (payMethod === "credit" && amountPaid > 0) {
      await postSupplierPaymentJournal({
        purchaseId: result.purchaseId,
        date: purchaseDate,
        amountPaid: amountPaid,
      });
    }
  } catch (pgcErr) {
    console.error("Erro ao lançar compra na contabilidade:", pgcErr);
  }

  toast("Compra registada. Stock actualizado.", "success");
  closeModal();
  renderFornecedores();
  await _refreshStockIfVisible();
};

window._closeModal = closeModal;

window._deleteSupplier = async (id) => {
  const purchases = await db.getAll("purchases");
  const hasPurchases = purchases.some(function(p){ return p.supplierId === id; });

  if (hasPurchases) {
    confirmDialog(
      "Este fornecedor tem compras registadas e não pode ser eliminado (preserva auditoria). Queres desactivá-lo? Deixa de aparecer na lista mas o histórico fica guardado.",
      async function() { await window._deactivateSupplier(id); },
      { title: "Desactivar fornecedor", confirmText: "Desactivar" }
    );
    return;
  }

  confirmDialog(
    "Eliminar este fornecedor? Esta ação não pode ser desfeita.",
    async function() {
      await db.delete("suppliers", id);
      toast("Fornecedor eliminado.", "success");
      closeModal();
      renderFornecedores();
    },
    { title: "Eliminar fornecedor", confirmText: "Eliminar", danger: true }
  );
};

window._deactivateSupplier = async (id) => {
  const s = await db.get("suppliers", id);
  if (!s) return;
  await db.put("suppliers", { ...s, active: false, deactivatedAt: new Date().toISOString() });
  toast("Fornecedor desactivado.", "success");
  closeModal();
  renderFornecedores();
};

window._openCompraMenu = (purchaseId) => {
  const isAdmin = getUser().role === "admin";
  const items = [];
  if (isAdmin) {
    items.push({ icon: "edit-3", label: "Editar", desc: "Alterar quantidades e custos desta compra", iconClass: "hist-export-icon--edit", action: "window._editCompra(" + purchaseId + ")" });
  }
  items.push({ icon: "archive", label: "Arquivar", desc: "Sai da lista activa, fica guardada para auditoria", iconClass: "hist-export-icon--cancel", action: "window._archivePurchase(" + purchaseId + ")" });

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

window._archivePurchase = async (purchaseId) => {
  confirmDialog(
    "Arquivar esta compra? Deixa de aparecer na lista, mas fica guardada para auditoria.",
    async function() {
      const p = await db.get("purchases", purchaseId);
      if (!p) return;
      await db.put("purchases", { ...p, archived: true, archivedAt: new Date().toISOString() });
      toast("Compra arquivada.", "success");
      renderFornecedores();
    },
    { title: "Arquivar compra", confirmText: "Arquivar" }
  );
};

window._editCompra = async (purchaseId) => {
  const p = await db.get("purchases", purchaseId);
  if (!p) return;
  const items = p.items || [];
  closeModal();

  const rowsHtml = items.map(function(item, idx) {
    return '<div style="background:#f4f4f5;border-radius:10px;padding:12px;margin-bottom:10px">' +
      '<div style="font-size:12px;color:#71717a;margin-bottom:8px">' + (item.productName||"?") + '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Quantidade</label><input type="number" class="ec-qty" data-idx="' + idx + '" value="' + (item.qty||0) + '" min="1"/></div>' +
      '<div class="field"><label>Custo Unitário (Kz)</label><input type="number" class="ec-cost" data-idx="' + idx + '" value="' + (item.unitCost||0) + '" min="0"/></div>' +
      '</div>' +
      '</div>';
  }).join("");

  openModal("Editar Compra",
    `<div style="display:flex;flex-direction:column;gap:4px">
      ${rowsHtml}
      <div class="field"><label>Notas</label><input id="ec-notes" value="${p.notes||""}"/></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._saveEditCompra(${purchaseId})">
        <i data-lucide="save"></i> Guardar alterações
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._saveEditCompra = async (purchaseId) => {
  const _user = getUser();
  if (!_user || _user.role !== "admin") {
    toast("Apenas administradores podem editar compras.", "error");
    return;
  }

  const p = await db.get("purchases", purchaseId);
  if (!p) return;
  const items = p.items || [];
  const newNotes = el("ec-notes").value;

  const qtyInputs  = document.querySelectorAll(".ec-qty");
  const costInputs = document.querySelectorAll(".ec-cost");

  const updatedItems = [];
  let total = 0;
  const { addStockMovement } = await import("../services.js");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const qtyInput  = document.querySelector('.ec-qty[data-idx="' + idx + '"]');
    const costInput = document.querySelector('.ec-cost[data-idx="' + idx + '"]');
    const newQty  = Number(qtyInput ? qtyInput.value : item.qty);
    const newCost = Number(costInput ? costInput.value : item.unitCost);

    if (!newQty || newQty <= 0) { toast("Quantidade inválida em " + (item.productName||"um item") + ".", "error"); return; }

    const diffQty = newQty - (item.qty||0);
    const product = await db.get("products", item.productId);

    if (product && diffQty !== 0) {
      await addStockMovement({
        productId: item.productId, productName: item.productName,
        type: "adjustment", location: p.dest||"shop",
        qty: diffQty, reference: "purchase-edit#"+purchaseId,
        note: "Correcção de compra editada", sessionId: null,
      });
    }
    if (product && newCost !== item.unitCost) {
      await db.put("products", { ...product, costPrice: newCost });
    }

    updatedItems.push({ ...item, qty: newQty, unitCost: newCost });
    total += newQty * newCost;
  }

  await db.put("purchases", {
    ...p,
    items: updatedItems,
    total,
    notes: newNotes,
    editedAt: new Date().toISOString(),
  });

  toast("Compra actualizada.", "success");
  closeModal();
  renderFornecedores();
  await _refreshStockIfVisible();
};
