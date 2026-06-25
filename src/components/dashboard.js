import { db }            from "../db.js";
import { fmt, fmtDate, refreshIcons } from "../utils.js";
import { getUser }       from "../auth.js";

export async function loadDashboard() {
  var wrap = document.getElementById("pg-vender");
  // Dashboard aparece como overlay no topo da página vender
  var dash = document.getElementById("dashboard-overlay");
  if (dash) { dash.remove(); return; }

  var user    = getUser();
  var hoje    = new Date().toISOString().slice(0,10);
  var mes     = new Date().toISOString().slice(0,7);
  var sales   = await db.getAll("sales");
  var products= await db.getAll("products");
  var fiados  = await db.getAll("fiado");

  var vendasHoje = sales.filter(function(s){ return (s.date||"").startsWith(hoje); });
  var totalHoje  = vendasHoje.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var fiadoAberto= fiados.filter(function(f){ return f.status==="open"; }).reduce(function(a,f){ return a+(f.amount||0); },0);
  var stockBaixo = products.filter(function(p){ return p.active && p.stock <= (p.minStock||5); }).length;
  var stockZero  = products.filter(function(p){ return p.active && p.stock === 0; }).length;

  // Vendas por hora hoje (para sparkline)
  var porHora = {};
  for (var h=8; h<=22; h++) porHora[h] = 0;
  vendasHoje.forEach(function(s){
    var hora = new Date(s.date).getHours();
    if (hora >= 8 && hora <= 22) porHora[hora] += s.total||0;
  });
  var maxHora = Math.max.apply(null, Object.values(porHora)) || 1;

  var d = document.createElement("div");
  d.id = "dashboard-overlay";
  d.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:72px;background:var(--bg);z-index:50;overflow-y:auto;animation:slideUp .25s ease";

  d.innerHTML =
    "<div style='background:linear-gradient(135deg,#5b21b6,#7c3aed);padding:20px 16px 24px'>" +
    "<div style='display:flex;justify-content:space-between;align-items:flex-start'>" +
    "<div>" +
    "<div style='font-size:12px;color:rgba(255,255,255,.7);margin-bottom:4px'>" + new Date().toLocaleDateString("pt-AO",{weekday:"long",day:"numeric",month:"long"}) + "</div>" +
    "<div style='font-size:22px;font-weight:700;color:#fff'>Bom dia, " + user.name.split(" ")[0] + " 👋</div>" +
    "</div>" +
    "<button onclick='document.getElementById(\"dashboard-overlay\").remove()' style='background:rgba(255,255,255,.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center'>×</button>" +
    "</div>" +

    "<div style='background:rgba(255,255,255,.15);border-radius:14px;padding:14px;margin-top:16px'>" +
    "<div style='font-size:11px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px'>Vendas hoje</div>" +
    "<div style='font-size:28px;font-weight:700;color:#fff'>" + fmt(totalHoje) + "</div>" +
    "<div style='font-size:12px;color:rgba(255,255,255,.7);margin-top:2px'>" + vendasHoje.length + " transações</div>" +
    "</div></div>" +

    "<div style='padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px'>" +
    kpiCard("Fiado em aberto", fmt(fiadoAberto), "#dc2626", "credit-card", fiadoAberto > 0) +
    kpiCard("Stock esgotado", stockZero + " prod.", "#dc2626", "package-x", stockZero > 0) +
    kpiCard("Stock baixo", stockBaixo + " prod.", "#d97706", "alert-triangle", stockBaixo > 0) +
    kpiCard("Produtos activos", products.filter(function(p){return p.active;}).length + "", "#16a34a", "package", false) +
    "</div>" +

    "<div style='padding:0 16px 16px'>" +
    "<div style='background:var(--bg2);border-radius:14px;padding:14px;border:1px solid var(--border2)'>" +
    "<div style='font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px'>Vendas por hora (hoje)</div>" +
    "<div style='display:flex;align-items:flex-end;gap:3px;height:60px'>" +
    Object.entries(porHora).map(function(e){
      var pct = Math.round((e[1]/maxHora)*100);
      var isNow = new Date().getHours() === Number(e[0]);
      return "<div style='flex:1;display:flex;flex-direction:column;align-items:center;gap:2px'>" +
        "<div style='flex:1;width:100%;border-radius:3px 3px 0 0;background:" + (isNow?"#5b21b6":e[1]>0?"#ddd6fe":"var(--border2)") + ";min-height:3px;height:" + pct + "%;transition:height .3s'></div>" +
        (Number(e[0])%4===0?"<div style='font-size:8px;color:var(--text4)'>"+e[0]+"h</div>":"<div style='height:12px'></div>") +
        "</div>";
    }).join("") +
    "</div></div></div>" +

    (stockBaixo > 0 || stockZero > 0 ?
    "<div style='padding:0 16px 16px'>" +
    "<div style='background:#fef3c7;border:1.5px solid #fde68a;border-radius:12px;padding:12px 14px'>" +
    "<div style='font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px'>⚠ Alertas de stock</div>" +
    products.filter(function(p){return p.active&&p.stock<=(p.minStock||5);}).slice(0,5).map(function(p){
      return "<div style='font-size:12px;color:#92400e;padding:3px 0;border-bottom:1px solid #fde68a;display:flex;justify-content:space-between'><span>" + p.name + "</span><span style='font-weight:700'>" + p.stock + " " + (p.unit||"unid") + "</span></div>";
    }).join("") +
    "</div></div>" : "") +

    "<div style='padding:0 16px 24px'>" +
    "<button onclick='document.getElementById(\"dashboard-overlay\").remove()' style='width:100%;padding:14px;background:var(--primary);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit'>Começar a vender</button>" +
    "</div>";

  document.body.appendChild(d);
  if (window.lucide) window.lucide.createIcons({el:d});
}

function kpiCard(label, value, color, icon, alert) {
  return "<div style='background:" + (alert?"#fff5f5":"var(--bg2)") + ";border-radius:12px;padding:12px;border:1.5px solid " + (alert?color+"40":"var(--border2)") + ";display:flex;flex-direction:column;gap:4px'>" +
    "<div style='display:flex;align-items:center;justify-content:space-between'>" +
    "<i data-lucide='" + icon + "' style='width:16px;height:16px;color:" + color + "'></i>" +
    (alert?"<div style='width:6px;height:6px;border-radius:50%;background:" + color + "'></div>":"") +
    "</div>" +
    "<div style='font-size:16px;font-weight:700;color:" + color + "'>" + value + "</div>" +
    "<div style='font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.3px'>" + label + "</div>" +
    "</div>";
}
