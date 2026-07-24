import { db } from "../db.js";
import { getUser, getSession } from "../auth.js";
import { refreshIcons, el } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { openField } from "../date-picker.js";
window._openDateField = openField;
import { postOwnerContribution, postBankTransfer, getAccountBalance } from "../pgc.js";
import { verifyAdminPin } from "../services.js";

var ADMIN_OPS = [
  { key: "aporte",       label: "Aporte de capital",        sub: "Entrada de capital do proprietário",   icon: "trending-up",        color: "#dcfce7", iconColor: "#16a34a", section: "Capital" },
  { key: "retirada",     label: "Retirada do proprietário",  sub: "Saída de capital para o proprietário", icon: "trending-down",      color: "#fee2e2", iconColor: "#dc2626", section: "Capital" },
  { key: "deposito",     label: "Depósito bancário",         sub: "Caixa → Banco",                        icon: "landmark",           color: "#dbeafe", iconColor: "#2563eb", section: "Banco" },
  { key: "levantamento", label: "Levantamento bancário",     sub: "Banco → Caixa",                        icon: "landmark",           color: "#dbeafe", iconColor: "#2563eb", section: "Banco" },
  { key: "sangria",      label: "Sangria de caixa",          sub: "Retirar dinheiro do caixa físico",     icon: "arrow-up-from-line", color: "#fef3c7", iconColor: "#d97706", section: "Caixa" },
  { key: "reforco",      label: "Reforço de caixa",          sub: "Repor dinheiro no caixa físico",       icon: "arrow-down-to-line", color: "#fef3c7", iconColor: "#d97706", section: "Caixa" },
  { key: "ajuste",       label: "Ajuste de caixa",           sub: "Regularizar diferenças",               icon: "sliders-horizontal", color: "#f4f4f5", iconColor: "#71717a", section: "Caixa" },
];

var CAIXA_OPS = [
  { key: "sangria", label: "Sangria de caixa", sub: "Retirar dinheiro do caixa físico",             icon: "arrow-up-from-line", color: "#fef3c7", iconColor: "#d97706", section: "Caixa" },
  { key: "reforco", label: "Reforço de caixa",  sub: "Repor dinheiro no caixa físico",               icon: "arrow-down-to-line", color: "#fef3c7", iconColor: "#d97706", section: "Caixa" },
  { key: "ajuste",  label: "Ajuste de caixa",   sub: "Regularizar diferenças (requer autorização)",  icon: "sliders-horizontal", color: "#f4f4f5", iconColor: "#71717a", section: "Caixa" },
];

var TYPE_META = {
  aporte_capital:        { label: "Aporte de capital",       icon: "trending-up",        color: "#16a34a" },
  retirada_proprietario: { label: "Retirada do proprietário", icon: "trending-down",      color: "#dc2626" },
  deposito_bancario:     { label: "Depósito bancário",       icon: "landmark",           color: "#2563eb" },
  levantamento_bancario: { label: "Levantamento bancário",   icon: "landmark",           color: "#2563eb" },
  sangria:                { label: "Sangria de caixa",        icon: "arrow-up-from-line", color: "#d97706" },
  reforco:                { label: "Reforço de caixa",        icon: "arrow-down-to-line", color: "#d97706" },
  ajuste:                 { label: "Ajuste de caixa",         icon: "sliders-horizontal", color: "#71717a" },
};

var TYPE_SIGN = {
  aporte_capital: 1, retirada_proprietario: -1,
  deposito_bancario: 0, levantamento_bancario: 0,
  sangria: -1, reforco: 1, ajuste: 0,
};

async function renderHistoricoList(filterType, isAdmin, session) {
  var listEl = document.getElementById("tes-hist-list");
  if (!listEl) return;

  var all = await db.getAll("treasuryMovements");
  if (!isAdmin && session) all = all.filter(function(m) { return m.sessionId === session.id; });
  if (filterType !== "all") all = all.filter(function(m) { return m.type === filterType; });

  all.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

  if (!all.length) {
    listEl.innerHTML = '<div style="font-size:12px;color:#a1a1aa;text-align:center;padding:20px 10px">Nenhum movimento registado.</div>';
    return;
  }

  listEl.innerHTML = all.map(function(m) {
    var meta = TYPE_META[m.type] || { label: m.type, icon: "circle", color: "#71717a" };
    var sign = TYPE_SIGN[m.type] || 0;
    var amountDisplay = m.type === "ajuste" ? m.amount : Math.abs(m.amount);
    var signPrefix = m.type === "ajuste" ? (m.amount > 0 ? "+" : "") : (sign > 0 ? "+" : (sign < 0 ? "-" : ""));
    var valColor = m.type === "ajuste" ? (m.amount >= 0 ? "#2563eb" : "#dc2626") : (sign > 0 ? "#16a34a" : (sign < 0 ? "#dc2626" : "#18181b"));
    var dataFmt = new Date(m.createdAt).toLocaleDateString("pt-AO", { day:"2-digit", month:"2-digit", year:"numeric" });

    return '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:#fff;border-radius:12px;border:1px solid #f4f4f5;margin-bottom:8px">' +
      '<div style="width:38px;height:38px;background:' + meta.color + '22;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
      '<i data-lucide="' + meta.icon + '" style="width:17px;height:17px;color:' + meta.color + '"></i></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:13.5px;font-weight:700;color:#18181b">' + meta.label + '</div>' +
      '<div style="font-size:11.5px;color:#71717a;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (m.description||"") + ' · ' + dataFmt + '</div>' +
      '</div>' +
      '<div style="font-size:13.5px;font-weight:700;color:' + valColor + ';flex-shrink:0">' + signPrefix + amountDisplay.toLocaleString("pt-AO") + ' Kz</div>' +
    '</div>';
  }).join('');

  refreshIcons(listEl);
}

function openHistoricoFilterModal(current, onSelect) {
  var options = [
    { value: "all",                    label: "Todos os tipos" },
    { value: "aporte_capital",         label: "Aporte de capital" },
    { value: "retirada_proprietario",  label: "Retirada do proprietário" },
    { value: "deposito_bancario",      label: "Depósito bancário" },
    { value: "levantamento_bancario",  label: "Levantamento bancário" },
    { value: "sangria",                label: "Sangria de caixa" },
    { value: "reforco",                label: "Reforço de caixa" },
    { value: "ajuste",                 label: "Ajuste de caixa" },
  ];

  openModal("Filtrar histórico",
    '<div style="display:flex;flex-direction:column;gap:2px">' +
    options.map(function(o) {
      var active = o.value === current;
      return '<button data-filter-val="' + o.value + '" style="display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;background:' +
        (active ? "var(--primary-light)" : "none") + ';border:none;padding:13px 12px;border-radius:10px;font-size:14.5px;color:' +
        (active ? "var(--primary)" : "#18181b") + ';font-weight:' + (active ? "700" : "400") + ';cursor:pointer;font-family:inherit">' +
        o.label + (active ? '<i data-lucide="check" style="width:17px;height:17px"></i>' : '') +
      '</button>';
    }).join('') +
    '</div>');
  refreshIcons(el("modal-box"));

  document.querySelectorAll("[data-filter-val]").forEach(function(btn) {
    btn.onclick = function() {
      onSelect(btn.getAttribute("data-filter-val"));
      closeModal();
    };
  });
}

export async function loadTesouraria() {
  var user = getUser();
  var session = getSession();
  var wrap = document.getElementById("tesouraria-content");
  if (!wrap) return;

  var isAdmin = user && user.role === "admin";
  var ops = isAdmin ? ADMIN_OPS : CAIXA_OPS;

  var todosMovimentos = await db.getAll("treasuryMovements");
  var saldoCofre = todosMovimentos.reduce(function(acc, m) {
    if (m.type === "sangria") return acc + (m.amount||0);
    if (m.type === "reforco") return acc - (m.amount||0);
    return acc;
  }, 0);

  wrap.innerHTML =
    '<div class="hist-hero" style="margin-bottom:16px">' +
    '<div class="hist-hero-label">Saldo do Cofre</div>' +
    '<div class="hist-hero-val">' + saldoCofre.toLocaleString("pt-AO") + ' Kz</div>' +
    '<div class="hist-hero-context">' + (saldoCofre > 0 ? "Disponível para reforço de caixa" : "Sem dinheiro guardado no cofre") + '</div>' +
    '</div>' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">' +
    (isAdmin ? "Todas as operações" : "Operações do teu turno") +
    '</div>' +
    (function() {
      var lastSection = null;
      return ops.map(function(op) {
        var headerHTML = '';
        if (op.section !== lastSection) {
          lastSection = op.section;
          headerHTML = '<div style="font-size:11px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:.5px;margin:' + (lastSection === ops[0].section ? '0' : '18px') + ' 0 8px 2px">' + op.section + '</div>';
        }
        return headerHTML +
          '<button data-op-key="' + op.key + '" class="tesouraria-op-btn" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:14px;background:#fff;border-radius:12px;border:1px solid #f4f4f5;margin-bottom:8px;cursor:pointer;font-family:inherit">' +
          '<div style="width:44px;height:44px;background:' + op.color + ';border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<i data-lucide="' + op.icon + '" style="width:20px;height:20px;color:' + op.iconColor + '"></i></div>' +
          '<div><div style="font-size:14px;font-weight:700;color:#18181b">' + op.label + '</div>' +
          '<div style="font-size:12px;color:#71717a;margin-top:2px">' + op.sub + '</div></div>' +
          '<i data-lucide="chevron-right" style="width:16px;height:16px;color:#a1a1aa;margin-left:auto"></i>' +
        '</button>';
      }).join('');
    })() +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin:18px 0 10px">' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px">Histórico</div>' +
    '<button id="tes-hist-filter-btn" style="background:#f4f4f5;border:none;width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer">' +
    '<i data-lucide="filter" style="width:15px;height:15px;color:#71717a"></i></button>' +
    '</div>' +
    '<div id="tes-hist-list"></div>';

  refreshIcons(wrap);

  var isAdmin2 = isAdmin;
  var currentFilter = "all";
  renderHistoricoList(currentFilter, isAdmin2, session);

  var filterBtn = document.getElementById("tes-hist-filter-btn");
  if (filterBtn) {
    filterBtn.onclick = function() {
      openHistoricoFilterModal(currentFilter, function(chosen) {
        currentFilter = chosen;
        renderHistoricoList(currentFilter, isAdmin2, session);
      });
    };
  }

  wrap.querySelectorAll(".tesouraria-op-btn").forEach(function(btn) {
    btn.onclick = function() {
      var key = btn.getAttribute("data-op-key");
      if (key === "aporte") { openAporteModal(); return; }
      if (key === "retirada") { openRetiradaModal(); return; }
      if (key === "deposito") { openDepositoModal(); return; }
      if (key === "levantamento") { openLevantamentoModal(); return; }
      if (key === "sangria") { openSangriaModal(); return; }
      if (key === "reforco") { openReforcoModal(); return; }
      if (key === "ajuste") { openAjusteModal(); return; }
      toast("Esta operação ainda está em construção.", "info");
    };
  });
}

// ── AJUSTE DE CAIXA ──────────────────────────────────────────────────────────
// Regularização baseada em contagem física (Esperado vs Contado), não num valor
// arbitrário. Sem lançamento contabilístico (mesma decisão de Sangria/Reforço).
// Se quem estiver a operar não for admin, exige PIN de administrador antes de
// gravar — reaproveita verifyAdminPin(), já usado para vendas com incidente.
async function _saveAjuste(p) {
  var saveBtn = document.getElementById("tes-ajuste-save");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "A gravar..."; }

  try {
    await db.add("treasuryMovements", {
      type: "ajuste",
      date: p.date,
      amount: p.diff,
      description: p.motivo,
      origem: null,
      expected: p.esperado,
      counted: p.contado,
      sessionId: p.session.id,
      userId: p.user ? p.user.id : null,
      journalEntryId: null,
      createdAt: new Date().toISOString(),
    });

    toast("Ajuste de caixa registado.", "success");
    closeModal();
    await loadTesouraria();
  } catch (err) {
    toast("Erro ao registar ajuste: " + err.message, "error");
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Confirmar Ajuste"; }
  }
}

function openAjusteAuthModal(payload) {
  openModal("Autorização necessária",
    '<div style="font-size:13px;color:var(--text3);line-height:1.6;margin-bottom:16px">' +
    'O ajuste de caixa altera o saldo operacional. É necessário o PIN de um administrador para continuar.' +
    '</div>' +
    '<div class="field" style="margin-bottom:14px">' +
    '<label>PIN do administrador</label>' +
    '<input type="password" inputmode="numeric" maxlength="6" id="tes-ajuste-auth-pin" placeholder="••••••" style="width:100%;padding:12px;border:1.5px solid var(--border);border-radius:10px;font-size:18px;text-align:center;letter-spacing:6px;font-family:inherit"/>' +
    '</div>' +
    '<div id="tes-ajuste-auth-err" style="display:none;color:var(--danger);font-size:12px;margin-bottom:10px"></div>' +
    '<div style="display:flex;gap:8px">' +
    '<button class="btn btn-ghost" id="tes-ajuste-auth-back" style="flex:0 0 auto"><i data-lucide="arrow-left" style="width:16px;height:16px"></i></button>' +
    '<button class="btn btn-ghost btn-full" id="tes-ajuste-auth-cancel">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" id="tes-ajuste-auth-confirm">Confirmar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));

  document.getElementById("tes-ajuste-auth-cancel").onclick = closeModal;
  document.getElementById("tes-ajuste-auth-back").onclick = function() {
    openAjusteModal({ contado: payload.contado, motivo: payload.motivo, date: payload.date });
  };

  document.getElementById("tes-ajuste-auth-confirm").onclick = async function() {
    var pinEl  = document.getElementById("tes-ajuste-auth-pin");
    var errEl  = document.getElementById("tes-ajuste-auth-err");
    var pin    = pinEl ? pinEl.value : "";
    if (!pin || pin.length < 4) {
      if (errEl) { errEl.style.display = "block"; errEl.textContent = "Introduz o PIN."; }
      return;
    }
    var result = await verifyAdminPin(pin);
    if (!result.ok) {
      if (errEl) {
        errEl.style.display = "block";
        errEl.textContent = result.reason === "no_admin" ? "Nenhum administrador disponível." : "PIN de administrador incorrecto.";
      }
      return;
    }
    await _saveAjuste(payload);
  };
}

function openAjusteModal(prefill) {
  prefill = prefill || {};
  getAccountBalance("45").then(function(esperado) {
    openModal("Ajuste de Caixa",
      '<div style="display:flex;flex-direction:column;gap:14px">' +
      '<div style="background:var(--warning-muted-light);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--warning-muted);display:flex;align-items:center;gap:8px">' +
      '<i data-lucide="info" style="width:15px;height:15px;flex-shrink:0"></i> Operação sem lançamento contabilístico — regulariza o saldo operacional do caixa.</div>' +
      '<div class="field"><label>Saldo esperado (Kz)</label><input type="text" value="' + esperado.toLocaleString("pt-AO") + '" disabled style="background:var(--bg);color:var(--text3)"/></div>' +
      '<div class="field"><label>Valor contado (Kz) *</label><input type="number" id="tes-ajuste-contado" placeholder="0" value="' + (prefill.contado != null ? prefill.contado : "") + '"/></div>' +
      '<div id="tes-ajuste-diff-preview" style="display:none;padding:12px;border-radius:10px;text-align:center;font-weight:700;font-size:15px"></div>' +
      '<div class="field"><label>Motivo *</label><input id="tes-ajuste-motivo" placeholder="Ex: Contagem de fecho, nota mal trocada..." value="' + (prefill.motivo || "").replace(/"/g,"&quot;") + '"/></div>' +
      '<div class="field"><label>Data</label><input type="text" id="tes-ajuste-date" readonly value="' + (prefill.date || new Date().toISOString().slice(0,10)) + '" onclick="window._openDateField(this)"/></div>' +
      '</div>' +
      '<div class="form-actions">' +
      '<button class="btn btn-ghost btn-full" id="tes-ajuste-cancel">Cancelar</button>' +
      '<button class="btn btn-primary btn-full" style="background:var(--warning-muted)" id="tes-ajuste-save">Confirmar Ajuste</button>' +
      '</div>');
    refreshIcons(el("modal-box"));

    var contadoInput = document.getElementById("tes-ajuste-contado");
    var diffPreview  = document.getElementById("tes-ajuste-diff-preview");
    function _updateDiffPreview() {
      var contado = Number(contadoInput.value);
      if (!contadoInput.value) { diffPreview.style.display = "none"; return; }
      var diff = contado - esperado;
      diffPreview.style.display = "block";
      diffPreview.style.background = diff === 0 ? "var(--success-light)" : (diff > 0 ? "var(--info-light)" : "var(--danger-light)");
      diffPreview.style.color      = diff === 0 ? "var(--success)"       : (diff > 0 ? "var(--info)"       : "var(--danger)");
      diffPreview.textContent = "Diferença: " + (diff > 0 ? "+" : "") + diff.toLocaleString("pt-AO") + " Kz";
    }
    contadoInput.addEventListener("input", _updateDiffPreview);
    if (prefill.contado != null) _updateDiffPreview();

    document.getElementById("tes-ajuste-cancel").onclick = closeModal;

    document.getElementById("tes-ajuste-save").onclick = async function() {
      var session = getSession();
      if (!session) { toast("Abre um turno primeiro.", "error"); return; }

      if (!contadoInput.value) { toast("Introduz o valor contado.", "error"); return; }
      var contado = Number(contadoInput.value);
      var diff = contado - esperado;

      var motivo = ((el("tes-ajuste-motivo")||{}).value || "").trim();
      if (!motivo) { toast("O motivo é obrigatório.", "error"); return; }

      if (diff === 0) { toast("Não há diferença a regularizar.", "info"); return; }

      var user = getUser();
      var date = (el("tes-ajuste-date")||{}).value || new Date().toISOString().slice(0,10);

      var payload = { esperado: esperado, contado: contado, diff: diff, motivo: motivo, date: date, session: session, user: user };

      if (user && user.role !== "admin") {
        openAjusteAuthModal(payload);
        return;
      }

      await _saveAjuste(payload);
    };
  });
}

// ── REFORÇO DE CAIXA ─────────────────────────────────────────────────────────
// Espelho exato da Sangria: dinheiro sai do cofre para a gaveta, continua a ser
// numerário da empresa (conta 45 do PGC). Sem lançamento contabilístico.
function openReforcoModal() {
  openModal("Reforço de Caixa",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div style="background:var(--warning-muted-light);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--warning-muted);display:flex;align-items:center;gap:8px">' +
    '<i data-lucide="info" style="width:15px;height:15px;flex-shrink:0"></i> Operação sem lançamento contabilístico — o dinheiro continua na empresa, só muda de local físico.</div>' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="tes-reforco-amount" placeholder="0"/></div>' +
    '<div class="field"><label>Motivo *</label><input id="tes-reforco-motivo" placeholder="Ex: Reforço de troco, falta de numerário..."/></div>' +
    '<div class="field"><label>Data</label><input type="text" id="tes-reforco-date" readonly value="' + new Date().toISOString().slice(0,10) + '" onclick="window._openDateField(this)"/></div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" id="tes-reforco-cancel">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--warning-muted)" id="tes-reforco-save">Confirmar Reforço</button>' +
    '</div>');
  refreshIcons(el("modal-box"));

  document.getElementById("tes-reforco-cancel").onclick = closeModal;

  document.getElementById("tes-reforco-save").onclick = async function() {
    var session = getSession();
    if (!session) { toast("Abre um turno primeiro.", "error"); return; }

    var amount = Number((el("tes-reforco-amount")||{}).value);
    if (!amount || amount <= 0) { toast("O valor deve ser maior que zero.", "error"); return; }

    var motivo = ((el("tes-reforco-motivo")||{}).value || "").trim();
    if (!motivo) { toast("O motivo é obrigatório.", "error"); return; }

    var todos = await db.getAll("treasuryMovements");
    var saldoCofre = todos.reduce(function(acc, m) {
      if (m.type === "sangria") return acc + (m.amount||0);
      if (m.type === "reforco") return acc - (m.amount||0);
      return acc;
    }, 0);
    if (amount > saldoCofre) {
      toast("Saldo insuficiente no cofre (disponível: " + saldoCofre.toLocaleString("pt-AO") + " Kz).", "error");
      return;
    }

    var date = (el("tes-reforco-date")||{}).value || new Date().toISOString().slice(0,10);
    var user = getUser();

    var saveBtn = document.getElementById("tes-reforco-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "A gravar...";

    try {
      await db.add("treasuryMovements", {
        type: "reforco",
        date: date,
        amount: amount,
        description: motivo,
        origem: "cofre",
        sessionId: session.id,
        userId: user ? user.id : null,
        journalEntryId: null,
        createdAt: new Date().toISOString(),
      });

      toast("Reforço registado.", "success");
      closeModal();
      await loadTesouraria();
    } catch (err) {
      toast("Erro ao registar reforço: " + err.message, "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Confirmar Reforço";
    }
  };
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
    '<div class="field"><label>Data</label><input type="text" id="tes-sangria-date" readonly value="' + new Date().toISOString().slice(0,10) + '" onclick="window._openDateField(this)"/></div>' +
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
    '<div class="field"><label>Data</label><input type="text" id="tes-levantamento-date" readonly value="' + new Date().toISOString().slice(0,10) + '" onclick="window._openDateField(this)"/></div>' +
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
    '<div class="field"><label>Data</label><input type="text" id="tes-deposito-date" readonly value="' + new Date().toISOString().slice(0,10) + '" onclick="window._openDateField(this)"/></div>' +
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
    '<div class="field"><label>Data</label><input type="text" id="tes-retirada-date" readonly value="' + new Date().toISOString().slice(0,10) + '" onclick="window._openDateField(this)"/></div>' +
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
    '<div class="field"><label>Data</label><input type="text" id="tes-aporte-date" readonly value="' + new Date().toISOString().slice(0,10) + '" onclick="window._openDateField(this)"/></div>' +
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
