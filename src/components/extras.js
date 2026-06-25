import { db }            from "../db.js";
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
export async function checkBadges() {
  try {
    var fiados = await db.getAll("fiado");
    var aberto = fiados.filter(function(f){ return f.status==="open"; }).length;
    var total = fiados.length;
    var fb = document.getElementById("fiados-badge");
    if (fb) {
      if (aberto > 0) {
        fb.textContent = aberto;
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
    
    var produtos = await db.getAll("products");
    var low = produtos.filter(function(p){ return p.active && p.stock <= (p.minStock || 5); }).length;
    var pb = document.getElementById("produtos-badge");
    if (pb) {
      if (low > 0) {
        pb.textContent = low;
        pb.style.display = "flex";
        pb.style.background = "#d97706";
        pb.style.animation = "none";
      } else {
        pb.style.display = "none";
      }
    }
  } catch(e) {}
}

export async function checkStockAlerts() {
  var products = await db.getAll("products");
  var low = products.filter(function(p) {
    return p.active && p.stock <= (p.minStock || 5);
  });

  if (!low.length) return;

  // Badge no ícone de produtos
  var badge = document.getElementById("produtos-badge");
  if (badge) {
    badge.textContent = low.length;
    badge.style.display = "flex";
  }

  // Toast discreto
  if (low.length <= 3) {
    low.forEach(function(p) {
      setTimeout(function() {
        toast("⚠ Stock baixo: " + p.name + " (" + p.stock + " " + (p.unit||"unid") + ")", "error");
      }, 1000);
    });
  } else {
    setTimeout(function() {
      toast("⚠ " + low.length + " produtos com stock baixo — ver Gestão de Stock", "error");
    }, 1000);
  }

  return low;
}

// ── DEVOLUÇÃO DE PRODUTOS ─────────────────────────────────────────────────────
export async function openDevolucao(saleId) {
  var sale = await db.get("sales", saleId);
  if (!sale) { toast("Venda não encontrada.", "error"); return; }

  var items = sale.items || [];
  if (!items.length) { toast("Venda sem itens.", "error"); return; }

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
    '<div style="font-size:13px;color:#71717a;margin-bottom:12px;line-height:1.5">' +
    'Insere a quantidade a devolver para cada produto. Stock será reposto automaticamente.</div>' +
    '<div style="max-height:300px;overflow-y:auto;margin-bottom:14px">' + rows + '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmarDevolucao()" style="background:#d97706">' +
    '<i data-lucide="rotate-ccw"></i> Confirmar devolução</button>' +
    '</div>');
  refreshIcons(document.getElementById("modal-box"));
}

window._confirmarDevolucao = async function() {
  var sale = window._saleParaDevolucao;
  if (!sale) return;

  var user  = getUser();
  var items = sale.items || [];
  var totalDevolvido = 0;
  var devolvidos = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var inp  = document.getElementById("dev-" + item.id);
    var qty  = inp ? (parseInt(inp.value) || 0) : 0;
    if (qty <= 0) continue;
    if (qty > item.qty) {
      toast("Não podes devolver mais do que foi vendido: " + item.name, "error");
      return;
    }

    // Verifica stock actual do produto
    var product = await db.get("products", item.id);
    var stockActual = product ? (product.stock || 0) : 0;

    // Cria StockMovement de devolução — adiciona qty ao stock
    await db.add("stockMovements", {
      productId:   item.id,
      productName: item.name,
      type:        "return",
      location:    "shop",
      qty:         qty,           // positivo — repõe stock
      qtyBefore:   stockActual,
      qtyAfter:    stockActual + qty,
      reference:   "return#" + sale.id,
      note:        "Devolução da venda #" + sale.id,
      userId:      user.id,
      sessionId:   user.sessionId || null,
      imported:    false,
      createdAt:   new Date().toISOString(),
    });

    // Actualiza cache do produto
    if (product) {
      await db.put("products", {
        ...product,
        stock: stockActual + qty,
        updatedAt: new Date().toISOString(),
      });
    }

    totalDevolvido += item.price * qty;
    devolvidos.push(item.name + " x" + qty);
  }

  if (!devolvidos.length) {
    toast("Nenhuma quantidade para devolver.", "error"); return;
  }

  // Marca a venda com devolução
  var saleAtual = await db.get("sales", sale.id);
  var devolucoes = saleAtual.devolucoes || [];
  devolucoes.push({
    itens:     devolvidos,
    total:     totalDevolvido,
    date:      new Date().toISOString(),
    userId:    user.id,
    userName:  user.name,
  });
  await db.put("sales", {
    ...saleAtual,
    devolucoes:    devolucoes,
    temDevolucao:  true,
    totalDevolvido:(saleAtual.totalDevolvido||0) + totalDevolvido,
  });

  closeModal();
  toast("Devolução registada: " + devolvidos.join(", ") + " — " + fmt(totalDevolvido) + " reembolsados.", "success");
  window._saleParaDevolucao = null;
};

// ── RELATÓRIO PDF MENSAL ──────────────────────────────────────────────────────
export async function gerarRelatorioPDF() {
  var now   = new Date();
  var mes   = now.toISOString().slice(0, 7);
  var label = now.toLocaleDateString("pt-AO", { month: "long", year: "numeric" });

  var [sales, products, purchases, fiados, store] = await Promise.all([
    db.getAll("sales"),
    db.getAll("products"),
    db.getAll("purchases"),
    db.getAll("fiado"),
    db.get("settings", "store").then(function(s){ return s||{}; }),
  ]);

  var vendasMes = sales.filter(function(s){ return (s.date||"").startsWith(mes); });
  var receitaMes = vendasMes.reduce(function(a,s){ return a+(s.total||0); }, 0);

  var prodMap = {};
  products.forEach(function(p){ prodMap[p.id] = p; });

  var cogsMes = vendasMes.reduce(function(a,s){
    return a + (s.items||[]).reduce(function(b,i){
      var p = prodMap[i.id];
      return b + (p?(p.costPrice||0)*i.qty:0);
    }, 0);
  }, 0);

  var lucroMes   = receitaMes - cogsMes;
  var margem     = receitaMes > 0 ? ((lucroMes/receitaMes)*100).toFixed(1) : "0.0";
  var comprasMes = purchases.filter(function(p){ return (p.date||"").startsWith(mes); })
    .reduce(function(a,p){ return a+(p.total||0); }, 0);
  var fiadoAberto = fiados.filter(function(f){ return f.status==="open"; })
    .reduce(function(a,f){ return a+(f.amount||0); }, 0);

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
    kpiBox("Receita Total", fmt(receitaMes), "#16a34a") +
    kpiBox("Custo das Vendas", fmt(cogsMes), "#d97706") +
    kpiBox("Lucro Bruto", fmt(lucroMes), lucroMes>=0?"#5b21b6":"#dc2626") +
    kpiBox("Margem Bruta", margem+"%", "#5b21b6") +
    kpiBox("Compras", fmt(comprasMes), "#dc2626") +
    kpiBox("Fiado Aberto", fmt(fiadoAberto), "#d97706") +
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

    '<div class="footer">' +
    'Documento de gestão interna · Sem validade fiscal perante a AGT · ' +
    'Powered by Kontaki · Introxeer Technology · Angola' +
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

