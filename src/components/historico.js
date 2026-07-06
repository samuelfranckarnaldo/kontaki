import { db }                           from "../db.js";
import { gerarReciboPDF, partilharReciboPDF } from "./recibo-pdf.js";
import { fmt, fmtDate, today, el, val, setVal, refreshIcons } from "../utils.js";
import { openModal, closeModal }        from "../modal.js";
import { getUser }                      from "../auth.js";
import { printRecibo }                  from "../print.js";
import { openDevolucao, gerarRelatorioPDF } from "./extras.js";

let activeTab = "geral";
let activeShortcut = "hoje";
let histChartInstance = null;

function toLocalDateStr(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return d.getFullYear() + "-" +
    String(d.getMonth()+1).padStart(2,"0") + "-" +
    String(d.getDate()).padStart(2,"0");
}

function getPreviousPeriod(from, to) {
  var fromD = new Date(from + "T00:00:00");
  var toD   = new Date(to + "T00:00:00");
  var days  = Math.round((toD - fromD) / 86400000) + 1;

  var prevTo = new Date(fromD);
  prevTo.setDate(prevTo.getDate() - 1);
  var prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));

  return { from: toLocalDateStr(prevFrom.toISOString()), to: toLocalDateStr(prevTo.toISOString()) };
}

function getShortcutDates(sc) {
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth();
  var d = now.getDate();
  var t = today();
  if (sc === "hoje")   return { from: t, to: t };
  if (sc === "semana") {
    var day = now.getDay();
    var diff = now.getDate() - day + (day === 0 ? -6 : 1);
    var mon = new Date(now.setDate(diff));
    return { from: toLocalDateStr(mon.toISOString()), to: today() };
  }
  if (sc === "mes") {
    return { from: y+"-"+String(m+1).padStart(2,"0")+"-01", to: t };
  }
  return null;
}

export async function initHistorico() {
  setVal("hist-from", today());
  setVal("hist-to",   today());
  el("btn-hist-filter").onclick = loadData;

  renderTabs();
  applyShortcut("hoje");
}

window._histShortcut = function(sc, btn) {
  activeShortcut = sc;
  document.querySelectorAll(".hist-shortcut").forEach(function(b) {
    b.classList.remove("active");
  });
  if (btn) btn.classList.add("active");

  var dateInputs = el("hist-date-inputs");
  if (sc === "custom") {
    if (dateInputs) dateInputs.style.display = "flex";
  } else {
    if (dateInputs) dateInputs.style.display = "none";
    applyShortcut(sc);
  }
};

function applyShortcut(sc) {
  var dates = getShortcutDates(sc);
  if (!dates) return;
  setVal("hist-from", dates.from);
  setVal("hist-to",   dates.to);
  loadData();
}

function renderTabs() {
  var tabs = [
    { id:"geral",     label:"Geral"     },
    { id:"stock",     label:"Stock"     },
    { id:"auditoria", label:"Auditoria" },
  ];
  var wrap = el("historico-tabs");
  if (!wrap) return;
  wrap.innerHTML = tabs.map(function(t) {
    return '<button class="hist-tab' + (activeTab===t.id?" active":"") + '" onclick="window._histTab(\'' + t.id + '\')">' + t.label + '</button>';
  }).join("");
}

window._histTab = async function(tab) {
  activeTab = tab;
  renderTabs();
  await loadData();
};

async function loadData() {
  var from = val("hist-from");
  var to   = val("hist-to");
  if (activeTab === "geral")     await loadGeral(from, to);
  if (activeTab === "stock")     await loadStock(from, to);
  if (activeTab === "auditoria") await loadAuditoria(from, to);
}

// ── GERAL ─────────────────────────────────────────────────────────────────────
function payIcon(method) {
  if (!method) return "banknote";
  var m = method.toLowerCase();
  if (m.includes("dinheiro") || m.includes("cash"))  return "banknote";
  if (m.includes("transfer") || m.includes("banco")) return "landmark";
  if (m.includes("fiado") || m.includes("crédito"))  return "clipboard-list";
  return "credit-card";
}

function payClass(method) {
  if (!method) return "hist-sale-avatar--dinheiro";
  var m = method.toLowerCase();
  if (m.includes("dinheiro") || m.includes("cash"))  return "hist-sale-avatar--dinheiro";
  if (m.includes("transfer") || m.includes("banco")) return "hist-sale-avatar--transferencia";
  if (m.includes("fiado") || m.includes("crédito"))  return "hist-sale-avatar--fiado";
  return "hist-sale-avatar--outros";
}

var DIAS_SEMANA = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
var MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

function dayLabel(dateStr) {
  var t = today();
  var yest = new Date();
  yest.setDate(yest.getDate() - 1);
  var yestStr = toLocalDateStr(yest.toISOString());

  if (dateStr === t) return "Hoje";
  if (dateStr === yestStr) return "Ontem";

  var d = new Date(dateStr + "T00:00:00");
  return DIAS_SEMANA[d.getDay()] + ", " + d.getDate() + " de " + MESES[d.getMonth()];
}

function groupByDay(items, dateField) {
  dateField = dateField || "date";
  var groups = [];
  var byDate = {};
  items.forEach(function(s) {
    var d = toLocalDateStr(s[dateField]);
    if (!byDate[d]) {
      byDate[d] = [];
      groups.push(d);
    }
    byDate[d].push(s);
  });
  return groups.map(function(d) { return { date: d, sales: byDate[d] }; });
}

async function loadGeral(from, to) {
  var sales    = await db.getAll("sales");
  var fiados   = await db.getAll("fiado");
  var incidents = await db.getAll("incidents");

  var filtered = sales.filter(function(s) {
    var d = toLocalDateStr(s.date);
    return d >= from && d <= to;
  }).reverse();

  var total     = filtered.reduce(function(a,s) { return a+((s.total||0)-(s.totalDevolvido||0)); }, 0);
  var nVendas   = filtered.length;

  var prevPeriod = getPreviousPeriod(from, to);
  var prevFiltered = sales.filter(function(s) {
    var d = toLocalDateStr(s.date);
    return d >= prevPeriod.from && d <= prevPeriod.to;
  });
  var prevTotal = prevFiltered.reduce(function(a,s) { return a+((s.total||0)-(s.totalDevolvido||0)); }, 0);
  var variacao = null;
  if (prevTotal > 0) {
    variacao = ((total - prevTotal) / prevTotal) * 100;
  } else if (total > 0) {
    variacao = 100;
  }
  var ticket    = nVendas > 0 ? total / nVendas : 0;
  var fiadoAb   = fiados.filter(function(f) { return f.status==="open"; })
                    .reduce(function(a,f) { return a+(f.amount||0); }, 0);
  var devTotal  = filtered.reduce(function(a,s) { return a+(s.totalDevolvido||0); }, 0);
  var incOpen   = incidents.filter(function(i) { return i.status==="open"; }).length;

  // Hero
  var hero = el("historico-hero");
  if (hero) {
    hero.style.display = "block";
    var badgeHtml = "";
    if (variacao !== null) {
      var isUp = variacao >= 0;
      badgeHtml =
        '<span class="hist-hero-trend ' + (isUp ? 'hist-hero-trend--up' : 'hist-hero-trend--down') + '">' +
        (isUp ? '↑' : '↓') + ' ' + Math.abs(variacao).toFixed(0) + '%' +
        '</span>';
    }

    hero.innerHTML =
      '<div class="hist-hero-label">Total do período</div>' +
      '<div class="hist-hero-row"><div class="hist-hero-val">' + fmt(total) + '</div>' + badgeHtml + '</div>' +
      '<div class="hist-hero-sub">' + nVendas + ' ' + (nVendas===1?"venda":"vendas") + ' · média por venda ' + fmt(ticket) + '</div>';
  }

  // KPIs
  var stats = el("historico-stats");
  if (stats) {
    stats.innerHTML =
      kpi("Nº Vendas",     nVendas,         "var(--primary)",  "", null) +
      kpi("Média por Venda",  fmt(ticket),     "var(--info)",     "", null) +
      kpi("Fiado Aberto",  fmt(fiadoAb),    "var(--warning)",  "", fiadoAb>0?"hist-kpi--attention":null) +
      kpi("Devoluções",    fmt(devTotal),   devTotal>0?"var(--danger)":"var(--success)", incOpen+" incidente"+(incOpen===1?"":"s"), devTotal>0?"hist-kpi--danger":null);
  }

  // Gráfico (Chart.js)
  var chart = el("historico-chart");
  if (chart) {
    if (filtered.length > 0) {
      var byDay = {};
      filtered.forEach(function(s) {
        var d = (s.date||"").split("T")[0];
        byDay[d] = (byDay[d]||0) + ((s.total||0)-(s.totalDevolvido||0));
      });
      var days = Object.keys(byDay).sort();
      var values = days.map(function(d) { return byDay[d]; });

      chart.style.display = "block";
      chart.innerHTML =
        '<div class="hist-chart-title">Vendas por dia</div>' +
        '<div style="position:relative;height:140px"><canvas id="hist-chart-canvas"></canvas></div>';

      renderSalesChart(days, values);
    } else {
      chart.style.display = "none";
      if (histChartInstance) {
        histChartInstance.destroy();
        histChartInstance = null;
      }
    }
  }

  function renderSalesChart(days, values) {
    var canvas = el("hist-chart-canvas");
    if (!canvas || typeof Chart === "undefined") return;

    if (histChartInstance) {
      histChartInstance.destroy();
      histChartInstance = null;
    }

    var labels = days.map(function(d) { return d.slice(5).split("-").reverse().join("/"); });
    var ctx = canvas.getContext("2d");

    var maxV = Math.max.apply(null, values.concat([1]));
    var suggestedMax = maxV * 1.25;

    var gradient = ctx.createLinearGradient(0, 0, 0, 140);
    gradient.addColorStop(0, "rgba(124,58,237,0.28)");
    gradient.addColorStop(1, "rgba(124,58,237,0)");

    var valueLabelPlugin = {
      id: "histValueLabels",
      afterDatasetsDraw: function(chart) {
        var ctx2 = chart.ctx;
        var meta = chart.getDatasetMeta(0);
        var chartArea = chart.chartArea;
        ctx2.save();
        ctx2.font = "700 11px sans-serif";
        ctx2.fillStyle = "#4c1d95";
        meta.data.forEach(function(point, i) {
          var v = chart.data.datasets[0].data[i];
          var text = fmt(v);
          var textWidth = ctx2.measureText(text).width;
          var align = "center";
          var x = point.x;

          if (point.x - textWidth / 2 < chartArea.left) {
            align = "left";
            x = chartArea.left;
          } else if (point.x + textWidth / 2 > chartArea.right) {
            align = "right";
            x = chartArea.right;
          }

          ctx2.textAlign = align;
          ctx2.fillText(text, x, point.y - 12);
        });
        ctx2.restore();
      }
    };

    histChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          borderColor: "#5b21b6",
          backgroundColor: gradient,
          borderWidth: 2.5,
          pointBackgroundColor: "#7c3aed",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: true,
        }]
      },
      plugins: [valueLabelPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 22, right: 8, left: 4, bottom: 0 }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx3) { return fmt(ctx3.parsed.y); }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 9 }, color: "#a1a1aa" }
          },
          y: {
            display: true,
            beginAtZero: true,
            suggestedMax: suggestedMax,
            grid: { color: "rgba(0,0,0,0.05)" },
            ticks: {
              font: { size: 9 },
              color: "#a1a1aa",
              maxTicksLimit: 4,
              callback: function(v) { return fmt(v); }
            }
          }
        }
      }
    });
  }

  // Acções
  var actions = el("hist-actions");
  if (actions) {
    actions.style.display = filtered.length > 0 ? "flex" : "none";
    var exportBtn = el("btn-export-csv");
    if (exportBtn) exportBtn.onclick = function() { exportCSV(filtered); };
    var pdfBtn = el("btn-export-pdf");
    if (pdfBtn) {
      pdfBtn.style.display = getUser().role==="admin" ? "flex" : "none";
      pdfBtn.onclick = function() { gerarRelatorioPDF(); };
    }
  }

  // Lista
  var list = el("historico-list");
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML =
      '<div class="hist-empty">' +
      '<i data-lucide="clock"></i>' +
      '<div class="hist-empty-title">Sem vendas no período</div>' +
      '<div class="hist-empty-sub">Ajusta o intervalo de datas.</div>' +
      '</div>';
    refreshIcons(list); return;
  }

  function renderSaleCard(s) {
    var totalLiq = (s.total||0) - (s.totalDevolvido||0);
    var hasDev   = s.temDevolucao && (s.totalDevolvido||0) > 0;
    return '<div class="hist-sale-card" onclick="window._openSaleDetail(' + s.id + ')">' +
      '<div class="hist-sale-avatar ' + payClass(s.payMethod) + '"><i data-lucide="' + payIcon(s.payMethod) + '" style="width:18px;height:18px"></i></div>' +
      '<div class="hist-sale-info">' +
      '<div class="hist-sale-id">Venda #' + String(s.id).padStart(4,"0") +
      (hasDev ? ' <span class="hist-badge-dev">↩ Dev.</span>' : '') + '</div>' +
      '<div class="hist-sale-meta">' + fmtDate(s.date) +
      (s.clientName ? " · " + s.clientName : "") +
      " · " + (s.items?s.items.length:0) + " " + (s.items&&s.items.length===1?"item":"itens") +
      '</div></div>' +
      '<div class="hist-sale-right">' +
      (hasDev
        ? '<div class="hist-sale-total--dev">' + fmt(s.total) + '</div>' +
          '<div class="hist-sale-total-liq">' + fmt(totalLiq) + '</div>'
        : '<div class="hist-sale-total">' + fmt(s.total) + '</div>') +
      (s.discount>0 ? '<div style="font-size:10px;color:var(--danger)">-'+fmt(s.discount)+' desc.</div>' : '') +
      '</div></div>';
  }

  var groups = groupByDay(filtered);
  list.innerHTML = groups.map(function(g) {
    return '<div class="hist-day-label">' + dayLabel(g.date) + '</div>' +
      g.sales.map(renderSaleCard).join("");
  }).join("");

  refreshIcons(list);
}

function kpi(label, val, color, sub, attentionClass) {
  return '<div class="hist-kpi' + (attentionClass ? ' ' + attentionClass : '') + '">' +
    '<div class="hist-kpi-label">' + label + '</div>' +
    '<div class="hist-kpi-val" style="color:' + color + '">' + val + '</div>' +
    (sub ? '<div class="hist-kpi-sub">' + sub + '</div>' : '') +
    '</div>';
}

// ── STOCK ─────────────────────────────────────────────────────────────────────
var typeLabels = {
  sale:"Venda", purchase:"Compra", transfer_in:"Entrada", transfer_out:"Saída",
  adjustment:"Ajuste", session_open:"Sessão", session_close:"Sessão",
  incident:"Incidente", incident_resolved:"Incidente resolvido"
};
var typeColors = {
  sale:"var(--danger)", purchase:"var(--success)", transfer_in:"var(--info)", transfer_out:"var(--warning)",
  adjustment:"var(--primary-mid)", session_open:"var(--text4)", session_close:"var(--text4)",
  incident:"var(--danger)", incident_resolved:"var(--success)"
};
var typeBg = {
  sale:"var(--danger-light)", purchase:"var(--success-light)", transfer_in:"var(--info-light)", transfer_out:"var(--warning-light)",
  adjustment:"var(--primary-light)", session_open:"var(--border2)", session_close:"var(--border2)",
  incident:"var(--danger-light)", incident_resolved:"var(--success-light)"
};

async function loadStock(from, to) {
  var hero = el("historico-hero");
  var stats = el("historico-stats");
  var chart = el("historico-chart");
  var actions = el("hist-actions");
  if (hero)    hero.style.display  = "none";
  if (stats)   stats.innerHTML     = "";
  if (chart)   chart.style.display = "none";
  if (actions) actions.style.display = "none";

  var movements = await db.getAll("stockMovements");
  var users     = await db.getAll("users");
  var usersById = {};
  users.forEach(function(u){ usersById[u.id] = u; });

  var filtered  = movements.filter(function(m) {
    var d = toLocalDateStr(m.createdAt);
    return d >= from && d <= to;
  });

  var local    = filtered.filter(function(m) { return m.imported !== true; });
  var imported = filtered.filter(function(m) { return m.imported === true; });

  var list = el("historico-list");
  if (!list) return;

  function abbrevQty(n) {
    var abs = Math.abs(n);
    var sign = n < 0 ? "-" : "";
    if (abs < 1000) return sign + abs;
    if (abs < 1e6)  return sign + (abs/1e3).toFixed(abs%1e3===0?0:1) + "K";
    if (abs < 1e9)  return sign + (abs/1e6).toFixed(abs%1e6===0?0:1) + "M";
    if (abs < 1e12) return sign + (abs/1e9).toFixed(abs%1e9===0?0:1) + "B";
    return sign + (abs/1e12).toFixed(abs%1e12===0?0:1) + "T";
  }

  function renderMovItem(m) {
    var color = typeColors[m.type] || "#9ca3af";
    var bg    = typeBg[m.type]    || "#f3f4f6";
    var label = typeLabels[m.type] || m.type;
    var sign  = m.qty > 0 ? "+" : "";
    var autor = (m.userId != null && usersById[m.userId]) ? usersById[m.userId].name : "Desconhecido";
    return '<div class="hist-mov-item">' +
      '<div class="hist-mov-icon" style="background:' + bg + ';color:' + color + '" title="' + sign + m.qty + '">' + sign + abbrevQty(m.qty) + '</div>' +
      '<div style="flex:1;min-width:0">' +
      '<div class="hist-mov-name"><i data-lucide="package" class="hist-mov-name-icon"></i>' + m.productName + '</div>' +
      '<span class="hist-mov-tag" style="background:' + bg + ';color:' + color + '">' + label + '</span>' +
      '<div class="hist-mov-meta">' + fmtDate(m.createdAt) + '</div>' +
      '<div class="hist-mov-meta hist-mov-meta--autor"><strong>' + autor + '</strong></div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div class="hist-mov-qty" style="color:' + color + '" title="' + sign + m.qty + '">' + sign + abbrevQty(m.qty) + '</div>' +
      '<div class="hist-mov-range">' + (m.qtyBefore||0) + ' → ' + (m.qtyAfter||0) + '</div>' +
      '</div></div>';
  }

  function renderMovBlock(arr, title) {
    if (!arr.length) return '<div class="hist-section-label">' + title + '</div>' +
      '<div class="hist-empty" style="padding:24px"><div class="hist-empty-sub">Nenhum movimento no período</div></div>';

    var capped = arr.slice(0,50);
    var groups = groupByDay(capped, "createdAt");

    return '<div class="hist-section-label">' + title + ' (' + arr.length + ')</div>' +
      '<div class="hist-mov-card">' +
      groups.map(function(g) {
        return '<div class="hist-day-label hist-day-label--inset">' + dayLabel(g.date) + '</div>' +
          g.sales.map(renderMovItem).join("");
      }).join("") +
      (arr.length>50 ? '<div style="padding:10px 14px;font-size:12px;color:var(--text4)">+' + (arr.length-50) + ' mais</div>' : '') +
      '</div>';
  }

  list.innerHTML = renderMovBlock(local, "Movimentos Locais") + renderMovBlock(imported, "Movimentos Importados");
  refreshIcons(list);
}

// ── AUDITORIA ─────────────────────────────────────────────────────────────────
async function loadAuditoria(from, to) {
  var hero    = el("historico-hero");
  var stats   = el("historico-stats");
  var chart   = el("historico-chart");
  var actions = el("hist-actions");
  if (hero)    hero.style.display    = "none";
  if (stats)   stats.innerHTML       = "";
  if (chart)   chart.style.display   = "none";
  if (actions) actions.style.display = "none";

  var sessions  = await db.getAll("sessions");
  var incidents = await db.getAll("incidents");

  var importedSessions = sessions.filter(function(s) { return s.isImported; });
  var openIncidents    = incidents.filter(function(i) { return i.status==="open"; });
  var seenUuids = new Set();
  var chain = sessions.filter(function(s) {
    if (s.isImported) return false;
    if (s.uuid && seenUuids.has(s.uuid)) return false;
    if (s.uuid) seenUuids.add(s.uuid);
    return true;
  }).sort(function(a,b) { return a.id - b.id; });

  var list = el("historico-list");
  if (!list) return;

  function dotColor(s) {
    if (s.status==="open")    return "var(--success)";
    if (s.hasIncidents)       return "var(--danger)";
    return "var(--primary)";
  }
  function badgeBg(s) {
    if (s.status==="open")  return "#dcfce7";
    if (s.hasIncidents)     return "#fee2e2";
    return "#ede9fe";
  }
  function badgeLabel(s) {
    if (s.status==="open")  return "Activo";
    if (s.hasIncidents)     return "Incidentes";
    return "Fechado";
  }

  list.innerHTML =
    '<div class="hist-section-label">Cadeia de Responsabilidade</div>' +
    '<div class="hist-timeline">' +
    (chain.length === 0
      ? '<div class="hist-empty" style="padding:24px"><div class="hist-empty-sub">Sem sessões registadas</div></div>'
      : chain.map(function(s) {
          return '<div class="hist-timeline-item"' + (s.uuid ? ' title="ID: ' + s.uuid + '"' : '') + '>' +
            '<div class="hist-timeline-dot" style="background:' + dotColor(s) + '"></div>' +
            '<div class="hist-timeline-info">' +
            '<div class="hist-timeline-name">' + s.userName + '</div>' +
            '<div class="hist-timeline-date">' + fmtDate(s.openedAt) + (s.closedAt?" → "+fmtDate(s.closedAt):" (em curso)") + '</div>' +
            '</div>' +
            '<span class="badge-status" style="background:' + badgeBg(s) + ';color:' + dotColor(s) + '">' + badgeLabel(s) + '</span>' +
            '</div>';
        }).join("")
    ) +
    '</div>' +

    '<div class="hist-section-label" style="margin-top:4px">Sessões Importadas (' + importedSessions.length + ')</div>' +
    '<div class="hist-timeline">' +
    (importedSessions.length === 0
      ? '<div class="hist-empty" style="padding:24px"><div class="hist-empty-sub">Nenhum ficheiro .ktk importado</div></div>'
      : importedSessions.map(function(s) {
          return '<div class="hist-timeline-item">' +
            '<div class="hist-timeline-dot" style="background:var(--info)"></div>' +
            '<div class="hist-timeline-info">' +
            '<div class="hist-timeline-name">' + s.userName + '</div>' +
            '<div class="hist-timeline-date">' + (s.lojaNome||"?") + ' · ' + fmtDate(s.openedAt) + '</div>' +
            '</div>' +
            '<div style="text-align:right">' +
            '<div style="font-size:13px;font-weight:700;color:var(--success)">' + fmt(s.totalVendas||0) + '</div>' +
            '<span class="badge-status" style="background:' + (s.hashLegacy?"#fef3c7":"#dcfce7") + ';color:' + (s.hashLegacy?"var(--warning)":"var(--success)") + '">' + (s.hashLegacy?"Hash legado":"HMAC válido") + '</span>' +
            '</div></div>';
        }).join("")
    ) +
    '</div>' +

    '<div class="hist-section-label" style="margin-top:4px;color:var(--danger)">Incidentes em Aberto (' + openIncidents.length + ')</div>' +
    '<div class="hist-timeline">' +
    (openIncidents.length === 0
      ? '<div class="hist-empty" style="padding:24px"><div class="hist-empty-sub">Sem incidentes em aberto ✓</div></div>'
      : openIncidents.map(function(i) {
          return '<div class="hist-timeline-item">' +
            '<div class="hist-timeline-dot" style="background:var(--danger)"></div>' +
            '<div class="hist-timeline-info">' +
            '<div class="hist-timeline-name" style="color:var(--danger)">' + i.productName + '</div>' +
            '<div class="hist-timeline-date">' + fmtDate(i.createdAt) + '</div>' +
            '</div>' +
            '<div style="font-size:15px;font-weight:800;color:var(--danger)">' + (i.diff>0?"+":"") + i.diff + '</div>' +
            '</div>';
        }).join("")
    ) +
    '</div>';

  refreshIcons(list);
}

// ── DETALHE DE VENDA ──────────────────────────────────────────────────────────
window._openSaleDetail = async function(id) {
  var s     = await db.get("sales", id);
  if (!s) return;

  var hasDev   = s.temDevolucao && (s.totalDevolvido||0) > 0;
  var totalLiq = (s.total||0) - (s.totalDevolvido||0);
  var isAdmin  = getUser().role === "admin";

  openModal("Venda #" + String(s.id).padStart(4,"0"),
    '<div class="hist-detail-wrap">' +

    '<div class="hist-detail-info">' +
    detailRow("Data",       fmtDate(s.date)) +
    detailRow("Pagamento",  s.payMethod||"—") +
    (s.clientName  ? detailRow("Cliente",  s.clientName)  : "") +
    (s.clientPhone ? detailRow("Telefone", s.clientPhone) : "") +
    detailRow("Subtotal",   fmt(s.subtotal||s.total)) +
    (s.discount>0  ? detailRow("Desconto", "- "+fmt(s.discount)) : "") +
    detailRow("Total",      fmt(s.total), true) +
    (hasDev ? detailRow("Líquido", fmt(totalLiq), true, "var(--warning)") : "") +
    '</div>' +

    '<div class="hist-section-label">Itens</div>' +
    '<div class="hist-detail-info">' +
    (s.items||[]).map(function(i) {
      return detailRow(i.name + " x" + i.qty, fmt(i.price*i.qty));
    }).join("") +
    '</div>' +

    (hasDev ?
      '<div class="hist-dev-box">' +
      '<div class="hist-dev-title">↩ Devoluções registadas</div>' +
      (s.devolucoes||[]).map(function(d) {
        return '<div class="hist-dev-row">' + fmtDate(d.date) + ' · ' + d.itens.join(", ") +
          ' · <strong style="color:var(--warning)">-' + fmt(d.total) + '</strong></div>';
      }).join("") +
      '</div>' : "") +

    '<div class="hist-section-label">Imprimir</div>' +
    '<div class="hist-print-grid">' +
    ["58mm","80mm","A5","A4"].map(function(f) {
      return '<button class="hist-print-btn" onclick="window._printSale(' + s.id + ',\'' + f.toLowerCase() + '\')">' + f + '</button>';
    }).join("") +
    '</div>' +

    '<div class="hist-detail-actions">' +
    '<button class="btn btn-outline btn-full" onclick="window._gerarReciboPDF(' + s.id + ')">' +
    '<i data-lucide="file-text"></i> Gerar PDF</button>' +
    '<button class="btn btn-outline btn-full hist-btn-whatsapp" onclick="window._partilharReciboPDF(' + s.id + ')">' +
    '<i data-lucide="share-2"></i> Partilhar</button>' +
    (isAdmin ? '<button class="btn btn-outline btn-full hist-btn-dev" onclick="window._abrirDevolucao(' + s.id + ')">' +
    '<i data-lucide="rotate-ccw"></i> Registar Devolução</button>' : "") +
    '</div>' +

    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._printSale(' + s.id + ',\'58mm\')">' +
    '<i data-lucide="printer"></i> Imprimir Talão</button>' +
    '</div></div>'
  );

  refreshIcons(el("modal-box"));
};

function detailRow(label, value, bold, color) {
  return '<div class="hist-detail-row">' +
    '<span class="hist-detail-label">' + label + '</span>' +
    '<span class="hist-detail-val"' + (bold?(' style="font-weight:800' + (color?';color:'+color:'') + '"'):'') + '>' + value + '</span>' +
    '</div>';
}

window._printSale = async function(id, format) {
  var s     = await db.get("sales", id);
  var store = (await db.get("settings","store")) || {};
  closeModal();
  printRecibo(s, store, format);
};

window._gerarReciboPDF     = async (id) => { await gerarReciboPDF(id);     };
window._partilharReciboPDF = async (id) => { await partilharReciboPDF(id); };
window._abrirDevolucao     = async (id) => { closeModal(); await openDevolucao(id); };

// ── EXPORTS CSV ───────────────────────────────────────────────────────────────
function exportCSV(sales) {
  var rows = [["ID","Data","Cliente","Itens","Total","Desconto","Pagamento","Devolvido"]];
  sales.forEach(function(s) {
    rows.push([
      s.id, fmtDate(s.date), s.clientName||"",
      (s.items||[]).map(function(i){return i.name+"x"+i.qty;}).join(";"),
      s.total, s.discount||0, s.payMethod||"", s.totalDevolvido||0
    ]);
  });
  var csv = rows.map(function(r){return r.join(",");}).join("\n");
  var blob = new Blob([csv],{type:"text/csv"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vendas_" + today() + ".csv";
  a.click();
}

function exportMovementsCSV(movements) {
  var rows = [["ID","Produto","Tipo","Qty","Antes","Depois","Data"]];
  movements.forEach(function(m) {
    rows.push([m.id,m.productName,m.type,m.qty,m.qtyBefore,m.qtyAfter,fmtDate(m.createdAt)]);
  });
  var csv = rows.map(function(r){return r.join(",");}).join("\n");
  var blob = new Blob([csv],{type:"text/csv"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "stock_" + today() + ".csv";
  a.click();
}
