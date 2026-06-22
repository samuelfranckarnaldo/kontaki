import { db }            from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast }         from "../toast.js";
import { openModal, closeModal } from "../modal.js";

export async function loadClientes() {
  var btn = document.getElementById("btn-back-clientes");
  if (btn) btn.onclick = function() { if (window._showSubpage) window._showSubpage(null); };
  await renderClientes();
}

async function renderClientes() {
  var wrap = document.getElementById("clientes-content");
  if (!wrap) return;

  var [clients, sales, fiados] = await Promise.all([
    db.getAll("clients"), db.getAll("sales"), db.getAll("fiado"),
  ]);

  clients.sort(function(a,b){ return (a.name||"").localeCompare(b.name||""); });

  var rows = clients.map(function(c) {
    var mySales  = sales.filter(function(s){ return s.clientId===c.id || (s.clientName||"").toLowerCase()===c.name.toLowerCase(); });
    var myFiados = fiados.filter(function(f){ return f.clientId===c.id || (f.clientName||"").toLowerCase()===c.name.toLowerCase(); });
    var totalGasto = mySales.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
    var fiadoAberto = myFiados.filter(function(f){ return f.status==="open"; }).reduce(function(a,f){ return a+(f.amount||0); },0);

    return '<div onclick="window._openClienteDetail(' + c.id + ')" style="display:flex;justify-content:space-between;align-items:center;padding:13px 14px;border-bottom:1px solid #f4f4f5;cursor:pointer">' +
      '<div>' +
      '<div style="font-size:14px;font-weight:600">' + c.name + '</div>' +
      '<div style="font-size:11px;color:#71717a;margin-top:2px">' + (c.phone||"sem telefone") + ' · ' + mySales.length + ' compras</div>' +
      '</div>' +
      '<div style="text-align:right">' +
      '<div style="font-size:13px;font-weight:700;color:#5b21b6">' + fmt(totalGasto) + '</div>' +
      (fiadoAberto>0 ? '<div style="font-size:11px;color:#dc2626;font-weight:600">Fiado: ' + fmt(fiadoAberto) + '</div>' : '') +
      '</div></div>';
  }).join("");

  wrap.innerHTML =
    '<button onclick="window._openClienteForm()" style="width:100%;padding:13px;background:#5b21b6;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px"><i data-lucide="user-plus" style="width:16px;height:16px"></i> Novo Cliente</button>' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">' + clients.length + ' cliente(s)</div>' +
    (clients.length === 0
      ? '<div style="text-align:center;color:#a1a1aa;font-size:13px;padding:30px">Nenhum cliente registado.<br/>São criados automaticamente ao vender ou registar fiado.</div>'
      : '<div class="list-card">' + rows + '</div>');

  refreshIcons(wrap);
}

window._openClienteForm = function(c) {
  c = c || {};
  openModal(c.id ? "Editar Cliente" : "Novo Cliente",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Nome *</label><input id="cl-name" value="' + (c.name||"") + '" placeholder="Ex: Maria Silva"/></div>' +
    '<div class="field"><label>Telefone</label><input id="cl-phone" value="' + (c.phone||"") + '" type="tel" placeholder="923 000 000"/></div>' +
    '<div class="field"><label>Endereço</label><input id="cl-addr" value="' + (c.address||"") + '"/></div>' +
    '<div class="field"><label>Notas</label><input id="cl-notes" value="' + (c.notes||"") + '"/></div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._saveCliente(' + (c.id||0) + ')"><i data-lucide="save"></i> Guardar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._saveCliente = async function(id) {
  var name = el("cl-name").value.trim();
  if (!name) { toast("O nome é obrigatório.","error"); return; }
  var data = {
    name,
    phone:   el("cl-phone").value.trim(),
    address: el("cl-addr").value.trim(),
    notes:   el("cl-notes").value.trim(),
  };
  if (id) {
    var ex = await db.get("clients", id);
    await db.put("clients", Object.assign({}, ex, data));
    toast("Cliente actualizado.","success");
  } else {
    await db.add("clients", Object.assign({}, data, { createdAt: new Date().toISOString() }));
    toast("Cliente adicionado.","success");
  }
  closeModal();
  await renderClientes();
};

window._openClienteDetail = async function(id) {
  var c = await db.get("clients", id);
  if (!c) return;
  var [sales, fiados] = await Promise.all([db.getAll("sales"), db.getAll("fiado")]);
  var mySales  = sales.filter(function(s){ return s.clientId===c.id || (s.clientName||"").toLowerCase()===c.name.toLowerCase(); }).reverse();
  var myFiados = fiados.filter(function(f){ return f.clientId===c.id || (f.clientName||"").toLowerCase()===c.name.toLowerCase(); });
  var totalGasto = mySales.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var fiadoAberto = myFiados.filter(function(f){ return f.status==="open"; }).reduce(function(a,f){ return a+(f.amount||0); },0);

  openModal(c.name,
    '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;background:#f4f4f5;border-radius:10px;padding:12px">' +
    (c.phone   ? '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#71717a">Telefone</span><span style="font-weight:600">' + c.phone + '</span></div>' : '') +
    (c.address ? '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#71717a">Endereço</span><span style="font-weight:600">' + c.address + '</span></div>' : '') +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">' +
    '<div class="stat-card" style="border-left:3px solid #16a34a"><div class="stat-label" style="color:#16a34a">Total gasto</div><div class="stat-val" style="color:#16a34a;font-size:14px">' + fmt(totalGasto) + '</div></div>' +
    '<div class="stat-card" style="border-left:3px solid ' + (fiadoAberto>0?"#dc2626":"#71717a") + '"><div class="stat-label">Fiado aberto</div><div class="stat-val" style="color:' + (fiadoAberto>0?"#dc2626":"#18181b") + ';font-size:14px">' + fmt(fiadoAberto) + '</div></div>' +
    '</div>' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Histórico de compras (' + mySales.length + ')</div>' +
    '<div style="max-height:240px;overflow-y:auto;margin-bottom:14px">' +
    (mySales.length === 0 ? '<div style="text-align:center;color:#a1a1aa;font-size:13px;padding:14px">Sem compras registadas</div>' :
      mySales.slice(0,30).map(function(s){
        return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f4f4f5;font-size:13px">' +
          '<span style="color:#71717a">' + fmtDate(s.date) + '</span><span style="font-weight:700">' + fmt(s.total) + '</span></div>';
      }).join("")
    ) +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._openClienteForm(' + JSON.stringify(c).replace(/"/g,"&quot;") + ')"><i data-lucide="edit-3"></i> Editar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._closeModal = closeModal;
