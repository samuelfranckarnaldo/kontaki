import { db } from "../db.js";
import { fmt, fmtDate, el, val, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser } from "../auth.js";

let fiadoFilter = "all";

export async function initFiados() {
  el("fiados-search").oninput = renderList;
  document.querySelectorAll("#fiados-filter-pills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      fiadoFilter = btn.dataset.filter;
      document.querySelectorAll("#fiados-filter-pills .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderList();
    });
  });
  window._openFiadoAdd = openFiadoAdd;
  window._clearPaidFiados = async function() {
    if (!confirm("Eliminar todos os fiados pagos? Esta acção não pode ser desfeita.")) return;
    var all = await db.getAll("fiado");
    var paid = all.filter(function(f){ return f.status==="paid"; });
    for (var i=0;i<paid.length;i++) await db.delete("fiado", paid[i].id);
    const { toast } = await import("../toast.js");
    toast(paid.length + " fiado(s) pagos removidos.", "success");
    await renderList();
  };
  await renderList();
}

async function renderList() {
  const all    = await db.getAll("fiado");
  const total  = all.filter(f => f.status==="open").reduce((a,f) => a+(f.amount||0), 0);
  const count  = all.filter(f => f.status==="open").length;

  var all2 = await db.getAll("fiado");
  var paidCount = all2.filter(function(f){ return f.status==="paid"; }).length;
  var clearBar = document.getElementById("fiados-clear-bar");
  if (!clearBar) {
    clearBar = document.createElement("div");
    clearBar.id = "fiados-clear-bar";
    var totalBar = el("fiados-total-bar");
    if (totalBar && totalBar.parentNode) totalBar.parentNode.insertBefore(clearBar, totalBar.nextSibling);
  }
  clearBar.innerHTML = paidCount > 0
    ? '<button onclick="window._clearPaidFiados()" style="width:100%;padding:10px;background:#f4f4f5;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;color:#71717a;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:6px"><i data-lucide="trash-2" style="width:13px;height:13px"></i> Limpar ' + paidCount + ' fiado(s) pago(s)</button>'
    : "";
  if (clearBar) refreshIcons(clearBar);

  el("fiados-total-bar").innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center;
                 background:#fff;border-radius:12px;padding:12px 14px;
                 box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <div>
        <div style="font-size:11px;color:#71717a;font-weight:600;text-transform:uppercase;
                    letter-spacing:.4px">Total em aberto</div>
        <div style="font-size:18px;font-weight:700;color:#dc2626;margin-top:2px">${fmt(total)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#71717a;font-weight:600;text-transform:uppercase;
                    letter-spacing:.4px">Clientes</div>
        <div style="font-size:18px;font-weight:700;color:#5b21b6;margin-top:2px">${count}</div>
      </div>
    </div>`;

  const q = (val("fiados-search")||"").toLowerCase();
  const filtered = all.filter(f => {
    const ms = (f.clientName || "").toLowerCase().includes(q);
    const mf = fiadoFilter==="all" || f.status===fiadoFilter;
    return ms && mf;
  });

  const grouped = filtered.reduce((acc,f) => {
    const k = f.clientName;
    if (!acc[k]) acc[k] = { clientName:k, entries:[], total:0 };
    acc[k].entries.push(f);
    if (f.status==="open") acc[k].total += f.amount||0;
    return acc;
  }, {});

  const groups = Object.values(grouped).sort((a,b) => b.total - a.total);

  if (!groups.length) {
    el("fiados-list").innerHTML =
      `<div class="empty-state">
        <i data-lucide="credit-card" style="width:36px;height:36px;color:#a1a1aa;margin-bottom:10px"></i>
        <div class="empty-state-title">Nenhum fiado</div>
        <div class="empty-state-sub">Os fiados registados aparecem aqui.</div>
      </div>`;
    refreshIcons(el("fiados-list")); return;
  }

  el("fiados-list").innerHTML = groups.map(g => `
    <div class="fiado-cliente" onclick="window._openFiadoCliente('${encodeURIComponent(g.clientName)}')">
      <div class="fiado-cliente-header">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:#ede9fe;
                      color:#5b21b6;font-size:15px;font-weight:700;display:flex;
                      align-items:center;justify-content:center;flex-shrink:0">
            ${g.clientName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="fiado-cliente-name">${g.clientName}</div>
            <div style="font-size:11px;color:#71717a">${g.entries.length} entradas</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="fiado-cliente-total">${g.total > 0 ? fmt(g.total) : ""}</div>
          ${g.total===0 ? `<span style="font-size:12px;font-weight:700;color:#16a34a">✓ Saldado</span>` : ""}
        </div>
      </div>
      ${g.entries.slice(0,2).map(e => `
        <div class="fiado-entry">
          <div>
            <div class="fiado-entry-amt" style="color:${e.status==="open"?"#dc2626":"#71717a"}">
              ${fmt(e.amount)}
              ${e.status==="paid" ? `<span style="font-size:10px;color:#16a34a;margin-left:4px">✓ Pago</span>` : ""}
            </div>
            <div class="fiado-entry-info">${fmtDate(e.date)}${e.notes?" · "+e.notes:""}</div>
          </div>
          ${e.status==="open" ?
            `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();window._openPayModal(${e.id})">
              <i data-lucide="check"></i> Pagar
            </button>` : ""}
        </div>`).join("")}
      ${g.entries.length > 2 ?
        `<div style="font-size:11px;color:#71717a;padding:6px 0;text-align:center">
          +${g.entries.length-2} mais entradas
        </div>` : ""}
    </div>`).join("");

  refreshIcons(el("fiados-list"));
}

window._openFiadoCliente = async (encodedName) => {
  const name    = decodeURIComponent(encodedName);
  const all     = await db.getAll("fiado");
  const entries = all.filter(f => f.clientName === name).reverse();
  const total   = entries.filter(f => f.status==="open").reduce((a,f) => a+(f.amount||0), 0);

  openModal(name,
    `<div style="background:${total>0?"#fee2e2":"#dcfce7"};border-radius:12px;padding:14px;
                 margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:11px;color:${total>0?"#dc2626":"#16a34a"};font-weight:700;
                    text-transform:uppercase;letter-spacing:.4px">Em dívida</div>
        <div style="font-size:22px;font-weight:700;color:${total>0?"#dc2626":"#16a34a"}">${fmt(total)}</div>
      </div>
      ${total>0 ?
        `<button class="btn btn-success btn-sm" onclick="window._pagarTudo('${encodeURIComponent(name)}')">
          <i data-lucide="check-check"></i> Pagar tudo
        </button>` :
        `<span style="font-size:24px">✓</span>`}
    </div>
    <div style="margin-bottom:14px">
      ${entries.map(e => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:10px 0;border-bottom:1px solid #f4f4f5">
          <div>
            <div style="font-size:13px;font-weight:600;color:${e.status==="open"?"#dc2626":"#71717a"}">
              ${fmt(e.amount)}
              ${e.status==="paid"?`<span style="font-size:10px;color:#16a34a;margin-left:4px">✓ Pago</span>`:""}
            </div>
            <div style="font-size:11px;color:#71717a">${fmtDate(e.date)}${e.notes?" · "+e.notes:""}</div>
          </div>
          ${e.status==="open" ?
            `<button class="btn btn-ghost btn-sm" onclick="window._openPayModal(${e.id})">Pagar</button>` : ""}
        </div>`).join("")}
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>
      <button class="btn btn-outline btn-full" onclick="window._addFiadoCliente('${encodeURIComponent(name)}')">
        <i data-lucide="plus"></i> Novo fiado
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._pagarTudo = async (encodedName) => {
  const name    = decodeURIComponent(encodedName);
  const all     = await db.getAll("fiado");
  const entries = all.filter(f => f.clientName===name && f.status==="open");
  for (const e of entries) {
    await db.put("fiado", { ...e, status:"paid", paidAt:new Date().toISOString() });
  }
  toast("Todos os fiados de "+name+" pagos.", "success");
  closeModal();
  renderList();
};

window._addFiadoCliente = (encodedName) => {
  const name = decodeURIComponent(encodedName);
  closeModal();
  openFiadoAdd(name);
};

function openFiadoAdd(prefillName = "") {
  openModal("Registar Fiado",
    `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label>Nome do Cliente *</label>
        <input id="fa-name" value="${prefillName}" placeholder="Ex: João Silva"/>
      </div>
      <div class="field"><label>Valor (Kz) *</label>
        <input type="number" id="fa-amt" placeholder="0"/>
      </div>
      <div class="field"><label>Notas</label>
        <input id="fa-notes" placeholder="Opcional..."/>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._saveFiado()">
        <i data-lucide="save"></i> Registar
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
}

window._saveFiado = async () => {
  const name = el("fa-name").value.trim();
  const amt  = Number(el("fa-amt").value);
  if (!name || !amt) { toast("Nome e valor são obrigatórios.", "error"); return; }
  await db.add("fiado", {
    clientName: name, amount: amt,
    notes: el("fa-notes").value,
    date: new Date().toISOString(),
    status: "open", userId: getUser().id,
  });
  toast("Fiado registado.", "success");
  closeModal(); renderList();
};

window._openPayModal = async (id) => {
  const e = await db.get("fiado", id);
  openModal("Registar Pagamento",
    `<div style="background:#f4f4f5;border-radius:12px;padding:14px;margin-bottom:16px;
                 display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:11px;color:#71717a">Cliente</div>
        <div style="font-size:15px;font-weight:700">${e.clientName}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#71717a">Em dívida</div>
        <div style="font-size:18px;font-weight:700;color:#dc2626">${fmt(e.amount)}</div>
      </div>
    </div>
    <div class="field" style="margin-bottom:20px">
      <label>Valor a pagar</label>
      <input type="number" id="pay-amt" value="${e.amount}"/>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-success btn-full" onclick="window._confirmPay(${id},${e.amount})">
        <i data-lucide="check"></i> Confirmar
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._confirmPay = async (id, fullAmt) => {
  const e   = await db.get("fiado", id);
  const amt = Number(el("pay-amt").value);
  if (isNaN(amt)||amt<=0||amt>e.amount) { toast("Valor inválido.", "error"); return; }
  if (amt < e.amount) {
    await db.put("fiado", { ...e, amount: e.amount-amt });
    await db.add("fiado", { clientName:e.clientName, amount:amt, notes:"Pagamento parcial", date:new Date().toISOString(), status:"paid", userId:getUser().id });
  } else {
    await db.put("fiado", { ...e, status:"paid", paidAt:new Date().toISOString() });
  }
  toast("Pagamento registado.", "success");
  closeModal(); renderList();
};

window._closeModal = closeModal;
