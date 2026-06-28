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
    if (!confirm("Arquivar todos os fiados pagos?")) return;
    var all = await db.getAll("fiado");
    var paid = all.filter(f => f.status === "paid");
    for (var i = 0; i < paid.length; i++) await db.delete("fiado", paid[i].id);
    toast(paid.length + " fiado(s) arquivados.", "success");
    await renderList();
  };
  await renderList();
}

async function renderList() {
  const all   = await db.getAll("fiado");
  const open  = all.filter(f => f.status === "open");
  const total = open.reduce((a, f) => a + (f.amount || 0), 0);
  const uniqueClients = [...new Set(open.map(f => f.clientName))].length;
  const paidCount = all.filter(f => f.status === "paid").length;

  // Summary bar
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

  // Arquivar pagos
  var clearBar = document.getElementById("fiados-clear-bar");
  if (!clearBar) {
    clearBar = document.createElement("div");
    clearBar.id = "fiados-clear-bar";
    var totalBar = el("fiados-total-bar");
    if (totalBar && totalBar.parentNode)
      totalBar.parentNode.insertBefore(clearBar, totalBar.nextSibling);
  }
  clearBar.innerHTML = paidCount > 0
    ? `<button onclick="window._clearPaidFiados()" class="fiados-archive-btn">
        <i data-lucide="archive" style="width:13px;height:13px"></i>
        Arquivar ${paidCount} pago${paidCount > 1 ? "s" : ""}
       </button>`
    : "";
  refreshIcons(clearBar);

  const q = (val("fiados-search") || "").toLowerCase();
  const filtered = all.filter(f => {
    const ms = (f.clientName || "").toLowerCase().includes(q);
    const mf = fiadoFilter === "all" || f.status === fiadoFilter ||
               (fiadoFilter === "open" && f.status === "open") ||
               (fiadoFilter === "paid" && f.status === "paid");
    return ms && mf;
  });

  // Agrupar por cliente
  const grouped = {};
  filtered.forEach(f => {
    const k = f.clientName;
    if (!grouped[k]) grouped[k] = { clientName: k, entries: [], totalOpen: 0 };
    grouped[k].entries.push(f);
    if (f.status === "open") grouped[k].totalOpen += f.amount || 0;
  });

  const groups = Object.values(grouped).sort((a, b) => b.totalOpen - a.totalOpen);
  const listEl = el("fiados-list");
  listEl.innerHTML = "";

  if (!groups.length) {
    listEl.innerHTML =
      `<div class="empty-state">
        <i data-lucide="wallet"></i>
        <div class="empty-state-title">Nenhum fiado</div>
        <div class="empty-state-sub">Os fiados registados aparecem aqui.</div>
      </div>`;
    refreshIcons(listEl); return;
  }

  groups.forEach(g => {
    const isSaldado  = g.totalOpen === 0;
    const openCount  = g.entries.filter(e => e.status === "open").length;
    const lastEntry  = [...g.entries].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const firstOpen  = g.entries.find(e => e.status === "open");
    const initial    = g.clientName.charAt(0).toUpperCase();

    const card = document.createElement("div");
    card.className = "fc";
    card.onclick = () => window._openFiadoCliente(encodeURIComponent(g.clientName));

    card.innerHTML =
      // Header
      `<div class="fc-header">
        <div class="fc-avatar" style="background:${isSaldado ? "var(--success-light);color:var(--success)" : "var(--primary-light);color:var(--primary)"}">
          ${initial}
        </div>
        <div class="fc-info">
          <div class="fc-name">${g.clientName}</div>
          <div class="fc-meta">
            ${g.entries.length} ${g.entries.length === 1 ? "entrada" : "entradas"}
            · ${fmtDate(lastEntry.date)}
          </div>
        </div>
        <div class="fc-right">
          ${isSaldado
            ? `<div class="fc-saldo"><i data-lucide="check-circle" style="width:14px;height:14px"></i> Saldado</div>`
            : `<div class="fc-total">${fmt(g.totalOpen)}</div>
               <div class="fc-open-count">${openCount} por pagar</div>`
          }
        </div>
      </div>` +
      // Linha de acção rápida
      (!isSaldado && firstOpen
        ? `<div class="fc-action">
            <div>
              <div class="fc-action-val">${fmt(firstOpen.amount)}</div>
              <div class="fc-action-date">${fmtDate(firstOpen.date)}${firstOpen.notes ? " · " + firstOpen.notes : ""}</div>
            </div>
            ${openCount === 1
              ? `<button class="fc-pay-btn" onclick="event.stopPropagation();window._openPayModal(${firstOpen.id})">
                  <i data-lucide="check" style="width:13px;height:13px"></i> Pagar
                </button>`
              : `<button class="fc-detail-btn" onclick="event.stopPropagation();window._openFiadoCliente('${encodeURIComponent(g.clientName)}')">
                  Ver ${openCount} →
                </button>`
            }
          </div>`
        : ""
      );

    listEl.appendChild(card);
  });

  refreshIcons(listEl);
}

window._openFiadoCliente = async (encodedName) => {
  const name    = decodeURIComponent(encodedName);
  const all     = await db.getAll("fiado");
  const entries = all.filter(f => f.clientName === name)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalOpen = entries.filter(f => f.status === "open")
    .reduce((a, f) => a + (f.amount || 0), 0);
  const encodedN = encodeURIComponent(name);

  openModal(name,
    `<div class="fc-modal-header ${totalOpen > 0 ? "fc-modal-open" : "fc-modal-saldo"}">
      <div>
        <div class="fc-modal-label">${totalOpen > 0 ? "Em dívida" : "Tudo pago"}</div>
        <div class="fc-modal-total">${fmt(totalOpen)}</div>
      </div>
      ${totalOpen > 0
        ? `<button class="btn btn-success btn-sm" onclick="window._pagarTudo('${encodedN}')">
             <i data-lucide="check-check"></i> Pagar tudo
           </button>`
        : `<div style="font-size:28px;color:var(--success)">✓</div>`
      }
    </div>

    <div class="fc-modal-entries">
      ${entries.map(e => `
        <div class="fc-modal-entry">
          <div class="fc-modal-entry-left">
            <div class="fc-modal-entry-val ${e.status === "open" ? "fc-val-open" : "fc-val-paid"}">
              ${fmt(e.amount)}
              ${e.status === "paid" ? `<span class="fc-paid-tag">✓ Pago</span>` : ""}
            </div>
            <div class="fc-modal-entry-date">${fmtDate(e.date)}${e.notes ? " · " + e.notes : ""}</div>
          </div>
          ${e.status === "open"
            ? `<button class="btn btn-outline btn-sm" onclick="window._openPayModal(${e.id})">
                <i data-lucide="check"></i> Pagar
               </button>`
            : `<div class="fc-paid-icon"><i data-lucide="check-circle" style="width:18px;height:18px;color:var(--success)"></i></div>`
          }
        </div>`).join("")}
    </div>

    <div class="form-actions">
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
  const entries = all.filter(f => f.clientName === name && f.status === "open");
  for (const e of entries)
    await db.put("fiado", { ...e, status: "paid", paidAt: new Date().toISOString() });
  toast("Todos os fiados de " + name + " pagos.", "success");
  closeModal(); renderList();
};

window._addFiadoCliente = (encodedName) => {
  closeModal();
  openFiadoAdd(decodeURIComponent(encodedName));
};

function openFiadoAdd(prefillName = "") {
  openModal("Registar Fiado",
    `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="field">
        <label>Nome do cliente *</label>
        <input id="fa-name" value="${prefillName}" placeholder="Ex: João Silva" autocomplete="off"/>
      </div>
      <div class="field">
        <label>Valor (Kz) *</label>
        <input type="number" id="fa-amt" placeholder="0" min="0"/>
      </div>
      <div class="field">
        <label>Notas (opcional)</label>
        <input id="fa-notes" placeholder="Ex: Compra de arroz..."/>
      </div>
    </div>
    <div class="form-actions" style="margin-top:16px">
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
    notes: el("fa-notes").value.trim(),
    date: new Date().toISOString(),
    status: "open", userId: getUser().id,
  });
  toast("Fiado registado.", "success");
  closeModal(); renderList();
};

window._openPayModal = async (id) => {
  const e = await db.get("fiado", id);
  openModal("Registar Pagamento",
    `<div class="fc-pay-modal-header">
      <div>
        <div class="fc-pay-modal-label">Cliente</div>
        <div class="fc-pay-modal-name">${e.clientName}</div>
      </div>
      <div style="text-align:right">
        <div class="fc-pay-modal-label">Em dívida</div>
        <div class="fc-pay-modal-val">${fmt(e.amount)}</div>
      </div>
    </div>
    <div class="field" style="margin-bottom:20px">
      <label>Valor a pagar</label>
      <input type="number" id="pay-amt" value="${e.amount}" min="0"
        style="font-size:20px;font-weight:700;text-align:center;padding:14px"/>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-success btn-full" onclick="window._confirmPay(${id},${e.amount})">
        <i data-lucide="check"></i> Confirmar pagamento
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._confirmPay = async (id, fullAmt) => {
  const e   = await db.get("fiado", id);
  const amt = Number(el("pay-amt").value);
  if (isNaN(amt) || amt <= 0 || amt > e.amount) { toast("Valor inválido.", "error"); return; }
  if (amt < e.amount) {
    await db.put("fiado", { ...e, amount: e.amount - amt });
    await db.add("fiado", {
      clientName: e.clientName, amount: amt,
      notes: "Pagamento parcial", date: new Date().toISOString(),
      status: "paid", userId: getUser().id,
    });
  } else {
    await db.put("fiado", { ...e, status: "paid", paidAt: new Date().toISOString() });
  }
  toast("Pagamento registado.", "success");
  closeModal(); renderList();
};

window._closeModal = closeModal;
