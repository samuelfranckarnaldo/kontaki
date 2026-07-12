import { db }         from "../db.js";
import { fmt, fmtDate, refreshIcons } from "../utils.js";
import { getUser, getSession } from "../auth.js";

window._closeDashboard = function() {
  var ov = document.getElementById("dashboard-overlay");
  if (ov) ov.remove();
};

export async function loadDashboard() {
  var loginPage = document.getElementById("login-page");
  if (loginPage && loginPage.style.display !== "none") return;

  var existing = document.getElementById("dashboard-overlay");
  if (existing) { existing.remove(); return; }

  var user    = getUser();
  var hoje    = new Date().toISOString().slice(0,10);
  var mes     = new Date().toISOString().slice(0,7);

  var results = await Promise.all([
    db.getAll("sales"), db.getAll("products"),
    db.getAll("fiado"), db.getAll("expenses"),
  ]);
  var sales    = results[0];
  var products = results[1];
  var fiados   = results[2];
  var expenses = results[3];

  var vendasHoje  = sales.filter(function(s){ return (s.date||"").startsWith(hoje); });
  var vendasMes   = sales.filter(function(s){ return (s.date||"").startsWith(mes); });
  var totalHoje   = vendasHoje.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var totalMes    = vendasMes.reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
  var fiadoAberto = fiados.filter(function(f){ return f.status==="open"; }).reduce(function(a,f){ return a+(f.amount||0); },0);
  var despesasMes = expenses.filter(function(e){ return (e.date||"").startsWith(mes); }).reduce(function(a,e){ return a+(e.amount||0); },0);
  var stockBaixo  = products.filter(function(p){ return p.active && (p.stock||0)<=(p.minStock||5) && (p.stock||0)>0; }).length;
  var stockZero   = products.filter(function(p){ return p.active && (p.stock||0)===0; }).length;

  // COGS (custo dos produtos vendidos) — mesma lógica da Contabilidade
  var cogsMes = vendasMes.reduce(function(a,s){
    var custoVenda = (s.items||[]).reduce(function(b,i){
      var p = products.find(function(pr){ return pr.id === i.id; });
      return b + (p ? (p.costPrice||0)*i.qty : 0);
    }, 0);
    var propDev = s.total > 0 ? (s.totalDevolvido||0) / s.total : 0;
    return a + custoVenda * (1 - propDev);
  }, 0);

  var lucroMes = totalMes - cogsMes - despesasMes;
  var saldoCaixa  = vendasHoje.filter(function(s){ return s.payMethod==="dinheiro"; })
    .reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);

  var dias7 = [];
  for (var i=6; i>=0; i--) {
    var dd = new Date();
    dd.setDate(dd.getDate()-i);
    var ds  = dd.toISOString().slice(0,10);
    var lbl = i===0?"Hoje":i===1?"Ont.":dd.toLocaleDateString("pt-AO",{weekday:"short"});
    var v   = sales.filter(function(s){ return (s.date||"").startsWith(ds); })
      .reduce(function(a,s){ return a+((s.total||0)-(s.totalDevolvido||0)); },0);
    dias7.push({label:lbl,val:v,date:ds});
  }
  var maxVal = Math.max.apply(null, dias7.map(function(d){return d.val;})) || 1;

  var hora     = new Date().getHours();
  var saudacao = hora<12?"Bom dia":hora<18?"Boa tarde":"Boa noite";
  var nome     = user ? user.name.split(" ")[0] : "";
  var dataStr  = new Date().toLocaleDateString("pt-AO",{weekday:"long",day:"numeric",month:"long"});

  var overlay = document.createElement("div");
  overlay.id = "dashboard-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;justify-content:flex-end";

  var backdrop = document.createElement("div");
  backdrop.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(3px)";
  backdrop.onclick = window._closeDashboard;
  overlay.appendChild(backdrop);

  var sheet = document.createElement("div");
  sheet.style.cssText = "position:relative;background:var(--bg);border-radius:24px 24px 0 0;max-height:88vh;overflow-y:auto;z-index:1;animation:slideUp .3s ease";
  overlay.appendChild(sheet);

  // ── Handle ──
  var handle = document.createElement("div");
  handle.style.cssText = "display:flex;justify-content:center;padding:12px 0 0";
  handle.innerHTML = "<div style='width:40px;height:4px;background:var(--border);border-radius:2px'></div>";
  sheet.appendChild(handle);

  // ── Header gradiente ──
  var header = document.createElement("div");
  header.style.cssText = "background:linear-gradient(135deg,#5b21b6,#7c3aed);padding:20px 16px 24px;margin:8px 12px 0;border-radius:16px";

  var headerTop = document.createElement("div");
  headerTop.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px";

  var headerLeft = document.createElement("div");
  headerLeft.innerHTML =
    "<div style='font-size:11px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.5px'>" + dataStr + "</div>" +
    "<div style='font-size:20px;font-weight:800;color:#fff;margin-top:3px'>" + saudacao + (nome?", "+nome:"") + "</div>";

  var closeBtn = document.createElement("button");
  closeBtn.style.cssText = "background:rgba(255,255,255,.2);border:1.5px solid rgba(255,255,255,.3);color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0";
  closeBtn.innerHTML = "<i data-lucide='x' style='width:16px;height:16px'></i>";
  closeBtn.onclick = window._closeDashboard;

  headerTop.appendChild(headerLeft);
  headerTop.appendChild(closeBtn);
  header.appendChild(headerTop);

  // KPIs
  var kpiGrid = document.createElement("div");
  kpiGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px";
  // "Lucro est." depende de costPrice (custo dos produtos), que é
  // informação operacional-confidencial (ver docs/architecture/
  // 04-data-classification.md) — só visível a admin. Operadores de
  // caixa veem o número de vendas do mês no lugar, para manter o
  // grid 2x2 sem espaço vazio.
  var isAdmin = user && user.role === "admin";
  kpiGrid.innerHTML =
    _kpi("Vendas hoje",  fmt(totalHoje),  vendasHoje.length+" transações") +
    _kpi("Caixa",        fmt(saldoCaixa), "dinheiro físico") +
    _kpi("Este mês",     fmt(totalMes),   vendasMes.length+" vendas") +
    (isAdmin
      ? _kpi("Lucro est.", fmt(lucroMes>0?lucroMes:0), lucroMes>=0?"positivo":"negativo")
      : _kpi("Transações", vendasMes.length, "este mês"));
  header.appendChild(kpiGrid);
  sheet.appendChild(header);

  // ── Alertas ──
  if (stockZero>0 || stockBaixo>0 || fiadoAberto>0) {
    var alertWrap = document.createElement("div");
    alertWrap.style.cssText = "margin:12px 12px 0";
    var alertCard = document.createElement("div");
    alertCard.style.cssText = "background:var(--bg2);border-radius:14px;border:1px solid var(--border2);overflow:hidden";

    var alertTitle = document.createElement("div");
    alertTitle.style.cssText = "padding:10px 14px;font-size:11px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border2)";
    alertTitle.textContent = "Alertas";
    alertCard.appendChild(alertTitle);

    if (stockZero>0) alertCard.appendChild(_alertRow("package-x","var(--danger)",stockZero+" produto"+(stockZero>1?"s":"")+" esgotado"+(stockZero>1?"s":""),"Necessita reposição urgente",true));
    if (stockBaixo>0) alertCard.appendChild(_alertRow("alert-triangle","var(--warning)",stockBaixo+" produto"+(stockBaixo>1?"s":"")+" com stock baixo","Considera repor em breve",stockZero>0||fiadoAberto>0));
    if (fiadoAberto>0) alertCard.appendChild(_alertRow("wallet","var(--primary)","Fiado em aberto: "+fmt(fiadoAberto),"Clientes com dívida pendente",false));

    alertWrap.appendChild(alertCard);
    sheet.appendChild(alertWrap);
  }

  // ── Gráfico ──
  var chartWrap = document.createElement("div");
  chartWrap.style.cssText = "margin:12px 12px 0";
  var chartCard = document.createElement("div");
  chartCard.style.cssText = "background:var(--bg2);border-radius:14px;padding:14px;border:1px solid var(--border2)";

  var chartTitle = document.createElement("div");
  chartTitle.style.cssText = "font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:14px";
  chartTitle.textContent = "Vendas — últimos 7 dias";
  chartCard.appendChild(chartTitle);

  var barsWrap = document.createElement("div");
  barsWrap.style.cssText = "display:flex;align-items:flex-end;gap:6px;height:80px";
  dias7.forEach(function(dia) {
    var pct     = Math.max(4, Math.round((dia.val/maxVal)*76));
    var isToday = dia.date === hoje;
    var col     = document.createElement("div");
    col.style.cssText = "flex:1;display:flex;flex-direction:column;align-items:center;gap:4px";
    col.innerHTML =
      "<div style='width:100%;border-radius:6px 6px 0 0;background:" +
      (isToday?"var(--primary)":dia.val>0?"var(--primary-light)":"var(--border2)") +
      ";height:"+pct+"px;transition:height .3s'></div>" +
      "<div style='font-size:9px;color:"+(isToday?"var(--primary)":"var(--text4)")+
      ";font-weight:"+(isToday?"700":"400")+";white-space:nowrap'>"+dia.label+"</div>";
    barsWrap.appendChild(col);
  });
  chartCard.appendChild(barsWrap);
  chartWrap.appendChild(chartCard);
  sheet.appendChild(chartWrap);

  // ── Botão começar ──
  var btnWrap = document.createElement("div");
  btnWrap.style.cssText = "padding:12px 12px 24px";
  var startBtn = document.createElement("button");
  startBtn.style.cssText = "width:100%;padding:15px;background:var(--primary);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(91,33,182,.3)";
  startBtn.innerHTML = "<i data-lucide='zap' style='width:18px;height:18px'></i> Começar a vender";
  startBtn.onclick = window._closeDashboard;
  btnWrap.appendChild(startBtn);
  sheet.appendChild(btnWrap);

  document.body.appendChild(overlay);
  if (window.lucide) window.lucide.createIcons({el:sheet});
}

function _kpi(label, value, sub) {
  return "<div style='background:rgba(255,255,255,.12);border-radius:10px;padding:10px'>" +
    "<div style='font-size:10px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px'>" + label + "</div>" +
    "<div style='font-size:16px;font-weight:800;color:#fff;line-height:1'>" + value + "</div>" +
    "<div style='font-size:10px;color:rgba(255,255,255,.6);margin-top:3px'>" + sub + "</div>" +
    "</div>";
}

function _alertRow(icon, color, title, sub, border) {
  var div = document.createElement("div");
  div.style.cssText = "padding:12px 14px;display:flex;align-items:center;gap:10px" + (border?";border-bottom:1px solid var(--border2)":"");
  div.innerHTML =
    "<div style='width:32px;height:32px;background:" + color + "20;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0'>" +
    "<i data-lucide='" + icon + "' style='width:15px;height:15px;color:" + color + "'></i></div>" +
    "<div><div style='font-size:13px;font-weight:700;color:" + color + "'>" + title + "</div>" +
    "<div style='font-size:11px;color:var(--text4)'>" + sub + "</div></div>";
  return div;
}
