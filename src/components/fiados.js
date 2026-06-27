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
    ? '<button onclick="window._clearPaidFiados()" class="fiados-archive-btn"><i data-lucide="archive" style="width:13px;height:13px"></i> Arquivar ' + paidCount + ' pago' + (paidCount>1?"s":"") + '</button>'
    : "";
  if (clearBar) refreshIcons(clearBar);

  const uniqueClients = [...new Set(all.filter(f=>f.status==="open").map(f=>f.clientName))].length;
  el("fiados-total-bar").innerHTML =
    `<div class="fiados-summary-card">
      <div class="fiados-summary-item">
        <div class="fiados-summary-label">Em aberto</div>
        <div class="fiados-summary-val" style="color:var(--warning)">${fmt(total)}</div>
      </div>
      <div class="fiados-summary-divider"></div>
      <div class="fiados-summary-item" style="text-align:right">
        <div class="fiados-summary-label">Clientes</div>
        <div class="fiados-summary-val" style="color:var(--primary)">${uniqueClients}</div>
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

  el("fiados-list").innerHTML = "";
  groups.forEach(function(g) {
    const lastEntry = g.entries.sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
    const openCount = g.entries.filter(e=>e.status==="open").length;
    const isSaldado = g.total === 0;
    const div = document.createElement("div");
    div.className = "fiado-card";
    div.onclick = function() { window._openFiadoCliente(encodeURIComponent(g.clientName)); };

    div.innerHTML =
      "<div class='fiado-card-header'>" +
        "<div class='fiado-card-avatar'>" + g.clientName.charAt(0).toUpperCase() + "</div>" +
        "<div class='fiado-card-info'>" +
          "<div class='fiado-card-name'>" + g.clientName + "</div>" +
          "<div class='fiado-card-meta'>" +
            (openCount > 0 ? openCount + " em aberto" : "Saldado") +
            " · " + fmtDate(lastEntry.date) +
          "</div>" +
        "</div>" +
        "<div class='fiado-card-right'>" +
          (isSaldado
            ? "<span class='fiado-badge-pago'>✓ Saldado</span>"
            : "<div class='fiado-card-total'>" + fmt(g.total) + "</div>"
          ) +
        "</div>" +
      "</div>" +
      // Entradas recentes
      g.entries.slice(0,2).map(function(e) {
        return "<div class='fiado-entry-row'>" +
          "<div class='fiado-entry-left'>" +
            "<div class='fiado-entry-val " + (e.status==="open"?"fiado-entry-open":"fiado-entry-paid") + "'>" +
              fmt(e.amount) +
              (e.status==="paid" ? " <span class='fiado-entry-check'>✓ Pago</span>" : "") +
            "</div>" +
            "<div class='fiado-entry-date'>" + fmtDate(e.date) + (e.notes?" · "+e.notes:"") + "</div>" +
          "</div>" +
          (e.status==="open"
            ? "<button class='fiado-pay-btn' onclick='event.stopPropagation();window._openPayModal(" + e.id + ")'>" +
              "<i data-lucide='check' style='width:13px;height:13px'></i> Pagar</button>"
            : "") +
        "</div>";
      }).join("") +
      (g.entries.length > 2
        ? "<div class='fiado-more'>+ " + (g.entries.length-2) + " mais entradas</div>"
        : "");

    el("fiados-list").appendChild(div);
  });

  refreshIcons(el("fiados-list"));
}

window._openFiadoCliente = async (encodedName) => {
  const name    = decodeURIComponent(encodedName);
  const all     = await db.getAll("fiado");
  const entries = all.filter(f => f.clientName === name).reverse();
  const total   = entries.filter(f => f.status==="open").reduce((a,f) => a+(f.amount||0), 0);

  const encodedN = encodeURIComponent(name);
  openModal(name,
    // Header com total
    `<div class="fiado-modal-header ${total>0?"fiado-modal-open":"fiado-modal-saldo"}">
      <div>
        <div class="fiado-modal-header-label">${total>0?"Em dívida":"Saldado"}</div>
        <div class="fiado-modal-header-val">${fmt(total)}</div>
      </div>
      ${total>0
        ? `<button class="btn btn-success btn-sm" onclick="window._pagarTudo('${encodedN}')">
             <i data-lucide="check-check"></i> Pagar tudo
           </button>`
        : `<div style="font-size:32px">✓</div>`}
    </div>` +

    // Lista de entradas
    `<div class="fiado-modal-entries">` +
    entries.map(e =>
      `<div class="fiado-modal-entry">
        <div>
          <div class="fiado-modal-entry-val ${e.status==="open"?"fiado-entry-open":"fiado-entry-paid"}">
            ${fmt(e.amount)}
            ${e.status==="paid"?`<span class="fiado-entry-check">✓ Pago</span>`:""}
          </div>
          <div class="fiado-modal-entry-date">${fmtDate(e.date)}${e.notes?" · "+e.notes:""}</div>
        </div>
        ${e.status==="open"
          ? `<button class="btn btn-outline btn-sm" onclick="window._openPayModal(${e.id})">
               <i data-lucide="check"></i> Pagar
             </button>`
          : ""}
      </div>`
    ).join("") +
    `</div>` +

    `<div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>
      <button class="btn btn-primary btn-full" onclick="window._addFiadoCliente('${encodedN}')">
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
