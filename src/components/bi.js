import { db } from "../db.js";
import { fmt, refreshIcons } from "../utils.js";
import { _statCard } from "./produtos.js";

// ═══════════════════════════════════════════
// CÁLCULOS (puros, sem DOM — reutilizáveis em PDF, API, etc.)
// ═══════════════════════════════════════════

/**
 * Agrupa vendas dos últimos N dias por data.
 * Retorna { days: ["2026-06-21", ...], values: [12500, ...] }
 */
export function computeSalesTrend(sales, numDays) {
  numDays = numDays || 30;
  var days = [];
  var today = new Date();
  for (var i = numDays - 1; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  var byDay = {};
  days.forEach(function(d) { byDay[d] = 0; });

  sales.forEach(function(s) {
    var day = (s.date || "").slice(0, 10);
    if (byDay.hasOwnProperty(day)) {
      byDay[day] += (s.total || 0) - (s.totalDevolvido || 0);
    }
  });

  var values = days.map(function(d) { return byDay[d]; });
  return { days: days, values: values };
}

/**
 * Compara mês atual vs. mês anterior: vendas, lucro bruto, despesas.
 * products é necessário para calcular COGS (custo dos produtos vendidos).
 */
export function computeMonthlyComparison(sales, expenses, products) {
  var now = new Date();
  var mesAtual = now.toISOString().slice(0, 7);
  var mesAnteriorDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var mesAnterior = mesAnteriorDate.toISOString().slice(0, 7);

  function computeForMonth(mes) {
    var vendasMes = sales.filter(function(s) { return (s.date || "").startsWith(mes); });
    var totalVendas = vendasMes.reduce(function(a, s) {
      return a + ((s.total || 0) - (s.totalDevolvido || 0));
    }, 0);

    var cogs = vendasMes.reduce(function(a, s) {
      var custoVenda = (s.items || []).reduce(function(b, i) {
        var p = products.find(function(pr) { return pr.id === i.id; });
        return b + (p ? (p.costPrice || 0) * i.qty : 0);
      }, 0);
      var propDev = s.total > 0 ? (s.totalDevolvido || 0) / s.total : 0;
      return a + custoVenda * (1 - propDev);
    }, 0);

    var despesasMes = expenses
      .filter(function(e) { return (e.date || "").startsWith(mes) && e.countsInAccounting !== false && !e.archived; })
      .reduce(function(a, e) { return a + (e.amount || 0); }, 0);

    var lucro = totalVendas - cogs - despesasMes;

    var ticketMedio = vendasMes.length > 0 ? totalVendas / vendasMes.length : 0;

    return {
      vendas: totalVendas,
      cogs: cogs,
      despesas: despesasMes,
      lucro: lucro,
      numVendas: vendasMes.length,
      ticketMedio: ticketMedio,
    };
  }

  var atual = computeForMonth(mesAtual);
  var anterior = computeForMonth(mesAnterior);

  function pctChange(nowVal, prevVal) {
    if (prevVal === 0) return nowVal > 0 ? 100 : 0;
    return Math.round(((nowVal - prevVal) / Math.abs(prevVal)) * 100);
  }

  return {
    atual: atual,
    anterior: anterior,
    variacao: {
      vendas: pctChange(atual.vendas, anterior.vendas),
      lucro: pctChange(atual.lucro, anterior.lucro),
      despesas: pctChange(atual.despesas, anterior.despesas),
      ticketMedio: pctChange(atual.ticketMedio, anterior.ticketMedio),
    },
    mesAtualLabel: now.toLocaleDateString("pt-AO", { month: "long", year: "numeric" }),
    mesAnteriorLabel: mesAnteriorDate.toLocaleDateString("pt-AO", { month: "long", year: "numeric" }),
  };
}

/**
 * Ranking dos produtos mais vendidos num período (por omissão, mês atual).
 * Retorna array ordenado por receita: [{ id, name, qty, receita }, ...]
 */
export function computeTopProducts(sales, mes, limit) {
  mes = mes || new Date().toISOString().slice(0, 7);
  limit = limit || 5;

  var vendasMes = sales.filter(function(s) { return (s.date || "").startsWith(mes); });

  var byProduct = {};
  vendasMes.forEach(function(s) {
    var propDev = s.total > 0 ? (s.totalDevolvido || 0) / s.total : 0;
    (s.items || []).forEach(function(item) {
      if (!byProduct[item.id]) {
        byProduct[item.id] = { id: item.id, name: item.name, qty: 0, receita: 0 };
      }
      var qtyEfetiva = item.qty * (1 - propDev);
      byProduct[item.id].qty += qtyEfetiva;
      byProduct[item.id].receita += item.price * qtyEfetiva;
    });
  });

  var list = Object.values(byProduct);
  list.sort(function(a, b) { return b.receita - a.receita; });
  return list.slice(0, limit);
}

/**
 * Margem de lucro (%) por dia, últimos N dias.
 * margem = (receita - cogs) / receita * 100
 */
export function computeProfitTrend(sales, products, numDays) {
  numDays = numDays || 30;
  var days = [];
  var today = new Date();
  for (var i = numDays - 1; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  var byDay = {};
  days.forEach(function(d) { byDay[d] = { receita: 0, cogs: 0 }; });

  sales.forEach(function(s) {
    var day = (s.date || "").slice(0, 10);
    if (!byDay.hasOwnProperty(day)) return;

    var propDev = s.total > 0 ? (s.totalDevolvido || 0) / s.total : 0;
    var receitaLiq = (s.total || 0) - (s.totalDevolvido || 0);
    var custoVenda = (s.items || []).reduce(function(b, it) {
      var p = products.find(function(pr) { return pr.id === it.id; });
      return b + (p ? (p.costPrice || 0) * it.qty : 0);
    }, 0) * (1 - propDev);

    byDay[day].receita += receitaLiq;
    byDay[day].cogs += custoVenda;
  });

  var values = days.map(function(d) {
    var r = byDay[d].receita;
    var c = byDay[d].cogs;
    if (r <= 0) return 0;
    return Math.round(((r - c) / r) * 1000) / 10; // 1 casa decimal
  });

  return { days: days, values: values };
}

/**
 * Agrega vendas por dia da semana (0=Dom..6=Sáb) x faixa horária (blocos de 3h).
 * Retorna matriz [dia][faixa] = número de vendas, mais os totais em Kz.
 */
export function computePeakHours(sales, numDays) {
  numDays = numDays || 90;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - numDays);

  var FAIXAS = [
    { label: "00-06", start: 0,  end: 6  },
    { label: "06-09", start: 6,  end: 9  },
    { label: "09-12", start: 9,  end: 12 },
    { label: "12-15", start: 12, end: 15 },
    { label: "15-18", start: 15, end: 18 },
    { label: "18-21", start: 18, end: 21 },
    { label: "21-24", start: 21, end: 24 },
  ];
  var DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  var matrix = DIAS.map(function() { return FAIXAS.map(function() { return 0; }); });

  sales.forEach(function(s) {
    if (!s.date) return;
    var d = new Date(s.date);
    if (isNaN(d.getTime()) || d < cutoff) return;

    var dow = d.getDay();
    var hour = d.getHours();
    var faixaIdx = FAIXAS.findIndex(function(f) { return hour >= f.start && hour < f.end; });
    if (faixaIdx === -1) faixaIdx = FAIXAS.length - 1;

    matrix[dow][faixaIdx] += 1;
  });

  var max = 0;
  matrix.forEach(function(row) { row.forEach(function(v) { if (v > max) max = v; }); });

  return { dias: DIAS, faixas: FAIXAS.map(function(f) { return f.label; }), matrix: matrix, max: max };
}

/**
 * Breakdown de vendas do mês por método de pagamento.
 * Retorna [{ method, label, icon, total, pct }, ...] ordenado por total desc.
 */
export function computePaymentMethods(sales, mes) {
  mes = mes || new Date().toISOString().slice(0, 7);
  var vendasMes = sales.filter(function(s) { return (s.date || "").startsWith(mes); });

  var META = {
    dinheiro:      { label: "Dinheiro",      icon: "banknote" },
    transferencia: { label: "Transferência", icon: "arrow-left-right" },
    multicaixa:    { label: "Multicaixa",    icon: "credit-card" },
    fiado:         { label: "Crédito",       icon: "hand-coins" },
  };

  var totals = { dinheiro: 0, transferencia: 0, multicaixa: 0, fiado: 0 };
  vendasMes.forEach(function(s) {
    var method = s.payMethod || "dinheiro";
    if (!totals.hasOwnProperty(method)) totals[method] = 0;
    totals[method] += (s.total || 0) - (s.totalDevolvido || 0);
  });

  var grandTotal = Object.values(totals).reduce(function(a, v) { return a + v; }, 0);

  var list = Object.keys(totals).map(function(method) {
    var meta = META[method] || { label: method, icon: "circle" };
    return {
      method: method,
      label: meta.label,
      icon: meta.icon,
      total: totals[method],
      pct: grandTotal > 0 ? Math.round((totals[method] / grandTotal) * 100) : 0,
    };
  });

  list.sort(function(a, b) { return b.total - a.total; });
  return list;
}

/**
 * Previsão de vendas para os próximos numForecastDays, por regressão linear simples
 * sobre os últimos `values` (mesmo período usado na tendência).
 * Retorna { days: [...], values: [...] } só com os dias futuros (não repete o histórico).
 * Se houver menos de 5 pontos de dados, ou todos forem 0, devolve forecast vazio (dados insuficientes).
 */
export function computeSalesForecast(historyDays, historyValues, numForecastDays) {
  numForecastDays = numForecastDays || 7;

  var n = historyValues.length;
  var nonZeroCount = historyValues.filter(function(v) { return v > 0; }).length;
  if (n < 5 || nonZeroCount < 3) {
    return { days: [], values: [], reliable: false };
  }

  // Regressão linear (mínimos quadrados): y = a + b*x, x = índice do dia (0..n-1)
  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (var i = 0; i < n; i++) {
    sumX += i;
    sumY += historyValues[i];
    sumXY += i * historyValues[i];
    sumX2 += i * i;
  }
  var b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  var a = (sumY - b * sumX) / n;

  var lastDate = new Date(historyDays[historyDays.length - 1] + "T00:00:00");
  var days = [];
  var values = [];
  for (var f = 1; f <= numForecastDays; f++) {
    var d = new Date(lastDate);
    d.setDate(d.getDate() + f);
    days.push(d.toISOString().slice(0, 10));

    var predicted = a + b * (n - 1 + f);
    values.push(Math.max(0, Math.round(predicted)));
  }

  return { days: days, values: values, reliable: true, trend: b > 0 ? "subida" : (b < 0 ? "descida" : "estável") };
}

// ═══════════════════════════════════════════
// UI
// ═══════════════════════════════════════════

var biChartInstance = null;


var biProfitChartInstance = null;

function _renderProfitChart(days, values) {
  var canvas = document.getElementById("bi-profit-canvas");
  if (!canvas || typeof Chart === "undefined") return;

  var labels = days.map(function(d) { return d.slice(5).split("-").reverse().join("/"); });

  if (biProfitChartInstance) { biProfitChartInstance.destroy(); biProfitChartInstance = null; }

  var ctx = canvas.getContext("2d");
  var gradient = ctx.createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, "rgba(22,163,74,0.25)");
  gradient.addColorStop(1, "rgba(22,163,74,0)");

  biProfitChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        borderColor: "#16a34a",
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointBackgroundColor: "#16a34a",
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function(ctx3) { return ctx3.parsed.y + "% margem"; } } }
      },
      scales: {
        y: { ticks: { display: false }, grid: { display: false } },
        x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

function _pctLabel(pct) {
  var sign = pct >= 0 ? "+" : "";
  return sign + pct + "% vs. mês anterior";
}

function _comparisonStatsGrid(comparison) {
  var vendasSubindo = comparison.variacao.vendas >= 0;
  var lucroSubindo = comparison.variacao.lucro >= 0;
  var despesasSubindo = comparison.variacao.despesas >= 0;
  var ticketSubindo = comparison.variacao.ticketMedio >= 0;

  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0 28px">' +
    _statCard({ label:"Vendas", value:fmt(comparison.atual.vendas), sub:_pctLabel(comparison.variacao.vendas), color: vendasSubindo ? "var(--success)" : "var(--danger)", icon:"shopping-bag" }) +
    _statCard({ label:"Lucro bruto", value:fmt(comparison.atual.lucro), sub:_pctLabel(comparison.variacao.lucro), color: lucroSubindo ? "var(--success)" : "var(--danger)", icon:"trending-up" }) +
    _statCard({ label:"Despesas", value:fmt(comparison.atual.despesas), sub:_pctLabel(comparison.variacao.despesas), color: despesasSubindo ? "var(--danger)" : "var(--success)", icon:"receipt" }) +
    _statCard({ label:"Ticket médio", value:fmt(comparison.atual.ticketMedio), sub:_pctLabel(comparison.variacao.ticketMedio), color: ticketSubindo ? "var(--success)" : "var(--danger)", icon:"shopping-cart" }) +
  '</div>';
}

var _biData = null; // { sales, products, expenses } — cache para trocar de período sem re-consultar a BD
var _biPeriod = 30;  // 7 | 30 | 90

var PERIOD_OPTIONS = [
  { value: 7,  label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
];

function _periodSelectorHtml() {
  return '<div style="display:flex;background:var(--primary-light, #ede9fe);border-radius:var(--radius-xl);padding:3px;gap:2px;margin-bottom:20px">' +
    PERIOD_OPTIONS.map(function(o) {
      var active = _biPeriod === o.value;
      return '<button onclick="window._biSetPeriod(' + o.value + ')" style="flex:1;padding:8px 10px;border-radius:calc(var(--radius-xl) - 3px);border:none;background:' + (active ? "#fff" : "transparent") + ';color:' + (active ? "var(--primary)" : "var(--text3)") + ';font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:' + (active ? "var(--shadow-sm)" : "none") + ';transition:all .15s ease">' + o.label + '</button>';
    }).join("") +
  '</div>';
}

window._biSetPeriod = function(days) {
  _biPeriod = days;
  _biRender();
};

export async function loadBI() {
  var wrap = document.getElementById("dash-content");
  if (!wrap) return;

  wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">A carregar análise…</div>';

  var results = await Promise.all([
    db.getAll("sales"), db.getAll("products"), db.getAll("expenses"),
  ]);
  _biData = { sales: results[0], products: results[1], expenses: results[2] };

  _biRender();
}

function _biRender() {
  var wrap = document.getElementById("dash-content");
  if (!wrap || !_biData) return;

  var sales = _biData.sales, products = _biData.products, expenses = _biData.expenses;
  var days = _biPeriod;

  var trend = computeSalesTrend(sales, days);
  var forecast = computeSalesForecast(trend.days, trend.values, 7);
  var comparison = computeMonthlyComparison(sales, expenses, products);
  var topProducts = computeTopProducts(sales);
  var profitTrend = computeProfitTrend(sales, products, days);
  var peakHours = computePeakHours(sales, days);
  var paymentMethods = computePaymentMethods(sales);

  wrap.innerHTML =
    _periodSelectorHtml() +

    '<div style="margin-bottom:14px">' +
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:2px">Tendência de vendas</div>' +
      '<div style="font-size:12px;color:var(--text3)">Últimos ' + days + ' dias</div>' +
    '</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px 12px 8px;margin-bottom:8px;height:220px"><canvas id="bi-trend-canvas"></canvas></div>' +
    _forecastNoteHtml(forecast) +

    '<div style="font-size:15px;font-weight:800;color:var(--text)">' + comparison.mesAtualLabel.charAt(0).toUpperCase() + comparison.mesAtualLabel.slice(1) + ' vs. ' + comparison.mesAnteriorLabel + '</div>' +
    _comparisonStatsGrid(comparison) +

    '<div style="font-size:15px;font-weight:800;color:var(--text);margin:24px 0 12px">Produtos mais vendidos</div>' +
    '<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Este mês, por receita</div>' +
    _topProductsHtml(topProducts) +

    '<div style="font-size:15px;font-weight:800;color:var(--text);margin:8px 0 2px">Margem de lucro</div>' +
    '<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Últimos ' + days + ' dias, % sobre receita</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px 12px 8px;margin-bottom:28px;height:200px"><canvas id="bi-profit-canvas"></canvas></div>' +

    '<div style="font-size:15px;font-weight:800;color:var(--text);margin:0 0 2px">Horários de pico</div>' +
    '<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Últimos ' + days + ' dias, por número de vendas</div>' +
    _peakHoursHtml(peakHours) +

    '<div style="font-size:15px;font-weight:800;color:var(--text);margin:0 0 2px">Métodos de pagamento</div>' +
    '<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Este mês, por valor recebido</div>' +
    _paymentMethodsHtml(paymentMethods);

  refreshIcons(wrap);
  _renderTrendChart(trend.days, trend.values, forecast);
  _renderProfitChart(profitTrend.days, profitTrend.values);
}

function _paymentMethodsHtml(methods) {
  var total = methods.reduce(function(a, m) { return a + m.total; }, 0);
  if (total === 0) {
    return '<div class="empty-state"><div class="empty-state-title">Sem vendas este mês</div></div>';
  }

  return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px">' +
    methods.map(function(m, i) {
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:' + (i < methods.length - 1 ? '14px' : '0') + '">' +
        '<div style="width:32px;height:32px;background:var(--primary-light, #ede9fe);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<i data-lucide="' + m.icon + '" style="width:15px;height:15px;color:var(--primary, #5b21b6)"></i>' +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">' +
            '<span style="font-size:13px;font-weight:700;color:var(--text)">' + m.label + '</span>' +
            '<span style="font-size:12px;font-weight:700;color:var(--text2)">' + fmt(m.total) + '</span>' +
          '</div>' +
          '<div style="height:6px;background:#f4f4f5;border-radius:3px;overflow:hidden">' +
            '<div style="height:100%;width:' + m.pct + '%;background:var(--primary, #5b21b6);border-radius:3px"></div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--text3);width:34px;text-align:right;flex-shrink:0">' + m.pct + '%</div>' +
      '</div>';
    }).join("") +
  '</div>';
}

function _peakHoursHtml(peak) {
  if (peak.max === 0) {
    return '<div class="empty-state"><div class="empty-state-title">Sem dados suficientes</div></div>';
  }

  function cellColor(v) {
    if (v === 0) return "#f4f4f5";
    var intensity = v / peak.max;
    var alpha = 0.15 + intensity * 0.75;
    return "rgba(91,33,182," + alpha.toFixed(2) + ")";
  }
  function textColor(v) {
    var intensity = peak.max ? v / peak.max : 0;
    return intensity > 0.55 ? "#fff" : "var(--text3)";
  }

  var headerRow = '<div style="display:grid;grid-template-columns:34px repeat(' + peak.faixas.length + ',1fr);gap:3px;margin-bottom:3px">' +
    '<div></div>' +
    peak.faixas.map(function(f) {
      return '<div style="font-size:8.5px;color:var(--text4);text-align:center;writing-mode:vertical-rl;transform:rotate(180deg);padding:2px 0">' + f + '</div>';
    }).join("") +
    '</div>';

  var rows = peak.dias.map(function(dia, dIdx) {
    return '<div style="display:grid;grid-template-columns:34px repeat(' + peak.faixas.length + ',1fr);gap:3px;margin-bottom:3px">' +
      '<div style="font-size:10.5px;font-weight:700;color:var(--text3);display:flex;align-items:center">' + dia + '</div>' +
      peak.matrix[dIdx].map(function(v) {
        return '<div style="aspect-ratio:1;border-radius:4px;background:' + cellColor(v) + ';display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:' + textColor(v) + '">' + (v > 0 ? v : "") + '</div>';
      }).join("") +
      '</div>';
  }).join("");

  return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 12px;margin-bottom:24px">' +
    headerRow + rows +
  '</div>';
}

function _topProductsHtml(topProducts) {
  if (!topProducts.length) {
    return '<div class="empty-state"><div class="empty-state-title">Sem vendas este mês</div></div>';
  }
  var maxReceita = topProducts[0].receita || 1;
  return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px">' +
    topProducts.map(function(p, i) {
      var pct = Math.round((p.receita / maxReceita) * 100);
      return '<div style="margin-bottom:' + (i < topProducts.length - 1 ? '14px' : '0') + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">' +
          '<span style="font-size:13px;font-weight:700;color:var(--text)">' + (i + 1) + '. ' + p.name + '</span>' +
          '<span style="font-size:12px;font-weight:700;color:var(--text2)">' + fmt(p.receita) + '</span>' +
        '</div>' +
        '<div style="height:6px;background:var(--primary-light, #ede9fe);border-radius:3px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:var(--primary, #5b21b6);border-radius:3px"></div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text4);margin-top:3px">' + Math.round(p.qty) + ' unidade' + (Math.round(p.qty) !== 1 ? 's' : '') + ' vendida' + (Math.round(p.qty) !== 1 ? 's' : '') + '</div>' +
      '</div>';
    }).join("") +
  '</div>';
}

function _forecastNoteHtml(forecast) {
  if (!forecast || !forecast.reliable) {
    return '<div style="font-size:11px;color:var(--text4);margin-bottom:20px">Previsão indisponível — histórico de vendas ainda insuficiente.</div>';
  }
  var icon = forecast.trend === "subida" ? "trending-up" : (forecast.trend === "descida" ? "trending-down" : "minus");
  var color = forecast.trend === "subida" ? "var(--success, #16a34a)" : (forecast.trend === "descida" ? "var(--danger, #dc2626)" : "var(--text3)");
  var label = forecast.trend === "subida" ? "tendência de subida" : (forecast.trend === "descida" ? "tendência de descida" : "tendência estável");
  return '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);margin-bottom:20px">' +
    '<span style="width:14px;height:2px;background:#f59e0b;border-radius:1px;display:inline-block;background-image:linear-gradient(to right, #f59e0b 50%, transparent 50%);background-size:5px 2px"></span>' +
    'Previsão para os próximos 7 dias — ' +
    '<i data-lucide="' + icon + '" style="width:12px;height:12px;color:' + color + '"></i> ' + label +
  '</div>';
}

function _renderTrendChart(days, values, forecast) {
  var canvas = document.getElementById("bi-trend-canvas");
  if (!canvas || typeof Chart === "undefined") return;

  var hasForecast = forecast && forecast.reliable && forecast.values.length > 0;

  var allDays = hasForecast ? days.concat(forecast.days) : days;
  var labels = allDays.map(function(d) { return d.slice(5).split("-").reverse().join("/"); });

  var historicalData = values.concat(hasForecast ? forecast.values.map(function() { return null; }) : []);
  var forecastData = hasForecast
    ? values.map(function() { return null; }).slice(0, -1).concat([values[values.length - 1]]).concat(forecast.values)
    : [];

  var allValuesForMax = values.concat(hasForecast ? forecast.values : []);
  var maxV = Math.max.apply(null, allValuesForMax.concat([1]));
  var suggestedMax = maxV * 1.2;

  if (biChartInstance) { biChartInstance.destroy(); biChartInstance = null; }

  var ctx = canvas.getContext("2d");
  var gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, "rgba(124,58,237,0.28)");
  gradient.addColorStop(1, "rgba(124,58,237,0)");

  var datasets = [{
    label: "Histórico",
    data: historicalData,
    borderColor: "#5b21b6",
    backgroundColor: gradient,
    borderWidth: 2.5,
    pointBackgroundColor: "#7c3aed",
    pointBorderColor: "#fff",
    pointBorderWidth: 1.5,
    pointRadius: 2,
    pointHoverRadius: 5,
    tension: 0.3,
    fill: true,
    spanGaps: false,
  }];

  if (hasForecast) {
    datasets.push({
      label: "Previsão",
      data: forecastData,
      borderColor: "#f59e0b",
      backgroundColor: "transparent",
      borderWidth: 2,
      borderDash: [5, 4],
      pointBackgroundColor: "#a78bfa",
      pointBorderColor: "#fff",
      pointBorderWidth: 1.5,
      pointRadius: 2,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: false,
      spanGaps: true,
    });
  }

  biChartInstance = new Chart(ctx, {
    type: "line",
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx3) {
              var prefix = ctx3.datasetIndex === 1 ? "Previsão: " : "";
              return prefix + fmt(ctx3.parsed.y);
            }
          }
        }
      },
      scales: {
        y: { suggestedMax: suggestedMax, ticks: { display: false }, grid: { display: false } },
        x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}
