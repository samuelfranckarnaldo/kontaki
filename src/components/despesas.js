import { db }            from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast }         from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser }       from "../auth.js";

var CATEGORIAS = ["Renda","Electricidade","Água","Salários","Transporte","Manutenção","Internet/Telefone","Outro"];

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
  btnEl.style.background = "var(--danger)";
  btnEl.innerHTML = '<i data-lucide="plus"></i> Nova despesa';
  btnEl.onclick = function(){ window._openDespesaForm(); };
  wrap.appendChild(btnEl);
  refreshIcons(btnEl);

  // ── Hero: total do mês
  var heroEl = document.createElement("div");
  heroEl.className = "desp-hero";
  heroEl.style.background = "linear-gradient(135deg,#dc2626,#ef4444)";
  heroEl.style.color = "#fff";
  heroEl.style.borderRadius = "16px";
  heroEl.style.padding = "20px 16px";
  heroEl.style.marginBottom = "16px";
  heroEl.innerHTML =
    '<div style="font-size:11px;font-weight:700;opacity:.8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Total em ' + nomeMes + '</div>' +
    '<div style="font-size:32px;font-weight:800;line-height:1;letter-spacing:-.5px">' + fmt(totalMes) + '</div>' +
    '<div style="font-size:12px;opacity:.8;margin-top:6px">' + doMes.length + ' despesa' + (doMes.length!==1?"s":"") + ' · clica + para registar</div>';
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
    item.innerHTML =
      '<div class="desp-item-icon"><i data-lucide="arrow-down-left"></i></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="desp-item-desc">' + e.description + '</div>' +
        '<div class="desp-item-meta">' + e.category + ' · ' + fmtDate(e.date) + '</div>' +
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

window._editDespesa = async function(id) {
  var e = await db.get("expenses", id);
  if (!e) return;
  openModal("Editar Despesa",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Descrição *</label><input id="de-desc" value="' + e.description + '" placeholder="Ex: Renda de Junho"/></div>' +
    '<div class="field"><label>Categoria</label><select id="de-cat">' + CATEGORIAS.map(function(c){ return '<option' + (c===e.category?' selected':'') + '>' + c + '</option>'; }).join("") + '</select></div>' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="de-amount" value="' + e.amount + '" placeholder="0"/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="de-date" value="' + (e.date||"").slice(0,10) + '"/></div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--danger)" onclick="window._updateDespesa(' + id + ')"><i data-lucide="save"></i> Guardar</button>' +
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
  await db.put("expenses", Object.assign({}, existing, {
    description: desc,
    category: (el("de-cat")||{}).value || "Outro",
    amount: amount,
    date: (el("de-date")||{}).value || existing.date,
  }));
  toast("Despesa actualizada.", "success");
  closeModal();
  await renderDespesas();
};

window._openDespesaForm = function() {
  openModal("Nova Despesa",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Descrição *</label><input id="de-desc" placeholder="Ex: Renda de Junho"/></div>' +
    '<div class="field"><label>Categoria</label><select id="de-cat">' + CATEGORIAS.map(function(c){return '<option>'+c+'</option>';}).join("") + '</select></div>' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="de-amount" placeholder="0"/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="de-date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--danger)" onclick="window._saveDespesa()"><i data-lucide="save"></i> Registar</button>' +
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
  await db.add("expenses", {
    description: desc,
    category: (el("de-cat")||{}).value || "Outro",
    amount: amount,
    date: (el("de-date")||{}).value || new Date().toISOString().slice(0,10),
    userId: user ? user.id : null,
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
