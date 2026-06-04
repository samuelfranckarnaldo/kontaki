import { db } from "../db.js";
import { fmt, fmtDate, today, el, val, setVal, refreshIcons } from "../utils.js";
import { openModal, closeModal } from "../modal.js";
import { getUser } from "../auth.js";

export async function initHistorico() {
  setVal("hist-from", today());
  setVal("hist-to",   today());
  el("btn-hist-filter").onclick = loadData;
  await loadData();
}

async function loadData() {
  const from  = val("hist-from");
  const to    = val("hist-to");
  const sales = await db.getAll("sales");

  const filtered = sales
    .filter(s => { const d = (s.date || "").split("T")[0]; return d >= from && d <= to; })
    .reverse();

  const total   = filtered.reduce((a,s) => a+(s.total||0), 0);
  const byM     = filtered.reduce((acc,s) => { acc[s.payMethod]=(acc[s.payMethod]||0)+s.total; return acc; }, {});
  const byUser  = filtered.reduce((acc,s) => { const k=s.userId||"?"; acc[k]=(acc[k]||0)+s.total; return acc; }, {});

  // Stats
  el("historico-stats").innerHTML =
    `<div class="stat-card" style="border-left:3px solid #16a34a">
      <div class="stat-label" style="color:#16a34a">Total período</div>
      <div class="stat-val" style="color:#16a34a;font-size:16px">${fmt(total)}</div>
    </div>` +
    `<div class="stat-card" style="border-left:3px solid #5b21b6">
      <div class="stat-label" style="color:#5b21b6">Nº vendas</div>
      <div class="stat-val" style="color:#5b21b6">${filtered.length}</div>
    </div>` +
    Object.entries(byM).map(([m,v]) =>
      `<div class="stat-card" style="border-left:3px solid #2563eb">
        <div class="stat-label" style="color:#2563eb">${m}</div>
        <div class="stat-val" style="font-size:14px">${fmt(v)}</div>
      </div>`
    ).join("");

  // Gráfico simples de barras por dia
  if (filtered.length > 0) {
    const byDay = {};
    filtered.forEach(s => {
      const d = (s.date || "").split("T")[0];
      byDay[d] = (byDay[d]||0) + s.total;
    });
    const days  = Object.keys(byDay).sort();
    const maxV  = Math.max(...Object.values(byDay));
    el("historico-chart").style.display = "block";
    el("historico-chart").innerHTML =
      `<div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;
                   letter-spacing:.4px;margin-bottom:10px">Vendas por dia</div>` +
      `<div style="display:flex;align-items:flex-end;gap:4px;height:80px">` +
      days.map(d => {
        const pct = maxV > 0 ? Math.max(8, Math.round((byDay[d]/maxV)*100)) : 8;
        const label = d.slice(5); // MM-DD
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="font-size:9px;color:#71717a">${fmt(byDay[d]).split(" ")[0]}</div>
          <div style="width:100%;background:#5b21b6;border-radius:4px 4px 0 0;height:${pct}%"></div>
          <div style="font-size:9px;color:#71717a;white-space:nowrap">${label}</div>
        </div>`;
      }).join("") +
      `</div>`;
  } else {
    el("historico-chart").style.display = "none";
  }

  // Lista
  if (!filtered.length) {
    el("historico-list").innerHTML =
      `<div class="empty-state">
        <i data-lucide="clock" style="width:36px;height:36px;color:#a1a1aa;margin-bottom:10px"></i>
        <div class="empty-state-title">Sem vendas no período</div>
        <div class="empty-state-sub">Ajusta o intervalo de datas.</div>
      </div>`;
    refreshIcons(el("historico-list")); return;
  }

  el("historico-list").innerHTML = filtered.map(s =>
    `<div class="historico-item" onclick="window._openSaleDetail(${s.id})">
      <div>
        <div class="historico-id">Venda #${s.id}</div>
        <div class="historico-meta">
          ${fmtDate(s.date)} · ${(s.items?s.items.length:undefined)||0} item(s) · ${s.payMethod}
          ${s.clientName ? " · "+s.clientName : ""}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="historico-total">${fmt(s.total)}</div>
        ${s.discount>0 ? `<div style="font-size:11px;color:#dc2626">-${fmt(s.discount)} desc.</div>` : ""}
      </div>
    </div>`
  ).join("");

  refreshIcons(el("historico-list"));

  // Exportar CSV
  el("btn-export-csv").style.display = "block";
  el("btn-export-csv").onclick = () => exportCSV(filtered);
}

window._openSaleDetail = async (id) => {
  const s = await db.get("sales", id);
  if (!s) return;
  const store = (await db.get("settings","store")) || {};
  const hash  = s.hash || "N/A";
  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=" +
    encodeURIComponent("KONTAKI|VENDA#"+s.id+"|"+fmt(s.total)+"|"+fmtDate(s.date)+"|"+hash);

  openModal("Venda #"+s.id,
    `<div style="background:#f4f4f5;border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-size:11px;color:#a1a1aa;font-weight:700;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:8px">Detalhes</div>
      ${[
        ["Data",       fmtDate(s.date)],
        ["Pagamento",  s.payMethod],
        ["Subtotal",   fmt(s.subtotal||s.total)],
        ...(s.discount>0 ? [["Desconto", "- "+fmt(s.discount)]] : []),
        ["Total",      fmt(s.total)],
        ...(s.clientName  ? [["Cliente",  s.clientName]]  : []),
        ...(s.clientPhone ? [["Telefone", s.clientPhone]] : []),
      ].map(([k,v]) =>
        `<div style="display:flex;justify-content:space-between;padding:6px 0;
                     border-bottom:1px solid #e4e4e7;font-size:13px">
          <span style="color:#71717a">${k}</span>
          <span style="font-weight:600">${v}</span>
        </div>`
      ).join("")}
    </div>
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:#a1a1aa;font-weight:700;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:8px">Produtos</div>
      ${(s.items||[]).map(i =>
        `<div style="display:flex;justify-content:space-between;padding:6px 0;
                     border-bottom:1px solid #f4f4f5;font-size:13px">
          <span>${i.name} <span style="color:#a1a1aa">×${i.qty}</span></span>
          <span style="font-weight:600">${fmt(i.price*i.qty*(1-(i.itemDisc||0)/100))}</span>
        </div>`
      ).join("")}
    </div>
    <div style="text-align:center;margin-bottom:14px">
      <img src="${qrUrl}" style="width:80px;height:80px;border-radius:8px"/>
      <div style="font-size:10px;color:#a1a1aa;margin-top:4px">Código: ${hash}</div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>
      <button class="btn btn-primary btn-full" onclick="window._reimprimirVenda(${s.id})">
        <i data-lucide="printer"></i> Reimprimir
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._reimprimirVenda = async (id) => {
  const s     = await db.get("sales", id);
  const store = (await db.get("settings","store")) || {};
  const hash  = s.hash || "N/A";
  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=" +
    encodeURIComponent("KONTAKI|VENDA#"+s.id+"|"+fmt(s.total)+"|"+fmtDate(s.date)+"|"+hash);

  const content =
    `<div style="font-family:monospace;max-width:300px;margin:0 auto;font-size:13px;line-height:1.6">
      <div style="text-align:center;border-bottom:2px dashed #ccc;padding-bottom:10px;margin-bottom:10px">
        <div style="font-size:16px;font-weight:700">${store.name||"Kontaki"}</div>
        ${store.address?`<div style="font-size:11px">${store.address}</div>`:""}
        ${store.phone?`<div style="font-size:11px">${store.phone}</div>`:""}
        <div style="font-size:11px;color:#777">Recibo Nº ${s.id} · ${fmtDate(s.date)}</div>
      </div>
      ${(s.items||[]).map(i =>
        `<div style="display:flex;justify-content:space-between">
          <span>${i.name} x${i.qty}</span>
          <span>${fmt(i.price*i.qty*(1-(i.itemDisc||0)/100))}</span>
        </div>`
      ).join("")}
      <div style="border-top:2px dashed #ccc;margin-top:8px;padding-top:8px">
        ${s.discount>0?`<div style="display:flex;justify-content:space-between"><span>Desconto</span><span>- ${fmt(s.discount)}</span></div>`:""}
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px">
          <span>TOTAL</span><span>${fmt(s.total)}</span>
        </div>
        <div style="font-size:11px;color:#555">Pagamento: ${s.payMethod}</div>
      </div>
      <div style="text-align:center;margin-top:10px">
        <img src="${qrUrl}" style="width:80px;height:80px"/>
        <div style="font-size:10px;color:#777">Código: ${hash}</div>
      </div>
      <div style="border-top:1px dashed #ccc;margin-top:10px;padding-top:8px;
                  text-align:center;font-size:10px;color:#888">
        <div>Powered by Kontaki · Introxeer Technology</div>
        <div>Documento de gestão interna. Sem validade fiscal.</div>
      </div>
    </div>`;

  const win = window.open("","_blank");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Recibo #${s.id}</title>
    <style>body{margin:20px}@media print{body{margin:0}}</style></head>
    <body>${content}<script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
  win.document.close();
  closeModal();
};

function exportCSV(sales) {
  const header = "ID,Data,Cliente,Pagamento,Subtotal,Desconto,Total,Itens";
  const rows   = sales.map(s =>
    `${s.id},"${fmtDate(s.date)}","${s.clientName||""}","${s.payMethod}",${s.subtotal||s.total},${s.discount||0},${s.total},"${(s.items||[]).map(i=>i.name+"x"+i.qty).join("|")}"`
  );
  const csv  = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "vendas_kontaki.csv";
  a.click();
  URL.revokeObjectURL(url);
}

window._closeModal = closeModal;
