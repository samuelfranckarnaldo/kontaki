import { db } from "../db.js";
import { fmt, refreshIcons } from "../utils.js";
import { _statCard } from "./produtos.js";

var CONSOLE_API = "https://kontaki-console.vercel.app/api";

var _mlActiveTab = "resumo";
var _mlSelectedStoreId = null;
var _mlChartInstance = null;

var TABS = [
  { key: "resumo",     label: "Resumo" },
  { key: "lojas",      label: "Lojas" },
  { key: "incidentes", label: "Incidentes" },
  { key: "escritorio", label: "Escritório" },
  { key: "registros",  label: "Registos" },
];

async function _getLicenseCode() {
  var lic = await db.get("settings", "license");
  return lic ? lic.code : null;
}

function _renderTabs() {
  var wrap = document.getElementById("multilojas-tabs");
  if (!wrap) return;
  wrap.innerHTML = TABS.map(function(t) {
    var active = _mlActiveTab === t.key;
    return '<button onclick="window._mlSwitchTab(\'' + t.key + '\')" style="flex:1;padding:9px 4px;border:none;border-radius:8px;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;background:' + (active ? "#fff" : "transparent") + ';color:' + (active ? "#5b21b6" : "#71717a") + ';box-shadow:' + (active ? "0 1px 3px rgba(0,0,0,.08)" : "none") + '">' + t.label + '</button>';
  }).join("");
}

window._mlSwitchTab = function(tab) {
  _mlActiveTab = tab;
  _mlSelectedStoreId = null;
  _renderTabs();
  _renderContent();
};

window._mlOpenStore = function(storeId) {
  _mlSelectedStoreId = storeId;
  _renderContent();
};

window._mlBackToStoreList = function() {
  _mlSelectedStoreId = null;
  _renderContent();
};

function _errorHtml(message) {
  return '<div class="empty-state">' +
    '<i data-lucide="wifi-off"></i>' +
    '<div class="empty-state-title">Não foi possível carregar</div>' +
    '<div class="empty-state-sub">' + message + '</div>' +
    '<button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="window._mlSwitchTab(\'' + _mlActiveTab + '\')">Tentar novamente</button>' +
  '</div>';
}

function _comingSoonHtml(label) {
  return '<div class="empty-state">' +
    '<i data-lucide="clock"></i>' +
    '<div class="empty-state-title">Em breve</div>' +
    '<div class="empty-state-sub">' + label + ' fica disponível quando os dados relevantes forem sincronizados com o Console.</div>' +
  '</div>';
}

export async function loadMultilojas() {
  var btn = document.getElementById("btn-back-multilojas");
  if (btn) btn.onclick = function() { window._showSubpage(null); };
  _mlActiveTab = "resumo";
  _mlSelectedStoreId = null;
  _renderTabs();
  await _renderContent();
}

async function _renderContent() {
  var wrap = document.getElementById("multilojas-content");
  if (!wrap) return;

  if (_mlActiveTab === "resumo") return _renderResumo(wrap);
  if (_mlActiveTab === "lojas") {
    return _mlSelectedStoreId ? _renderStoreDetail(wrap, _mlSelectedStoreId) : _renderStoreList(wrap);
  }
  if (_mlActiveTab === "incidentes") { wrap.innerHTML = _comingSoonHtml("A análise de incidentes entre lojas"); refreshIcons(wrap); return; }
  if (_mlActiveTab === "escritorio") { wrap.innerHTML = _comingSoonHtml("A geração de catálogo para envio à loja"); refreshIcons(wrap); return; }
  if (_mlActiveTab === "registros")  { wrap.innerHTML = _comingSoonHtml("O registo de auditoria por funcionário"); refreshIcons(wrap); return; }
}

// ── RESUMO ───────────────────────────────────────────────────────────────

async function _renderResumo(wrap) {
  wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">A carregar…</div>';

  var code = await _getLicenseCode();
  if (!code) { wrap.innerHTML = _errorHtml("Licença não encontrada."); return; }

  var res;
  try {
    res = await fetch(CONSOLE_API + "/reports/multi-store/summary?code=" + encodeURIComponent(code) + "&days=30");
  } catch (e) {
    wrap.innerHTML = _errorHtml("Sem ligação à internet. Verifica a rede e tenta novamente.");
    return;
  }

  if (!res.ok) {
    var errData = await res.json().catch(function() { return {}; });
    wrap.innerHTML = _errorHtml(errData.error || "Erro ao carregar o resumo.");
    return;
  }

  var data = await res.json();
  if (!data || !data.success) { wrap.innerHTML = _errorHtml("Resposta inválida do servidor."); return; }

  var multiStore = data.storeCount > 1;

  wrap.innerHTML =
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:2px">Vendas agregadas</div>' +
      '<div style="font-size:12px;color:var(--text3)">' + data.storeCount + ' loja' + (data.storeCount !== 1 ? 's' : '') + ' · últimos 30 dias</div>' +
    '</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:16px 12px 8px;margin-bottom:20px;height:200px"><canvas id="ml-trend-canvas"></canvas></div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">' +
      _statCard({ label: "Total geral", value: fmt(data.grandTotal), sub: "últimos 30 dias", color: "var(--text)", icon: "banknote" }) +
      _statCard({ label: "Lojas ativas", value: data.storeCount, sub: "na empresa", color: "var(--text)", icon: "store" }) +
    '</div>' +

    (multiStore ? (
      '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:12px">Ranking de lojas</div>' +
      '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px">' +
        data.ranking.map(function(r, i) {
          var maxTotal = data.ranking[0].total || 1;
          var pct = Math.round((r.total / maxTotal) * 100);
          return '<div style="margin-bottom:' + (i < data.ranking.length - 1 ? '14px' : '0') + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">' +
              '<span style="font-size:13px;font-weight:700;color:var(--text)">' + (i + 1) + '. ' + r.name + '</span>' +
              '<span style="font-size:12px;font-weight:700;color:var(--text2)">' + fmt(r.total) + '</span>' +
            '</div>' +
            '<div style="height:6px;background:#f4f4f5;border-radius:3px;overflow:hidden">' +
              '<div style="height:100%;width:' + pct + '%;background:var(--primary,#5b21b6);border-radius:3px"></div>' +
            '</div>' +
          '</div>';
        }).join("") +
      '</div>'
    ) : (
      '<div style="font-size:12px;color:var(--text4);text-align:center;padding:12px">A tua licença está associada a uma única loja. O ranking aparece quando a empresa tiver mais do que uma.</div>'
    ));

  refreshIcons(wrap);
  _renderTrendChart(data.trend.days, data.trend.values);
}

function _renderTrendChart(days, values) {
  var canvas = document.getElementById("ml-trend-canvas");
  if (!canvas || typeof Chart === "undefined") return;

  var labels = days.map(function(d) { return d.slice(5).split("-").reverse().join("/"); });
  var maxV = Math.max.apply(null, values.concat([1]));

  if (_mlChartInstance) { _mlChartInstance.destroy(); _mlChartInstance = null; }

  var ctx = canvas.getContext("2d");
  var gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, "rgba(91,33,182,0.25)");
  gradient.addColorStop(1, "rgba(91,33,182,0)");

  _mlChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        borderColor: "#5b21b6",
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: "#7c3aed",
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function(c) { return fmt(c.parsed.y); } } }
      },
      scales: {
        y: { suggestedMax: maxV * 1.2, ticks: { display: false }, grid: { display: false } },
        x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

// ── LOJAS ────────────────────────────────────────────────────────────────

async function _renderStoreList(wrap) {
  wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">A carregar…</div>';

  var code = await _getLicenseCode();
  if (!code) { wrap.innerHTML = _errorHtml("Licença não encontrada."); return; }

  var res;
  try {
    res = await fetch(CONSOLE_API + "/reports/multi-store/stores?code=" + encodeURIComponent(code));
  } catch (e) {
    wrap.innerHTML = _errorHtml("Sem ligação à internet. Verifica a rede e tenta novamente.");
    return;
  }

  if (!res.ok) {
    var errData = await res.json().catch(function() { return {}; });
    wrap.innerHTML = _errorHtml(errData.error || "Erro ao carregar as lojas.");
    return;
  }

  var data = await res.json();
  if (!data || !data.success) { wrap.innerHTML = _errorHtml("Resposta inválida do servidor."); return; }

  if (!data.stores.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-state-title">Nenhuma loja encontrada</div></div>';
    return;
  }

  wrap.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px">' +
    data.stores.map(function(s) {
      var statusColor = s.status === "active" ? "var(--success,#16a34a)" : "var(--text4)";
      var lastSeen = s.lastSeenAt ? _relativeTime(s.lastSeenAt) : "nunca sincronizada";
      return '<button onclick="window._mlOpenStore(\'' + s.id + '\')" style="text-align:left;background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px;cursor:pointer;font-family:inherit;display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
            '<span style="width:7px;height:7px;border-radius:50%;background:' + statusColor + '"></span>' +
            '<span style="font-size:14px;font-weight:700;color:var(--text)">' + s.name + '</span>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--text4)">' + lastSeen + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-size:13px;font-weight:700;color:var(--text2)">' + fmt(s.salesThisMonth) + '</div>' +
          '<div style="font-size:10.5px;color:var(--text4)">este mês</div>' +
        '</div>' +
      '</button>';
    }).join("") +
  '</div>';
}

function _relativeTime(iso) {
  var diffMs = Date.now() - new Date(iso).getTime();
  var mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return "há " + mins + " min";
  var hours = Math.floor(mins / 60);
  if (hours < 24) return "há " + hours + "h";
  var days = Math.floor(hours / 24);
  return "há " + days + " dia" + (days !== 1 ? "s" : "");
}

async function _renderStoreDetail(wrap, storeId) {
  wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">A carregar…</div>';

  var code = await _getLicenseCode();
  if (!code) { wrap.innerHTML = _errorHtml("Licença não encontrada."); return; }

  var res;
  try {
    res = await fetch(CONSOLE_API + "/reports/multi-store/store/" + encodeURIComponent(storeId) + "?code=" + encodeURIComponent(code));
  } catch (e) {
    wrap.innerHTML = _errorHtml("Sem ligação à internet. Verifica a rede e tenta novamente.");
    return;
  }

  if (!res.ok) {
    var errData = await res.json().catch(function() { return {}; });
    wrap.innerHTML = _errorHtml(errData.error || "Erro ao carregar a loja.");
    return;
  }

  var data = await res.json();
  if (!data || !data.success) { wrap.innerHTML = _errorHtml("Resposta inválida do servidor."); return; }

  var totalVendas = data.sales.reduce(function(a, s) { return a + (s.total || 0); }, 0);

  wrap.innerHTML =
    '<button onclick="window._mlBackToStoreList()" style="border:none;background:none;color:var(--primary,#5b21b6);font-size:13px;font-weight:700;padding:0 0 12px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px">' +
      '<i data-lucide="chevron-left" style="width:16px;height:16px"></i> Lojas' +
    '</button>' +

    '<div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:2px">' + data.store.name + '</div>' +
    '<div style="font-size:12px;color:var(--text4);margin-bottom:20px">' + (data.store.lastSeenAt ? _relativeTime(data.store.lastSeenAt) : "nunca sincronizada") + '</div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">' +
      _statCard({ label: "Vendas", value: fmt(totalVendas), sub: "últimos registos", color: "var(--text)", icon: "shopping-bag" }) +
      _statCard({ label: "Transações", value: data.sales.length, sub: "sincronizadas", color: "var(--text)", icon: "receipt" }) +
    '</div>' +

    '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">Produtos mais vendidos</div>' +
    (data.topProducts.length
      ? '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:24px">' +
        data.topProducts.slice(0, 5).map(function(p, i) {
          return '<div style="display:flex;justify-content:space-between;margin-bottom:' + (i < 4 ? '10px' : '0') + ';font-size:13px">' +
            '<span style="color:var(--text)">' + (i + 1) + '. ' + p.name + '</span>' +
            '<span style="font-weight:700;color:var(--text2)">' + fmt(p.receita) + '</span>' +
          '</div>';
        }).join("") +
        '</div>'
      : '<div style="font-size:12px;color:var(--text4);margin-bottom:24px">Sem vendas registadas ainda.</div>') +

    '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">Histórico de vendas</div>' +
    (data.sales.length
      ? '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);overflow:hidden;margin-bottom:24px">' +
        data.sales.slice(0, 20).map(function(s, i) {
          return '<div style="padding:12px 16px;' + (i < Math.min(data.sales.length, 20) - 1 ? 'border-bottom:1px solid #f4f4f5;' : '') + 'display:flex;justify-content:space-between;align-items:center">' +
            '<div>' +
              '<div style="font-size:13px;font-weight:700;color:var(--text)">' + (s.clientName || "Cliente não identificado") + '</div>' +
              '<div style="font-size:11px;color:var(--text4)">' + (s.date ? new Date(s.date).toLocaleDateString("pt-AO") : "") + ' · ' + (s.payMethod || "") + '</div>' +
            '</div>' +
            '<div style="font-size:13px;font-weight:700;color:var(--text2)">' + fmt(s.total) + '</div>' +
          '</div>';
        }).join("") +
        '</div>'
      : '<div style="font-size:12px;color:var(--text4);margin-bottom:24px">Sem vendas registadas ainda.</div>') +

    '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">Outros dados</div>' +
    '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px;display:flex;flex-direction:column;gap:10px">' +
      _pendingRow("Produtos", data.products.message) +
      _pendingRow("Stock", data.stock.message) +
      _pendingRow("Clientes", data.customers.message) +
      _pendingRow("Despesas", data.expenses.message) +
    '</div>';

  refreshIcons(wrap);
}

function _pendingRow(label, message) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px">' +
    '<span style="color:var(--text3)">' + label + '</span>' +
    '<span style="color:var(--text4);font-size:11px">' + message + '</span>' +
  '</div>';
}
