import { db }            from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast }         from "../toast.js";
import { openModal, closeModal } from "../modal.js";

export async function loadClientes() {
  var btn = document.getElementById("btn-back-clientes");
  if (btn) btn.onclick = function() { window._perfilBack(); };
  await renderClientes();
}

async function renderClientes() {
  var wrap = document.getElementById("clientes-content");
  if (!wrap) return;

  var results = await Promise.all([
    db.getAll("clients"), db.getAll("sales"), db.getAll("fiado"),
  ]);
  var clients = results[0];
  var sales   = results[1];
  var fiados  = results[2];

  clients.sort(function(a,b){ return (a.name||"").localeCompare(b.name||""); });

  // Pesquisa
  var searchId = "clientes-search-input";
  var searchVal = (document.getElementById(searchId)||{}).value || "";

  wrap.innerHTML = "";

  // Barra de pesquisa + botão
  var topBar = document.createElement("div");
  topBar.style.cssText = "display:flex;gap:8px;margin-bottom:14px";
  topBar.innerHTML =
    '<div class="search-wrap" style="flex:1">' +
    '<i data-lucide="search" class="search-icon"></i>' +
    '<input id="' + searchId + '" placeholder="Pesquisar cliente..." value="' + searchVal + '" ' +
    'style="padding-left:36px" oninput="window._filterClientes(this.value)"/>' +
    '</div>' +
    '<button onclick="window._openClienteForm()" class="btn btn-primary btn-sm">' +
    '<i data-lucide="user-plus"></i> Novo' +
    '</button>';
  wrap.appendChild(topBar);
  refreshIcons(topBar);

  var filtered = clients.filter(function(c) {
    return !searchVal || (c.name||"").toLowerCase().includes(searchVal.toLowerCase()) ||
           (c.phone||"").includes(searchVal);
  });

  // Stats
  var statsEl = document.createElement("div");
  statsEl.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px";
  var totalFiadoAberto = fiados.filter(function(f){ return f.status==="open"; })
    .reduce(function(a,f){ return a+(f.amount||0); },0);
  statsEl.innerHTML =
    '<div class="stat-card">' +
    '<div class="stat-label">Total clientes</div>' +
    '<div class="stat-val" style="color:var(--primary)">' + clients.length + '</div>' +
    '</div>' +
    '<div class="stat-card">' +
    '<div class="stat-label">Fiado em aberto</div>' +
    '<div class="stat-val" style="color:var(--warning)">' + fmt(totalFiadoAberto) + '</div>' +
    '</div>';
  wrap.appendChild(statsEl);

  if (filtered.length === 0) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      '<i data-lucide="users"></i>' +
      '<div class="empty-state-title">' + (clients.length === 0 ? "Nenhum cliente" : "Sem resultados") + '</div>' +
      '<div class="empty-state-sub">' +
      (clients.length === 0
        ? "Os clientes são criados automaticamente ao vender ou registar fiado."
        : "Tenta pesquisar por outro nome ou telefone.") +
      '</div>';
    wrap.appendChild(empty);
    refreshIcons(wrap);
    return;
  }

  var listEl = document.createElement("div");
  listEl.className = "list-card";

  filtered.forEach(function(c) {
    var mySales     = sales.filter(function(s){ return s.clientId===c.id || (s.clientName||"").toLowerCase()===c.name.toLowerCase(); });
    var myFiados    = fiados.filter(function(f){ return f.clientId===c.id || (f.clientName||"").toLowerCase()===c.name.toLowerCase(); });
    var totalGasto  = mySales.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
    var fiadoAberto = myFiados.filter(function(f){ return f.status==="open"; }).reduce(function(a,f){ return a+(f.amount||0); },0);

    var row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px;padding:13px 14px;border-bottom:1px solid var(--border2);cursor:pointer;transition:background .15s";
    row.onmouseenter = function(){ this.style.background = "var(--border2)"; };
    row.onmouseleave = function(){ this.style.background = ""; };
    row.onclick = function(){ window._openClienteDetail(c.id); };

    row.innerHTML =
      '<div style="width:40px;height:40px;border-radius:12px;background:var(--primary-light);' +
      'color:var(--primary);font-size:16px;font-weight:800;display:flex;align-items:center;' +
      'justify-content:center;flex-shrink:0">' + c.name.charAt(0).toUpperCase() + '</div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:14px;font-weight:700;color:var(--text)">' + c.name + '</div>' +
      '<div style="font-size:11px;color:var(--text4);margin-top:2px">' +
      (c.phone || "sem telefone") + ' · ' + mySales.length + ' ' + (mySales.length===1?"compra":"compras") +
      '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div style="font-size:14px;font-weight:700;color:var(--primary)">' + fmt(totalGasto) + '</div>' +
      (fiadoAberto > 0
        ? '<div style="font-size:10px;color:var(--warning);font-weight:700;margin-top:2px">Fiado: ' + fmt(fiadoAberto) + '</div>'
        : '') +
      '</div>' +
      '<i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text4);flex-shrink:0"></i>';

    listEl.appendChild(row);
  });

  wrap.appendChild(listEl);
  refreshIcons(wrap);
}

window._filterClientes = function(q) {
  renderClientes();
};

window._openClienteForm = function(c) {
  c = c || {};
  openModal(c.id ? "Editar Cliente" : "Novo Cliente",
    '<div style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="field"><label>Nome *</label>' +
    '<input id="cl-name" value="' + (c.name||"") + '" placeholder="Ex: Maria Silva" autocomplete="off"/></div>' +
    '<div class="field"><label>Telefone</label>' +
    '<input id="cl-phone" value="' + (c.phone||"") + '" type="tel" placeholder="923 000 000"/></div>' +
    '<div class="field"><label>Endereço</label>' +
    '<input id="cl-addr" value="' + (c.address||"") + '" placeholder="Bairro, rua..."/></div>' +
    '<div class="field"><label>Notas</label>' +
    '<input id="cl-notes" value="' + (c.notes||"") + '" placeholder="Informações adicionais..."/></div>' +
    '</div>' +
    '<div class="form-actions" style="margin-top:16px">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._saveCliente(' + (c.id||0) + ')">' +
    '<i data-lucide="save"></i> Guardar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._saveCliente = async function(id) {
  var name = (el("cl-name")||{}).value || "";
  name = name.trim();
  if (!name) { toast("O nome é obrigatório.", "error"); return; }
  var data = {
    name:    name,
    phone:   ((el("cl-phone")||{}).value||"").trim(),
    address: ((el("cl-addr")||{}).value||"").trim(),
    notes:   ((el("cl-notes")||{}).value||"").trim(),
  };
  if (id) {
    var ex = await db.get("clients", id);
    await db.put("clients", Object.assign({}, ex, data));
    toast("Cliente actualizado.", "success");
  } else {
    await db.add("clients", Object.assign({}, data, { createdAt: new Date().toISOString() }));
    toast("Cliente adicionado.", "success");
  }
  closeModal();
  await renderClientes();
};

window._openClienteDetail = async function(id) {
  var c = await db.get("clients", id);
  if (!c) return;

  var results = await Promise.all([db.getAll("sales"), db.getAll("fiado")]);
  var sales  = results[0];
  var fiados = results[1];

  var mySales     = sales.filter(function(s){ return s.clientId===c.id || (s.clientName||"").toLowerCase()===c.name.toLowerCase(); }).reverse();
  var myFiados    = fiados.filter(function(f){ return f.clientId===c.id || (f.clientName||"").toLowerCase()===c.name.toLowerCase(); });
  var totalGasto  = mySales.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var fiadoAberto = myFiados.filter(function(f){ return f.status==="open"; }).reduce(function(a,f){ return a+(f.amount||0); },0);
  var nCompras    = mySales.length;

  openModal(c.name,
    // Header do cliente
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">' +
    '<div style="width:52px;height:52px;border-radius:16px;background:var(--primary-light);' +
    'color:var(--primary);font-size:22px;font-weight:800;display:flex;align-items:center;' +
    'justify-content:center;flex-shrink:0">' + c.name.charAt(0).toUpperCase() + '</div>' +
    '<div>' +
    '<div style="font-size:17px;font-weight:700">' + c.name + '</div>' +
    (c.phone ? '<div style="font-size:12px;color:var(--text3);margin-top:2px">' + c.phone + '</div>' : '') +
    (c.address ? '<div style="font-size:12px;color:var(--text3)">' + c.address + '</div>' : '') +
    '</div></div>' +

    // Stats
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">' +
    '<div class="stat-card" style="text-align:center">' +
    '<div class="stat-label">Compras</div>' +
    '<div class="stat-val" style="color:var(--primary);font-size:20px">' + nCompras + '</div>' +
    '</div>' +
    '<div class="stat-card" style="text-align:center">' +
    '<div class="stat-label">Total gasto</div>' +
    '<div class="stat-val" style="color:var(--success);font-size:14px">' + fmt(totalGasto) + '</div>' +
    '</div>' +
    '<div class="stat-card" style="text-align:center">' +
    '<div class="stat-label">Fiado</div>' +
    '<div class="stat-val" style="color:' + (fiadoAberto>0?"var(--warning)":"var(--success)") + ';font-size:14px">' + fmt(fiadoAberto) + '</div>' +
    '</div>' +
    '</div>' +

    // Histórico
    '<div style="font-size:11px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Últimas compras</div>' +
    '<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border2);border-radius:12px;margin-bottom:16px">' +
    (mySales.length === 0
      ? '<div style="text-align:center;color:var(--text4);font-size:13px;padding:20px">Sem compras registadas</div>'
      : mySales.slice(0,20).map(function(s){
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border2)">' +
            '<div>' +
            '<div style="font-size:13px;font-weight:600">' + fmtDate(s.date) + '</div>' +
            '<div style="font-size:11px;color:var(--text4)">' + (s.payMethod||"") + ' · ' + (s.items||[]).length + ' item(s)</div>' +
            '</div>' +
            '<div style="font-size:14px;font-weight:700;color:var(--primary)">' + fmt(s.total) + '</div>' +
            '</div>';
        }).join("")
    ) +
    '</div>' +

    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._openClienteForm(' + JSON.stringify(c).replace(/"/g,"&quot;") + ')">' +
    '<i data-lucide="edit-3"></i> Editar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._closeModal = closeModal;
