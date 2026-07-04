import { db }            from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast }         from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser }       from "../auth.js";

var CATEGORIAS = ["Renda","Electricidade","Água","Salários","Transporte","Manutenção","Internet/Telefone","Impostos e Taxas","Combustível","Marketing e Publicidade","Seguros","Material de Escritório","Limpeza","Segurança","Comissões","Outro"];

export async function loadDespesas() {
  var btn = document.getElementById("btn-back-despesas");
  if (btn) btn.onclick = function() { window._perfilBack(); };
  await renderDespesas();
}

var _despesasMesRef = new Date();
_despesasMesRef.setDate(1);

window._despesasMudarMes = function(delta) {
  _despesasMesRef.setMonth(_despesasMesRef.getMonth() + delta);
  renderDespesas();
};

async function renderDespesas() {
  var wrap = document.getElementById("despesas-content");
  if (!wrap) return;

  var expenses, mes, doMes, totalMes, nomeMes, porCategoria, cats;

  try {
    expenses = await db.getAll("expenses");
  } catch(err) {
    wrap.innerHTML = '<div style="padding:20px;color:red;font-size:13px">Erro DB: ' + err.message + '</div>';
    return;
  }

  expenses.sort(function(a,b){ return new Date(b.date) - new Date(a.date); });
  var activeExpenses   = expenses.filter(function(e){ return !e.archived; });
  var archivedExpenses = expenses.filter(function(e){ return e.archived; });

  mes      = _despesasMesRef.toISOString().slice(0,7);
  doMes    = activeExpenses.filter(function(e){ return (e.date||"").startsWith(mes); });
  totalMes = doMes.reduce(function(a,e){ return a+(e.amount||0); },0);

  try {
    nomeMes = _despesasMesRef.toLocaleDateString("pt-PT",{month:"long",year:"numeric"});
  } catch(e) {
    nomeMes = mes;
  }

  var mesActualRef  = new Date(); mesActualRef.setDate(1);
  var ehMesActual    = _despesasMesRef.getFullYear()===mesActualRef.getFullYear() && _despesasMesRef.getMonth()===mesActualRef.getMonth();

  porCategoria = {};
  doMes.forEach(function(e){ porCategoria[e.category] = (porCategoria[e.category]||0) + e.amount; });
  cats = Object.entries(porCategoria).sort(function(a,b){ return b[1]-a[1]; });

  wrap.innerHTML = "";

  // ── Navegação de mês
  var navEl = document.createElement("div");
  navEl.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:10px";
  navEl.innerHTML =
    '<button onclick="window._despesasMudarMes(-1)" style="width:34px;height:34px;border-radius:var(--radius-sm);border:1.5px solid #e4e4e7;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s ease"><i data-lucide="chevron-left" style="width:16px;height:16px;color:var(--text2)"></i></button>' +
    '<div style="font-size:13px;font-weight:700;color:var(--text2);text-transform:capitalize">' + nomeMes + '</div>' +
    '<button onclick="window._despesasMudarMes(1)" ' + (ehMesActual?'disabled style="opacity:.35;cursor:default;':'style="cursor:pointer;') + 'width:34px;height:34px;border-radius:var(--radius-sm);border:1.5px solid #e4e4e7;background:#fff;display:flex;align-items:center;justify-content:center;transition:background .15s ease"><i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text2)"></i></button>';
  wrap.appendChild(navEl);

  // ── Botão nova despesa
  var btnEl = document.createElement("button");
  btnEl.className = "btn btn-primary btn-full";
  btnEl.style.marginBottom = "16px";
  btnEl.style.background = "var(--primary)";
  btnEl.innerHTML = '<i data-lucide="plus"></i> Nova despesa';
  btnEl.onclick = function(){ window._openDespesaForm(); };
  wrap.appendChild(btnEl);
  refreshIcons(btnEl);

  // ── Hero: total do mês
  var totalContabilizavel = doMes.filter(function(e){ return e.countsInAccounting !== false; })
    .reduce(function(a,e){ return a+(e.amount||0); },0);
  var temExcecoes = doMes.some(function(e){ return e.countsInAccounting === false; });

  var heroEl = document.createElement("div");
  heroEl.className = "desp-hero";
  heroEl.innerHTML =
    '<div class="desp-hero-label">Total do mês</div>' +
    '<div class="desp-hero-val">' + fmt(totalMes) + '</div>' +
    '<div class="desp-hero-sub">' + doMes.length + ' despesa' + (doMes.length!==1?"s":"") + ' · clica + para registar</div>' +
    (temExcecoes
      ? '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border2);font-size:12px;color:var(--text3)">Contabilizável: <strong style="color:var(--text2)">' + fmt(totalContabilizavel) + '</strong></div>'
      : '');
  wrap.appendChild(heroEl);

  // ── Por categoria
  if (cats.length) {
    var catLabel = document.createElement("div");
    catLabel.className = "desp-section-label";
    catLabel.textContent = "Por categoria";
    wrap.appendChild(catLabel);

    var catCard = document.createElement("div");
    catCard.className = "list-card";
    catCard.style.padding = "14px 16px";
    catCard.style.marginBottom = "16px";

    var catRows = document.createElement("div");
    catRows.className = "desp-cat-row";
    cats.forEach(function(entry) {
      var pct = totalMes > 0 ? Math.round((entry[1]/totalMes)*100) : 0;
      var row = document.createElement("div");
      row.className = "desp-cat-item";
      row.innerHTML =
        '<div class="desp-cat-name">' + entry[0] + '</div>' +
        '<div class="desp-cat-bar-wrap"><div class="desp-cat-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="desp-cat-val">' + fmt(entry[1]) + '</div>';
      catRows.appendChild(row);
    });
    catCard.appendChild(catRows);
    wrap.appendChild(catCard);
  }

  // ── Histórico
  var histLabel = document.createElement("div");
  histLabel.className = "desp-section-label";
  histLabel.textContent = "Histórico (" + activeExpenses.length + ")";
  wrap.appendChild(histLabel);

  if (activeExpenses.length === 0) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      '<i data-lucide="receipt"></i>' +
      '<div class="empty-state-title">Nenhuma despesa</div>' +
      '<div class="empty-state-sub">As despesas registadas aparecem aqui.</div>';
    wrap.appendChild(empty);
    refreshIcons(wrap);
    return;
  }

  var listEl = document.createElement("div");
  listEl.className = "list-card";
  listEl.style.marginBottom = "16px";

  activeExpenses.slice(0,50).forEach(function(e) {
    var item = document.createElement("div");
    item.className = "desp-item";
    var naoContabilizavel = e.countsInAccounting === false;
    item.innerHTML =
      '<div class="desp-item-icon"><i data-lucide="arrow-down-left"></i></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="desp-item-desc">' + e.description + '</div>' +
        '<div class="desp-item-meta">' + e.category + ' · ' + fmtDate(e.date) + ' · ' + (PAYMETHODS.find(function(p){return p.value===e.payMethod;})||{label:"Dinheiro"}).label + (naoContabilizavel ? ' · <span style="color:var(--text4)">Não contabilizável</span>' : '') + '</div>' +
      '</div>' +
      '<div class="desp-item-val">' + fmt(e.amount) + '</div>' +
      '<div style="display:flex;gap:4px">' +
      '<button class="desp-item-edit" onclick="window._editDespesa(' + e.id + ')"><i data-lucide="pencil" style="width:15px;height:15px"></i></button>' +
      '<button class="desp-item-del" onclick="window._archiveDespesa(' + e.id + ')" title="Arquivar"><i data-lucide="archive" style="width:15px;height:15px"></i></button>' +
      '</div>';
    listEl.appendChild(item);
  });

  wrap.appendChild(listEl);

  if (archivedExpenses.length) {
    var archLink = document.createElement("button");
    archLink.style.cssText = "width:100%;padding:10px;background:none;border:none;color:var(--text3);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:8px";
    archLink.innerHTML = '<i data-lucide="archive" style="width:13px;height:13px"></i> Arquivadas (' + archivedExpenses.length + ')';
    archLink.onclick = window._toggleArquivadasDespesas;
    wrap.appendChild(archLink);

    var archSection = document.createElement("div");
    archSection.id = "desp-archived-section";
    archSection.className = "list-card";
    archSection.style.display = "none";
    archSection.style.marginBottom = "16px";
    archivedExpenses.forEach(function(e){
      var item = document.createElement("div");
      item.className = "desp-item";
      item.style.opacity = ".7";
      item.innerHTML =
        '<div class="desp-item-icon"><i data-lucide="arrow-down-left"></i></div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="desp-item-desc">' + e.description + '</div>' +
          '<div class="desp-item-meta">' + e.category + ' · ' + fmtDate(e.date) + '</div>' +
        '</div>' +
        '<div class="desp-item-val">' + fmt(e.amount) + '</div>' +
        '<button class="desp-item-edit" onclick="window._restoreDespesa(' + e.id + ')" title="Restaurar"><i data-lucide="rotate-ccw" style="width:15px;height:15px"></i></button>';
      archSection.appendChild(item);
    });
    wrap.appendChild(archSection);
  }

  refreshIcons(wrap);
}

function _accountingToggleHtml(checked) {
  return '<div class="field">' +
    '<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:10px 12px;background:#fafafa;border-radius:var(--radius-sm)">' +
      '<span style="font-size:13px;font-weight:600;color:var(--text2)">Conta para a contabilidade</span>' +
      '<input type="checkbox" id="de-accounting" ' + (checked !== false ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--primary)"/>' +
    '</label>' +
    '<div style="font-size:11px;color:var(--text4);margin-top:4px;line-height:1.4">Desmarca se for uma despesa pessoal ou sem comprovativo — não entra no cálculo de lucro do negócio.</div>' +
  '</div>';
}

var PAYMETHODS = [
  { value:"dinheiro",      label:"Dinheiro",      icon:"banknote" },
  { value:"multicaixa",    label:"Multicaixa",    icon:"credit-card" },
  { value:"transferencia", label:"Transferência", icon:"arrow-left-right" },
];

function _payMethodHtml(current) {
  current = current || "dinheiro";
  return '<div class="field"><label>Método de pagamento</label>' +
    '<input type="hidden" id="de-paymethod-value" value="' + current + '"/>' +
    '<div id="de-paymethod" style="display:flex;gap:6px">' +
    PAYMETHODS.map(function(o){
      var active = o.value === current;
      return '<button type="button" data-value="' + o.value + '" onclick="window._selectPayMethod(this)" ' +
        'style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:var(--radius-sm);border:1.5px solid ' + (active?"var(--primary)":"#e4e4e7") + ';background:' + (active?"var(--primary-light)":"#fff") + ';color:' + (active?"var(--primary)":"var(--text3)") + ';font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:border-color .18s ease,background .18s ease,color .18s ease">' +
        '<i data-lucide="' + o.icon + '" style="width:16px;height:16px"></i>' + o.label +
        '</button>';
    }).join("") +
    '</div></div>';
}

window._selectPayMethod = function(btn) {
  var val = btn.getAttribute("data-value");
  var hidden = document.getElementById("de-paymethod-value");
  if (hidden) hidden.value = val;
  var wrap = btn.parentElement;
  Array.prototype.forEach.call(wrap.children, function(b){
    var active = b.getAttribute("data-value") === val;
    b.style.borderColor = active ? "var(--primary)" : "#e4e4e7";
    b.style.background  = active ? "var(--primary-light)" : "#fff";
    b.style.color       = active ? "var(--primary)" : "var(--text3)";
  });
};

function _catPickerButtonHtml(current) {
  return '<div class="field">' +
    '<label>Categoria</label>' +
    '<button type="button" id="de-cat-btn" data-value="' + current + '" onclick="window._openCatPicker()" ' +
    'style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:11px 12px;border:1.5px solid #e4e4e7;border-radius:var(--radius-sm);background:#fff;font-size:14px;font-family:inherit;color:var(--text);cursor:pointer">' +
    '<span>' + current + '</span>' +
    '<i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text4)"></i>' +
    '</button>' +
  '</div>';
}

window._openCatPicker = function() {
  var btn = document.getElementById("de-cat-btn");
  var current = btn ? btn.getAttribute("data-value") : CATEGORIAS[0];
  window._catPickerReturnTo = btn;

  var old = document.getElementById("cat-picker-overlay");
  if (old) old.remove();

  var rows = CATEGORIAS.map(function(c){
    var active = c === current;
    return '<button onclick="window._selectCat(\'' + c.replace(/'/g,"\\'") + '\')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border:none;border-bottom:1px solid #f4f4f5;background:none;font-size:14px;font-family:inherit;color:' + (active?"var(--primary)":"var(--text)") + ';font-weight:' + (active?"700":"500") + ';cursor:pointer;text-align:left">' +
      '<span>' + c + '</span>' +
      (active ? '<i data-lucide="check" style="width:16px;height:16px;color:var(--primary)"></i>' : '') +
      '</button>';
  }).join("");

  var overlay = document.createElement("div");
  overlay.id = "cat-picker-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0);z-index:9999;display:flex;align-items:flex-end;transition:background .22s ease";
  overlay.innerHTML =
    '<div id="cat-picker-sheet" style="width:100%;background:#fff;border-radius:20px 20px 0 0;max-height:70vh;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0);transform:translateY(100%);transition:transform .25s cubic-bezier(.22,1,.36,1)">' +
      '<div style="padding:16px 18px 10px;font-size:15px;font-weight:700;color:var(--text);border-bottom:1px solid #f4f4f5">Escolher Categoria</div>' +
      '<div style="overflow-y:auto">' + rows + '</div>' +
    '</div>';
  overlay.onclick = function(e) { if (e.target === overlay) _closeCatPicker(); };
  document.body.appendChild(overlay);
  refreshIcons(overlay);
  requestAnimationFrame(function(){
    overlay.style.background = "rgba(0,0,0,.4)";
    var sheet = document.getElementById("cat-picker-sheet");
    if (sheet) sheet.style.transform = "translateY(0)";
  });
};

function _closeCatPicker() {
  var overlay = document.getElementById("cat-picker-overlay");
  if (!overlay) return;
  var sheet = document.getElementById("cat-picker-sheet");
  overlay.style.background = "rgba(0,0,0,0)";
  if (sheet) sheet.style.transform = "translateY(100%)";
  setTimeout(function(){ overlay.remove(); }, 220);
}

window._selectCat = function(value) {
  var btn = window._catPickerReturnTo || document.getElementById("de-cat-btn");
  if (btn) {
    btn.setAttribute("data-value", value);
    var span = btn.querySelector("span");
    if (span) span.textContent = value;
  }
  _closeCatPicker();
};

window._editDespesa = async function(id) {
  var { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }

  var e = await db.get("expenses", id);
  if (!e) return;
  openModal("Editar Despesa",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Descrição *</label><input id="de-desc" value="' + e.description + '" placeholder="Ex: Renda de Junho"/></div>' +
    _catPickerButtonHtml(e.category || CATEGORIAS[0]) +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="de-amount" value="' + e.amount + '" placeholder="0"/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="de-date" value="' + (e.date||"").slice(0,10) + '"/></div>' +
    _payMethodHtml(e.payMethod) +
    _accountingToggleHtml(e.countsInAccounting) +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--primary)" onclick="window._updateDespesa(' + id + ')"><i data-lucide="save"></i> Guardar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._updateDespesa = async function(id) {
  var { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }
  var desc   = (el("de-desc")||{}).value.trim();
  var amount = Number((el("de-amount")||{}).value);
  if (!desc)         { toast("A descrição é obrigatória.", "error"); return; }
  if (!amount || amount <= 0) { toast("O valor deve ser maior que zero.", "error"); return; }
  var existing = await db.get("expenses", id);
  var accEl   = document.getElementById("de-accounting");
  var catBtnU = document.getElementById("de-cat-btn");
  var payElU  = document.getElementById("de-paymethod-value");
  await db.put("expenses", Object.assign({}, existing, {
    description: desc,
    category: (catBtnU ? catBtnU.getAttribute("data-value") : null) || "Outro",
    amount: amount,
    date: (el("de-date")||{}).value || existing.date,
    payMethod: payElU ? payElU.value : (existing.payMethod || "dinheiro"),
    countsInAccounting: accEl ? accEl.checked : true,
  }));
  toast("Despesa actualizada.", "success");
  closeModal();
  await renderDespesas();
};

window._openDespesaForm = async function() {
  var { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }

  openModal("Nova Despesa",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Descrição *</label><input id="de-desc" placeholder="Ex: Renda de Junho"/></div>' +
    _catPickerButtonHtml(CATEGORIAS[0]) +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="de-amount" placeholder="0"/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="de-date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
    _payMethodHtml("dinheiro") +
    _accountingToggleHtml(true) +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--primary)" onclick="window._saveDespesa()"><i data-lucide="save"></i> Registar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._saveDespesa = async function() {
  const { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }
  var desc   = (el("de-desc")||{}).value || "";
  desc = desc.trim();
  var amount = Number((el("de-amount")||{}).value);
  if (!desc)          { toast("A descrição é obrigatória.","error"); return; }
  if (!amount || amount <= 0) { toast("O valor deve ser maior que zero.","error"); return; }
  var user = getUser();
  var accEl2  = document.getElementById("de-accounting");
  var catBtnN = document.getElementById("de-cat-btn");
  var payEl2  = document.getElementById("de-paymethod-value");
  var sess    = getSession();
  await db.add("expenses", {
    description: desc,
    category: (catBtnN ? catBtnN.getAttribute("data-value") : null) || "Outro",
    amount: amount,
    date: (el("de-date")||{}).value || new Date().toISOString().slice(0,10),
    userId: user ? user.id : null,
    sessionId: sess ? sess.id : null,
    payMethod: payEl2 ? payEl2.value : "dinheiro",
    countsInAccounting: accEl2 ? accEl2.checked : true,
    createdAt: new Date().toISOString(),
  });
  toast("Despesa registada.","success");
  closeModal();
  await renderDespesas();
};

window._archiveDespesa = async function(id) {
  if (!confirm("Arquivar esta despesa? Sai da lista mas fica guardada para auditoria.")) return;
  var e = await db.get("expenses", id);
  if (!e) return;
  await db.put("expenses", Object.assign({}, e, { archived:true, archivedAt:new Date().toISOString() }));
  toast("Despesa arquivada.","success");
  await renderDespesas();
};

window._restoreDespesa = async function(id) {
  var e = await db.get("expenses", id);
  if (!e) return;
  await db.put("expenses", Object.assign({}, e, { archived:false, archivedAt:null }));
  toast("Despesa restaurada.","success");
  await renderDespesas();
};

window._toggleArquivadasDespesas = function() {
  var sec = document.getElementById("desp-archived-section");
  if (sec) sec.style.display = sec.style.display === "none" ? "block" : "none";
};

window._closeModal = closeModal;
