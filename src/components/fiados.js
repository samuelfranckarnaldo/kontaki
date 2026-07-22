import { db } from "../db.js";
import { fmt, fmtDate, el, val, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser } from "../auth.js";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isOverdue(e) {
  if (e.status !== "open" || !e.dueDate) return false;
  return new Date(e.dueDate) < startOfToday();
}

export function daysOverdue(e) {
  if (!isOverdue(e)) return 0;
  const diff = startOfToday() - new Date(new Date(e.dueDate).setHours(0,0,0,0));
  return Math.max(1, Math.round(diff / 86400000));
}

export function overdueBadge(e) {
  if (!isOverdue(e)) return "";
  const d = daysOverdue(e);
  return `<span class="fc-badge-overdue">Atrasado há ${d} ${d === 1 ? "dia" : "dias"}</span>`;
}

export function waLink(phone, msg) {
  const clean = (phone || "").replace(/\D/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
}

function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

window._liveFormatAmount = (input) => {
  const raw = input.value.replace(/\D/g, "");
  input.value = raw ? groupThousands(raw) : "";
};

function parseAmountInput(id) {
  const raw = (el(id)?.value || "").replace(/\s/g, "");
  return Number(raw);
}

window._confirmReceiveAll = (encodedName, total) => {
  const name = decodeURIComponent(encodedName);
  openModal("",
    `<div class="m3-confirm">
      <div class="m3-confirm-icon"><i data-lucide="banknote"></i></div>
      <div class="m3-confirm-title">Receber ${fmt(total)}?</div>
      <div class="m3-confirm-body">
        Vais marcar toda a dívida de <b>${name}</b> como paga. Esta ação não pode ser desfeita.
      </div>
      <div class="m3-confirm-actions">
        <button class="m3-btn-text" onclick="window._closeModal()">Cancelar</button>
        <button class="m3-btn-filled" onclick="window._pagarTudo('${encodedName}')">Confirmar</button>
      </div>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._pagarTudo = async (encodedName) => {
  const { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }
  const name    = decodeURIComponent(encodedName);
  const all     = await db.getAll("fiado");
  const entries = all.filter(f => f.clientName === name && f.status === "open");
  for (const e of entries) {
    const wasLate = isOverdue(e);
    await db.put("fiado", { ...e, status: "paid", paidAt: new Date().toISOString(), paidLate: wasLate });
  }
  toast("Todos os fiados de " + name + " recebidos.", "success");
  closeModal();
  if (window._refreshClientesTab) window._refreshClientesTab();
};

async function openFiadoAdd(prefillName = "", prefillPhone = "") {
  const { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }

  let phoneVal = prefillPhone;
  if (!phoneVal && prefillName) {
    const all = await db.getAll("fiado");
    const found = [...all].reverse().find(f => f.clientName === prefillName && f.phone);
    if (found) phoneVal = found.phone;
  }

  openModal("Registar Crédito",
    `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="field">
        <label>Nome do cliente *</label>
        <input id="fa-name" value="${prefillName}" placeholder="Ex: João Silva" autocomplete="off"/>
      </div>
      <div class="field">
        <label>Valor (Kz) *</label>
        <input type="text" inputmode="numeric" id="fa-amt" placeholder="0" oninput="window._liveFormatAmount(this)"/>
      </div>
      <div class="field">
        <label>Telefone (opcional)</label>
        <input id="fa-phone" value="${phoneVal}" placeholder="Ex: 923456789" autocomplete="off"/>
      </div>
      <div class="field">
        <label>Vencimento (opcional)</label>
        <input type="date" id="fa-duedate"/>
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
window._openFiadoAdd = openFiadoAdd;

window._saveFiado = async () => {
  const { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }
  const name = el("fa-name").value.trim();
  const amt  = parseAmountInput("fa-amt");
  if (!name || !amt) { toast("Nome e valor são obrigatórios.", "error"); return; }
  await db.add("fiado", {
    clientName: name, amount: amt,
    phone: el("fa-phone").value.trim(),
    dueDate: el("fa-duedate").value ? new Date(el("fa-duedate").value).toISOString() : null,
    notes: el("fa-notes").value.trim(),
    date: new Date().toISOString(),
    status: "open", userId: getUser().id,
  });
  toast("Fiado registado.", "success");
  closeModal();
  if (window._refreshClientesTab) window._refreshClientesTab();
};

// ── Editar Fiado ──────────────────────────────────────────────────────────────
window._openEditFiado = async (id) => {
  const e = await db.get("fiado", id);
  if (!e) return;
  const dueVal = e.dueDate ? new Date(e.dueDate).toISOString().slice(0,10) : "";
  const efFormatted = groupThousands(String(e.amount));

  openModal("Editar Fiado",
    `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="field">
        <label>Valor (Kz) *</label>
        <input type="text" inputmode="numeric" id="ef-amt" value="${efFormatted}" oninput="window._liveFormatAmount(this)"/>
      </div>
      <div class="field">
        <label>Vencimento</label>
        <input type="date" id="ef-duedate" value="${dueVal}"/>
      </div>
      <div class="field">
        <label>Notas</label>
        <input id="ef-notes" value="${e.notes || ""}" placeholder="Ex: Compra de arroz..."/>
      </div>
    </div>
    <div class="m3-edit-hint">
      <i data-lucide="info" style="width:13px;height:13px"></i>
      Alterações a este fiado ficam registadas na hora abaixo.
    </div>
    <div class="form-actions" style="margin-top:14px">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._saveEditFiado(${id})">
        <i data-lucide="save"></i> Guardar alterações
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._saveEditFiado = async (id) => {
  const e = await db.get("fiado", id);
  if (!e) return;
  const amt = parseAmountInput("ef-amt");
  if (isNaN(amt) || amt <= 0) { toast("Valor inválido.", "error"); return; }
  const dueRaw = el("ef-duedate").value;
  await db.put("fiado", {
    ...e,
    amount: amt,
    dueDate: dueRaw ? new Date(dueRaw).toISOString() : null,
    notes: el("ef-notes").value.trim(),
    editedAt: new Date().toISOString(),
  });
  toast("Fiado atualizado.", "success");
  closeModal();
  if (window._refreshClientesTab) window._refreshClientesTab();
};

// ── Anular Fiado (motivo obrigatório) ──────────────────────────────────────────
window._openCancelFiado = async (id) => {
  const e = await db.get("fiado", id);
  if (!e) return;

  openModal("",
    `<div class="m3-confirm">
      <div class="m3-confirm-icon m3-confirm-icon-danger"><i data-lucide="ban"></i></div>
      <div class="m3-confirm-title">Anular fiado de ${fmt(e.amount)}?</div>
      <div class="m3-confirm-body">
        Esta ação remove o valor da dívida de <b>${e.clientName}</b>. O motivo é obrigatório e fica guardado no histórico.
      </div>
      <div class="field" style="width:100%;text-align:left;margin-bottom:16px">
        <label>Motivo *</label>
        <input id="cf-reason" placeholder="Ex: Venda cancelada, erro ao registar..." autocomplete="off"/>
      </div>
      <div class="m3-confirm-actions">
        <button class="m3-btn-text" onclick="window._closeModal()">Voltar</button>
        <button class="m3-btn-filled m3-btn-filled-danger" onclick="window._confirmCancelFiado(${id})">Anular fiado</button>
      </div>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._confirmCancelFiado = async (id) => {
  const reason = (el("cf-reason")?.value || "").trim();
  if (!reason) { toast("O motivo é obrigatório.", "error"); return; }
  const e = await db.get("fiado", id);
  if (!e) return;
  await db.put("fiado", {
    ...e, status: "cancelled",
    cancelReason: reason,
    cancelledAt: new Date().toISOString(),
  });
  toast("Fiado anulado.", "success");
  closeModal();
  if (window._refreshClientesTab) window._refreshClientesTab();
};

window._openPayModal = async (id) => {
  const e = await db.get("fiado", id);
  const initFormatted = groupThousands(String(e.amount));
  openModal("Receber Pagamento",
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
    <div class="field" style="margin-bottom:10px">
      <label>Valor a receber</label>
      <input type="text" inputmode="numeric" id="pay-amt" value="${initFormatted}" oninput="window._liveFormatAmount(this)"
        style="font-size:20px;font-weight:700;text-align:center;padding:14px"/>
    </div>
    <div class="fc-pay-quick-row">
      <button class="fc-pay-quick-btn" onclick="window._setPayAmt(${e.amount},0.25)">25%</button>
      <button class="fc-pay-quick-btn" onclick="window._setPayAmt(${e.amount},0.5)">50%</button>
      <button class="fc-pay-quick-btn" onclick="window._setPayAmt(${e.amount},1)">Tudo</button>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary btn-full" onclick="window._confirmPay(${id},${e.amount})">
        <i data-lucide="check"></i> Confirmar recebimento
      </button>
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._setPayAmt = (full, pct) => {
  el("pay-amt").value = groupThousands(String(Math.round(full * pct)));
};

window._confirmPay = async (id, fullAmt) => {
  const { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }
  const e   = await db.get("fiado", id);
  const amt = parseAmountInput("pay-amt");
  if (isNaN(amt) || amt <= 0 || amt > e.amount) { toast("Valor inválido.", "error"); return; }
  const wasLate = isOverdue(e);
  if (amt < e.amount) {
    await db.put("fiado", { ...e, amount: e.amount - amt });
    await db.add("fiado", {
      clientName: e.clientName, amount: amt,
      notes: "Pagamento parcial", date: new Date().toISOString(),
      status: "paid", paidLate: wasLate, userId: getUser().id,
    });
  } else {
    await db.put("fiado", { ...e, status: "paid", paidAt: new Date().toISOString(), paidLate: wasLate });
  }
  toast("Pagamento registado.", "success");
  closeModal();
  if (window._refreshClientesTab) window._refreshClientesTab();
};

window._closeModal = closeModal;
