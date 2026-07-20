import { db } from "../db.js";
import { getUser, getSession } from "../auth.js";
import { refreshIcons, el } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { postOwnerContribution, postBankTransfer, getAccountBalance } from "../pgc.js";

var ADMIN_OPS = [
  { key: "aporte",       label: "Aporte de capital",        sub: "Entrada de capital do proprietário",   icon: "trending-up",        color: "#dcfce7", iconColor: "#16a34a" },
  { key: "retirada",     label: "Retirada do proprietário",  sub: "Saída de capital para o proprietário", icon: "trending-down",      color: "#fee2e2", iconColor: "#dc2626" },
  { key: "deposito",     label: "Depósito bancário",         sub: "Caixa → Banco",                        icon: "landmark",           color: "#dbeafe", iconColor: "#2563eb" },
  { key: "levantamento", label: "Levantamento bancário",     sub: "Banco → Caixa",                        icon: "landmark",           color: "#dbeafe", iconColor: "#2563eb" },
  { key: "sangria",      label: "Sangria de caixa",          sub: "Retirar dinheiro do caixa físico",     icon: "arrow-up-from-line", color: "#fef3c7", iconColor: "#d97706" },
  { key: "reforco",      label: "Reforço de caixa",          sub: "Repor dinheiro no caixa físico",       icon: "arrow-down-to-line", color: "#fef3c7", iconColor: "#d97706" },
  { key: "ajuste",       label: "Ajuste de caixa",           sub: "Regularizar diferenças",               icon: "sliders-horizontal", color: "#f4f4f5", iconColor: "#71717a" },
];

var CAIXA_OPS = [
  { key: "sangria", label: "Sangria de caixa", sub: "Retirar dinheiro do caixa físico",             icon: "arrow-up-from-line", color: "#fef3c7", iconColor: "#d97706" },
  { key: "reforco", label: "Reforço de caixa",  sub: "Repor dinheiro no caixa físico",               icon: "arrow-down-to-line", color: "#fef3c7", iconColor: "#d97706" },
  { key: "ajuste",  label: "Ajuste de caixa",   sub: "Regularizar diferenças (requer autorização)",  icon: "sliders-horizontal", color: "#f4f4f5", iconColor: "#71717a" },
];

export async function loadTesouraria() {
  var user = getUser();
  var wrap = document.getElementById("tesouraria-content");
  if (!wrap) return;

  var isAdmin = user && user.role === "admin";
  var ops = isAdmin ? ADMIN_OPS : CAIXA_OPS;

  wrap.innerHTML =
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">' +
    (isAdmin ? "Todas as operações" : "Operações do teu turno") +
    '</div>' +
    ops.map(function(op) {
      return '<button data-op-key="' + op.key + '" class="tesouraria-op-btn" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:14px;background:#fff;border-radius:12px;border:1px solid #f4f4f5;margin-bottom:8px;cursor:pointer;font-family:inherit">' +
        '<div style="width:44px;height:44px;background:' + op.color + ';border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
        '<i data-lucide="' + op.icon + '" style="width:20px;height:20px;color:' + op.iconColor + '"></i></div>' +
        '<div><div style="font-size:14px;font-weight:700;color:#18181b">' + op.label + '</div>' +
        '<div style="font-size:12px;color:#71717a;margin-top:2px">' + op.sub + '</div></div>' +
        '<i data-lucide="chevron-right" style="width:16px;height:16px;color:#a1a1aa;margin-left:auto"></i>' +
      '</button>';
    }).join('') +
    '<div style="font-size:12px;color:#a1a1aa;text-align:center;padding:20px 10px">Histórico de movimentos em breve.</div>';

  refreshIcons(wrap);

  wrap.querySelectorAll(".tesouraria-op-btn").forEach(function(btn) {
    btn.onclick = function() {
      var key = btn.getAttribute("data-op-key");
      if (key === "aporte") { openAporteModal(); return; }
      if (key === "retirada") { openRetiradaModal(); return; }
      if (key === "deposito") { openDepositoModal(); return; }
      if (key === "levantamento") { openLevantamentoModal(); return; }
      if (key === "sangria") { openSangriaModal(); return; }
      toast("Esta operação ainda está em construção.", "info");
    };
  });
}

// ── SANGRIA DE CAIXA ─────────────────────────────────────────────────────────
// Operação puramente operacional — dinheiro sai da gaveta para o cofre da loja,
// mas continua a ser numerário da empresa (conta 45 do PGC). Sem lançamento
// contabilístico (journalEntryId fica null). Auditoria feita via os campos
// proprios de treasuryMovements (userId, sessionId, createdAt, motivo).
function openSangriaModal() {
  openModal("Sangria de Caixa",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div style="background:var(--warning-muted-light);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--warning-muted);display:flex;align-items:center;gap:8px">' +
    '<i data-lucide="info" style="width:15px;height:15px;flex-shrink:0"></i> Operação sem lançamento contabilístico — o dinheiro continua na empresa, só muda de local físico.</div>' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="tes-sangria-amount" placeholder="0"/></div>' +
    '<div class="field"><label>Motivo *</label><input id="tes-sangria-motivo" placeholder="Ex: Excesso de numerário, entrega ao gerente..."/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="tes-sangria-date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" id="tes-sangria-cancel">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--warning-muted)" id="tes-sangria-save">Confirmar Sangria</button>' +
    '</div>');
  refreshIcons(el("modal-box"));

  document.getElementById("tes-sangria-cancel").onclick = closeModal;

  document.getElementById("tes-sangria-save").onclick = async function() {
    var session = getSession();
    if (!session) { toast("Abre um turno primeiro.", "error"); return; }

    var amount = Number((el("tes-sangria-amount")||{}).value);
    if (!amount || amount <= 0) { toast("O valor deve ser maior que zero.", "error"); return; }

    var motivo = ((el("tes-sangria-motivo")||{}).value || "").trim();
    if (!motivo) { toast("O motivo é obrigatório.", "error"); return; }

    var saldoCaixa = await getAccountBalance("45");
    if (amount > saldoCaixa) {
      toast("Saldo insuficiente em Caixa (disponível: " + saldoCaixa.toLocaleString("pt-AO") + " Kz).", "error");
      return;
    }

    var date = (el("tes-sangria-date")||{}).value || new Date().toISOString().slice(0,10);
    var user = getUser();

    var saveBtn = document.getElementById("tes-sangria-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "A gravar...";

    try {
      await db.add("treasuryMovements", {
        type: "sangria",
        date: date,
        amount: amount,
        description: motivo,
        origem: "cofre",
        sessionId: session.id,
        userId: user ? user.id : null,
        journalEntryId: null,
        createdAt: new Date().toISOString(),
      });

      toast("Sangria registada.", "success");
      closeModal();
      await loadTesouraria();
    } catch (err) {
      toast("Erro ao registar sangria: " + err.message, "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Confirmar Sangria";
    }
  };
}

// ── LEVANTAMENTO BANCÁRIO ────────────────────────────────────────────────────
function openLevantamentoModal() {
  openModal("Levantamento Bancário",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div style="background:var(--info-light);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--info);display:flex;align-items:center;gap:8px">' +
    '<i data-lucide="landmark" style="width:15px;height:15px;flex-shrink:0"></i> Banco → Caixa</div>' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="tes-levantamento-amount" placeholder="0"/></div>' +
    '<div class="field"><label>Descrição</label><input id="tes-levantamento-desc" placeholder="Ex: Levantamento para troco, reforço de caixa..."/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="tes-levantamento-date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" id="tes-levantamento-cancel">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" id="tes-levantamento-save">Confirmar Levantamento</button>' +
    '</div>');
  refreshIcons(el("modal-box"));

  document.getElementById("tes-levantamento-cancel").onclick = closeModal;

  document.getElementById("tes-levantamento-save").onclick = async function() {
    var session = getSession();
    if (!session) { toast("Abre um turno primeiro.", "error"); return; }

    var amount = Number((el("tes-levantamento-amount")||{}).value);
    if (!amount || amount <= 0) { toast("O valor deve ser maior que zero.", "error"); return; }

    var saldoBanco = await getAccountBalance("43");
    if (amount > saldoBanco) {
      toast("Saldo insuficiente em Banco (disponível: " + saldoBanco.toLocaleString("pt-AO") + " Kz).", "error");
      return;
    }

    var desc = ((el("tes-levantamento-desc")||{}).value || "Levantamento bancário").trim();
    var date = (el("tes-levantamento-date")||{}).value || new Date().toISOString().slice(0,10);
    var user = getUser();

    var saveBtn = document.getElementById("tes-levantamento-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "A gravar...";

    try {
      var movementId = await db.add("treasuryMovements", {
        type: "levantamento_bancario",
        date: date,
        amount: amount,
        description: desc,
        origem: null,
        sessionId: session.id,
        userId: user ? user.id : null,
        journalEntryId: null,
        createdAt: new Date().toISOString(),
      });

      var journalEntryId = await postBankTransfer({
        date: date,
        description: "Levantamento bancário — " + desc,
        amount: amount,
        direction: "banco_to_caixa",
        movementId: movementId,
      });

      var mv = await db.get("treasuryMovements", movementId);
      await db.put("treasuryMovements", Object.assign({}, mv, { journalEntryId: journalEntryId }));

      toast("Levantamento bancário registado.", "success");
      closeModal();
      await loadTesouraria();
    } catch (err) {
      toast("Erro ao registar levantamento: " + err.message, "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Confirmar Levantamento";
    }
  };
}

// ── DEPÓSITO BANCÁRIO ────────────────────────────────────────────────────────
function openDepositoModal() {
  openModal("Depósito Bancário",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div style="background:var(--info-light);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--info);display:flex;align-items:center;gap:8px">' +
    '<i data-lucide="landmark" style="width:15px;height:15px;flex-shrink:0"></i> Caixa → Banco</div>' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="tes-deposito-amount" placeholder="0"/></div>' +
    '<div class="field"><label>Descrição</label><input id="tes-deposito-desc" placeholder="Ex: Depósito no BAI, fecho de caixa..."/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="tes-deposito-date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" id="tes-deposito-cancel">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" id="tes-deposito-save">Confirmar Depósito</button>' +
    '</div>');
  refreshIcons(el("modal-box"));

  document.getElementById("tes-deposito-cancel").onclick = closeModal;

  document.getElementById("tes-deposito-save").onclick = async function() {
    var session = getSession();
    if (!session) { toast("Abre um turno primeiro.", "error"); return; }

    var amount = Number((el("tes-deposito-amount")||{}).value);
    if (!amount || amount <= 0) { toast("O valor deve ser maior que zero.", "error"); return; }

    var saldoCaixa = await getAccountBalance("45");
    if (amount > saldoCaixa) {
      toast("Saldo insuficiente em Caixa (disponível: " + saldoCaixa.toLocaleString("pt-AO") + " Kz).", "error");
      return;
    }

    var desc = ((el("tes-deposito-desc")||{}).value || "Depósito bancário").trim();
    var date = (el("tes-deposito-date")||{}).value || new Date().toISOString().slice(0,10);
    var user = getUser();

    var saveBtn = document.getElementById("tes-deposito-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "A gravar...";

    try {
      var movementId = await db.add("treasuryMovements", {
        type: "deposito_bancario",
        date: date,
        amount: amount,
        description: desc,
        origem: null,
        sessionId: session.id,
        userId: user ? user.id : null,
        journalEntryId: null,
        createdAt: new Date().toISOString(),
      });

      var journalEntryId = await postBankTransfer({
        date: date,
        description: "Depósito bancário — " + desc,
        amount: amount,
        direction: "caixa_to_banco",
        movementId: movementId,
      });

      var mv = await db.get("treasuryMovements", movementId);
      await db.put("treasuryMovements", Object.assign({}, mv, { journalEntryId: journalEntryId }));

      toast("Depósito bancário registado.", "success");
      closeModal();
      await loadTesouraria();
    } catch (err) {
      toast("Erro ao registar depósito: " + err.message, "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Confirmar Depósito";
    }
  };
}

// ── RETIRADA DO PROPRIETÁRIO ─────────────────────────────────────────────────
function openRetiradaModal() {
  openModal("Retirada do Proprietário",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="tes-retirada-amount" placeholder="0"/></div>' +
    '<div class="field"><label>Descrição</label><input id="tes-retirada-desc" placeholder="Ex: Retirada pessoal, despesa do proprietário..."/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="tes-retirada-date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
    '<div class="field"><label>Sai de</label>' +
      '<div style="display:flex;gap:8px">' +
        '<button type="button" data-method="caixa" class="tes-method-btn-r tes-method-active" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid var(--primary);background:var(--primary-light);color:var(--primary);font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">Caixa</button>' +
        '<button type="button" data-method="banco" class="tes-method-btn-r" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid var(--border2);background:#fff;color:var(--text3);font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">Banco</button>' +
      '</div>' +
    '</div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" id="tes-retirada-cancel">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--danger)" id="tes-retirada-save">Confirmar Retirada</button>' +
    '</div>');
  refreshIcons(el("modal-box"));

  var selectedMethod = "caixa";
  var methodBtns = document.querySelectorAll(".tes-method-btn-r");
  methodBtns.forEach(function(mb) {
    mb.onclick = function() {
      selectedMethod = mb.getAttribute("data-method");
      methodBtns.forEach(function(other) {
        var active = other === mb;
        other.style.borderColor  = active ? "var(--primary)" : "var(--border2)";
        other.style.background   = active ? "var(--primary-light)" : "#fff";
        other.style.color        = active ? "var(--primary)" : "var(--text3)";
      });
    };
  });

  document.getElementById("tes-retirada-cancel").onclick = closeModal;

  document.getElementById("tes-retirada-save").onclick = async function() {
    var session = getSession();
    if (!session) { toast("Abre um turno primeiro.", "error"); return; }

    var amount = Number((el("tes-retirada-amount")||{}).value);
    if (!amount || amount <= 0) { toast("O valor deve ser maior que zero.", "error"); return; }

    var desc = ((el("tes-retirada-desc")||{}).value || "Retirada do proprietário").trim();
    var date = (el("tes-retirada-date")||{}).value || new Date().toISOString().slice(0,10);
    var user = getUser();

    var contaCode = selectedMethod === "banco" ? "43" : "45";
    var saldoDisponivel = await getAccountBalance(contaCode);
    if (amount > saldoDisponivel) {
      toast("Saldo insuficiente em " + (selectedMethod === "banco" ? "Banco" : "Caixa") + " (disponível: " + saldoDisponivel.toLocaleString("pt-AO") + " Kz).", "error");
      return;
    }

    var saveBtn = document.getElementById("tes-retirada-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "A gravar...";

    try {
      var movementId = await db.add("treasuryMovements", {
        type: "retirada_proprietario",
        date: date,
        amount: amount,
        description: desc,
        origem: null,
        sessionId: session.id,
        userId: user ? user.id : null,
        journalEntryId: null,
        createdAt: new Date().toISOString(),
      });

      var journalEntryId = await postOwnerContribution({
        date: date,
        description: "Retirada do proprietário — " + desc,
        amount: amount,
        method: selectedMethod,
        direction: "out",
        movementId: movementId,
      });

      var mv = await db.get("treasuryMovements", movementId);
      await db.put("treasuryMovements", Object.assign({}, mv, { journalEntryId: journalEntryId }));

      toast("Retirada do proprietário registada.", "success");
      closeModal();
      await loadTesouraria();
    } catch (err) {
      toast("Erro ao registar retirada: " + err.message, "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Confirmar Retirada";
    }
  };
}

// ── APORTE DE CAPITAL ────────────────────────────────────────────────────────
function openAporteModal() {
  openModal("Aporte de Capital",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="tes-aporte-amount" placeholder="0"/></div>' +
    '<div class="field"><label>Descrição</label><input id="tes-aporte-desc" placeholder="Ex: Capital inicial, reforço de tesouraria..."/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="tes-aporte-date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
    '<div class="field"><label>Entra em</label>' +
      '<div style="display:flex;gap:8px">' +
        '<button type="button" data-method="caixa" class="tes-method-btn tes-method-active" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid var(--primary);background:var(--primary-light);color:var(--primary);font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">Caixa</button>' +
        '<button type="button" data-method="banco" class="tes-method-btn" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid var(--border2);background:#fff;color:var(--text3);font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">Banco</button>' +
      '</div>' +
    '</div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" id="tes-aporte-cancel">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" id="tes-aporte-save">Confirmar Aporte</button>' +
    '</div>');
  refreshIcons(el("modal-box"));

  var selectedMethod = "caixa";
  var methodBtns = document.querySelectorAll(".tes-method-btn");
  methodBtns.forEach(function(mb) {
    mb.onclick = function() {
      selectedMethod = mb.getAttribute("data-method");
      methodBtns.forEach(function(other) {
        var active = other === mb;
        other.style.borderColor  = active ? "var(--primary)" : "var(--border2)";
        other.style.background   = active ? "var(--primary-light)" : "#fff";
        other.style.color        = active ? "var(--primary)" : "var(--text3)";
      });
    };
  });

  document.getElementById("tes-aporte-cancel").onclick = closeModal;

  document.getElementById("tes-aporte-save").onclick = async function() {
    var session = getSession();
    if (!session) { toast("Abre um turno primeiro.", "error"); return; }

    var amount = Number((el("tes-aporte-amount")||{}).value);
    if (!amount || amount <= 0) { toast("O valor deve ser maior que zero.", "error"); return; }

    var desc = ((el("tes-aporte-desc")||{}).value || "Aporte de capital").trim();
    var date = (el("tes-aporte-date")||{}).value || new Date().toISOString().slice(0,10);
    var user = getUser();

    var saveBtn = document.getElementById("tes-aporte-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "A gravar...";

    try {
      var movementId = await db.add("treasuryMovements", {
        type: "aporte_capital",
        date: date,
        amount: amount,
        description: desc,
        origem: null,
        sessionId: session.id,
        userId: user ? user.id : null,
        journalEntryId: null,
        createdAt: new Date().toISOString(),
      });

      var journalEntryId = await postOwnerContribution({
        date: date,
        description: "Aporte de capital — " + desc,
        amount: amount,
        method: selectedMethod,
        direction: "in",
        movementId: movementId,
      });

      var mv = await db.get("treasuryMovements", movementId);
      await db.put("treasuryMovements", Object.assign({}, mv, { journalEntryId: journalEntryId }));

      toast("Aporte de capital registado.", "success");
      closeModal();
      await loadTesouraria();
    } catch (err) {
      toast("Erro ao registar aporte: " + err.message, "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Confirmar Aporte";
    }
  };
}
