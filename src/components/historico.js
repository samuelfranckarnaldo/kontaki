import { db }                           from "../db.js";
import { gerarReciboPDF, partilharReciboPDF } from "./recibo-pdf.js";
import { fmt, fmtDate, today, el, val, setVal, refreshIcons } from "../utils.js";
import { openModal, closeModal }        from "../modal.js";
import { initCalendar, getCalSelection } from "../calendar.js";
import { getUser }                      from "../auth.js";
import { printRecibo }                  from "../print.js";
import { openDevolucao, gerarRelatorioPDF } from "./extras.js";

let activeTab = "geral";
let activeShortcut = "hoje";
let histChartInstance = null;
let auditUserFilter = "all";
let auditKindFilter = "all";
let periodOffset = 0;
let heroLastValue = 0;

export function fmtChartVal(n) {
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

function getMultiplePeriodsHistory(from, to, count) {
  var periods = [];
  var curFrom = from, curTo = to;
  for (var i = 0; i < count; i++) {
    var prev = getPreviousPeriod(curFrom, curTo);
    periods.push(prev);
    curFrom = prev.from;
    curTo = prev.to;
  }
  return periods;
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

export function getShortcutDates(sc, offset) {
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

  if (sc === "ano") {
    var baseY = new Date().getFullYear() + offset;
    var fromStr = baseY + "-01-01";
    var toStr = offset === 0 ? t : (baseY + "-12-31");
    return { from: fromStr, to: toStr };
  }

  return null;
}

export function getPeriodLabel(sc, offset, dates) {
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
  if (sc === "ano") {
    var d3 = new Date(dates.from + "T00:00:00");
    return "Ano " + d3.getFullYear();
  }
  if (sc === "custom" && dates) {
    var f = new Date(dates.from + "T00:00:00");
    var t = new Date(dates.to + "T00:00:00");
    return f.getDate() + "/" + (f.getMonth()+1) + " – " + t.getDate() + "/" + (t.getMonth()+1);
  }
  return "";
}

export async function initHistorico() {
  setVal("hist-from", today());
  setVal("hist-to",   today());
  heroLastValue = 0;

  renderTabs();
  applyShortcut("hoje");
}

window._openExportMenu = async function(filtered) {
  var licMod = await import("../license.js");
  if (!licMod.hasFeature("exportar_relatorios")) {
    licMod.showUpgradeBanner("Exportação de relatórios disponível a partir do plano Standard. Contacta a Introxeer para upgrade.");
    return;
  }
  var isAdmin = getUser().role === "admin";
  var body =
    '<div class="hist-export-options">' +
      '<button class="hist-export-option" onclick="window._exportChoice(\'csv\')">' +
        '<div class="hist-export-icon hist-export-icon--csv"><i data-lucide="table"></i></div>' +
        '<div class="hist-export-info">' +
          '<div class="hist-export-title">Exportar CSV</div>' +
          '<div class="hist-export-desc">Planilha com todas as vendas do período</div>' +
        '</div>' +
        '<i data-lucide="chevron-right" class="hist-export-arrow"></i>' +
      '</button>' +
      (isAdmin ?
        '<button class="hist-export-option" onclick="window._exportChoice(\'pdf\')">' +
          '<div class="hist-export-icon hist-export-icon--pdf"><i data-lucide="file-text"></i></div>' +
          '<div class="hist-export-info">' +
            '<div class="hist-export-title">Relatório PDF mensal</div>' +
            '<div class="hist-export-desc">Documento pronto para partilhar ou imprimir</div>' +
          '</div>' +
          '<i data-lucide="chevron-right" class="hist-export-arrow"></i>' +
        '</button>' : ''
      ) +
    '</div>';
  openModal("Exportar dados", body);
  window._exportFilteredData = filtered;
};

window._exportChoice = function(type) {
  closeModal();
  if (type === "csv") exportCSV(window._exportFilteredData);
  if (type === "pdf") gerarRelatorioPDF(val("hist-from"), val("hist-to"));
};

window._openPeriodPicker = function() {
  var options = [
    { id:"hoje",   label:"Hoje" },
    { id:"semana", label:"Esta semana" },
    { id:"mes",    label:"Este mês" },
    { id:"ano",    label:"Este ano" },
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

  if (activeShortcut === "custom") {
    initCalendar("hist-calendar", "hist-picker-apply", val("hist-from") || null, val("hist-to") || null);
  }
};

window._pickShortcut = function(btn) {
  var sc = btn.getAttribute("data-sc");
  document.querySelectorAll(".hist-picker-option").forEach(function(b) { b.classList.remove("active"); });
  btn.classList.add("active");

  if (sc === "custom") {
    activeShortcut = "custom";
    var custom = el("hist-picker-custom");
    if (custom) custom.style.display = "block";
    initCalendar("hist-calendar", "hist-picker-apply", val("hist-from") || null, val("hist-to") || null);
    return;
  }

  activeShortcut = sc;
  periodOffset = 0;
  applyShortcut(sc);
  closeModal();
};

window._applyCustomPeriod = function() {
  var sel = getCalSelection();
  if (!sel.from || !sel.to) return;
  activeShortcut = "custom";
  setVal("hist-from", sel.from);
  setVal("hist-to",   sel.to);
  updatePeriodTrigger("custom", 0, { from: sel.from, to: sel.to });
  closeModal();
  loadData();
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

  var searchWrap = el("hist-search-wrap");
  if (searchWrap) searchWrap.classList.add("hist-skel");
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

  var searchWrapDone = el("hist-search-wrap");
  if (searchWrapDone) searchWrapDone.classList.remove("hist-skel");
}

// ── GERAL ─────────────────────────────────────────────────────────────────────
export function payIcon(method) {
  if (!method) return "wallet";
  var m = method.toLowerCase();
  if (m.includes("dinheiro") || m.includes("cash"))  return "wallet";
  if (m.includes("transfer") || m.includes("banco")) return "landmark";
  if (m.includes("fiado") || m.includes("crédito"))  return "hand-coins";
  if (m.includes("multicaixa") || m.includes("cartão") || m.includes("cartao")) return "credit-card";
  return "credit-card";
}

export function payClass(method) {
  if (!method) return "hist-sale-avatar--dinheiro";
  var m = method.toLowerCase();
  if (m.includes("dinheiro") || m.includes("cash"))  return "hist-sale-avatar--dinheiro";
  if (m.includes("transfer") || m.includes("banco")) return "hist-sale-avatar--transferencia";
  if (m.includes("fiado") || m.includes("crédito"))  return "hist-sale-avatar--fiado";
  if (m.includes("multicaixa") || m.includes("cartão") || m.includes("cartao")) return "hist-sale-avatar--multicaixa";
  return "hist-sale-avatar--outros";
}

export function payColor(method) {
  if (!method) return "var(--teal)";
  var m = method.toLowerCase();
  if (m.includes("dinheiro") || m.includes("cash"))  return "var(--teal)";
  if (m.includes("transfer") || m.includes("banco")) return "var(--info)";
  if (m.includes("fiado") || m.includes("crédito"))  return "var(--warning)";
  if (m.includes("multicaixa") || m.includes("cartão") || m.includes("cartao")) return "#4338ca";
  return "var(--text3)";
}

export function payLabel(method) {
  if (!method) return "Dinheiro";
  var m = method.toLowerCase();
  if (m.includes("dinheiro") || m.includes("cash"))  return "Dinheiro";
  if (m.includes("transfer") || m.includes("banco")) return "Transferência";
  if (m.includes("fiado") || m.includes("crédito"))  return "Crédito";
  if (m.includes("multicaixa") || m.includes("cartão") || m.includes("cartao")) return "Multicaixa";
  return method;
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

  // Insights ricos: recorde de período e devoluções anómalas
  var historyPeriods = getMultiplePeriodsHistory(from, to, 6);
  var historyTotals = historyPeriods.map(function(p) {
    var pSales = sales.filter(function(s) {
      var d = toLocalDateStr(s.date);
      return d >= p.from && d <= p.to;
    });
    return pSales.reduce(function(a,s) { return a+((s.total||0)-(s.totalDevolvido||0)); }, 0);
  });
  var maxHistoryTotal = historyTotals.length ? Math.max.apply(null, historyTotals) : 0;
  var isRecord = total > 0 && total > maxHistoryTotal && historyTotals.some(function(t){return t>0;});

  var historyDevRatios = historyPeriods.map(function(p, idx) {
    var pSales = sales.filter(function(s) {
      var d = toLocalDateStr(s.date);
      return d >= p.from && d <= p.to;
    });
    var pTotal = pSales.reduce(function(a,s) { return a+((s.total||0)-(s.totalDevolvido||0))+(s.totalDevolvido||0); }, 0);
    var pDev   = pSales.reduce(function(a,s) { return a+(s.totalDevolvido||0); }, 0);
    return pTotal > 0 ? pDev / pTotal : 0;
  }).filter(function(r) { return r > 0; });
  var avgDevRatio = historyDevRatios.length ? (historyDevRatios.reduce(function(a,r){return a+r;},0) / historyDevRatios.length) : 0;
  var curGrossTotal = total + devTotal;
  var curDevRatio = curGrossTotal > 0 ? devTotal / curGrossTotal : 0;
  var devAnomaly = devTotal > 0 && avgDevRatio > 0 && curDevRatio > avgDevRatio * 1.8;

  var fiadoAlert = fiadoAb > 0 && total > 0 && (fiadoAb / total) > 0.3;

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

    var recordLabels = {
      hoje:   "Melhor dia dos últimos 6 dias!",
      semana: "Melhor semana das últimas 6 semanas!",
      mes:    "Melhor mês dos últimos 6 meses!",
      custom: "Melhor período dos últimos 6 registados!"
    };
    var recordLabel = isRecord ? (recordLabels[activeShortcut] || recordLabels.custom) : "";

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
    var recordHtml = recordLabel ? '<div class="hist-hero-record"><i data-lucide="award"></i>' + recordLabel + '</div>' : '';
    hero.innerHTML =
      cornerBadge +
      '<div class="hist-hero-label">Total do período</div>' +
      '<div class="hist-hero-row"><div class="hist-hero-val" id="hist-hero-val-num">' + fmt(startVal) + '</div></div>' +
      recordHtml +
      (contextPhrase ? '<div class="hist-hero-context">' + contextPhrase + '</div>' : '') +
      '<div class="hist-hero-sub">' + nVendas + ' ' + (nVendas===1?"venda":"vendas") + ' · média por venda ' + fmt(ticket) + '</div>';
    refreshIcons(hero);

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
      kpi("Crédito Aberto",  fmt(fiadoAb),    "var(--warning-muted)",  fiadoAlert?"Valor alto":"", null) +
      kpi("Devoluções",    fmt(devTotal),   devTotal>0?"var(--danger-muted)":"var(--success)", devAnomaly?"Acima do habitual":(incOpen+" incidente"+(incOpen===1?"":"s")), devTotal>0?"hist-kpi--danger":null);
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
              maxRotation: 0,
              minRotation: 0,
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
    var exportMenuBtn = el("btn-export-menu");
    if (exportMenuBtn) {
      exportMenuBtn.onclick = function() { window._openExportMenu(filtered); };
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
    var isFiado  = (s.payMethod||"").toLowerCase().includes("fiado");
    var color    = payColor(s.payMethod);
    var nItems   = s.items ? s.items.length : 0;

    return '<div class="hist-sale-card" style="border-left:3px solid ' + color + '" onclick="window._openSaleDetail(' + s.id + ')">' +
      '<div class="hist-sale-avatar ' + payClass(s.payMethod) + '"><i data-lucide="' + payIcon(s.payMethod) + '" style="width:18px;height:18px"></i></div>' +
      '<div class="hist-sale-info">' +
      '<div class="hist-sale-id">Venda #' + String(s.id).padStart(4,"0") +
      (hasDev ? ' <span class="hist-badge-dev">↩ Dev.</span>' : '') + '</div>' +
      '<span class="hist-sale-tag" style="background:color-mix(in srgb, ' + color + ' 15%, white);color:' + color + '">' + payLabel(s.payMethod) + '</span>' +
      '<div class="hist-sale-meta">' + fmtDate(s.date) + ' · ' + nItems + ' ' + (nItems===1?"item":"itens") + '</div>' +
      (s.clientName ? '<div class="hist-sale-client' + (isFiado?' hist-sale-client--fiado':'') + '"><i data-lucide="user" style="width:11px;height:11px"></i>' + s.clientName + '</div>' : '') +
      '</div>' +
      '<div class="hist-sale-right">' +
      (hasDev
        ? '<div class="hist-sale-total--dev">' + fmt(s.total) + '</div>' +
          '<div class="hist-sale-total-liq">' + fmt(totalLiq) + '</div>'
        : '<div class="hist-sale-total">' + fmt(s.total) + '</div>') +
      (s.discount>0 ? '<div style="font-size:10px;color:var(--danger)">-'+fmt(s.discount)+' desc.</div>' : '') +
      '</div></div>';
  }

  function renderSalesList(salesArr) {
    if (!salesArr.length) {
      list.innerHTML =
        '<div class="hist-empty">' +
        '<i data-lucide="search-x"></i>' +
        '<div class="hist-empty-title">Nenhum resultado</div>' +
        '<div class="hist-empty-sub">Tenta outro termo de pesquisa.</div>' +
        '</div>';
      refreshIcons(list);
      return;
    }
    var groups = groupByDay(salesArr);
    list.innerHTML = groups.map(function(g) {
      var n = g.sales.length;
      return '<div class="hist-day-label"><span>' + dayLabel(g.date) + '</span><span class="hist-day-label-count">' + n + ' ' + (n===1?"venda":"vendas") + '</span></div>' +
        g.sales.map(renderSaleCard).join("");
    }).join("");
    refreshIcons(list);
  }

  renderSalesList(filtered);

  var searchInput = el("hist-search-input");
  var searchClearBtn = el("btn-hist-search-clear");
  var searchDropdown = el("hist-search-dropdown");

  function searchMatches(q) {
    return filtered.filter(function(s) {
      var clientMatch = (s.clientName||"").toLowerCase().includes(q);
      var productMatch = (s.items||[]).some(function(i) { return (i.name||"").toLowerCase().includes(q); });
      var valueMatch = String(s.total||"").includes(q);
      var idMatch = String(s.id).includes(q);
      return clientMatch || productMatch || valueMatch || idMatch;
    });
  }

  function renderDropdown(results, q) {
    if (!searchDropdown) return;
    if (!q || !results.length) { searchDropdown.style.display = "none"; return; }
    var top = results.slice(0, 5);
    searchDropdown.style.display = "block";
    searchDropdown.innerHTML = top.map(function(s) {
      var nItems = s.items ? s.items.length : 0;
      return '<div class="hist-search-dropdown-item" onclick="window._openSaleDetail(' + s.id + ')">' +
        '<div class="hist-search-dropdown-info">' +
        '<div class="hist-search-dropdown-title">Venda #' + String(s.id).padStart(4,"0") + (s.clientName ? " · " + s.clientName : "") + '</div>' +
        '<div class="hist-search-dropdown-sub">' + fmtDate(s.date) + ' · ' + nItems + ' ' + (nItems===1?"item":"itens") + '</div>' +
        '</div>' +
        '<div class="hist-search-dropdown-val">' + fmt(s.total) + '</div>' +
        '</div>';
    }).join("") +
    (results.length > 5 ? '<div class="hist-search-dropdown-more">+' + (results.length - 5) + ' resultado' + (results.length-5===1?"":"s") + ' na lista abaixo</div>' : '');
  }

  if (searchInput) {
    searchInput.oninput = function() {
      var q = searchInput.value.trim().toLowerCase();
      if (searchClearBtn) searchClearBtn.style.display = q ? "flex" : "none";
      if (!q) { renderSalesList(filtered); if (searchDropdown) searchDropdown.style.display = "none"; return; }

      var results = searchMatches(q);
      renderSalesList(results);
      renderDropdown(results, q);
    };

    searchInput.onblur = function() {
      setTimeout(function() { if (searchDropdown) searchDropdown.style.display = "none"; }, 150);
    };
    searchInput.onfocus = function() {
      var q = searchInput.value.trim().toLowerCase();
      if (q) renderDropdown(searchMatches(q), q);
    };

    if (searchClearBtn) {
      searchClearBtn.onclick = function() {
        searchInput.value = "";
        searchClearBtn.style.display = "none";
        renderSalesList(filtered);
        if (searchDropdown) searchDropdown.style.display = "none";
        searchInput.focus();
      };
    }
  }
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

window._auditFilterKind = function(kind) {
  auditKindFilter = kind;
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
      kpi("Ajustes", adjustments.length, "var(--primary-mid)", "stock", null) +
      kpi("Incidentes", periodIncidents.length, periodIncidents.length>0?"var(--danger)":"var(--success)", "", null) +
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
    '</div>' +
    '<div class="hist-audit-filters" style="margin-top:6px">' +
    [
      { id:"all",        label:"Tudo" },
      { id:"session",     label:"Sessões" },
      { id:"adjustment",  label:"Ajustes" },
      { id:"incident",    label:"Incidentes" },
      { id:"audit",       label:"Edições" },
    ].map(function(k) {
      return '<button class="hist-audit-chip' + (auditKindFilter===k.id?" active":"") + '" onclick="window._auditFilterKind(\'' + k.id + '\')">' + k.label + '</button>';
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

  var allAuditLog = await db.getAll("auditLog");
  var periodAuditLog = allAuditLog.filter(function(a) {
    var d = toLocalDateStr(a.createdAt);
    return d >= from && d <= to;
  }).filter(function(a){ return matchesFilter(a.userId); });

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
  periodAuditLog.forEach(function(a) {
    timelineEvents.push({ eventDate: a.createdAt, kind: "audit", data: a });
  });

  timelineEvents.sort(function(a,b) { return new Date(b.eventDate) - new Date(a.eventDate); });

  function renderTimelineEvent(ev) {
    if (ev.kind === "session") {
      var s = ev.data;
      var clickable = !!s.closedAt;
      return '<div class="hist-timeline-item' + (clickable?' hist-timeline-item--clickable':'') + '"' +
        (s.uuid ? ' title="ID: ' + s.uuid + '"' : '') +
        (clickable ? ' onclick="window._openSessionDetail(' + s.id + ')"' : '') + '>' +
        '<div class="hist-timeline-dot" style="background:' + dotColor(s) + '"></div>' +
        '<div class="hist-timeline-info">' +
        '<div class="hist-timeline-name">' + s.userName + '</div>' +
        '<div class="hist-timeline-date">Sessão · ' + fmtDate(s.openedAt) + (s.closedAt?" → "+fmtDate(s.closedAt):" (em curso)") + '</div>' +
        '</div>' +
        '<span class="badge-status" style="background:' + badgeBg(s) + ';color:' + dotColor(s) + '">' + badgeLabel(s) + '</span>' +
        (clickable ? '<i data-lucide="chevron-right" class="hist-timeline-arrow"></i>' : '') +
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
    if (ev.kind === "audit") {
      var a = ev.data;
      var entityLabel = a.entityType === "product" ? "Produto" : a.entityType;
      var actionLabel = a.action === "edit" ? "editado" : a.action === "create" ? "criado" : a.action;
      var changesText = (a.changes||[]).map(function(c) {
        return c.field + ': ' + c.before + ' → ' + c.after;
      }).join(" · ");
      return '<div class="hist-timeline-item hist-timeline-item--adjustment">' +
        '<div class="hist-timeline-dot" style="background:var(--primary-mid)"></div>' +
        '<div class="hist-timeline-info">' +
        '<div class="hist-timeline-name">' + entityLabel + ' ' + actionLabel + '</div>' +
        '<div class="hist-timeline-date">' + fmtDate(a.createdAt) + ' · <strong>' + a.userName + '</strong>' + (changesText ? ' · ' + changesText : '') + '</div>' +
        '</div>' +
        '</div>';
    }
    return "";
  }

  if (auditKindFilter !== "all") {
    timelineEvents = timelineEvents.filter(function(ev) { return ev.kind === auditKindFilter; });
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
window._openSessionDetail = async function(sessionId) {
  var s = await db.get("sessions", sessionId);
  if (!s) return;

  var isLocal = !s.isImported;

  var sales = await db.getAll("sales");
  var sessionSales = isLocal ? sales.filter(function(x){ return x.sessionId === sessionId; }) : [];
  var totalVendas = isLocal
    ? sessionSales.reduce(function(a,x){ return a+((x.total||0)-(x.totalDevolvido||0)); }, 0)
    : (s.totalVendas || 0);
  var nVendas = isLocal ? sessionSales.length : (s.nVendas || 0);

  var incidents = await db.getAll("incidents");
  var sessionIncidents = incidents.filter(function(i){ return i.sessionId === sessionId; });

  var hasCashData = s.cashExpected != null && s.cashCounted != null;
  var cashDiff = s.cashDiff || 0;
  var diffColor = cashDiff === 0 ? "var(--success)" : (cashDiff > 0 ? "var(--info)" : "var(--danger-muted)");
  var diffLabel = cashDiff === 0 ? "Caixa exato" : (cashDiff > 0 ? "Sobra de caixa" : "Falta em caixa");

  var durationMs = s.closedAt ? (new Date(s.closedAt) - new Date(s.openedAt)) : 0;
  var durationH = Math.floor(durationMs / 3600000);
  var durationM = Math.round((durationMs % 3600000) / 60000);
  var durationLabel = durationH > 0 ? (durationH + "h" + (durationM>0?durationM+"min":"")) : (durationM + "min");

  var sectionIdx = 0;
  function sectionDelay() { return (sectionIdx++ * 60) + "ms"; }

  var cashSection = "";
  if (hasCashData) {
    var maxV = Math.max(s.cashExpected, s.cashCounted, 1);
    var expectedPct = Math.min(100, (s.cashExpected / maxV) * 100);
    var countedPct = Math.min(100, (s.cashCounted / maxV) * 100);
    cashSection =
      '<div class="hist-session-cash hist-session-fade" style="animation-delay:' + sectionDelay() + '">' +
        '<div class="hist-session-cash-title" style="color:var(--teal)"><i data-lucide="wallet"></i>Conferência de caixa</div>' +
        '<div class="hist-session-cash-bar-row">' +
          '<div class="hist-session-cash-bar-label">Esperado</div>' +
          '<div class="hist-session-cash-bar-track"><div class="hist-session-cash-bar-fill hist-session-bar-anim" style="width:' + expectedPct + '%;background:var(--text4)"></div></div>' +
          '<div class="hist-session-cash-bar-val">' + fmt(s.cashExpected) + '</div>' +
        '</div>' +
        '<div class="hist-session-cash-bar-row">' +
          '<div class="hist-session-cash-bar-label">Contado</div>' +
          '<div class="hist-session-cash-bar-track"><div class="hist-session-cash-bar-fill hist-session-bar-anim" style="width:' + countedPct + '%;background:' + diffColor + '"></div></div>' +
          '<div class="hist-session-cash-bar-val">' + fmt(s.cashCounted) + '</div>' +
        '</div>' +
        '<div class="hist-session-cash-diff" style="background:' + diffColor + '1a;color:' + diffColor + '">' +
          '<i data-lucide="' + (cashDiff===0?"check-circle":"alert-triangle") + '"></i>' +
          diffLabel + (cashDiff!==0 ? ': ' + (cashDiff>0?"+":"") + fmt(cashDiff) : '') +
        '</div>' +
      '</div>';
  }

  var salesListSection = "";
  if (isLocal && sessionSales.length) {
    var sortedSales = sessionSales.slice().sort(function(a,b){ return new Date(b.date) - new Date(a.date); });
    salesListSection =
      '<div class="hist-session-cash hist-session-fade" style="animation-delay:' + sectionDelay() + '">' +
        '<div class="hist-session-cash-title" style="color:var(--info)"><i data-lucide="receipt"></i>Vendas realizadas (' + sortedSales.length + ')</div>' +
        sortedSales.map(function(x) {
          var col = payColor(x.payMethod);
          var timeStr = fmtDate(x.date).split(",")[1] || fmtDate(x.date);
          return '<div class="hist-session-sale-row" onclick="window._openSaleDetail(' + x.id + ')">' +
            '<div class="hist-sale-avatar ' + payClass(x.payMethod) + '" style="width:32px;height:32px"><i data-lucide="' + payIcon(x.payMethod) + '" style="width:15px;height:15px"></i></div>' +
            '<div style="flex:1;min-width:0">' +
            '<div class="hist-session-sale-row-name">#' + String(x.id).padStart(4,"0") + (x.clientName ? ' · ' + x.clientName : '') + '</div>' +
            '<div class="hist-session-sale-row-meta">' + timeStr.trim() + '</div>' +
            '</div>' +
            '<div style="text-align:right;flex-shrink:0">' +
            '<div style="font-size:13px;font-weight:700;color:var(--text)">' + fmt(x.total) + '</div>' +
            '</div>' +
            '<i data-lucide="chevron-right" class="hist-timeline-arrow"></i>' +
            '</div>';
        }).join("") +
      '</div>';
  }

  var paymentSection = "";
  if (isLocal && sessionSales.length) {
    var byMethod = {};
    sessionSales.forEach(function(x) {
      var lbl = payLabel(x.payMethod);
      byMethod[lbl] = (byMethod[lbl] || 0) + ((x.total||0)-(x.totalDevolvido||0));
    });
    var methods = Object.keys(byMethod);
    var maxMethodV = Math.max.apply(null, methods.map(function(k){return byMethod[k];}).concat([1]));
    paymentSection =
      '<div class="hist-session-cash hist-session-fade" style="animation-delay:' + sectionDelay() + '">' +
        '<div class="hist-session-cash-title" style="color:var(--primary)"><i data-lucide="pie-chart"></i>Vendas por forma de pagamento</div>' +
        methods.map(function(lbl) {
          var pct = Math.min(100, (byMethod[lbl] / maxMethodV) * 100);
          var col = lbl === "Dinheiro" ? "var(--teal)" : lbl === "Multicaixa" ? "#4338ca" : lbl === "Crédito" ? "var(--warning)" : "var(--info)";
          return '<div class="hist-session-cash-bar-row">' +
            '<div class="hist-session-cash-bar-label">' + lbl + '</div>' +
            '<div class="hist-session-cash-bar-track"><div class="hist-session-cash-bar-fill hist-session-bar-anim" style="width:' + pct + '%;background:' + col + '"></div></div>' +
            '<div class="hist-session-cash-bar-val">' + fmt(byMethod[lbl]) + '</div>' +
          '</div>';
        }).join("") +
      '</div>';
  }

  var productsSection = "";
  if (isLocal && sessionSales.length) {
    var prodQty = {};
    sessionSales.forEach(function(x) {
      (x.items||[]).forEach(function(i) {
        if (!prodQty[i.name]) prodQty[i.name] = { qty: 0, total: 0 };
        prodQty[i.name].qty += i.qty;
        prodQty[i.name].total += i.price * i.qty;
      });
    });
    var topProdNames = Object.keys(prodQty).sort(function(a,b){ return prodQty[b].total - prodQty[a].total; }).slice(0, 5);
    if (topProdNames.length) {
      productsSection =
        '<div class="hist-session-cash hist-session-fade" style="animation-delay:' + sectionDelay() + '">' +
          '<div class="hist-session-cash-title" style="color:var(--success)"><i data-lucide="package"></i>Produtos mais vendidos</div>' +
          topProdNames.map(function(name) {
            return '<div class="hist-session-incident-row">' +
              '<span>' + name + ' <span style="color:var(--text4)">×' + prodQty[name].qty + '</span></span>' +
              '<strong style="color:var(--success)">' + fmt(prodQty[name].total) + '</strong>' +
            '</div>';
          }).join("") +
        '</div>';
    }
  }

  var fiadosSection = "";
  if (isLocal) {
    var allFiados = await db.getAll("fiado");
    var sessionFiados = allFiados.filter(function(f){ return f.sessionId === sessionId; });
    if (sessionFiados.length) {
      var totalFiado = sessionFiados.reduce(function(a,f){ return a+(f.amount||0); }, 0);
      fiadosSection =
        '<div class="hist-session-cash hist-session-fade" style="animation-delay:' + sectionDelay() + '">' +
          '<div class="hist-session-cash-title" style="color:var(--warning-muted)"><i data-lucide="hand-coins"></i>Crédito concedido (' + sessionFiados.length + ')</div>' +
          sessionFiados.map(function(f) {
            return '<div class="hist-session-incident-row">' +
              '<span>' + (f.clientName||"Cliente") + '</span>' +
              '<strong style="color:var(--warning-muted)">' + fmt(f.amount) + '</strong>' +
            '</div>';
          }).join("") +
          '<div class="hist-session-incident-row" style="border-top:1.5px solid rgba(0,0,0,.08);margin-top:4px;padding-top:8px">' +
            '<span style="font-weight:700">Total</span>' +
            '<strong style="color:var(--warning-muted)">' + fmt(totalFiado) + '</strong>' +
          '</div>' +
        '</div>';
    }
  }

  var stockMovSection = "";
  var allMoves = await db.getAll("stockMovements");
  var sessionMoves = allMoves.filter(function(m){ return m.sessionId === sessionId; });
  var adjustments = sessionMoves.filter(function(m){ return m.type === "adjustment"; });
  if (adjustments.length) {
    stockMovSection =
      '<div class="hist-session-cash hist-session-fade" style="animation-delay:' + sectionDelay() + '">' +
        '<div class="hist-session-cash-title" style="color:var(--primary-mid)"><i data-lucide="sliders-horizontal"></i>Ajustes de stock (' + adjustments.length + ')</div>' +
        adjustments.map(function(m) {
          var sign = m.qty > 0 ? "+" : "";
          return '<div class="hist-session-incident-row">' +
            '<span>' + (m.productName||"?") + '</span>' +
            '<strong style="color:var(--primary-mid)">' + sign + m.qty + '</strong>' +
          '</div>';
        }).join("") +
      '</div>';
  }

  var incidentsSection = sessionIncidents.length ?
    '<div class="hist-session-incidents hist-session-fade" style="animation-delay:' + sectionDelay() + '">' +
      '<div class="hist-session-cash-title"><i data-lucide="alert-triangle"></i>Incidentes reportados (' + sessionIncidents.length + ')</div>' +
      sessionIncidents.map(function(i) {
        return '<div class="hist-session-incident-row">' +
          '<span>' + (i.productName||"?") + '</span>' +
          '<strong style="color:var(--danger-muted)">' + (i.diff>0?"+":"") + i.diff + '</strong>' +
        '</div>';
      }).join("") +
    '</div>' : "";

  var importedNote = !isLocal ?
    '<div class="hist-session-imported-note"><i data-lucide="info"></i>Sessão importada de outro dispositivo — detalhes de fiados, produtos e ajustes não estão disponíveis localmente.</div>' : "";

  var hasAnySection = cashSection || paymentSection || productsSection || fiadosSection || stockMovSection || sessionIncidents.length;

  var body =
    '<div class="hist-session-summary hist-session-fade" style="animation-delay:0ms">' +
      '<div class="hist-session-stat"><div class="hist-session-stat-val">' + fmt(totalVendas) + '</div><div class="hist-session-stat-label">Total vendido</div></div>' +
      '<div class="hist-session-stat"><div class="hist-session-stat-val">' + nVendas + '</div><div class="hist-session-stat-label">Vendas</div></div>' +
      '<div class="hist-session-stat"><div class="hist-session-stat-val">' + durationLabel + '</div><div class="hist-session-stat-label">Duração</div></div>' +
    '</div>' +
    importedNote +
    cashSection +
    paymentSection +
    salesListSection +
    productsSection +
    fiadosSection +
    stockMovSection +
    incidentsSection +
    (!hasAnySection && isLocal ? '<div class="hist-empty" style="padding:20px"><div class="hist-empty-sub">Sem dados de conferência para este turno.</div></div>' : '');

  openModal(s.userName + " · " + fmtDate(s.openedAt).split(",")[0], body);
  refreshIcons(el("modal-box"));
};

window._openSaleDetail = async function(id) {
  var s     = await db.get("sales", id);
  if (!s) return;

  var hasDev   = s.temDevolucao && (s.totalDevolvido||0) > 0;
  var totalLiq = (s.total||0) - (s.totalDevolvido||0);
  var isAdmin  = getUser().role === "admin";
  var color    = payColor(s.payMethod);
  var nItems   = s.items ? s.items.length : 0;
  var idx      = 0;
  function fadeDelay() { return (idx++ * 50) + "ms"; }

  var headerHtml =
    '<div class="hist-detail-header hist-session-fade" style="animation-delay:' + fadeDelay() + '">' +
      '<div class="hist-sale-avatar ' + payClass(s.payMethod) + '" style="width:48px;height:48px"><i data-lucide="' + payIcon(s.payMethod) + '" style="width:22px;height:22px"></i></div>' +
      '<div>' +
        '<span class="hist-sale-tag" style="background:color-mix(in srgb, ' + color + ' 15%, white);color:' + color + '">' + payLabel(s.payMethod) + '</span>' +
        '<div class="hist-detail-header-date">' + fmtDate(s.date) + '</div>' +
      '</div>' +
    '</div>';

  var clientHtml = "";
  if (s.clientName) {
    var isFiado = (s.payMethod||"").toLowerCase().includes("fiado");
    clientHtml =
      '<div class="hist-sale-client' + (isFiado?' hist-sale-client--fiado':'') + '" style="margin-bottom:12px;cursor:' + (s.clientId?'pointer':'default') + '"' +
      (s.clientId ? ' onclick="window._closeModal();window._openClienteProfile(' + s.clientId + ')"' : '') + '>' +
      '<i data-lucide="user" style="width:12px;height:12px"></i>' + s.clientName +
      (s.clientPhone ? ' · ' + s.clientPhone : '') +
      (s.clientId ? ' <i data-lucide="chevron-right" style="width:11px;height:11px;margin-left:2px"></i>' : '') +
      '</div>';
  }

  var notesHtml = s.notes ?
    '<div class="hist-detail-notes hist-session-fade" style="animation-delay:' + fadeDelay() + '">' +
      '<div class="hist-detail-notes-title"><i data-lucide="sticky-note"></i>Observação</div>' +
      '<div class="hist-detail-notes-text">' + s.notes + '</div>' +
    '</div>' : "";

  openModal("Venda #" + String(s.id).padStart(4,"0"),
    '<div class="hist-detail-wrap">' +

    headerHtml +
    clientHtml +

    '<div class="hist-detail-info hist-session-fade" style="animation-delay:' + fadeDelay() + '">' +
    detailRow("Subtotal",   fmt(s.subtotal||s.total)) +
    (s.discount>0  ? detailRow("Desconto", "- "+fmt(s.discount)) : "") +
    detailRow("Total",      fmt(s.total), true) +
    (hasDev ? detailRow("Líquido", fmt(totalLiq), true, "var(--warning-muted)") : "") +
    '</div>' +

    '<div class="hist-section-label">Itens (' + nItems + ')</div>' +
    '<div class="hist-detail-info hist-session-fade" style="animation-delay:' + fadeDelay() + '">' +
    (s.items||[]).map(function(i) {
      return detailRow(i.name + " x" + i.qty, fmt(i.price*i.qty));
    }).join("") +
    '</div>' +

    notesHtml +

    (hasDev ?
      '<div class="hist-dev-box hist-session-fade" style="animation-delay:' + fadeDelay() + '">' +
      '<div class="hist-dev-title">↩ Devoluções registadas</div>' +
      (s.devolucoes||[]).map(function(d) {
        var destinoLabel = d.destino === "danificado" ? " · <span style=\"color:var(--danger)\">Danificado</span>" : "";
        var motivoLine = d.motivo ? '<div class="hist-dev-motivo" style="font-size:11.5px;color:var(--text3);margin-top:2px">' + d.motivo + '</div>' : "";
        return '<div class="hist-dev-row">' +
          '<div>' + fmtDate(d.date) + ' · ' + d.itens.join(", ") +
          ' · <strong style="color:var(--warning-muted)">-' + fmt(d.total) + '</strong>' + destinoLabel + '</div>' +
          motivoLine +
        '</div>';
      }).join("") +
      '</div>' : "") +

    '<div class="hist-detail-actions">' +
    '<button class="btn btn-primary btn-full" onclick="window._openPrintMenu(' + s.id + ')">' +
    '<i data-lucide="printer"></i> Imprimir</button>' +
    '<button class="btn btn-outline btn-full" onclick="window._gerarReciboPDF(' + s.id + ')">' +
    '<i data-lucide="file-text"></i> Gerar PDF</button>' +
    '<button class="btn btn-outline btn-full hist-btn-whatsapp" onclick="window._partilharReciboPDF(' + s.id + ')">' +
    '<i data-lucide="share-2"></i> Partilhar</button>' +
    (isAdmin ? '<button class="btn btn-outline btn-full hist-btn-dev" onclick="window._abrirDevolucao(' + s.id + ')">' +
    '<i data-lucide="rotate-ccw"></i> Registar Devolução</button>' : "") +
    '</div>' +

    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>' +
    '</div></div>'
  );

  refreshIcons(el("modal-box"));
};

window._openPrintMenu = function(saleId) {
  var formats = [
    { id:"58mm", label:"Talão 58mm", desc:"Impressora térmica pequena", icon:"receipt" },
    { id:"80mm", label:"Talão 80mm", desc:"Impressora térmica padrão",  icon:"receipt" },
    { id:"a5",   label:"Factura A5", desc:"Meia página, formato compacto", icon:"file-text" },
    { id:"a4",   label:"Factura A4", desc:"Página inteira, formato completo", icon:"file-text" },
  ];
  var body =
    '<div class="hist-export-options">' +
    formats.map(function(f, i) {
      return '<button class="hist-export-option" style="animation-delay:' + (i*50) + 'ms" onclick="window._printFromMenu(' + saleId + ',\'' + f.id + '\')">' +
        '<div class="hist-export-icon hist-export-icon--csv"><i data-lucide="' + f.icon + '"></i></div>' +
        '<div class="hist-export-info">' +
          '<div class="hist-export-title">' + f.label + '</div>' +
          '<div class="hist-export-desc">' + f.desc + '</div>' +
        '</div>' +
        '<i data-lucide="chevron-right" class="hist-export-arrow"></i>' +
      '</button>';
    }).join("") +
    '</div>';
  openModal("Formato de impressão", body);
};

window._printFromMenu = async function(saleId, format) {
  closeModal();
  await window._printSale(saleId, format);
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
  await printRecibo(s, store, format);
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
