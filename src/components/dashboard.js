import { db } from "../db.js";
import { fmt, today, refreshIcons } from "../utils.js";

export async function loadDashboard(filterUserId) {
  filterUserId = filterUserId || null;
  const elD = document.getElementById("dash-content");
  if (!elD) return;
  elD.innerHTML = `<div style="padding:20px;text-align:center;color:#a1a1aa;font-size:13px">A carregar...</div>`;

  const sales    = await db.getAll("sales");
  const products = await db.getAll("products");
  const fiados   = await db.getAll("fiado");
  const users    = await db.getAll("users");

  const td         = today();
  const thisMonth  = td.slice(0, 7);
  const todaySales = sales.filter(s => (s.date || "").startsWith(td));
  const monthSales = sales.filter(s => (s.date || "").startsWith(thisMonth));
  const totalToday = todaySales.reduce((a,s) => a+((s.total||0)-(s.totalDevolvido||0)), 0);
  const totalMonth = monthSales.reduce((a,s) => a+((s.total||0)-(s.totalDevolvido||0)), 0);

  const activeProds = products.filter(p => p.active);
  const zeroStock   = activeProds.filter(p => (p.stock||0) === 0);
  const lowStock    = activeProds.filter(p => (p.stock||0) > 0 && (p.stock||0) <= (p.minStock||5));
  const openFiados  = fiados.filter(f => f.status === "open");
  const fiadoTotal  = openFiados.reduce((a,f) => a+(f.amount||0), 0);

  // Vendas por funcionário hoje
  const byUser = {};
  todaySales.forEach(s => {
    const uid = s.userId || 0;
    if (!byUser[uid]) byUser[uid] = { total:0, count:0 };
    byUser[uid].total += s.total||0;
    byUser[uid].count++;
  });

  // Top 5 produtos
  const prodCount = {};
  sales.forEach(s => (s.items||[]).forEach(i => {
    prodCount[i.name] = (prodCount[i.name]||0) + i.qty;
  }));
  const top5 = Object.entries(prodCount).sort((a,b) => b[1]-a[1]).slice(0,5);

  // Últimos 7 dias
  const last7 = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7[d.toISOString().split("T")[0]] = 0;
  }
  sales.forEach(s => {
    const d = (s.date || "").split("T")[0];
    if (d && last7[d] !== undefined) last7[d] += s.total||0;
  });
  const maxBar = Math.max(...Object.values(last7), 1);

  // Por funcionário — resolve nomes
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u.name; });

  // Monta HTML
  let html = "";

  // KPIs
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">`;
  html += `<div class="stat-card" style="border-left:3px solid #16a34a">
    <div class="stat-label" style="color:#16a34a">Vendas Hoje</div>
    <div class="stat-val" style="color:#16a34a;font-size:15px">${fmt(totalToday)}</div>
    <div style="font-size:11px;color:#71717a;margin-top:2px">${todaySales.length} transações</div>
  </div>`;
  html += `<div class="stat-card" style="border-left:3px solid #5b21b6">
    <div class="stat-label" style="color:#5b21b6">Vendas Mês</div>
    <div class="stat-val" style="color:#5b21b6;font-size:15px">${fmt(totalMonth)}</div>
    <div style="font-size:11px;color:#71717a;margin-top:2px">${thisMonth}</div>
  </div>`;
  html += `<div class="stat-card" style="border-left:3px solid #dc2626">
    <div class="stat-label" style="color:#dc2626">Stock Crítico</div>
    <div class="stat-val" style="color:#dc2626">${zeroStock.length}</div>
    <div style="font-size:11px;color:#d97706;margin-top:2px">${lowStock.length} em baixo stock</div>
  </div>`;
  html += `<div class="stat-card" style="border-left:3px solid #d97706">
    <div class="stat-label" style="color:#d97706">Fiado Aberto</div>
    <div class="stat-val" style="color:#d97706;font-size:14px">${fmt(fiadoTotal)}</div>
    <div style="font-size:11px;color:#71717a;margin-top:2px">${openFiados.length} clientes</div>
  </div>`;
  html += `</div>`;

  // Gráfico 7 dias
  html += `<div class="vender-card" style="margin-bottom:10px">
    <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;
                letter-spacing:.4px;margin-bottom:12px">Últimos 7 dias</div>
    <div style="display:flex;align-items:flex-end;gap:4px;height:80px">`;
  Object.entries(last7).forEach(([d, v]) => {
    const pct   = Math.max(6, Math.round((v/maxBar)*100));
    const label = d.slice(5).replace("-","/");
    const isToday = d === td;
    html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="font-size:8px;color:#71717a;text-align:center">${v>0?fmt(v).split(" ")[0]:""}</div>
      <div style="width:100%;background:${isToday?"#5b21b6":"#ddd6fe"};border-radius:4px 4px 0 0;height:${pct}%"></div>
      <div style="font-size:9px;color:${isToday?"#5b21b6":"#71717a"};font-weight:${isToday?"700":"400"}">${label}</div>
    </div>`;
  });
  html += `</div></div>`;

  // Vendas por funcionário hoje
  if (Object.keys(byUser).length > 0) {
    html += `<div class="vender-card" style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:10px">Vendas hoje por funcionário</div>`;
    Object.entries(byUser).forEach(([uid, data]) => {
      const name = userMap[Number(uid)] || "Utilizador #"+uid;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;
                           padding:8px 0;border-bottom:1px solid #f4f4f5">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:30px;height:30px;border-radius:50%;background:#ede9fe;color:#5b21b6;
                      font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center">
            ${name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-size:13px;font-weight:600">${name}</div>
            <div style="font-size:11px;color:#71717a">${data.count} venda(s)</div>
          </div>
        </div>
        <div style="font-size:14px;font-weight:700;color:#16a34a">${fmt(data.total)}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // Top produtos
  if (top5.length > 0) {
    html += `<div class="vender-card" style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:10px">Top 5 produtos mais vendidos</div>`;
    top5.forEach(([name, qty], i) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;
                           padding:8px 0;border-bottom:1px solid #f4f4f5">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:22px;height:22px;border-radius:50%;background:#ede9fe;color:#5b21b6;
                      font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">
            ${i+1}
          </div>
          <div style="font-size:13px;font-weight:600">${name}</div>
        </div>
        <div style="font-size:13px;font-weight:700;color:#5b21b6">${qty} un</div>
      </div>`;
    });
    html += `</div>`;
  }

  // Esgotados
  if (zeroStock.length > 0) {
    html += `<div class="vender-card" style="border-left:3px solid #dc2626;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:10px">⚠ Produtos esgotados</div>`;
    zeroStock.slice(0,5).forEach(p => {
      html += `<div style="display:flex;justify-content:space-between;padding:6px 0;
                           border-bottom:1px solid #f4f4f5;font-size:13px">
        <span>${p.name}</span>
        <span style="color:#dc2626;font-weight:700">0 ${p.unit}</span>
      </div>`;
    });
    if (zeroStock.length > 5) html += `<div style="font-size:11px;color:#71717a;margin-top:6px">+${zeroStock.length-5} mais</div>`;
    html += `</div>`;
  }

  elD.innerHTML = html;
  refreshIcons(elD);
}
