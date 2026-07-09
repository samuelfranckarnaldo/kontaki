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
let auditUserFilter = "all";
let periodOffset = 0;
let heroLastValue = 0;

function fmtChartVal(n) {
  var abs = Math.abs(n);
  var sign = n < 0 ? "-" : "";
  if (abs < 1000) return sign + abs.toLocaleString("pt-AO") + " Kz";
  var s;
  if (abs < 1e6)  s = (abs/1e3).toFixed(abs%1e3===0?0:1) + "K";
  else if (abs < 1e9) s = (abs/1e6).toFixed(abs%1e6===0?0:1) + "M";
  else s = (abs/1e9).toFixed(abs%1e9===0?0:1) + "B";
  return sign + s + " Kz";
}

var histChartValueLabelPlugin = {
  id: "histValueLabels",
  afterDatasetsDraw: function(chart) {
    var ctx2 = chart.ctx;
    var meta = chart.getDatasetMeta(0);
    var chartArea = chart.chartArea;
    var lastIndex = meta.data.length - 1;
    ctx2.save();
    ctx2.font = "700 11px sans-serif";
    ctx2.fillStyle = "#4c1d95";

    meta.data.forEach(function(point, i) {
      if (i !== lastIndex && i !== 0) return;
      var v = chart.data.datasets[0].data[i];
      var text = fmtChartVal(v);
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
      ctx2.fillText(text, x, point.y - 24);
    });
    ctx2.restore();
  }
};

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

function getShortcutDates(sc, offset) {
  offset = offset || 0;
  var t = today();

  if (sc === "hoje") {
    var d0 = new Date();
    d0.setDate(d0.getDate() + offset);
    var s = toLocalDateStr(d0.toISOString());
    return { from: s, to: s };
  }

  if (sc === "semana") {
    var now = new Date();
    var day = now.getDay();
    var mondayThisWeek = new Date(now);
    mondayThisWeek.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
    mondayThisWeek.setDate(mondayThisWeek.getDate() + offset * 7);
    var sundayThisWeek = new Date(mondayThisWeek);
    sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);

    var fromStr = toLocalDateStr(mondayThisWeek.toISOString());
    var toStr   = offset === 0 ? t : toLocalDateStr(sundayThisWeek.toISOString());
    return { from: fromStr, to: toStr };
  }

  if (sc === "mes") {
    var base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + offset);
    var y = base.getFullYear();
    var m = base.getMonth();
    var fromStr = y + "-" + String(m+1).padStart(2,"0") + "-01";
    var toStr;
    if (offset === 0) {
      toStr = t;
    } else {
      var lastDay = new Date(y, m + 1, 0).getDate();
      toStr = y + "-" + String(m+1).padStart(2,"0") + "-" + String(lastDay).padStart(2,"0");
    }
    return { from: fromStr, to: toStr };
  }

  return null;
}

function getPeriodLabel(sc, offset, dates) {
  var MESES_FULL = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  if (sc === "hoje") {
    if (offset === 0) return "Hoje";
    if (offset === -1) return "Ontem";
    var d = new Date(dates.from + "T00:00:00");
    return d.getDate() + " de " + MESES_FULL[d.getMonth()];
  }
  if (sc === "semana") {
    if (offset === 0) return "Esta semana";
    var f = new Date(dates.from + "T00:00:00");
    var tt = new Date(dates.to + "T00:00:00");
    return f.getDate() + "/" + (f.getMonth()+1) + " – " + tt.getDate() + "/" + (tt.getMonth()+1);
  }
  if (sc === "mes") {
    var d2 = new Date(dates.from + "T00:00:00");
    if (offset === 0) return MESES_FULL[d2.getMonth()] + " " + d2.getFullYear();
    return MESES_FULL[d2.getMonth()] + " " + d2.getFullYear();
  }
  if (sc === "custom" && dates) {
    var f = new Date(dates.from + "T00:00:00");
    var t = new Date(dates.to + "T00:00:00");
    return f.getDate() + "/" + (f.getMonth()+1) + " – " + t.getDate() + "/" + (t.getMonth()+1);
  }
  return "";
}

window._seedMockSales = async function() {
  var user = getUser();
  var produtos = [
    { name: "Arroz", price: 500 },
    { name: "Água", price: 300 },
    { name: "Trigo", price: 2000 },
    { name: "Massa", price: 800 },
    { name: "Ovos", price: 1500 },
  ];
  var pagamentos = ["dinheiro", "dinheiro", "dinheiro", "transferencia", "fiado"];

  for (var d = 14; d >= 0; d--) {
    var nVendasNoDia = Math.floor(Math.random() * 4) + 1;
    for (var v = 0; v < nVendasNoDia; v++) {
      var dt = new Date();
      dt.setDate(dt.getDate() - d);
      dt.setHours(8 + Math.floor(Math.random()*10), Math.floor(Math.random()*60), 0, 0);

      var nItems = Math.floor(Math.random() * 3) + 1;
      var items = [];
      var total = 0;
      for (var it = 0; it < nItems; it++) {
        var p = produtos[Math.floor(Math.random()*produtos.length)];
        var qty = Math.floor(Math.random()*5) + 1;
        items.push({ id: it+1, name: p.name, price: p.price, qty: qty });
        total += p.price * qty;
      }

      var pay = pagamentos[Math.floor(Math.random()*pagamentos.length)];

      await db.add("sales", {
        items: items,
        subtotal: total, discount: 0,
        total: total, payMethod: pay, date: dt.toISOString(),
        userId: user ? user.id : 1, sessionId: user ? user.sessionId : null,
        clientName: pay === "fiado" ? "Cliente Teste" : "",
        clientPhone: "", clientId: null,
        fiadoClient: pay === "fiado" ? "Cliente Teste" : null,
        recebido: total, troco: 0,
        hash: null,
      });
    }
  }
  alert("Dados de teste gerados! Recarrega a tela.");
  loadData();
};

export async function initHistorico() {
  setVal("hist-from", today());
  setVal("hist-to",   today());
  heroLastValue = 0;

  renderTabs();
  applyShortcut("hoje");
}

var calState = { viewYear:0, viewMonth:0, selFrom:null, selTo:null };

window._openPeriodPicker = function() {
  var options = [
    { id:"hoje",   label:"Hoje" },
    { id:"semana", label:"Esta semana" },
    { id:"mes",    label:"Este mês" },
    { id:"custom", label:"Personalizado" },
  ];
  var body =
    '<div class="hist-picker-options">' +
    options.map(function(o) {
      var active = activeShortcut === o.id;
      return '<button class="hist-picker-option' + (active?' active':'') + '" data-sc="' + o.id + '" onclick="window._pickShortcut(this)">' + o.label + '</button>';
    }).join("") +
    '</div>' +
    '<div id="hist-picker-custom" style="display:' + (activeShortcut==="custom" ? "block" : "none") + ';margin-top:14px">' +
      '<div id="hist-calendar"></div>' +
      '<button class="btn btn-primary btn-full" id="hist-picker-apply" style="margin-top:12px" disabled onclick="window._applyCustomPeriod()">Aplicar</button>' +
    '</div>';
  openModal("Período", body);

  var startRef = val("hist-from") ? new Date(val("hist-from") + "T00:00:00") : new Date();
  calState.viewYear  = startRef.getFullYear();
  calState.viewMonth = startRef.getMonth();
  calState.selFrom = val("hist-from") || null;
  calState.selTo   = val("hist-to") || null;

  if (activeShortcut === "custom") renderCalendar();
};

window._pickShortcut = function(btn) {
  var sc = btn.getAttribute("data-sc");
  document.querySelectorAll(".hist-picker-option").forEach(function(b) { b.classList.remove("active"); });
  btn.classList.add("active");

  if (sc === "custom") {
    activeShortcut = "custom";
    var custom = el("hist-picker-custom");
    if (custom) custom.style.display = "block";
    renderCalendar();
    return;
  }

  activeShortcut = sc;
  periodOffset = 0;
  applyShortcut(sc);
  closeModal();
};

window._applyCustomPeriod = function() {
  if (!calState.selFrom || !calState.selTo) return;
  activeShortcut = "custom";
  setVal("hist-from", calState.selFrom);
  setVal("hist-to",   calState.selTo);
  updatePeriodTrigger("custom", 0, { from: calState.selFrom, to: calState.selTo });
  closeModal();
  loadData();
};

var CAL_DIAS = ["D","S","T","Q","Q","S","S"];
var CAL_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmtCalShort(dateStr) {
  if (!dateStr) return "--";
  var d = new Date(dateStr + "T00:00:00");
  return String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
}

function renderCalendar(dir) {
  var wrap = el("hist-calendar");
  if (!wrap) return;

  var y = calState.viewYear, m = calState.viewMonth;
  var firstDay = new Date(y, m, 1).getDay();
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var todayStr = today();

  var cells = "";
  for (var i = 0; i < firstDay; i++) cells += '<div class="cal-cell cal-cell--empty"></div>';
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = y + "-" + String(m+1).padStart(2,"0") + "-" + String(d).padStart(2,"0");
    var cls = "cal-cell";
    var isSingle = calState.selFrom && calState.selTo && calState.selFrom === calState.selTo && dateStr === calState.selFrom;
    if (dateStr === todayStr) cls += " cal-cell--today";
    if (isSingle) {
      cls += " cal-cell--single";
    } else {
      if (calState.selFrom && dateStr === calState.selFrom) cls += " cal-cell--start";
      if (calState.selTo && dateStr === calState.selTo) cls += " cal-cell--end";
      if (calState.selFrom && calState.selTo && dateStr > calState.selFrom && dateStr < calState.selTo) cls += " cal-cell--inrange";
    }
    if (dateStr > todayStr) cls += " cal-cell--future";
    cells += '<button class="' + cls + '" onclick="window._calPick(\'' + dateStr + '\')"' + (dateStr > todayStr ? ' disabled' : '') + '>' + d + '</button>';
  }

  var statusText;
  if (!calState.selFrom) {
    statusText = 'Toca numa data de início';
  } else if (!calState.selTo) {
    statusText = '<strong>' + fmtCalShort(calState.selFrom) + '</strong> → toca na data final';
  } else {
    statusText = '<strong>' + fmtCalShort(calState.selFrom) + '</strong> → <strong>' + fmtCalShort(calState.selTo) + '</strong>';
  }

  wrap.innerHTML =
    '<div class="cal-status">' + statusText + '</div>' +
    '<div class="cal-header">' +
      '<button class="hist-nav-arrow" onclick="window._calNavMonth(-1)"><i data-lucide="chevron-left"></i></button>' +
      '<span class="cal-title">' + CAL_MESES[m] + ' ' + y + '</span>' +
      '<button class="hist-nav-arrow" onclick="window._calNavMonth(1)"><i data-lucide="chevron-right"></i></button>' +
    '</div>' +
    '<div class="cal-grid cal-grid--weekdays">' + CAL_DIAS.map(function(d0){return '<div class="cal-weekday">'+d0+'</div>';}).join("") + '</div>' +
    '<div class="cal-grid ' + (dir === 1 ? "cal-grid--slide-left" : dir === -1 ? "cal-grid--slide-right" : "cal-grid--anim") + '">' + cells + '</div>';

  refreshIcons(wrap);
}

window._calNavMonth = function(dir) {
  calState.viewMonth += dir;
  if (calState.viewMonth > 11) { calState.viewMonth = 0; calState.viewYear++; }
  if (calState.viewMonth < 0)  { calState.viewMonth = 11; calState.viewYear--; }
  renderCalendar(dir);
};

window._calPick = function(dateStr) {
  if (!calState.selFrom || (calState.selFrom && calState.selTo) || dateStr < calState.selFrom) {
    calState.selFrom = dateStr;
    calState.selTo = null;
  } else if (dateStr === calState.selFrom) {
    calState.selFrom = dateStr;
    calState.selTo = dateStr;
  } else {
    calState.selTo = dateStr;
  }
  var applyBtn = el("hist-picker-apply");
  if (applyBtn) applyBtn.disabled = !(calState.selFrom && calState.selTo);
  renderCalendar();
};

window._histNavPeriod = function(dir) {
  periodOffset += dir;
  if (periodOffset > 0) periodOffset = 0;
  applyShortcut(activeShortcut);
};

function applyShortcut(sc) {
  var dates = getShortcutDates(sc, periodOffset);
  if (!dates) return;
  setVal("hist-from", dates.from);
  setVal("hist-to",   dates.to);
  updatePeriodTrigger(sc, periodOffset, dates);
  loadData();
}

function updatePeriodTrigger(sc, offset, dates) {
  var labelEl = el("hist-period-trigger-label");
  var prevBtn = el("hist-nav-prev");
  var nextBtn = el("hist-nav-next");
  if (labelEl) labelEl.textContent = getPeriodLabel(sc, offset, dates);
  var isCustom = sc === "custom";
  if (prevBtn) prevBtn.style.visibility = isCustom ? "hidden" : "visible";
  if (nextBtn) {
    nextBtn.style.visibility = isCustom ? "hidden" : "visible";
    nextBtn.disabled = offset >= 0;
  }
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
  if (activeTab === "geral" && tab !== "geral" && histChartInstance) {
    histChartInstance.destroy();
    histChartInstance = null;
  }
  activeTab = tab;
  renderTabs();
  await loadData();
};

function skeletonKpi() {
  return '<div class="hist-kpi hist-skel"><div class="skel-line skel-line--label"></div><div class="skel-line skel-line--val"></div></div>';
}
function skeletonCard() {
  return '<div class="hist-sale-card hist-skel">' +
    '<div class="skel-circle"></div>' +
    '<div style="flex:1"><div class="skel-line skel-line--title"></div><div class="skel-line skel-line--sub"></div></div>' +
    '<div class="skel-line skel-line--price"></div>' +
    '</div>';
}
function renderHistSkeleton(tab) {
  var stats = el("historico-stats");
  var hero  = el("historico-hero");
  var chart = el("historico-chart");
  var list  = el("historico-list");

  if (tab === "geral" && hero) {
    hero.style.display = "block";
    hero.innerHTML = '<div class="hist-skel hist-hero-skel"><div class="skel-line skel-line--label" style="background:rgba(255,255,255,.3)"></div><div class="skel-line skel-line--hero" style="background:rgba(255,255,255,.35)"></div></div>';
  }
  if (chart) chart.style.display = "none";
  if (stats) stats.innerHTML = skeletonKpi() + skeletonKpi() + skeletonKpi() + skeletonKpi();
  if (list)  list.innerHTML  = skeletonCard() + skeletonCard() + skeletonCard();
}

function minDelay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function loadData() {
  var from = val("hist-from");
  var to   = val("hist-to");
  renderHistSkeleton(activeTab);

  await minDelay(280);

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
      var displayPct = Math.min(Math.abs(variacao), 100).toFixed(0);
      badgeHtml =
        '<span class="hist-hero-trend ' + (isUp ? 'hist-hero-trend--up' : 'hist-hero-trend--down') + '">' +
        (isUp ? '↑' : '↓') + ' ' + displayPct + '%' +
        '</span>';
    }

    var phraseTemplates = {
      hoje:   { muitoAcima:"Muito acima de ontem",        melhor:"Melhor que ontem",        igual:"Igual a ontem",        abaixo:"Abaixo de ontem",        bemAbaixo:"Bem abaixo de ontem" },
      semana: { muitoAcima:"Muito acima da semana passada", melhor:"Melhor que a semana passada", igual:"Igual à semana passada", abaixo:"Abaixo da semana passada", bemAbaixo:"Bem abaixo da semana passada" },
      mes:    { muitoAcima:"Muito acima do mês passado",   melhor:"Melhor que o mês passado",   igual:"Igual ao mês passado",   abaixo:"Abaixo do mês passado",   bemAbaixo:"Bem abaixo do mês passado" },
      custom: { muitoAcima:"Muito acima do período anterior", melhor:"Melhor que o período anterior", igual:"Igual ao período anterior", abaixo:"Abaixo do período anterior", bemAbaixo:"Bem abaixo do período anterior" }
    };
    var tpl = phraseTemplates[activeShortcut] || phraseTemplates.custom;

    var contextPhrase = "";
    if (nVendas === 0) {
      contextPhrase = "Sem vendas neste período";
    } else if (variacao !== null) {
      if (variacao > 20)        contextPhrase = tpl.muitoAcima;
      else if (variacao > 2)    contextPhrase = tpl.melhor;
      else if (variacao >= -2)  contextPhrase = tpl.igual;
      else if (variacao >= -20) contextPhrase = tpl.abaixo;
      else                       contextPhrase = tpl.bemAbaixo;
    }

    var startVal = heroLastValue === null ? total : heroLastValue;
    var cornerBadge = badgeHtml.replace('class="hist-hero-trend', 'class="hist-hero-trend hist-hero-trend--corner');
    hero.innerHTML =
      cornerBadge +
      '<div class="hist-hero-label">Total do período</div>' +
      '<div class="hist-hero-row"><div class="hist-hero-val" id="hist-hero-val-num">' + fmt(startVal) + '</div></div>' +
      (contextPhrase ? '<div class="hist-hero-context">' + contextPhrase + '</div>' : '') +
      '<div class="hist-hero-sub">' + nVendas + ' ' + (nVendas===1?"venda":"vendas") + ' · média por venda ' + fmt(ticket) + '</div>';

    if (heroLastValue !== null && heroLastValue !== total) {
      animateHeroValue(heroLastValue, total);
    }
    heroLastValue = total;
  }

  // KPIs
  var stats = el("historico-stats");
  if (stats) {
    stats.innerHTML =
      kpi("Nº Vendas",     nVendas,         "var(--text)",  "", null) +
      kpi("Média por Venda",  fmt(ticket),     "var(--text)",     "", null) +
      kpi("Fiado Aberto",  fmt(fiadoAb),    "var(--warning-muted)",  "", fiadoAb>0?"hist-kpi--attention":null) +
      kpi("Devoluções",    fmt(devTotal),   devTotal>0?"var(--danger-muted)":"var(--success)", incOpen+" incidente"+(incOpen===1?"":"s"), devTotal>0?"hist-kpi--danger":null);
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
      if (!document.getElementById("hist-chart-canvas")) {
        chart.innerHTML =
          '<div class="hist-chart-title">Vendas por dia</div>' +
          '<div style="position:relative;height:165px"><canvas id="hist-chart-canvas"></canvas></div>';
      }

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

    var labels = days.map(function(d) { return d.slice(5).split("-").reverse().join("/"); });
    var maxV = Math.max.apply(null, values.concat([1]));
    var suggestedMax = maxV * 1.35;

    if (histChartInstance) {
      histChartInstance.data.labels = labels;
      histChartInstance.data.datasets[0].data = values;
      histChartInstance.options.scales.y.suggestedMax = suggestedMax;
      histChartInstance.update();
      return;
    }

    var ctx = canvas.getContext("2d");
    var gradient = ctx.createLinearGradient(0, 0, 0, 140);
    gradient.addColorStop(0, "rgba(124,58,237,0.28)");
    gradient.addColorStop(1, "rgba(124,58,237,0)");

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
      plugins: [histChartValueLabelPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: "easeOutQuart" },
        layout: {
          padding: { top: 38, right: 10, left: 4, bottom: 0 }
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
            ticks: {
              font: { size: 9 }, color: "#a1a1aa",
              autoSkip: false,
              callback: function(val, index) {
                var total = this.chart.data.labels.length;
                if (total <= 8) return this.getLabelForValue(val);

                var maxTicks = 5;
                var step = Math.max(1, Math.round((total - 1) / (maxTicks - 1)));
                var isMarker = (index === 0) || (index === total - 1) || (index % step === 0 && index < total - 1);
                return isMarker ? this.getLabelForValue(val) : "";
              }
            }
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
              callback: function(v) { return fmtChartVal(v); }
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

function animateHeroValue(from, to) {
  var el2 = document.getElementById("hist-hero-val-num");
  if (!el2) return;
  var duration = 1300;
  var startTime = null;

  function step(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = from + (to - from) * eased;
    var liveEl = document.getElementById("hist-hero-val-num");
    if (!liveEl) return;
    liveEl.textContent = fmt(current);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function kpi(label, val, color, sub, attentionClass) {
  var len = String(val).length;
  var sizeClass = len > 13 ? " hist-kpi-val--xs" : (len > 9 ? " hist-kpi-val--sm" : "");
  return '<div class="hist-kpi' + (attentionClass ? ' ' + attentionClass : '') + '">' +
    '<div class="hist-kpi-label">' + label + '</div>' +
    '<div class="hist-kpi-val' + sizeClass + '" style="color:' + color + '">' + val + '</div>' +
    (sub ? '<div class="hist-kpi-sub">' + sub + '</div>' : '') +
    '</div>';
}

// ── STOCK ─────────────────────────────────────────────────────────────────────
var typeLabels = {
  sale:"Venda", purchase:"Compra", transfer_in:"Entrada", transfer_out:"Saída",
  adjustment:"Ajuste", session_open:"Sessão", session_close:"Sessão",
  incident:"Incidente", incident_resolved:"Incidente resolvido", incident_resolution:"Incidente resolvido"
};
var typeColors = {
  sale:"var(--danger)", purchase:"var(--success)", transfer_in:"var(--info)", transfer_out:"var(--warning)",
  adjustment:"var(--primary-mid)", session_open:"var(--text4)", session_close:"var(--text4)",
  incident:"var(--danger)", incident_resolved:"var(--success)", incident_resolution:"var(--success)"
};
var typeIcons = {
  sale:"shopping-cart", purchase:"package-plus", transfer_in:"arrow-down-to-line", transfer_out:"arrow-up-from-line",
  adjustment:"sliders-horizontal", session_open:"log-in", session_close:"log-out",
  incident:"alert-triangle", incident_resolved:"check-circle", incident_resolution:"check-circle"
};
var typeBg = {
  sale:"var(--danger-light)", purchase:"var(--success-light)", transfer_in:"var(--info-light)", transfer_out:"var(--warning-light)",
  adjustment:"var(--primary-light)", session_open:"var(--border2)", session_close:"var(--border2)",
  incident:"var(--danger-light)", incident_resolved:"var(--success-light)", incident_resolution:"var(--success-light)"
};

async function loadStock(from, to) {
  var hero = el("historico-hero");
  var stats = el("historico-stats");
  var chart = el("historico-chart");
  var actions = el("hist-actions");
  if (hero)    hero.style.display  = "none";
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

  filtered = filtered.filter(function(m) {
    var isSessionType = m.type === "session_open" || m.type === "session_close";
    return !(isSessionType && (m.qty === 0 || !m.qty));
  });

  if (stats) {
    var totalOps = filtered.length;
    var totalIn  = filtered.filter(function(m){ return m.qty > 0; }).reduce(function(a,m){ return a + m.qty; }, 0);
    var totalOut = filtered.filter(function(m){ return m.qty < 0; }).reduce(function(a,m){ return a + Math.abs(m.qty); }, 0);
    var uniqueProducts = {};
    filtered.forEach(function(m){ uniqueProducts[m.productName] = true; });
    var nProducts = Object.keys(uniqueProducts).length;
    stats.innerHTML =
      kpi("Operações", totalOps, "var(--text)", "", null) +
      kpi("Entradas", "+" + abbrevQty(totalIn), "var(--success)", "unidades", null) +
      kpi("Saídas", "-" + abbrevQty(totalOut), "var(--danger)", "unidades", null) +
      kpi("Produtos", nProducts, "var(--info)", nProducts===1?"movimentado":"movimentados", null);
  }

  var local    = filtered.filter(function(m) { return m.imported !== true; });
  var imported = filtered.filter(function(m) { return m.imported === true; });

  var list = el("historico-list");
  if (!list) return;

  function fmtAbbrev(v) {
    var s = v.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  }

  function abbrevQty(n) {
    var abs = Math.abs(n);
    var sign = n < 0 ? "-" : "";
    if (abs < 1000) return sign + abs;
    if (abs < 1e6)  return sign + fmtAbbrev(abs/1e3) + "K";
    if (abs < 1e9)  return sign + fmtAbbrev(abs/1e6) + "M";
    if (abs < 1e12) return sign + fmtAbbrev(abs/1e9) + "B";
    return sign + fmtAbbrev(abs/1e12) + "T";
  }

  function renderMovItem(m) {
    var color = typeColors[m.type] || "#9ca3af";
    var bg    = typeBg[m.type]    || "#f3f4f6";
    var label = typeLabels[m.type] || m.type;
    var sign  = m.qty > 0 ? "+" : "";
    var autor = (m.userId != null && usersById[m.userId]) ? usersById[m.userId].name : "Desconhecido";
    return '<div class="hist-mov-item" style="border-left:3px solid ' + color + '">' +
      '<div class="hist-mov-icon" style="background:' + bg + ';color:' + color + '"><i data-lucide="' + (typeIcons[m.type]||"circle") + '" style="width:18px;height:18px"></i></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div class="hist-mov-name"><i data-lucide="package" class="hist-mov-name-icon"></i>' + m.productName + '</div>' +
      '<span class="hist-mov-tag" style="background:' + bg + ';color:' + color + '">' + label + '</span>' +
      '<div class="hist-mov-meta">' + fmtDate(m.createdAt) + '</div>' +
      '<div class="hist-mov-meta hist-mov-meta--autor"><strong>' + autor + '</strong></div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div class="hist-mov-qty" style="color:' + color + '" title="' + sign + m.qty + '">' + sign + abbrevQty(m.qty) + '</div>' +
      '<div class="hist-mov-range"><span class="hist-mov-range-label">Stock</span> ' + (m.qtyBefore||0) + ' <i data-lucide="arrow-right" style="width:9px;height:9px;vertical-align:middle"></i> <strong>' + (m.qtyAfter||0) + '</strong></div>' +
      '</div></div>';
  }

  function renderMovSubItem(m) {
    var color = typeColors[m.type] || "#9ca3af";
    var bg    = typeBg[m.type]    || "#f3f4f6";
    var label = typeLabels[m.type] || m.type;
    var sign  = m.qty > 0 ? "+" : "";
    var autor = (m.userId != null && usersById[m.userId]) ? usersById[m.userId].name : "Desconhecido";
    return '<div class="hist-mov-subitem" style="border-left-color:' + color + '">' +
      '<div class="hist-mov-icon hist-mov-icon--sm" style="background:' + bg + ';color:' + color + '"><i data-lucide="' + (typeIcons[m.type]||"circle") + '" style="width:14px;height:14px"></i></div>' +
      '<div style="flex:1;min-width:0">' +
      '<span class="hist-mov-tag" style="background:' + bg + ';color:' + color + '">' + label + '</span>' +
      '<div class="hist-mov-meta">' + fmtDate(m.createdAt) + ' · <strong>' + autor + '</strong></div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div class="hist-mov-qty" style="color:' + color + '" title="' + sign + m.qty + '">' + sign + abbrevQty(m.qty) + '</div>' +
      '<div class="hist-mov-range">' + (m.qtyBefore||0) + ' <i data-lucide="arrow-right" style="width:9px;height:9px;vertical-align:middle"></i> <strong>' + (m.qtyAfter||0) + '</strong></div>' +
      '</div></div>';
  }

  function groupConsecutiveByProduct(items) {
    var groups = [];
    items.forEach(function(m) {
      var last = groups[groups.length - 1];
      if (last && last.productName === m.productName) {
        last.items.push(m);
      } else {
        groups.push({ productName: m.productName, items: [m] });
      }
    });
    return groups;
  }

  function renderProductGroup(g) {
    if (g.items.length === 1) return renderMovItem(g.items[0]);
    var header =
      '<div class="hist-mov-group-header">' +
      '<i data-lucide="package" class="hist-mov-name-icon"></i>' + g.productName +
      '<span class="hist-mov-group-count">' + g.items.length + ' operações</span>' +
      '</div>';
    var subitems = g.items.map(renderMovSubItem).join("");
    return '<div class="hist-mov-group">' + header + subitems + '</div>';
  }

  function renderMovBlock(arr, title) {
    if (!arr.length) return '<div class="hist-section-label">' + title + '</div>' +
      '<div class="hist-empty" style="padding:24px"><div class="hist-empty-sub">Nenhum movimento no período</div></div>';

    var capped = arr.slice(0,50);
    var groups = groupByDay(capped, "createdAt");

    return '<div class="hist-section-label">' + title + ' (' + arr.length + ')</div>' +
      '<div class="hist-mov-card">' +
      groups.map(function(g) {
        var productGroups = groupConsecutiveByProduct(g.sales);
        return '<div class="hist-day-label hist-day-label--inset">' + dayLabel(g.date) + '</div>' +
          productGroups.map(renderProductGroup).join("");
      }).join("") +
      (arr.length>50 ? '<div style="padding:10px 14px;font-size:12px;color:var(--text4)">+' + (arr.length-50) + ' mais</div>' : '') +
      '</div>';
  }

  list.innerHTML = renderMovBlock(local, "Movimentos Locais") + renderMovBlock(imported, "Movimentos Importados");
  refreshIcons(list);
}

// ── AUDITORIA ─────────────────────────────────────────────────────────────────
window._auditFilterUser = function(uid) {
  auditUserFilter = uid;
  loadAuditoria(val("hist-from"), val("hist-to"));
};

async function loadAuditoria(from, to) {
  var hero    = el("historico-hero");
  var stats   = el("historico-stats");
  var chart   = el("historico-chart");
  var actions = el("hist-actions");
  if (hero)    hero.style.display    = "none";
  if (chart)   chart.style.display   = "none";
  if (actions) actions.style.display = "none";

  var sessions  = await db.getAll("sessions");
  var incidents = await db.getAll("incidents");
  var movements = await db.getAll("stockMovements");
  var sales     = await db.getAll("sales");
  var users     = await db.getAll("users");

  var periodMovs = movements.filter(function(m) {
    var d = toLocalDateStr(m.createdAt);
    return d >= from && d <= to;
  });
  var periodSales = sales.filter(function(s) {
    var d = toLocalDateStr(s.date);
    return d >= from && d <= to;
  });
  var periodIncidents = incidents.filter(function(i) {
    var d = toLocalDateStr(i.createdAt);
    return d >= from && d <= to;
  });
  var adjustments = periodMovs.filter(function(m) { return m.type === "adjustment"; });

  var employeeIds = {};
  sessions.forEach(function(s){ if (s.userId != null) employeeIds[s.userId] = s.userName; });
  periodMovs.forEach(function(m){ if (m.userId != null && users.find(function(u){return u.id===m.userId;})) employeeIds[m.userId] = (users.find(function(u){return u.id===m.userId;})||{}).name; });

  function matchesFilter(userId) {
    return auditUserFilter === "all" || String(userId) === String(auditUserFilter);
  }

  if (auditUserFilter !== "all") {
    adjustments      = adjustments.filter(function(m){ return matchesFilter(m.userId); });
    periodSales      = periodSales.filter(function(s){ return matchesFilter(s.userId); });
    periodIncidents  = periodIncidents.filter(function(i){ return matchesFilter(i.userId); });
  }

  var periodSessions = sessions.filter(function(s) {
    if (s.isImported) return false;
    var d = toLocalDateStr(s.openedAt);
    return d >= from && d <= to;
  }).filter(function(s){ return matchesFilter(s.userId); });

  if (stats) {
    var salesTotal = periodSales.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); }, 0);
    stats.innerHTML =
      kpi("Vendas", periodSales.length, "var(--text)", fmt(salesTotal), null) +
      kpi("Ajustes", adjustments.length, "var(--primary-mid)", "stock", adjustments.length>0?"hist-kpi--attention":null) +
      kpi("Incidentes", periodIncidents.length, periodIncidents.length>0?"var(--danger)":"var(--success)", "", periodIncidents.length>0?"hist-kpi--danger":null) +
      kpi("Sessões", periodSessions.length, "var(--text)", "", null);
  }

  var importedSessions = sessions.filter(function(s) { return s.isImported; });
  var openIncidents    = incidents.filter(function(i) { return i.status==="open"; });
  var seenUuids = new Set();
  var chain = sessions.filter(function(s) {
    if (s.isImported) return false;
    if (s.uuid && seenUuids.has(s.uuid)) return false;
    if (s.uuid) seenUuids.add(s.uuid);
    if (!matchesFilter(s.userId)) return false;
    return true;
  }).sort(function(a,b) { return a.id - b.id; });

  var list = el("historico-list");
  if (!list) return;

  var filterChipsHtml =
    '<div class="hist-audit-filters">' +
    '<button class="hist-audit-chip' + (auditUserFilter==="all"?" active":"") + '" onclick="window._auditFilterUser(\'all\')">Todos</button>' +
    Object.keys(employeeIds).map(function(uid) {
      return '<button class="hist-audit-chip' + (String(auditUserFilter)===String(uid)?" active":"") + '" onclick="window._auditFilterUser(\'' + uid + '\')">' + (employeeIds[uid]||"?") + '</button>';
    }).join("") +
    '</div>';

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

  var timelineEvents = [];

  chain.forEach(function(s) {
    timelineEvents.push({ eventDate: s.openedAt, kind: "session", data: s });
  });
  adjustments.forEach(function(m) {
    timelineEvents.push({ eventDate: m.createdAt, kind: "adjustment", data: m });
  });
  periodIncidents.forEach(function(i) {
    timelineEvents.push({ eventDate: i.createdAt, kind: "incident", data: i });
  });

  timelineEvents.sort(function(a,b) { return new Date(b.eventDate) - new Date(a.eventDate); });

  function renderTimelineEvent(ev) {
    if (ev.kind === "session") {
      var s = ev.data;
      return '<div class="hist-timeline-item"' + (s.uuid ? ' title="ID: ' + s.uuid + '"' : '') + '>' +
        '<div class="hist-timeline-dot" style="background:' + dotColor(s) + '"></div>' +
        '<div class="hist-timeline-info">' +
        '<div class="hist-timeline-name">' + s.userName + '</div>' +
        '<div class="hist-timeline-date">Sessão · ' + fmtDate(s.openedAt) + (s.closedAt?" → "+fmtDate(s.closedAt):" (em curso)") + '</div>' +
        '</div>' +
        '<span class="badge-status" style="background:' + badgeBg(s) + ';color:' + dotColor(s) + '">' + badgeLabel(s) + '</span>' +
        '</div>';
    }
    if (ev.kind === "adjustment") {
      var m = ev.data;
      var autor = (m.userId != null && employeeIds[m.userId]) ? employeeIds[m.userId] : "Desconhecido";
      var sign = m.qty > 0 ? "+" : "";
      return '<div class="hist-timeline-item hist-timeline-item--adjustment">' +
        '<div class="hist-timeline-dot" style="background:var(--primary-mid)"></div>' +
        '<div class="hist-timeline-info">' +
        '<div class="hist-timeline-name">Ajuste manual · ' + m.productName + '</div>' +
        '<div class="hist-timeline-date">' + fmtDate(m.createdAt) + ' · <strong>' + autor + '</strong> · ' + (m.qtyBefore||0) + ' → ' + (m.qtyAfter||0) + '</div>' +
        '</div>' +
        '<span class="badge-status" style="background:var(--primary-light);color:var(--primary-mid)">' + sign + m.qty + '</span>' +
        '</div>';
    }
    if (ev.kind === "incident") {
      var i = ev.data;
      return '<div class="hist-timeline-item">' +
        '<div class="hist-timeline-dot" style="background:var(--danger)"></div>' +
        '<div class="hist-timeline-info">' +
        '<div class="hist-timeline-name" style="color:var(--danger)">Incidente · ' + i.productName + '</div>' +
        '<div class="hist-timeline-date">' + fmtDate(i.createdAt) + '</div>' +
        '</div>' +
        '<div style="font-size:15px;font-weight:800;color:var(--danger)">' + (i.diff>0?"+":"") + i.diff + '</div>' +
        '</div>';
    }
    return "";
  }

  var timelineGroups = groupByDay(timelineEvents, "eventDate");

  list.innerHTML =
    filterChipsHtml +
    '<div class="hist-section-label">Linha do Tempo</div>' +
    '<div class="hist-timeline">' +
    (timelineEvents.length === 0
      ? '<div class="hist-empty" style="padding:24px"><div class="hist-empty-sub">Sem eventos no período</div></div>'
      : timelineGroups.map(function(g) {
          return '<div class="hist-day-label hist-day-label--inset">' + dayLabel(g.date) + '</div>' +
            g.sales.map(renderTimelineEvent).join("");
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
