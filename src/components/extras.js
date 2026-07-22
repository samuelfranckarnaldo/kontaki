import { db }            from "../db.js";
import { postReturnJournal } from "../pgc.js";
import { CHART_OF_ACCOUNTS } from "../pgc.js";
import { fmt, fmtDate, refreshIcons } from "../utils.js";
import { toast }         from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser }       from "../auth.js";
import { addStockMovement } from "../services.js";

// ── MODO ESCURO ───────────────────────────────────────────────────────────────
export function initDarkMode() {
  var saved = localStorage.getItem("kontaki-theme") || "light";
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("kontaki-theme", theme);
  var btn = document.getElementById("btn-dark-toggle");
  if (btn) {
    btn.innerHTML = theme === "dark"
      ? '<i data-lucide="sun" style="width:18px;height:18px"></i>'
      : '<i data-lucide="moon" style="width:18px;height:18px"></i>';
    refreshIcons(btn);
  }
}

window._toggleDarkMode = function() {
  var current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
};

// ── ALERTAS DE STOCK MÍNIMO ───────────────────────────────────────────────────
function badgeCount(n) { return n > 9 ? "+9" : String(n); }

export async function checkBadges() {
  try {
    var fiados = await db.getAll("fiado");
    var aberto = fiados.filter(function(f){ return f.status==="open"; }).length;
    var total = fiados.length;
    var fb = document.getElementById("fiados-badge");
    if (fb) {
      if (aberto > 0) {
        fb.textContent = badgeCount(aberto);
        fb.style.display = "flex";
        fb.style.background = "#ef4444";
        fb.style.animation = "pulse 1.5s infinite";
      } else if (total > 0) {
        fb.textContent = "";
        fb.style.display = "flex";
        fb.style.background = "#16a34a";
        fb.style.animation = "none";
        fb.style.minWidth = "8px";
        fb.style.width = "8px";
        fb.style.height = "8px";
        fb.style.borderRadius = "50%";
      } else {
        fb.style.display = "none";
      }
    }
    
    var incidents = await db.getAll("incidents");
    var incAbertos = incidents.filter(function(i){ return i.status==="open" && !i.archived; }).length;
    var ib = document.getElementById("inc-count-badge");
    if (ib) {
      if (incAbertos > 0) {
        ib.textContent = badgeCount(incAbertos);
        ib.style.display = "flex";
      } else {
        ib.style.display = "none";
      }
    }

  } catch(e) {}
}

// ── DEVOLUÇÃO DE PRODUTOS ─────────────────────────────────────────────────────
export async function openDevolucao(saleId) {
  var { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }

  var sale = await db.get("sales", saleId);
  if (!sale) { toast("Venda não encontrada.", "error"); return; }

  var items = sale.items || [];
  if (!items.length) { toast("Venda sem itens.", "error"); return; }

  var store = (await db.get("settings", "store")) || {};
  var maxDias = store.devolucaoMaxDias != null ? store.devolucaoMaxDias : 30;
  var diasDesdeVenda = Math.floor((Date.now() - new Date(sale.date).getTime()) / 86400000);
  var foraDoPrazo = diasDesdeVenda > maxDias;
  var politicaBloqueia = (store.devolucaoForaPrazoPolicy || "bloquear") === "bloquear";

  if (foraDoPrazo && politicaBloqueia) {
    toast("Esta venda foi feita há " + diasDesdeVenda + " dias — o limite para devoluções é de " + maxDias + " dias.", "error");
    return;
  }

  var avisoForaDoPrazo = foraDoPrazo
    ? '<div style="background:var(--warning-muted-light);border:1.5px solid var(--warning-muted);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--warning-muted)">' +
      '<i data-lucide="alert-triangle" style="width:14px;height:14px;vertical-align:-2px"></i> Esta venda foi feita há ' + diasDesdeVenda + ' dias, acima do limite de ' + maxDias + ' dias. A devolução ainda é permitida, mas fica assinalada.</div>'
    : '';

  var rows = items.map(function(item) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f4f4f5">' +
      '<div style="flex:1">' +
      '<div style="font-size:13px;font-weight:600">' + item.name + '</div>' +
      '<div style="font-size:11px;color:#71717a">' + fmt(item.price) + ' × ' + item.qty + '</div>' +
      '</div>' +
      '<input type="number" id="dev-' + item.id + '" min="0" max="' + item.qty + '" value="0" ' +
      'style="width:60px;padding:6px;border:1.5px solid #ddd6fe;border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit"/>' +
      '</div>';
  }).join("");

  window._saleParaDevolucao = sale;

  openModal("Devolução — Venda #" + saleId,
    avisoForaDoPrazo +
    '<div style="font-size:13px;color:#71717a;margin-bottom:12px;line-height:1.5">' +
    'Insere a quantidade a devolver para cada produto.</div>' +
    '<div style="max-height:280px;overflow-y:auto;margin-bottom:14px">' + rows + '</div>' +
    '<div class="field" style="margin-bottom:12px">' +
    '<label>Motivo da devolução *</label>' +
    '<input id="dev-motivo" placeholder="Ex: Produto com defeito, cliente desistiu..."/>' +
    '</div>' +
    '<div class="field" style="margin-bottom:14px">' +
    '<label>Destino do produto devolvido</label>' +
    '<div style="display:flex;gap:8px">' +
    '<button type="button" data-destino="vendavel" class="dev-destino-btn dev-destino-active" style="flex:1;padding:11px;border-radius:10px;border:1.5px solid var(--primary);background:var(--primary-light);color:var(--primary);font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit">Vendável</button>' +
    '<button type="button" data-destino="danificado" class="dev-destino-btn" style="flex:1;padding:11px;border-radius:10px;border:1.5px solid var(--border2);background:#fff;color:var(--text3);font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit">Danificado</button>' +
    '</div>' +
    '<div style="font-size:11px;color:#a1a1aa;margin-top:6px">Vendável repõe o stock disponível. Danificado regista a devolução sem repor o stock.</div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmarDevolucao()" style="background:#d97706">' +
    '<i data-lucide="rotate-ccw"></i> Confirmar devolução</button>' +
    '</div>');
  refreshIcons(document.getElementById("modal-box"));

  window._devolucaoDestino = "vendavel";
  document.querySelectorAll(".dev-destino-btn").forEach(function(btn) {
    btn.onclick = function() {
      window._devolucaoDestino = btn.getAttribute("data-destino");
      document.querySelectorAll(".dev-destino-btn").forEach(function(other) {
        var active = other === btn;
        other.style.borderColor = active ? "var(--primary)" : "var(--border2)";
        other.style.background  = active ? "var(--primary-light)" : "#fff";
        other.style.color       = active ? "var(--primary)" : "var(--text3)";
      });
    };
  });
}

window._confirmarDevolucao = async function() {
  var { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }

  var sale = window._saleParaDevolucao;
  if (!sale) return;

  var motivo = ((document.getElementById("dev-motivo")||{}).value || "").trim();
  if (!motivo) { toast("O motivo da devolução é obrigatório.", "error"); return; }

  var destino = window._devolucaoDestino || "vendavel";

  var user  = getUser();
  var items = sale.items || [];
  var totalDevolvido = 0;
  var cogsDevolvido  = 0;
  var devolvidos = [];
  var itensDevolvidosEstruturado = [];

  // Soma quanto ja foi devolvido de cada item em devolucoes anteriores desta
  // venda — sem isto, cada devolucao parcial validava so contra a quantidade
  // ORIGINAL vendida, permitindo devolver mais do que o total comprado ao
  // longo de varias devolucoes (repondo stock e estornando receita a mais).
  var devolucoesAnteriores = sale.devolucoes || [];
  var jaDevolvidoPorItem = {};
  devolucoesAnteriores.forEach(function(dv) {
    (dv.itensDevolvidos || []).forEach(function(iv) {
      jaDevolvidoPorItem[iv.itemId] = (jaDevolvidoPorItem[iv.itemId] || 0) + iv.qty;
    });
  });

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var inp  = document.getElementById("dev-" + item.id);
    var qty  = inp ? (parseInt(inp.value) || 0) : 0;
    if (qty <= 0) continue;

    var jaDevolvido = jaDevolvidoPorItem[item.id] || 0;
    var disponivelParaDevolver = item.qty - jaDevolvido;
    if (qty > disponivelParaDevolver) {
      toast("Só podes devolver mais " + disponivelParaDevolver + " un. de " + item.name + " (já devolveste " + jaDevolvido + " de " + item.qty + ").", "error");
      return;
    }

    itensDevolvidosEstruturado.push({ itemId: item.id, qty: qty });

    // Verifica stock actual do produto
    var product = await db.get("products", item.id);
    var stockActual = product ? (product.stock || 0) : 0;

    // Cria StockMovement de devolução. Se "vendavel", repõe qty ao stock
    // disponível; se "danificado", fica só registado para auditoria — o
    // produto não volta a ficar disponível para venda.
    var repoeStock = destino === "vendavel";
    await db.add("stockMovements", {
      productId:   item.id,
      productName: item.name,
      type:        "return",
      location:    "shop",
      qty:         repoeStock ? qty : 0,
      qtyBefore:   stockActual,
      qtyAfter:    repoeStock ? (stockActual + qty) : stockActual,
      reference:   "return#" + sale.id,
      note:        "Devolução da venda #" + sale.id + " — " + motivo + (repoeStock ? "" : " (produto danificado, não repõe stock)"),
      userId:      user.id,
      sessionId:   user.sessionId || null,
      imported:    false,
      createdAt:   new Date().toISOString(),
    });

    // Actualiza cache do produto — só se for reposto como vendável
    if (product && repoeStock) {
      await db.put("products", {
        ...product,
        stock: stockActual + qty,
        updatedAt: new Date().toISOString(),
      });
    }

    totalDevolvido += item.price * qty;
    cogsDevolvido  += (product ? (product.costPrice||0) : 0) * qty;
    devolvidos.push(item.name + " x" + qty);
  }

  if (!devolvidos.length) {
    toast("Nenhuma quantidade para devolver.", "error"); return;
  }

  // Marca a venda com devolução
  var saleAtual = await db.get("sales", sale.id);
  var devolucoes = saleAtual.devolucoes || [];
  var diasDesdeVendaFinal = Math.floor((Date.now() - new Date(sale.date).getTime()) / 86400000);
  devolucoes.push({
    itens:            devolvidos,
    itensDevolvidos:  itensDevolvidosEstruturado,
    total:            totalDevolvido,
    motivo:           motivo,
    destino:          destino,
    diasDesdeVenda:   diasDesdeVendaFinal,
    date:             new Date().toISOString(),
    userId:           user.id,
    userName:         user.name,
  });
  await db.put("sales", {
    ...saleAtual,
    devolucoes:    devolucoes,
    temDevolucao:  true,
    totalDevolvido:(saleAtual.totalDevolvido||0) + totalDevolvido,
  });

  // Contabilidade — estorno de partidas dobradas (PGC)
  try {
    var ivaPctVenda = saleAtual.ivaPct || 0;
    var ivaValorDevolvido = ivaPctVenda > 0 ? totalDevolvido * (ivaPctVenda/100) : 0;
    await postReturnJournal({
      saleId:      sale.id,
      date:        new Date().toISOString(),
      payMethod:   saleAtual.payMethod,
      totalBase:   totalDevolvido,
      ivaValor:    ivaValorDevolvido,
      cogs:        cogsDevolvido,
    });
  } catch (pgcErr) {
    console.error("Erro ao lançar devolução na contabilidade:", pgcErr);
  }

  closeModal();
  toast("Devolução registada: " + devolvidos.join(", ") + " — " + fmt(totalDevolvido) + " reembolsados.", "success");
  window._saleParaDevolucao = null;
  window._devolucaoDestino = null;
};

// ── RELATÓRIO PDF MENSAL ──────────────────────────────────────────────────────
export async function gerarRelatorioPDF(from, to) {
  // Defesa em profundidade: o relatório contém COGS/margens
  // (operacional-confidencial). Já protegido na UI em historico.js e
  // perfil.js, mas a função em si também verifica — para que um
  // futuro ponto de chamada não fique desprotegido por esquecimento.
  const _user = getUser();
  if (!_user || _user.role !== "admin") {
    toast("Apenas administradores podem gerar este relatório.", "error");
    return;
  }

  const licMod = await import("../license.js");
  if (!licMod.hasFeature("pdf_contabilidade")) {
    licMod.showUpgradeBanner("Exportar PDF disponível a partir do plano Pro. Contacta a Introxeer para upgrade.");
    return;
  }
  var now = new Date();
  if (!from || !to) {
    var mesAtual = now.toISOString().slice(0, 7);
    from = mesAtual + "-01";
    to   = now.toISOString().split("T")[0];
  }
  var fromD = new Date(from + "T00:00:00");
  var toD   = new Date(to + "T00:00:00");
  var label = (from === to)
    ? fromD.toLocaleDateString("pt-AO", { day:"2-digit", month:"long", year:"numeric" })
    : fromD.toLocaleDateString("pt-AO", { day:"2-digit", month:"short" }) + " – " + toD.toLocaleDateString("pt-AO", { day:"2-digit", month:"short", year:"numeric" });

  var [sales, products, purchases, fiados, store, journalEntries] = await Promise.all([
    db.getAll("sales"),
    db.getAll("products"),
    db.getAll("purchases"),
    db.getAll("fiado"),
    db.get("settings", "store").then(function(s){ return s||{}; }),
    db.getAll("journalEntries"),
  ]);

  var vendasMes = sales.filter(function(s){
    var d = (s.date||"").split("T")[0];
    return d >= from && d <= to;
  });
  var receitaMes = vendasMes.reduce(function(a,s){ return a+(s.total||0); }, 0);

  var prodMap = {};
  products.forEach(function(p){ prodMap[p.id] = p; });

  var comprasMes = purchases.filter(function(p){
    var d = (p.date||"").split("T")[0];
    return d >= from && d <= to;
  }).reduce(function(a,p){ return a+(p.total||0); }, 0);
  var fiadoAberto = fiados.filter(function(f){ return f.status==="open"; })
    .reduce(function(a,f){ return a+(f.amount||0); }, 0);
  var devolucoesMes = vendasMes.reduce(function(a,s){ return a+(s.totalDevolvido||0); }, 0);

  // ── Livro Razão: contas de resultado filtradas pelo período; contas de balanço acumuladas até a data final ──
  var periodEntries  = journalEntries.filter(function(e){ var d=(e.date||"").split("T")[0]; return d>=from && d<=to; });
  var balanceEntries = journalEntries.filter(function(e){ return (e.date||"").split("T")[0] <= to; });

  function acctBal(entriesArr, code) {
    var acc = CHART_OF_ACCOUNTS.find(function(c){ return c.code===code; });
    if (!acc) return 0;
    var d=0,c=0;
    entriesArr.forEach(function(e){ (e.lines||[]).forEach(function(l){ if (l.account===code) { d+=l.debit||0; c+=l.credit||0; } }); });
    return acc.natureza==="devedora" ? d-c : c-d;
  }
  function contasComMov(entriesArr, tipo) {
    var totals = {};
    entriesArr.forEach(function(e){ (e.lines||[]).forEach(function(l){ totals[l.account]=(totals[l.account]||0)+(l.debit||0)+(l.credit||0); }); });
    return CHART_OF_ACCOUNTS.filter(function(c){ return c.tipo===tipo && totals[c.code]>0; });
  }

  var proveitoAccs = contasComMov(periodEntries, "proveito");
  var custoAccs    = contasComMov(periodEntries, "custo");
  var totalProveitos = proveitoAccs.reduce(function(a,c){ return a+acctBal(periodEntries,c.code); }, 0);
  var totalCustos    = custoAccs.reduce(function(a,c){ return a+acctBal(periodEntries,c.code); }, 0);
  var resultadoLiquido = totalProveitos - totalCustos;
  var margemLiq = totalProveitos>0 ? ((resultadoLiquido/totalProveitos)*100).toFixed(1) : "0.0";

  var ativoAccs   = contasComMov(balanceEntries, "activo");
  var passivoAccs = contasComMov(balanceEntries, "passivo");
  var capitalAccs = contasComMov(balanceEntries, "capital");
  var totalAtivo   = ativoAccs.reduce(function(a,c){ return a+acctBal(balanceEntries,c.code); }, 0);
  var totalPassivo = passivoAccs.reduce(function(a,c){ return a+acctBal(balanceEntries,c.code); }, 0);
  var totalCapital = capitalAccs.reduce(function(a,c){ return a+acctBal(balanceEntries,c.code); }, 0);

  var classeNomes = {
    1:"Meios Fixos e Investimentos", 2:"Existências", 3:"Terceiros", 4:"Meios Monetários",
    5:"Capital e Reservas", 6:"Proveitos por Natureza", 7:"Custos por Natureza", 8:"Resultados",
  };
  var contasBalancete = CHART_OF_ACCOUNTS.filter(function(c){
    var mov = 0;
    balanceEntries.forEach(function(e){ (e.lines||[]).forEach(function(l){ if (l.account===c.code) mov += (l.debit||0)+(l.credit||0); }); });
    return mov > 0;
  });
  var porClasse = {};
  contasBalancete.forEach(function(c){ porClasse[c.classe] = porClasse[c.classe]||[]; porClasse[c.classe].push(c); });

  var saldoCaixaBanco = acctBal(balanceEntries,"45")+acctBal(balanceEntries,"43")+acctBal(balanceEntries,"44")+acctBal(balanceEntries,"42")+acctBal(balanceEntries,"41");
  var contasAReceber  = acctBal(balanceEntries,"31");
  var contasAPagar    = acctBal(balanceEntries,"32");
  var ivaAPagar       = acctBal(balanceEntries,"34");

  // Por método de pagamento
  var porMetodo = {};
  vendasMes.forEach(function(s){ porMetodo[s.payMethod] = (porMetodo[s.payMethod]||0) + s.total; });
  var metodoLabels = { dinheiro:"Dinheiro", transferencia:"Transferência", multicaixa:"Multicaixa", fiado:"Venda a Crédito" };

  // Top produtos
  var prodReceita = {};
  vendasMes.forEach(function(s){
    (s.items||[]).forEach(function(i){
      if (!prodReceita[i.id]) prodReceita[i.id] = { name:i.name, total:0, qty:0 };
      prodReceita[i.id].total += i.price * i.qty;
      prodReceita[i.id].qty   += i.qty;
    });
  });
  var topProd = Object.values(prodReceita).sort(function(a,b){ return b.total-a.total; }).slice(0,10);

  // Vendas por dia
  var porDia = {};
  vendasMes.forEach(function(s){
    var d = (s.date||"").split("T")[0];
    porDia[d] = (porDia[d]||0) + s.total;
  });

  function acctTable(rows, entriesArr) {
    return '<table><thead><tr><th>Conta</th><th>Saldo</th></tr></thead><tbody>' +
      rows.map(function(c) {
        var v = acctBal(entriesArr, c.code);
        return '<tr><td>' + c.code + ' — ' + c.name + '</td><td><b>' + fmt(v) + '</b></td></tr>';
      }).join("") +
      '</tbody></table>';
  }

  var html =
    '<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/>' +
    '<title>Relatório ' + label + ' — ' + (store.name||"Kontaki") + '</title>' +
    '<style>' +
    'body{font-family:Arial,sans-serif;font-size:13px;color:#18181b;margin:0;padding:0}' +
    '.page{width:210mm;min-height:297mm;padding:20mm;box-sizing:border-box;margin:0 auto}' +
    'h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 10px;color:#5b21b6;border-bottom:2px solid #5b21b6;padding-bottom:4px}' +
    '.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #18181b}' +
    '.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}' +
    '.kpi{background:#f8f8f8;border-radius:8px;padding:12px;border-left:4px solid #5b21b6}' +
    '.kpi-label{font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.4px}' +
    '.kpi-val{font-size:18px;font-weight:700;margin-top:4px}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:20px}' +
    'th{background:#5b21b6;color:#fff;padding:8px 10px;text-align:left;font-size:12px}' +
    'td{padding:7px 10px;border-bottom:1px solid #eee;font-size:12px}' +
    'tr:nth-child(even) td{background:#f8f8f8}' +
    '.total-row td{font-weight:700;background:#ede9fe;color:#5b21b6}' +
    '.footer{margin-top:30px;text-align:center;font-size:11px;color:#a1a1aa;border-top:1px solid #eee;padding-top:12px}' +
    '.page-break{page-break-before:always}' +
    '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
    '</style></head><body><div class="page">' +

    '<div class="header">' +
    '<div><h1>' + (store.name||"Kontaki") + '</h1>' +
    '<div style="color:#71717a;font-size:13px">' + (store.address||"") + '</div>' +
    '<div style="color:#71717a;font-size:13px">' + (store.phone||"") + '</div></div>' +
    '<div style="text-align:right">' +
    '<div style="font-size:20px;font-weight:700;color:#5b21b6">Relatório Mensal</div>' +
    '<div style="color:#71717a;margin-top:4px">' + label + '</div>' +
    '<div style="color:#71717a;font-size:12px">Gerado em ' + new Date().toLocaleDateString("pt-AO") + '</div>' +
    '</div></div>' +

    '<h2>Resumo Financeiro</h2>' +
    '<div class="kpis">' +
    kpiBox("Receita", fmt(totalProveitos), "#16a34a") +
    kpiBox("Custos", fmt(totalCustos), "#dc2626") +
    kpiBox("Resultado Líquido", fmt(resultadoLiquido), resultadoLiquido>=0?"#5b21b6":"#dc2626") +
    kpiBox("Margem Líquida", margemLiq+"%", "#5b21b6") +
    kpiBox("Compras", fmt(comprasMes), "#d97706") +
    kpiBox("Fiado Aberto", fmt(fiadoAberto), "#d97706") +
    '</div>' +

    '<h2>Demonstração de Resultados</h2>' +
    '<table><thead><tr><th>Conta</th><th>Valor</th></tr></thead><tbody>' +
    proveitoAccs.map(function(c){ return '<tr><td>' + c.code + ' — ' + c.name + '</td><td><b>' + fmt(acctBal(periodEntries,c.code)) + '</b></td></tr>'; }).join("") +
    custoAccs.map(function(c){ return '<tr><td>' + c.code + ' — ' + c.name + '</td><td><b>-' + fmt(acctBal(periodEntries,c.code)) + '</b></td></tr>'; }).join("") +
    '<tr class="total-row"><td>Total Proveitos</td><td>' + fmt(totalProveitos) + '</td></tr>' +
    '<tr class="total-row"><td>Total Custos</td><td>' + fmt(totalCustos) + '</td></tr>' +
    '<tr class="total-row"><td>Resultado Líquido</td><td>' + fmt(resultadoLiquido) + '</td></tr>' +
    '</tbody></table>' +

    '<h2>Balanço Patrimonial</h2>' +
    '<table><thead><tr><th>Ativo</th><th>Saldo</th></tr></thead><tbody>' +
    ativoAccs.map(function(c){ return '<tr><td>' + c.code + ' — ' + c.name + '</td><td><b>' + fmt(acctBal(balanceEntries,c.code)) + '</b></td></tr>'; }).join("") +
    '<tr class="total-row"><td>Total Ativo</td><td>' + fmt(totalAtivo) + '</td></tr>' +
    '</tbody></table>' +
    '<table><thead><tr><th>Passivo + Capital</th><th>Saldo</th></tr></thead><tbody>' +
    passivoAccs.map(function(c){ return '<tr><td>' + c.code + ' — ' + c.name + '</td><td><b>' + fmt(acctBal(balanceEntries,c.code)) + '</b></td></tr>'; }).join("") +
    capitalAccs.map(function(c){ return '<tr><td>' + c.code + ' — ' + c.name + '</td><td><b>' + fmt(acctBal(balanceEntries,c.code)) + '</b></td></tr>'; }).join("") +
    '<tr class="total-row"><td>Total Passivo + Capital</td><td>' + fmt(totalPassivo+totalCapital) + '</td></tr>' +
    '</tbody></table>' +

    '<div class="page-break"></div>' +
    '<h2>Balancete</h2>' +
    Object.keys(porClasse).sort().map(function(classe) {
      return '<h2 style="font-size:13px;color:#71717a;border:none;margin-top:14px">Classe ' + classe + ' — ' + classeNomes[classe] + '</h2>' +
        acctTable(porClasse[classe], balanceEntries);
    }).join("") +

    '<h2>Posição Financeira</h2>' +
    '<div class="kpis">' +
    kpiBox("Caixa + Banco", fmt(saldoCaixaBanco), "#5b21b6") +
    kpiBox("A Receber", fmt(contasAReceber), "#d97706") +
    kpiBox("A Pagar", fmt(contasAPagar), "#dc2626") +
    kpiBox("IVA a Pagar", fmt(ivaAPagar), "#dc2626") +
    '</div>' +

    '<h2>Vendas por Dia</h2>' +
    '<table><thead><tr><th>Data</th><th>Vendas</th><th>Receita</th></tr></thead><tbody>' +
    Object.keys(porDia).sort().map(function(d) {
      var nVendas = vendasMes.filter(function(s){ return (s.date||"").startsWith(d); }).length;
      return '<tr><td>' + d + '</td><td>' + nVendas + '</td><td><b>' + fmt(porDia[d]) + '</b></td></tr>';
    }).join("") +
    '<tr class="total-row"><td>TOTAL</td><td>' + vendasMes.length + '</td><td>' + fmt(receitaMes) + '</td></tr>' +
    '</tbody></table>' +

    (topProd.length ?
    '<h2>Top Produtos</h2>' +
    '<table><thead><tr><th>#</th><th>Produto</th><th>Qtd</th><th>Receita</th><th>%</th></tr></thead><tbody>' +
    topProd.map(function(p, i) {
      var pct = receitaMes>0?((p.total/receitaMes)*100).toFixed(1):"0.0";
      return '<tr><td>' + (i+1) + '</td><td>' + p.name + '</td><td>' + p.qty + '</td><td><b>' + fmt(p.total) + '</b></td><td>' + pct + '%</td></tr>';
    }).join("") +
    '</tbody></table>' : "") +

    (Object.keys(porMetodo).length ?
    '<h2>Por Método de Pagamento</h2>' +
    '<table><thead><tr><th>Método</th><th>Valor</th><th>%</th></tr></thead><tbody>' +
    Object.entries(porMetodo).map(function(e) {
      var pct = receitaMes>0?((e[1]/receitaMes)*100).toFixed(1):"0.0";
      return '<tr><td>' + (metodoLabels[e[0]]||e[0]) + '</td><td><b>' + fmt(e[1]) + '</b></td><td>' + pct + '%</td></tr>';
    }).join("") +
    '</tbody></table>' : "") +

    (devolucoesMes>0 ?
    '<h2>Devoluções do Mês</h2>' +
    '<div class="kpis"><div style="grid-column:span 3">' + kpiBox("Total Devolvido", fmt(devolucoesMes), "#d97706") + '</div></div>' : "") +

    '<div class="footer">' +
    'Documento de gestão interna · Sem validade fiscal perante a AGT · ' +
    'Kontaki · Desenvolvido pela Introxeer · Angola' +
    '</div></div></body></html>';

  var win = window.open("", "_blank", "width=900,height=700");
  win.document.write(html);
  win.document.close();
  setTimeout(function(){ win.print(); }, 500);
}

function kpiBox(label, value, color) {
  return '<div class="kpi" style="border-left-color:' + color + '">' +
    '<div class="kpi-label">' + label + '</div>' +
    '<div class="kpi-val" style="color:' + color + '">' + value + '</div>' +
    '</div>';
}



// ── SYNC EM TEMPO REAL ───────────────────────────────────────────────────────
var _syncInterval = null;

export function startRealtimeSync() {
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(function() {
    checkBadges();
  }, 15000); // a cada 15 segundos
}

export function stopRealtimeSync() {
  if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
}
