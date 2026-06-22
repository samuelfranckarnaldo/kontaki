import { db }            from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast }         from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser }       from "../auth.js";

var CATEGORIAS = ["Renda","Electricidade","Água","Salários","Transporte","Manutenção","Internet/Telefone","Outro"];

export async function loadDespesas() {
  var btn = document.getElementById("btn-back-despesas");
  if (btn) btn.onclick = function() { if (window._showSubpage) window._showSubpage(null); };
  await renderDespesas();
}

async function renderDespesas() {
  var wrap = document.getElementById("despesas-content");
  if (!wrap) return;

  var expenses = await db.getAll("expenses");
  expenses.sort(function(a,b){ return new Date(b.date) - new Date(a.date); });

  var now = new Date();
  var mes = now.toISOString().slice(0,7);
  var doMes = expenses.filter(function(e){ return (e.date||"").startsWith(mes); });
  var totalMes = doMes.reduce(function(a,e){ return a+(e.amount||0); },0);

  var porCategoria = {};
  doMes.forEach(function(e){ porCategoria[e.category] = (porCategoria[e.category]||0) + e.amount; });

  wrap.innerHTML =
    '<button onclick="window._openDespesaForm()" style="width:100%;padding:13px;background:#dc2626;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px"><i data-lucide="plus" style="width:16px;height:16px"></i> Nova Despesa</button>' +

    '<div class="stat-card" style="border-left:3px solid #dc2626;margin-bottom:14px">' +
    '<div class="stat-label" style="color:#dc2626">Total este mês</div>' +
    '<div class="stat-val" style="color:#dc2626">' + fmt(totalMes) + '</div>' +
    '</div>' +

    (Object.keys(porCategoria).length ?
      '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Por categoria</div>' +
      '<div class="vender-card" style="margin-bottom:14px">' +
      Object.entries(porCategoria).sort(function(a,b){return b[1]-a[1];}).map(function(e){
        var pct = totalMes>0 ? Math.round((e[1]/totalMes)*100) : 0;
        return '<div style="margin-bottom:8px">' +
          '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px"><span style="font-weight:600">' + e[0] + '</span><span style="font-weight:700;color:#dc2626">' + fmt(e[1]) + '</span></div>' +
          '<div style="height:5px;background:#f4f4f5;border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:#dc2626"></div></div>' +
          '</div>';
      }).join("") +
      '</div>' : "") +

    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Histórico (' + expenses.length + ')</div>' +
    (expenses.length === 0 ?
      '<div style="text-align:center;color:#a1a1aa;font-size:13px;padding:20px">Nenhuma despesa registada.</div>' :
      '<div class="list-card">' +
      expenses.slice(0,50).map(function(e){
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #f4f4f5">' +
          '<div>' +
          '<div style="font-size:13px;font-weight:600">' + e.description + '</div>' +
          '<div style="font-size:11px;color:#71717a;margin-top:2px">' + e.category + ' · ' + fmtDate(e.date) + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
          '<div style="font-size:14px;font-weight:700;color:#dc2626">' + fmt(e.amount) + '</div>' +
          '<button onclick="window._deleteDespesa(' + e.id + ')" style="background:none;border:none;color:#a1a1aa;cursor:pointer;padding:4px"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>' +
          '</div></div>';
      }).join("") +
      '</div>');

  refreshIcons(wrap);
}

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
    '<button class="btn btn-primary btn-full" style="background:#dc2626" onclick="window._saveDespesa()"><i data-lucide="save"></i> Registar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._saveDespesa = async function() {
  var desc   = el("de-desc").value.trim();
  var amount = Number(el("de-amount").value);
  if (!desc)   { toast("A descrição é obrigatória.","error"); return; }
  if (!amount || amount <= 0) { toast("O valor deve ser maior que zero.","error"); return; }
  var user = getUser();
  await db.add("expenses", {
    description: desc,
    category: el("de-cat").value,
    amount: amount,
    date: el("de-date").value || new Date().toISOString().slice(0,10),
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
