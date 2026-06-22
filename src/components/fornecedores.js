import { db } from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
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

  const totalCompras = purchases.reduce((a,p) => a+(p.total||0), 0);
  const mesAtual     = new Date().toISOString().slice(0,7);
  const comprasMes   = purchases.filter(p => (p.date || "").startsWith(mesAtual)).reduce((a,p) => a+(p.total||0), 0);

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
        const comprasSupp = purchases.filter(p => p.supplierId === s.id);
        const totalSupp   = comprasSupp.reduce((a,p) => a+(p.total||0), 0);
        return `<div style="padding:13px 14px;border-bottom:1px solid #f4f4f5;
                             display:flex;justify-content:space-between;align-items:center"
                     onclick="window._openSupplierDetail(${s.id})">
          <div>
            <div style="font-size:14px;font-weight:600">${s.name}</div>
            <div style="font-size:11px;color:#71717a;margin-top:2px">
              ${s.phone||""} ${s.contact ? " · "+s.contact : ""}
            </div>
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
    (purchases.length === 0 ?
      `<div style="font-size:13px;color:#a1a1aa;text-align:center;padding:20px">Nenhuma compra registada.</div>` :
      `<div class="list-card">` +
      purchases.slice(-10).reverse().map(p => {
        const supp = suppliers.find(s => s.id === p.supplierId);
        return `<div style="padding:12px 14px;border-bottom:1px solid #f4f4f5">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:13px;font-weight:600">${(supp&&supp.name)||"Fornecedor"}</div>
              <div style="font-size:11px;color:#71717a;margin-top:2px">${fmtDate(p.date)}</div>
              <div style="font-size:11px;color:#71717a;margin-top:2px">
                ${(p.items||[]).map(i => i.productName+"×"+i.qty).join(", ")}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
              <div style="font-size:14px;font-weight:700;color:#dc2626">${fmt(p.total)}</div>
              <button onclick="window._editCompra(${p.id})" style="background:none;border:none;color:#5b21b6;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">Editar</button>
            </div>
          </div>
        </div>`;
      }).join("") +
      `</div>`);

  refreshIcons(el("fornecedores-content"));
}

function openFornecedorForm(s = {}) {
  openModal(s.id ? "Editar Fornecedor" : "Novo Fornecedor",
    `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label>Nome *</label><input id="sf-name" value="${s.name||""}" placeholder="Ex: Distribuidora ABC"/></div>
      <div class="field"><label>Telefone</label><input id="sf-phone" value="${s.phone||""}" placeholder="923 000 000"/></div>
      <div class="field"><label>Contacto</label><input id="sf-contact" value="${s.contact||""}" placeholder="Nome do responsável"/></div>
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
  openModal(s.name,
    `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${s.phone   ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f4f4f5"><span style="color:#71717a;font-size:13px">Telefone</span><span style="font-weight:600">${s.phone}</span></div>` : ""}
      ${s.contact ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f4f4f5"><span style="color:#71717a;font-size:13px">Contacto</span><span style="font-weight:600">${s.contact}</span></div>` : ""}
      ${s.notes   ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f4f4f5"><span style="color:#71717a;font-size:13px">Notas</span><span style="font-weight:600">${s.notes}</span></div>` : ""}
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>
      <button class="btn btn-danger btn-full" onclick="window._deleteSupplier(${id})"><i data-lucide="trash-2"></i> Eliminar fornecedor</button>
      <button class="btn btn-outline btn-full" onclick="window._editSupplier(${id})">
        <i data-lucide="edit-3"></i> Editar
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

async function openCompraForm() {
  const [suppliers, products] = await Promise.all([
    db.getAll("suppliers"),
    db.getAll("products").then(p => p.filter(x => x.active)),
  ]);

  if (!suppliers.length) { toast("Adiciona um fornecedor primeiro.", "error"); return; }

  openModal("Registar Compra",
    `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="field">
        <label>Fornecedor *</label>
        <select id="cp-supplier">
          ${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Produto *</label>
        <select id="cp-product">
          ${products.map(p => `<option value="${p.id}">${p.name}</option>`).join("")}
        </select>
      </div>
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
      <div class="field">
        <label>Destino</label>
        <select id="cp-dest">
          <option value="warehouse">Armazém</option>
          <option value="shop">Loja</option>
        </select>
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
}

window._saveCompra = async () => {
  const suppId  = Number(el("cp-supplier").value);
  const prodId  = Number(el("cp-product").value);
  const qty     = Number(el("cp-qty").value);
  const cost    = Number(el("cp-cost").value);
  const dest    = el("cp-dest").value;

  if (!qty || !cost) { toast("Quantidade e preço são obrigatórios.", "error"); return; }

  const product = await db.get("products", prodId);
  const supplier= await db.get("suppliers", suppId);

  // Actualiza stock
  if (dest === "warehouse") {
    await db.put("products", { ...product, warehouseStock: (product.warehouseStock||0) + qty, costPrice: cost });
  } else {
    await db.put("products", { ...product, stock: (product.stock||0) + qty, costPrice: cost });
  }

  // Regista compra
  await db.add("purchases", {
    supplierId:   suppId,
    supplierName: supplier.name,
    items: [{ productId: prodId, productName: product.name, qty, unitCost: cost }],
    total:   qty * cost,
    dest,
    notes:   el("cp-notes").value,
    userId:  getUser().id,
    date:    new Date().toISOString(),
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
    if (!confirm("Este fornecedor tem compras registadas e nao pode ser eliminado (preserva auditoria). Queres desactiva-lo? Deixa de aparecer na lista mas o historico fica guardado.")) return;
    await window._deactivateSupplier(id);
    return;
  }

  if (!confirm("Eliminar este fornecedor? Esta accao nao pode ser desfeita.")) return;
  await db.delete("suppliers", id);
  toast("Fornecedor eliminado.", "success");
  closeModal();
  renderFornecedores();
};

window._deactivateSupplier = async (id) => {
  const s = await db.get("suppliers", id);
  if (!s) return;
  await db.put("suppliers", { ...s, active: false, deactivatedAt: new Date().toISOString() });
  toast("Fornecedor desactivado.", "success");
  closeModal();
  renderFornecedores();
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
