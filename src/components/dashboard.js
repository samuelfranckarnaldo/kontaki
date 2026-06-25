import { db }         from "../db.js";
import { fmt, fmtDate, refreshIcons } from "../utils.js";
import { getUser, getSession } from "../auth.js";

export async function loadDashboard() {
  var existing = document.getElementById("dashboard-overlay");
  if (existing) { existing.remove(); return; }

  var user    = getUser();
  var session = getSession();
  var hoje    = new Date().toISOString().slice(0,10);
  var mes     = new Date().toISOString().slice(0,7);

  var [sales, products, fiados, expenses] = await Promise.all([
    db.getAll("sales"), db.getAll("products"),
    db.getAll("fiado"), db.getAll("expenses"),
  ]);

  var vendasHoje  = sales.filter(function(s){ return (s.date||"").startsWith(hoje); });
  var vendasMes   = sales.filter(function(s){ return (s.date||"").startsWith(mes); });
  var totalHoje   = vendasHoje.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var totalMes    = vendasMes.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var fiadoAberto = fiados.filter(function(f){ return f.status==="open"; }).reduce(function(a,f){ return a+(f.amount||0); },0);
  var despesasMes = expenses.filter(function(e){ return (e.date||"").startsWith(mes); }).reduce(function(a,e){ return a+(e.amount||0); },0);
  var stockBaixo  = products.filter(function(p){ return p.active && p.stock <= (p.minStock||5) && p.stock > 0; }).length;
  var stockZero   = products.filter(function(p){ return p.active && p.stock === 0; }).length;
  var lucroMes    = totalMes - despesasMes;

  // Saldo de caixa = vendas em dinheiro hoje
  var saldoCaixa = vendasHoje.filter(function(s){ return s.payMethod==="dinheiro"; })
    .reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);

  // Gráfico: vendas últimos 7 dias
  var dias7 = [];
  for (var i=6; i>=0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var ds = d.toISOString().slice(0,10);
    var label = i===0 ? "Hoje" : i===1 ? "Ont." : d.toLocaleDateString("pt-AO",{weekday:"short"});
    var val = sales.filter(function(s){ return (s.date||"").startsWith(ds); })
      .reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
    dias7.push({ label:label, val:val, date:ds });
  }
  var maxVal = Math.max.apply(null, dias7.map(function(d){return d.val;})) || 1;

  // Hora actual para saudação
  var hora = new Date().getHours();
  var saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  var nome = user ? user.name.split(" ")[0] : "";

  var d = document.createElement("div");
  d.id = "dashboard-overlay";
  d.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:64px;background:var(--bg);z-index:50;overflow-y:auto";

  d.innerHTML =
    // Header
    "<div style='background:linear-gradient(135deg,#5b21b6,#7c3aed);padding:20px 16px 28px'>" +
    "<div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px'>" +
    "<div>" +
    "<div style='font-size:12px;color:rgba(255,255,255,.7)'>" + new Date().toLocaleDateString("pt-AO",{weekday:"long",day:"numeric",month:"long"}) + "</div>" +
    "<div style='font-size:20px;font-weight:700;color:#fff;margin-top:2px'>" + saudacao + (nome?", "+nome:"") + " 👋</div>" +
    "</div>" +
    "<button onclick='document.getElementById(\"dashboard-overlay\").remove()' style='background:rgba(255,255,255,.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0'>×</button>" +
    "</div>" +
    // KPI principal
    "<div style='background:rgba(255,255,255,.15);border-radius:14px;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px'>" +
    kpiHero("Vendas hoje", fmt(totalHoje), vendasHoje.length + " transações") +
    kpiHero("Saldo caixa", fmt(saldoCaixa), "dinheiro físico") +
    kpiHero("Este mês", fmt(totalMes), vendasMes.length + " vendas") +
    kpiHero("Lucro est.", fmt(lucroMes), "receita − despesas") +
    "</div></div>" +

    // Alertas
    ((stockZero > 0 || stockBaixo > 0 || fiadoAberto > 0) ?
    "<div style='padding:12px 16px'>" +
    "<div style='background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden'>" +
    "<div style='padding:10px 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;background:#f9fafb;border-bottom:1px solid #e5e7eb'>Alertas</div>" +
    (stockZero>0?"<div style='padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f3f4f6'><i data-lucide='package-x' style='width:16px;height:16px;color:#dc2626;flex-shrink:0'></i><span style='font-size:13px;flex:1'>" + stockZero + " produto(s) esgotado(s)</span></div>":"") +
    (stockBaixo>0?"<div style='padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f3f4f6'><i data-lucide='alert-triangle' style='width:16px;height:16px;color:#d97706;flex-shrink:0'></i><span style='font-size:13px;flex:1'>" + stockBaixo + " produto(s) com stock baixo</span></div>":"") +
    (fiadoAberto>0?"<div style='padding:10px 14px;display:flex;align-items:center;gap:10px'><i data-lucide='credit-card' style='width:16px;height:16px;color:#5b21b6;flex-shrink:0'></i><span style='font-size:13px;flex:1'>Fiado em aberto: <strong>" + fmt(fiadoAberto) + "</strong></span></div>":"") +
    "</div></div>" : "") +

    // Gráfico 7 dias
    "<div style='padding:0 16px 12px'>" +
    "<div style='background:#fff;border-radius:12px;padding:14px;border:1px solid #e5e7eb'>" +
    "<div style='font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px'>Vendas — últimos 7 dias</div>" +
    "<div style='display:flex;align-items:flex-end;gap:6px;height:80px'>" +
    dias7.map(function(dia) {
      var pct = maxVal > 0 ? Math.max(4, Math.round((dia.val/maxVal)*100)) : 4;
      var isToday = dia.date === hoje;
      return "<div style='flex:1;display:flex;flex-direction:column;align-items:center;gap:4px'>" +
        "<div style='width:100%;border-radius:4px 4px 0 0;background:" + (isToday?"#5b21b6":dia.val>0?"#ddd6fe":"#f3f4f6") + ";height:" + pct + "%;min-height:4px;transition:height .3s'></div>" +
        "<div style='font-size:9px;color:" + (isToday?"#5b21b6":"#9ca3af") + ";font-weight:" + (isToday?"700":"400") + ";white-space:nowrap'>" + dia.label + "</div>" +
        "</div>";
    }).join("") +
    "</div>" +
    (totalMes>0?"<div style='font-size:11px;color:#9ca3af;margin-top:8px;text-align:right'>Total do mês: " + fmt(totalMes) + "</div>":"") +
    "</div></div>" +

    // Botão
    "<div style='padding:0 16px 20px'>" +
    "<button onclick='document.getElementById(\"dashboard-overlay\").remove()' style='width:100%;padding:14px;background:#5b21b6;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px'>" +
    "<i data-lucide='zap' style='width:16px;height:16px'></i> Começar a vender</button>" +
    "</div>";

  document.body.appendChild(d);
  if (window.lucide) window.lucide.createIcons({el:d});
}

function kpiHero(label, value, sub) {
  return "<div style='background:rgba(255,255,255,.12);border-radius:10px;padding:10px'>" +
    "<div style='font-size:10px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px'>" + label + "</div>" +
    "<div style='font-size:16px;font-weight:700;color:#fff'>" + value + "</div>" +
    "<div style='font-size:10px;color:rgba(255,255,255,.6);margin-top:2px'>" + sub + "</div>" +
    "</div>";
}
