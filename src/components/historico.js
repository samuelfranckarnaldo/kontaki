import { db }                           from "../db.js";
import { fmt, fmtDate, today, el, val, setVal, refreshIcons } from "../utils.js";
import { openModal, closeModal }        from "../modal.js";
import { getUser }                      from "../auth.js";
import { printRecibo }                  from "../print.js";

let activeTab = "geral";

export async function initHistorico() {
  setVal("hist-from", today());
  setVal("hist-to",   today());
  el("btn-hist-filter").onclick = loadData;

  renderTabs();
  await loadData();
}

function renderTabs() {
  const tabs = [
    { id:"geral",    label:"Geral"    },
    { id:"stock",    label:"Stock"    },
    { id:"auditoria",label:"Auditoria"},
  ];

  const wrap = el("historico-tabs");
  if (!wrap) return;

  wrap.innerHTML = tabs.map(t =>
    '<button onclick="window._histTab(\'' + t.id + '\')" ' +
    'style="flex:1;padding:9px;border:none;border-radius:8px;font-family:inherit;' +
    'font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;' +
    'background:' + (activeTab===t.id?"#5b21b6":"transparent") + ';' +
    'color:' + (activeTab===t.id?"#fff":"#71717a") + '">' +
    t.label + '</button>'
  ).join("");
}

window._histTab = async (tab) => {
  activeTab = tab;
  renderTabs();
  await loadData();
};

async function loadData() {
  const from = val("hist-from");
  const to   = val("hist-to");

  if (activeTab === "geral")     await loadGeral(from, to);
  if (activeTab === "stock")     await loadStock(from, to);
  if (activeTab === "auditoria") await loadAuditoria(from, to);
}

// ── GERAL ─────────────────────────────────────────────────────────────────────
async function loadGeral(from, to) {
  const sales   = await db.getAll("sales");
  const fiados  = await db.getAll("fiado");
  const incidents = await db.getAll("incidents");

  const filtered = sales.filter(function(s) {
    const d = (s.date || "").split("T")[0];
    return d >= from && d <= to;
  }).reverse();

  const total    = filtered.reduce(function(a,s) { return a+(s.total||0); }, 0);
  const byM      = {};
  filtered.forEach(function(s) { byM[s.payMethod] = (byM[s.payMethod]||0) + s.total; });

  const fiadoAberto = fiados.filter(function(f) { return f.status==="open"; })
    .reduce(function(a,f) { return a+(f.amount||0); }, 0);

  const incOpen = incidents.filter(function(i) { return i.status==="open"; }).length;

  // Stats
  let statsHtml =
    '<div class="stat-card" style="border-left:3px solid #16a34a">' +
    '<div class="stat-label" style="color:#16a34a">Total período</div>' +
    '<div class="stat-val" style="color:#16a34a;font-size:16px">' + fmt(total) + '</div>' +
    '</div>' +
    '<div class="stat-card" style="border-left:3px solid #5b21b6">' +
    '<div class="stat-label" style="color:#5b21b6">Nº vendas</div>' +
    '<div class="stat-val" style="color:#5b21b6">' + filtered.length + '</div>' +
    '</div>' +
    '<div class="stat-card" style="border-left:3px solid #d97706">' +
    '<div class="stat-label" style="color:#d97706">Fiado aberto</div>' +
    '<div class="stat-val" style="color:#d97706;font-size:14px">' + fmt(fiadoAberto) + '</div>' +
    '</div>' +
    '<div class="stat-card" style="border-left:3px solid #dc2626">' +
    '<div class="stat-label" style="color:#dc2626">Incidentes</div>' +
    '<div class="stat-val" style="color:#dc2626">' + incOpen + '</div>' +
    '</div>';

  el("historico-stats").innerHTML = statsHtml;

  // Gráfico
  if (filtered.length > 0) {
    const byDay = {};
    filtered.forEach(function(s) {
      const d = (s.date || "").split("T")[0];
      byDay[d] = (byDay[d]||0) + s.total;
    });
    const days = Object.keys(byDay).sort();
    const maxV = Math.max.apply(null, Object.values(byDay).concat([1]));

    el("historico-chart").style.display = "block";
    el("historico-chart").innerHTML =
      '<div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Vendas por dia</div>' +
      '<div style="display:flex;align-items:flex-end;gap:4px;height:80px">' +
      days.map(function(d) {
        const pct   = Math.max(6, Math.round((byDay[d]/maxV)*100));
        const label = d.slice(5);
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">' +
          '<div style="font-size:9px;color:#71717a">' + fmt(byDay[d]).split(" ")[0] + '</div>' +
          '<div style="width:100%;background:#5b21b6;border-radius:4px 4px 0 0;height:' + pct + '%"></div>' +
          '<div style="font-size:9px;color:#71717a;white-space:nowrap">' + label + '</div>' +
          '</div>';
      }).join("") +
      '</div>';
  } else {
    el("historico-chart").style.display = "none";
  }

  // Botão exportar
  const exportBtn = el("btn-export-csv");
  if (exportBtn) {
    exportBtn.style.display = "block";
    exportBtn.onclick = function() { exportCSV(filtered); };
  }

  // Lista
  if (!filtered.length) {
    el("historico-list").innerHTML =
      '<div class="empty-state">' +
      '<i data-lucide="clock" style="width:36px;height:36px;color:#a1a1aa;margin-bottom:10px"></i>' +
      '<div class="empty-state-title">Sem vendas no período</div>' +
      '<div class="empty-state-sub">Ajusta o intervalo de datas.</div>' +
      '</div>';
    refreshIcons(el("historico-list")); return;
  }

  el("historico-list").innerHTML = filtered.map(function(s) {
    return '<div class="historico-item" onclick="window._openSaleDetail(' + s.id + ')">' +
      '<div>' +
      '<div class="historico-id">Venda #' + s.id + '</div>' +
      '<div class="historico-meta">' + fmtDate(s.date) + ' · ' + (s.items ? s.items.length : 0) + ' item(s) · ' + s.payMethod +
      (s.clientName ? ' · ' + s.clientName : '') + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div class="historico-total">' + fmt(s.total) + '</div>' +
      (s.discount > 0 ? '<div style="font-size:11px;color:#dc2626">-' + fmt(s.discount) + ' desc.</div>' : '') +
      '</div></div>';
  }).join("");

  refreshIcons(el("historico-list"));
}

// ── STOCK ─────────────────────────────────────────────────────────────────────
async function loadStock(from, to) {
  el("historico-stats").innerHTML = "";
  el("historico-chart").style.display = "none";

  const movements = await db.getAll("stockMovements");
  const filtered  = movements.filter(function(m) {
    const d = (m.createdAt || "").split("T")[0];
    return d >= from && d <= to;
  });

  const local    = filtered.filter(function(m) { return m.imported !== true; });
  const imported = filtered.filter(function(m) { return m.imported === true; });

  const typeColors = {
    sale:              "#dc2626",
    purchase:          "#16a34a",
    transfer_in:       "#2563eb",
    transfer_out:      "#d97706",
    adjustment:        "#7c3aed",
    session_open:      "#71717a",
    session_close:     "#71717a",
    incident:          "#dc2626",
    incident_resolved: "#16a34a",
  };

  function renderMovements(list, title, emptyMsg) {
    if (!list.length) {
      return '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">' + title + '</div>' +
        '<div style="font-size:13px;color:#a1a1aa;text-align:center;padding:16px;background:#fff;border-radius:10px;margin-bottom:14px">' + emptyMsg + '</div>';
    }
    return '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">' + title + ' (' + list.length + ')</div>' +
      '<div class="list-card" style="margin-bottom:14px">' +
      list.slice(0,50).map(function(m) {
        const color = typeColors[m.type] || "#71717a";
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #f4f4f5">' +
          '<div>' +
          '<div style="font-size:13px;font-weight:600">' + m.productName + '</div>' +
          '<div style="font-size:11px;color:#71717a;margin-top:2px">' + m.type + ' · ' + fmtDate(m.createdAt) + '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
          '<div style="font-size:14px;font-weight:700;color:' + color + '">' + (m.qty > 0 ? "+" : "") + m.qty + '</div>' +
          '<div style="font-size:11px;color:#a1a1aa">' + m.qtyBefore + ' → ' + m.qtyAfter + '</div>' +
          '</div></div>';
      }).join("") +
      (list.length > 50 ? '<div style="padding:10px 14px;font-size:12px;color:#a1a1aa">+' + (list.length-50) + ' mais registos</div>' : '') +
      '</div>';
  }

  el("historico-list").innerHTML =
    renderMovements(local,    "Movimentos Locais",    "Nenhum movimento local no período") +
    renderMovements(imported, "Movimentos Importados","Nenhum movimento importado no período");

  refreshIcons(el("historico-list"));

  const exportBtn = el("btn-export-csv");
  if (exportBtn) {
    exportBtn.style.display = "block";
    exportBtn.onclick = function() { exportMovementsCSV(filtered); };
  }
}

// ── AUDITORIA ─────────────────────────────────────────────────────────────────
async function loadAuditoria(from, to) {
  el("historico-stats").innerHTML = "";
  el("historico-chart").style.display = "none";

  const [sessions, incidents, users] = await Promise.all([
    db.getAll("sessions"),
    db.getAll("incidents"),
    db.getAll("users"),
  ]);

  const userMap = {};
  users.forEach(function(u) { userMap[u.id] = u.name; });

  const importedSessions = sessions.filter(function(s) { return s.isImported; });
  const openIncidents    = incidents.filter(function(i) { return i.status === "open"; });
  const chain            = sessions.filter(function(s) { return !s.isImported; })
    .sort(function(a,b) { return a.id - b.id; });

  el("historico-list").innerHTML =

    // Cadeia de responsabilidade
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Cadeia de responsabilidade</div>' +
    '<div class="list-card" style="margin-bottom:14px">' +
    (chain.length === 0
      ? '<div style="padding:16px;text-align:center;font-size:13px;color:#a1a1aa">Sem sessões registadas</div>'
      : chain.map(function(s, i) {
          const color = s.status==="open" ? "#16a34a" : s.hasIncidents ? "#dc2626" : "#5b21b6";
          return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f4f4f5">' +
            (i > 0 ? '<div style="width:2px;height:20px;background:#ddd;margin-left:8px;position:absolute;margin-top:-30px"></div>' : '') +
            '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';flex-shrink:0"></div>' +
            '<div style="flex:1">' +
            '<div style="font-size:13px;font-weight:600">' + s.userName + '</div>' +
            '<div style="font-size:11px;color:#71717a">' + fmtDate(s.openedAt) + (s.closedAt ? " → "+fmtDate(s.closedAt) : " (aberto)") + '</div>' +
            (s.uuid ? '<div style="font-size:9px;color:#a1a1aa;font-family:monospace">' + s.uuid.slice(0,16) + '...</div>' : '') +
            '</div>' +
            '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:' +
            (s.status==="open"?"#dcfce7":s.hasIncidents?"#fee2e2":"#ede9fe") + ';color:' + color + '">' +
            (s.status==="open"?"Activo":s.hasIncidents?"Incidentes":"Fechado") + '</span>' +
            '</div>';
        }).join("")
    ) +
    '</div>' +

    // Sessões importadas
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Sessões importadas (' + importedSessions.length + ')</div>' +
    '<div class="list-card" style="margin-bottom:14px">' +
    (importedSessions.length === 0
      ? '<div style="padding:16px;text-align:center;font-size:13px;color:#a1a1aa">Nenhum KTK importado</div>'
      : importedSessions.map(function(s) {
          return '<div style="padding:10px 14px;border-bottom:1px solid #f4f4f5">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
            '<div>' +
            '<div style="font-size:13px;font-weight:600">' + s.userName + '</div>' +
            '<div style="font-size:11px;color:#71717a">' + fmtDate(s.openedAt) + (s.closedAt?" → "+fmtDate(s.closedAt):"") + '</div>' +
            '<div style="font-size:11px;color:#71717a">Loja: ' + (s.lojaNome||"?") + '</div>' +
            '</div>' +
            '<div style="text-align:right">' +
            '<div style="font-size:13px;font-weight:700;color:#16a34a">' + fmt(s.totalVendas||0) + '</div>' +
            '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:' +
            (s.hashLegacy?"#fef3c7":"#dcfce7") + ';color:' + (s.hashLegacy?"#d97706":"#16a34a") + '">' +
            (s.hashLegacy?"Hash legado":"HMAC válido") + '</span>' +
            '</div></div></div>';
        }).join("")
    ) +
    '</div>' +

    // Incidentes em aberto
    '<div style="font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Incidentes em aberto (' + openIncidents.length + ')</div>' +
    '<div class="list-card">' +
    (openIncidents.length === 0
      ? '<div style="padding:16px;text-align:center;font-size:13px;color:#a1a1aa">Sem incidentes em aberto</div>'
      : openIncidents.map(function(i) {
          return '<div style="padding:10px 14px;border-bottom:1px solid #f4f4f5">' +
            '<div style="display:flex;justify-content:space-between">' +
            '<div>' +
            '<div style="font-size:13px;font-weight:600;color:#dc2626">' + i.productName + '</div>' +
            '<div style="font-size:11px;color:#71717a">' + fmtDate(i.createdAt) + '</div>' +
            '</div>' +
            '<div style="font-size:13px;font-weight:700;color:#dc2626">' +
            (i.diff > 0 ? "+" : "") + i.diff + '</div>' +
            '</div></div>';
        }).join("")
    ) +
    '</div>';

  refreshIcons(el("historico-list"));

  const exportBtn = el("btn-export-csv");
  if (exportBtn) exportBtn.style.display = "none";
}

// ── DETALHE DE VENDA ──────────────────────────────────────────────────────────
window._openSaleDetail = async function(id) {
  const s     = await db.get("sales", id);
  if (!s) return;
  const store = (await db.get("settings","store")) || {};

  openModal("Venda #"+s.id,
    '<div style="background:#f4f4f5;border-radius:12px;padding:14px;margin-bottom:14px">' +
    [["Data",fmtDate(s.date)],["Pagamento",s.payMethod],
     ["Subtotal",fmt(s.subtotal||s.total)],
     ...(s.discount>0?[["Desconto","- "+fmt(s.discount)]]:[]),
     ["Total",fmt(s.total)],
     ...(s.clientName?[["Cliente",s.clientName]]:[]),
     ...(s.clientPhone?[["Telefone",s.clientPhone]]:[]),
    ].map(function(kv) {
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e4e4e7;font-size:13px">' +
        '<span style="color:#71717a">' + kv[0] + '</span>' +
        '<span style="font-weight:600">' + kv[1] + '</span></div>';
    }).join("") +
    '</div>' +
    '<div style="margin-bottom:14px">' +
    (s.items||[]).map(function(i) {
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f4f4f5;font-size:13px">' +
        '<span>' + i.name + ' x' + i.qty + '</span>' +
        '<span style="font-weight:600">' + fmt(i.price*i.qty) + '</span></div>';
    }).join("") +
    '</div>' +
    '<div style="font-size:11px;color:#a1a1aa;text-align:center;margin-bottom:14px">Código: ' + (s.hash||"N/A") + '</div>' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Imprimir</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">' +
    ['58mm','80mm','a5','a4'].map(function(f) {
      return '<button onclick="window._printSale(' + s.id + ',\'' + f + '\')" ' +
        'style="padding:10px;background:#f4f4f5;border:1.5px solid #e4e4e7;border-radius:8px;' +
        'font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;color:#18181b">' +
        f.toUpperCase() + '</button>';
    }).join("") +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._printSale(' + s.id + ',\'58mm\')">' +
    '<i data-lucide="printer"></i> Imprimir talão</button>' +
    '</div>');

  refreshIcons(el("modal-box"));
};

window._printSale = async function(id, format) {
  const s     = await db.get("sales", id);
  const store = (await db.get("settings","store")) || {};
  closeModal();
  printRecibo(s, store, format);
};

// ── EXPORTAÇÕES ───────────────────────────────────────────────────────────────
function exportCSV(sales) {
  const header = "ID,Data,Cliente,Pagamento,Subtotal,Desconto,Total,Itens";
  const rows   = sales.map(function(s) {
    return s.id+',"'+fmtDate(s.date)+'","'+(s.clientName||"")+'","'+s.payMethod+'",'+
      (s.subtotal||s.total)+","+(s.discount||0)+","+s.total+
      ',"'+((s.items||[]).map(function(i){return i.name+"x"+i.qty;}).join("|"))+'"';
  });
  downloadCSV([header].concat(rows).join("\n"), "vendas_kontaki.csv");
}

function exportMovementsCSV(movements) {
  const header = "ID,Data,Produto,Tipo,Local,Qty,Antes,Depois,Importado,Nota";
  const rows   = movements.map(function(m) {
    return m.id+',"'+fmtDate(m.createdAt)+'","'+m.productName+'","'+m.type+'","'+
      m.location+'",'+m.qty+","+m.qtyBefore+","+m.qtyAfter+","+(m.imported?"sim":"não")+',"'+(m.note||"")+'"';
  });
  downloadCSV([header].concat(rows).join("\n"), "movimentos_kontaki.csv");
}

function downloadCSV(csv, filename) {
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

window._closeModal = closeModal;
