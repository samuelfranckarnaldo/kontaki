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

async function renderDespesas() {
  var wrap = document.getElementById("despesas-content");
  if (!wrap) return;

  var expenses, now, mes, doMes, totalMes, nomeMes, porCategoria, cats;

  try {
    expenses = await db.getAll("expenses");
  } catch(err) {
    wrap.innerHTML = '<div style="padding:20px;color:red;font-size:13px">Erro DB: ' + err.message + '</div>';
    return;
  }

  expenses.sort(function(a,b){ return new Date(b.date) - new Date(a.date); });

  now      = new Date();
  mes      = now.toISOString().slice(0,7);
  doMes    = expenses.filter(function(e){ return (e.date||"").startsWith(mes); });
  totalMes = doMes.reduce(function(a,e){ return a+(e.amount||0); },0);

  try {
    nomeMes = now.toLocaleDateString("pt-PT",{month:"long",year:"numeric"});
  } catch(e) {
    nomeMes = mes;
  }

  porCategoria = {};
  doMes.forEach(function(e){ porCategoria[e.category] = (porCategoria[e.category]||0) + e.amount; });
  cats = Object.entries(porCategoria).sort(function(a,b){ return b[1]-a[1]; });

  wrap.innerHTML = "";

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
    '<div class="desp-hero-label">Total em ' + nomeMes + '</div>' +
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
  histLabel.textContent = "Histórico (" + expenses.length + ")";
  wrap.appendChild(histLabel);

  if (expenses.length === 0) {
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

  expenses.slice(0,50).forEach(function(e) {
    var item = document.createElement("div");
    item.className = "desp-item";
    var naoContabilizavel = e.countsInAccounting === false;
    item.innerHTML =
      '<div class="desp-item-icon"><i data-lucide="arrow-down-left"></i></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="desp-item-desc">' + e.description + '</div>' +
        '<div class="desp-item-meta">' + e.category + ' · ' + fmtDate(e.date) + (naoContabilizavel ? ' · <span style="color:var(--text4)">Não contabilizável</span>' : '') + '</div>' +
      '</div>' +
      '<div class="desp-item-val">' + fmt(e.amount) + '</div>' +
      '<div style="display:flex;gap:4px">' +
      '<button class="desp-item-edit" onclick="window._editDespesa(' + e.id + ')"><i data-lucide="pencil" style="width:15px;height:15px"></i></button>' +
      '<button class="desp-item-del" onclick="window._deleteDespesa(' + e.id + ')"><i data-lucide="trash-2" style="width:15px;height:15px"></i></button>' +
      '</div>';
    listEl.appendChild(item);
  });

  wrap.appendChild(listEl);
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
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:flex-end";
  overlay.innerHTML =
    '<div style="width:100%;background:#fff;border-radius:20px 20px 0 0;max-height:70vh;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0)">' +
      '<div style="padding:16px 18px 10px;font-size:15px;font-weight:700;color:var(--text);border-bottom:1px solid #f4f4f5">Escolher Categoria</div>' +
      '<div style="overflow-y:auto">' + rows + '</div>' +
    '</div>';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  refreshIcons(overlay);
};

window._selectCat = function(value) {
  var btn = window._catPickerReturnTo || document.getElementById("de-cat-btn");
  if (btn) {
    btn.setAttribute("data-value", value);
    var span = btn.querySelector("span");
    if (span) span.textContent = value;
  }
  var overlay = document.getElementById("cat-picker-overlay");
  if (overlay) overlay.remove();
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
  var accEl = document.getElementById("de-accounting");
  var catBtnU = document.getElementById("de-cat-btn");
  await db.put("expenses", Object.assign({}, existing, {
    description: desc,
    category: (catBtnU ? catBtnU.getAttribute("data-value") : null) || "Outro",
    amount: amount,
    date: (el("de-date")||{}).value || existing.date,
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
  var accEl2 = document.getElementById("de-accounting");
  var catBtnN = document.getElementById("de-cat-btn");
  await db.add("expenses", {
    description: desc,
    category: (catBtnN ? catBtnN.getAttribute("data-value") : null) || "Outro",
    amount: amount,
    date: (el("de-date")||{}).value || new Date().toISOString().slice(0,10),
    userId: user ? user.id : null,
    countsInAccounting: accEl2 ? accEl2.checked : true,
    createdAt: new Date().toISOString(),
  });
  toast("Despesa registada.","success");
  closeModal();
  await renderDespesas();
};

window._deleteDespesa = async function(id) {
  if (!confirm("Eliminar esta despesa?")) return;
  await db.delete("expenses", id);
  toast("Despesa eliminada.","success");
  await renderDespesas();
};

window._closeModal = closeModal;
