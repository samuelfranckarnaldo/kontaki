import { db } from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal, confirmDialog } from "../modal.js";
import { getUser } from "../auth.js";

export async function loadFornecedores() {
  const btn = el("btn-back-fornecedores");
  if (btn) btn.onclick = () => window._showSubpage(null);

  const btnAdd = el("btn-fornecedor-add");
  if (btnAdd) btnAdd.onclick = openFornecedorForm;

  const btnCompra = el("btn-compra-add");
  if (btnCompra) btnCompra.onclick = openCompraForm;

  await renderFornecedores();
}

async function renderFornecedores() {
  const [allSuppliers, purchases] = await Promise.all([
    db.getAll("suppliers"),
    db.getAll("purchases"),
  ]);
  const suppliers = allSuppliers.filter(function(s){ return s.active !== false; });

  const comprasAtivas = purchases.filter(function(p){ return p.archived !== true; });
  const mesAtual      = new Date().toISOString().slice(0,7);
  const comprasMes    = comprasAtivas.filter(p => (p.date || "").startsWith(mesAtual)).reduce((a,p) => a+(p.total||0), 0);

  el("fornecedores-content").innerHTML =
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="stat-card" style="border-left:3px solid #5b21b6">
        <div class="stat-label" style="color:#5b21b6">Fornecedores</div>
        <div class="stat-val" style="color:#5b21b6">${suppliers.length}</div>
      </div>
      <div class="stat-card" style="border-left:3px solid #dc2626">
        <div class="stat-label" style="color:#dc2626">Compras este mês</div>
        <div class="stat-val" style="color:#dc2626;font-size:14px">${fmt(comprasMes)}</div>
      </div>
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
              <div style="font-size:14px;font-weight:700;color:#dc2626">${fmt(p.total)}</div>
              <button onclick="window._editCompra(${p.id})" style="background:none;border:none;color:#5b21b6;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">Editar</button>
              <button onclick="window._archivePurchase(${p.id})" style="background:none;border:none;color:#71717a;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">Arquivar</button>
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
      <button onclick="window._deleteSupplier(${id})" style="width:100%;padding:10px;background:none;border:none;color:#dc2626;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
        <i data-lucide="trash-2" style="width:14px;height:14px"></i> Eliminar fornecedor
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
var _cpState = { supplierId: null, productId: null, dest: "warehouse", payment: "paid" };
var _cpSuppliers = [];
var _cpProducts = [];

const DEST_OPTIONS = [
  { value: "warehouse", label: "Armazém" },
  { value: "shop",       label: "Loja" },
];
const PAYMENT_OPTIONS = [
  { value: "paid",   label: "Pago no acto" },
  { value: "credit", label: "A Crédito" },
];

async function openCompraForm() {
  const [suppliers, products] = await Promise.all([
    db.getAll("suppliers"),
    db.getAll("products").then(p => p.filter(x => x.active)),
  ]);

  if (!suppliers.length) { toast("Adiciona um fornecedor primeiro.", "error"); return; }

  _cpSuppliers = suppliers;
  _cpProducts  = products;
  _cpState = {
    supplierId: suppliers[0].id,
    productId:  products.length ? products[0].id : null,
    dest: "warehouse",
    payment: "paid",
  };

  openModal("Registar Compra",
    `<div style="display:flex;flex-direction:column;gap:14px">
      ${cselField("Fornecedor *", "cp-supplier-trigger", "Seleccionar fornecedor")}
      ${cselField("Produto *", "cp-product-trigger", products.length ? "Seleccionar produto" : "Nenhum produto disponível")}
      <div class="field-row">
        <div class="field">
          <label>Quantidade *</label>
          <input type="number" id="cp-qty" placeholder="0" min="1"/>
        </div>
        <div class="field">
          <label>Preço unitário (Kz) *</label>
          <input type="number" id="cp-cost" placeholder="0"/>
        </div>
      </div>
      ${cselField("Destino", "cp-dest-trigger", "Armazém")}
      ${cselField("Forma de Pagamento", "cp-payment-trigger", "Pago no acto")}
      <div class="field" id="cp-paid-wrap" style="display:none">
        <label>Valor já pago (Kz)</label>
        <input type="number" id="cp-paid" placeholder="0" min="0"/>
      </div>
      <div class="field">
        <label>Notas</label>
        <input id="cp-notes" placeholder="Opcional..."/>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._saveCompra()">
        <i data-lucide="package-plus"></i> Registar
      </button>
    </div>`);
  refreshIcons(el("modal-box"));

  _setCselLabel("cp-supplier-trigger", suppliers.find(s=>s.id===_cpState.supplierId));
  _setCselLabel("cp-product-trigger", products.find(p=>p.id===_cpState.productId), true);
  _setCselLabel("cp-dest-trigger", DEST_OPTIONS[0]);
  _setCselLabel("cp-payment-trigger", PAYMENT_OPTIONS[0]);

  var suppTrigger = document.getElementById("cp-supplier-trigger");
  if (suppTrigger) suppTrigger.onclick = function() {
    openCselSheet("Fornecedor", suppliers.map(s => ({ value: s.id, label: s.name })), function(opt) {
      _cpState.supplierId = Number(opt.value);
      _setCselLabelDirect("cp-supplier-trigger", opt.label);
    });
  };

  var prodTrigger = document.getElementById("cp-product-trigger");
  if (prodTrigger) prodTrigger.onclick = function() {
    if (!products.length) { toast("Nenhum produto disponível.", "error"); return; }
    openCselSheet("Produto", products.map(p => ({ value: p.id, label: p.name })), function(opt) {
      _cpState.productId = Number(opt.value);
      _setCselLabelDirect("cp-product-trigger", opt.label);
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
  const prodId  = _cpState.productId;
  const qty     = Number(el("cp-qty").value);
  const cost    = Number(el("cp-cost").value);
  const dest    = _cpState.dest;
  const payMethod = _cpState.payment;
  const total     = qty * cost;
  const amountPaid = payMethod === "paid" ? total : Number((el("cp-paid")||{}).value || 0);

  if (!prodId) { toast("Selecciona um produto.", "error"); return; }
  if (!qty || !cost) { toast("Quantidade e preço são obrigatórios.", "error"); return; }
  if (amountPaid > total) { toast("O valor pago não pode ser maior que o total.", "error"); return; }

  const supplier = await db.get("suppliers", suppId);
  const { purchaseService } = await import("../services.js");

  await purchaseService.register({
    productId: prodId, qty, unitCost: cost, location: dest,
    supplierId: suppId, supplierName: supplier.name,
    paymentStatus: amountPaid >= total ? "paid" : (amountPaid > 0 ? "partial" : "pending"),
    amountPaid, notes: el("cp-notes").value, userId: getUser().id,
  });

  toast("Compra registada. Stock actualizado.", "success");
  closeModal();
  renderFornecedores();
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
  const item = (p.items||[])[0] || {};
  closeModal();
  openModal("Editar Compra",
    `<div style="background:#f4f4f5;border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:12px;color:#71717a">Produto</div>
      <div style="font-size:14px;font-weight:700">${item.productName||"?"}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="field-row">
        <div class="field"><label>Quantidade</label><input type="number" id="ec-qty" value="${item.qty||0}" min="1"/></div>
        <div class="field"><label>Custo Unitário (Kz)</label><input type="number" id="ec-cost" value="${item.unitCost||0}" min="0"/></div>
      </div>
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
  const p = await db.get("purchases", purchaseId);
  if (!p) return;
  const item = (p.items||[])[0] || {};
  const newQty  = Number(el("ec-qty").value);
  const newCost = Number(el("ec-cost").value);
  const newNotes = el("ec-notes").value;

  if (!newQty || newQty <= 0) { toast("Quantidade inválida.", "error"); return; }

  const diffQty = newQty - (item.qty||0);
  const product = await db.get("products", item.productId);

  if (product && diffQty !== 0) {
    const { addStockMovement } = await import("../services.js");
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

  await db.put("purchases", {
    ...p,
    items: [{ ...item, qty:newQty, unitCost:newCost }],
    total: newQty * newCost,
    notes: newNotes,
    editedAt: new Date().toISOString(),
  });

  toast("Compra actualizada.", "success");
  closeModal();
  renderFornecedores();
};
