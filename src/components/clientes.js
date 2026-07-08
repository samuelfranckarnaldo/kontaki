import { db } from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import "./fiados.js";
import { isOverdue } from "./fiados.js";

let fiadosFilter = "all";

export async function initClientesTab() {
  document.querySelectorAll("#ct-tabbar .ct-tab").forEach(btn => {
    btn.onclick = () => switchCtTab(btn.dataset.tab);
  });
  window._openClienteForm = openClienteForm;
  window._refreshClientesTab = () => switchCtTab(getActiveTab());
  switchCtTab("geral");
}

function getActiveTab() {
  const active = document.querySelector("#ct-tabbar .ct-tab.active");
  return active ? active.dataset.tab : "geral";
}

function switchCtTab(tab) {
  document.querySelectorAll("#ct-tabbar .ct-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("ct-panel-geral").style.display    = tab === "geral"    ? "block" : "none";
  document.getElementById("ct-panel-clientes").style.display = tab === "clientes" ? "block" : "none";
  document.getElementById("ct-panel-fiados").style.display   = tab === "fiados"   ? "block" : "none";

  if (tab === "geral")    renderGeral();
  if (tab === "clientes") renderClientesList();
  if (tab === "fiados")   renderFiadosList();
}
window._switchCtTab = switchCtTab;

// ── VISÃO GERAL ───────────────────────────────────────────────────────────────
async function renderGeral() {
  const [clients, fiados] = await Promise.all([db.getAll("clients"), db.getAll("fiado")]);

  const enriched = clients.map(c => {
    const myFiados = fiados.filter(f =>
      (f.clientName || "").toLowerCase() === (c.name || "").toLowerCase());
    const open = myFiados.filter(f => f.status === "open");
    const totalOpen = open.reduce((a, f) => a + (f.amount || 0), 0);
    const overdue = open.some(isOverdue);
    return { client: c, totalOpen, overdue };
  });

  const totalReceber = enriched.reduce((a, e) => a + e.totalOpen, 0);
  const overdueList = enriched.filter(e => e.overdue);
  const overdueTotal = overdueList.reduce((a, e) => a + e.totalOpen, 0);
  const clientesComDivida = enriched.filter(e => e.totalOpen > 0).length;
  const top3 = [...enriched].filter(e => e.totalOpen > 0)
    .sort((a, b) => b.totalOpen - a.totalOpen).slice(0, 3);

  const panel = el("ct-panel-geral");
  panel.innerHTML =
    `<div class="fiados-hero">
      <div class="fiados-hero-label">Total a receber</div>
      <div class="fiados-hero-val">${fmt(totalReceber)}</div>
      ${overdueTotal > 0 ? `<div class="ct-hero-badge">${fmt(overdueTotal)} atrasados</div>` : ""}
      <div class="fiados-hero-sub">
        <span>${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}</span>
        <span>·</span>
        <span>${clientesComDivida} com dívida</span>
      </div>
    </div>

    <div class="ct-stat-row">
      <div class="ct-stat-card ct-stat-danger">
        <div class="stat-label">Atrasados</div>
        <div class="stat-val" style="color:var(--danger)">${overdueList.length}</div>
      </div>
      <div class="ct-stat-card ct-stat-primary">
        <div class="stat-label">Total clientes</div>
        <div class="stat-val" style="color:var(--primary)">${clients.length}</div>
      </div>
    </div>

    <div class="ct-section-label">Maiores dívidas</div>
    ${top3.length === 0
      ? `<div class="empty-state" style="padding:24px 12px">
          <i data-lucide="check-circle"></i>
          <div class="empty-state-title">Nenhuma dívida em aberto</div>
        </div>`
      : `<div class="list-card">
          ${top3.map(({ client: c, totalOpen, overdue }) => `
            <div class="ct-devedor-row" onclick="window._openClienteProfile(${c.id})">
              <div class="fc-row-avatar" style="background:${overdue ? "var(--danger-light);color:var(--danger)" : "var(--warning-light);color:var(--warning)"}">
                ${(c.name||"?").charAt(0).toUpperCase()}
              </div>
              <div class="fc-row-info">
                <div class="fc-row-name">${c.name}</div>
                ${overdue ? `<div class="fc-badge-overdue">Atrasado</div>` : ""}
              </div>
              <div class="fc-row-val ${overdue ? "overdue" : ""}">${fmt(totalOpen)}</div>
            </div>`).join("")}
        </div>`
    }`;
  refreshIcons(panel);
}

// ── ABA CLIENTES ──────────────────────────────────────────────────────────────
async function renderClientesList() {
  const search = el("clientes-search");
  if (search && !search.oninput) search.oninput = renderClientesList;

  const [clients, sales, fiados] = await Promise.all([
    db.getAll("clients"), db.getAll("sales"), db.getAll("fiado"),
  ]);
  const q = (search ? search.value : "").toLowerCase();

  const filtered = clients
    .filter(c => (c.name||"").toLowerCase().includes(q) || (c.phone||"").includes(q))
    .sort((a,b) => (a.name||"").localeCompare(b.name||""));

  const listEl = el("clientes-list");
  listEl.innerHTML = "";

  if (!filtered.length) {
    listEl.innerHTML =
      `<div class="empty-state">
        <i data-lucide="users"></i>
        <div class="empty-state-title">${clients.length === 0 ? "Nenhum cliente" : "Sem resultados"}</div>
        <div class="empty-state-sub">${clients.length === 0
          ? "Toca em + para adicionar o teu primeiro cliente."
          : "Tenta pesquisar por outro nome ou telefone."}</div>
      </div>`;
    refreshIcons(listEl);
    return;
  }

  filtered.forEach(c => {
    const mySales  = sales.filter(s => s.clientId===c.id || (s.clientName||"").toLowerCase()===c.name.toLowerCase());
    const myFiados = fiados.filter(f => f.clientId===c.id || (f.clientName||"").toLowerCase()===c.name.toLowerCase());
    const fiadoAberto = myFiados.filter(f => f.status==="open").reduce((a,f) => a+(f.amount||0), 0);
    const overdue = myFiados.filter(f => f.status==="open").some(isOverdue);

    const row = document.createElement("div");
    row.className = "fc-row";
    row.onclick = () => window._openClienteProfile(c.id);
    row.innerHTML =
      `<div class="fc-row-avatar" style="background:${overdue ? "var(--danger-light);color:var(--danger)" : "var(--primary-light);color:var(--primary)"}">
        ${c.name.charAt(0).toUpperCase()}
      </div>
      <div class="fc-row-info">
        <div class="fc-row-name">${c.name}</div>
        <div class="fc-row-meta">${c.phone || "sem telefone"} · ${mySales.length} ${mySales.length===1?"compra":"compras"}</div>
      </div>
      <div class="fc-row-right">
        ${fiadoAberto > 0
          ? `<div class="fc-row-val ${overdue?"overdue":""}">${fmt(fiadoAberto)}</div><div class="fc-row-sub">${overdue?"Atrasado":"Pendente"}</div>`
          : `<div class="fc-row-saldo"><i data-lucide="check-circle" style="width:13px;height:13px"></i> Em dia</div>`
        }
      </div>`;
    listEl.appendChild(row);
  });

  refreshIcons(listEl);
}

function openClienteForm(c) {
  c = c || {};
  openModal(c.id ? "Editar Cliente" : "Novo Cliente",
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label>Nome *</label>
        <input id="cl-name" value="${c.name||""}" placeholder="Ex: Maria Silva" autocomplete="off"/></div>
      <div class="field"><label>Telefone</label>
        <input id="cl-phone" value="${c.phone||""}" type="tel" placeholder="923 000 000"/></div>
      <div class="field"><label>Endereço</label>
        <input id="cl-addr" value="${c.address||""}" placeholder="Bairro, rua..."/></div>
      <div class="field"><label>Notas</label>
        <input id="cl-notes" value="${c.notes||""}" placeholder="Informações adicionais..."/></div>
    </div>
    <div class="form-actions" style="margin-top:16px">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._saveCliente(${c.id||0})">
        <i data-lucide="save"></i> Guardar</button>
    </div>`);
  refreshIcons(el("modal-box"));
}

window._saveCliente = async (id) => {
  const name = (el("cl-name")?.value || "").trim();
  if (!name) { toast("O nome é obrigatório.", "error"); return; }
  const data = {
    name,
    phone:   (el("cl-phone")?.value  || "").trim(),
    address: (el("cl-addr")?.value   || "").trim(),
    notes:   (el("cl-notes")?.value  || "").trim(),
  };
  let savedId = id;
  if (id) {
    const ex = await db.get("clients", id);
    await db.put("clients", { ...ex, ...data });
    toast("Cliente actualizado.", "success");
  } else {
    savedId = await db.add("clients", { ...data, createdAt: new Date().toISOString() });
    toast("Cliente adicionado.", "success");
  }
  closeModal();
  const active = getActiveTab();
  if (document.getElementById("cliente-profile-overlay") && id) {
    window._openClienteProfile(id);
  } else {
    switchCtTab(active);
  }
};

// ── ABA FIADOS (agrupado por cliente, ação direta na linha) ───────────────────
async function renderFiadosList() {
  const search = el("fiados-search");
  if (search && !search.oninput) search.oninput = renderFiadosList;
  document.querySelectorAll("#fiados-filter-pills .pill").forEach(btn => {
    if (!btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        fiadosFilter = btn.dataset.filter;
        document.querySelectorAll("#fiados-filter-pills .pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderFiadosList();
      });
    }
  });

  const [all, clients] = await Promise.all([db.getAll("fiado"), db.getAll("clients")]);
  const open = all.filter(f => f.status === "open");
  const total = open.reduce((a, f) => a + (f.amount || 0), 0);
  const uniqueClients = [...new Set(open.map(f => f.clientName))].length;

  el("fiados-total-bar").innerHTML =
    `<div class="ct-inline-summary">
      <span class="ct-inline-val">${fmt(total)}</span>
      <span class="ct-inline-label">em aberto</span>
      <span>·</span>
      <span>${uniqueClients} ${uniqueClients===1?"cliente":"clientes"}</span>
    </div>`;

  const q = (search ? search.value : "").toLowerCase();
  const filtered = all.filter(f => {
    const ms = (f.clientName || "").toLowerCase().includes(q);
    let mf = fiadosFilter === "all" || f.status === fiadosFilter;
    if (fiadosFilter === "debt")  mf = f.status === "open";
    if (fiadosFilter === "clean") mf = f.status === "paid";
    return ms && mf;
  });

  const grouped = {};
  filtered.forEach(f => {
    const k = f.clientName;
    if (!grouped[k]) grouped[k] = { clientName: k, entries: [], totalOpen: 0 };
    grouped[k].entries.push(f);
    if (f.status === "open") grouped[k].totalOpen += f.amount || 0;
  });
  const groups = Object.values(grouped).sort((a,b) => b.totalOpen - a.totalOpen);

  const listEl = el("fiados-list");
  listEl.innerHTML = "";

  if (!groups.length) {
    listEl.innerHTML =
      `<div class="empty-state">
        <i data-lucide="wallet"></i>
        <div class="empty-state-title">Nenhum fiado</div>
        <div class="empty-state-sub">Os fiados registados aparecem aqui.</div>
      </div>`;
    refreshIcons(listEl);
    return;
  }

  groups.forEach(g => {
    const isSaldado = g.totalOpen === 0;
    const openCount = g.entries.filter(e => e.status === "open").length;
    const firstOpen = g.entries.find(e => e.status === "open");
    const groupOverdue = g.entries.some(isOverdue);
    const matchClient = clients.find(c => (c.name||"").toLowerCase() === g.clientName.toLowerCase());

    let avatarStyle;
    if (isSaldado) avatarStyle = "background:var(--success-light);color:var(--success)";
    else if (groupOverdue) avatarStyle = "background:var(--danger-light);color:var(--danger)";
    else avatarStyle = "background:var(--primary-light);color:var(--primary)";

    const row = document.createElement("div");
    row.className = "fc-row";
    row.onclick = () => {
      if (matchClient) window._openClienteProfile(matchClient.id);
      else if (firstOpen) window._openPayModal(firstOpen.id);
    };

    row.innerHTML =
      `<div class="fc-row-avatar" style="${avatarStyle}">${g.clientName.charAt(0).toUpperCase()}</div>
       <div class="fc-row-info">
         <div class="fc-row-name">${g.clientName}${!matchClient ? ' <span class="ct-nocliente-tag">sem ficha</span>' : ""}</div>
         <div class="fc-row-meta">${g.entries.length} ${g.entries.length===1?"entrada":"entradas"}</div>
       </div>
       <div class="fc-row-right">
         ${isSaldado
           ? `<div class="fc-row-saldo"><i data-lucide="check-circle" style="width:13px;height:13px"></i> Saldado</div>`
           : `<div class="fc-row-val ${groupOverdue?"overdue":""}">${fmt(g.totalOpen)}</div>
              ${openCount === 1
                ? `<div class="fc-row-action" onclick="event.stopPropagation();window._openPayModal(${firstOpen.id})">Receber →</div>`
                : `<div class="fc-row-action">${openCount} por pagar →</div>`
              }`
         }
       </div>`;
    listEl.appendChild(row);
  });

  refreshIcons(listEl);
}

// ── FICHA DO CLIENTE — página cheia (overlay), não modal ──────────────────────
function renderComprasPanel(mySales) {
  if (!mySales.length) return `<div style="text-align:center;color:var(--text4);font-size:13px;padding:24px">Sem compras registadas</div>`;
  return mySales.slice(0,30).map(s => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border2)">
      <div>
        <div style="font-size:13px;font-weight:600">Compra</div>
        <div style="font-size:11px;color:var(--text4)">${fmtDate(s.date)} · ${(s.items||[]).length} item(s) · ${s.payMethod||""}</div>
      </div>
      <div style="font-size:14px;font-weight:700;color:var(--primary)">${fmt(s.total)}</div>
    </div>`).join("");
}

function renderFiadosPanel(myFiados, clientName) {
  const open = myFiados.filter(f => f.status === "open");
  const totalOpen = open.reduce((a, f) => a + (f.amount || 0), 0);
  const sorted = [...myFiados].sort((a,b) => new Date(b.date) - new Date(a.date));

  const actions =
    (totalOpen > 0
      ? `<button class="btn btn-success btn-full btn-sm" style="margin-bottom:8px" onclick="window._confirmReceiveAll('${encodeURIComponent(clientName)}',${totalOpen})">
           <i data-lucide="check-check"></i> Receber tudo (${fmt(totalOpen)})
         </button>` : ""
    ) +
    `<button class="btn btn-outline btn-full btn-sm" style="margin-bottom:14px" onclick="window._openFiadoAdd('${clientName.replace(/'/g,"\\'")}')">
       <i data-lucide="plus"></i> Registar novo fiado
     </button>`;

  const list = !sorted.length
    ? `<div style="text-align:center;color:var(--text4);font-size:13px;padding:24px">Sem fiados registados</div>`
    : sorted.slice(0,30).map(f => {
        const overdue = isOverdue(f);
        const color = f.status === "paid" ? "var(--success)" : (overdue ? "var(--danger)" : "var(--warning)");
        const label = f.status === "paid" ? "Pagamento recebido" : "Fiado";
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border2)">
          <div>
            <div style="font-size:13px;font-weight:600">${label}${overdue ? ' <span class="fc-badge-overdue">Atrasado</span>' : ""}</div>
            <div style="font-size:11px;color:var(--text4)">${fmtDate(f.date)}${f.notes ? " · " + f.notes : ""}${f.dueDate ? " · vence " + fmtDate(f.dueDate) : ""}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="font-size:14px;font-weight:700;color:${color}">${fmt(f.amount)}</div>
            ${f.status === "open" ? `
              <button class="fc-icon-btn" onclick="window._openEditFiado(${f.id})" title="Editar">
                <i data-lucide="pencil" style="width:13px;height:13px"></i>
              </button>
              <button class="btn btn-outline btn-sm" style="padding:6px 10px" onclick="window._openPayModal(${f.id})">Receber</button>
            ` : ""}
          </div>
        </div>`;
      }).join("");

  return actions + `<div style="border:1px solid var(--border2);border-radius:12px;overflow:hidden">${list}</div>`;
}

function switchProfileTab(tab) {
  document.querySelectorAll("#cliente-profile-overlay .fc-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("cp-panel-compras").style.display = tab === "compras" ? "block" : "none";
  document.getElementById("cp-panel-fiados").style.display  = tab === "fiados"  ? "block" : "none";
}
window._switchProfileTab = switchProfileTab;

window._closeClienteProfile = () => {
  const ov = document.getElementById("cliente-profile-overlay");
  if (ov) ov.remove();
  document.body.style.overflow = "";
  switchCtTab(getActiveTab());
};

window._openClienteProfile = async (id) => {
  const c = await db.get("clients", id);
  if (!c) { toast("Cliente não encontrado.", "error"); return; }

  const [sales, fiados] = await Promise.all([db.getAll("sales"), db.getAll("fiado")]);
  const mySales  = sales.filter(s => s.clientId===c.id || (s.clientName||"").toLowerCase()===c.name.toLowerCase())
                        .sort((a,b) => new Date(b.date) - new Date(a.date));
  const myFiados = fiados.filter(f => f.clientId===c.id || (f.clientName||"").toLowerCase()===c.name.toLowerCase());
  const openFiados = myFiados.filter(f => f.status === "open");
  const totalGasto  = mySales.reduce((a,s) => a + ((s.total||0) - (s.totalDevolvido||0)), 0);
  const fiadoAberto = openFiados.reduce((a,f) => a + (f.amount||0), 0);

  let ov = document.getElementById("cliente-profile-overlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "cliente-profile-overlay";
    ov.className = "ct-profile-overlay";
    document.body.appendChild(ov);
  }
  document.body.style.overflow = "hidden";

  ov.innerHTML =
    `<div class="ct-profile-header">
      <button class="ct-profile-back" onclick="window._closeClienteProfile()">
        <i data-lucide="arrow-left"></i>
      </button>
      <div class="ct-profile-header-title">${c.name}</div>
      <button class="ct-profile-back" onclick="window._openClienteForm(${JSON.stringify(c).replace(/"/g,"&quot;")})">
        <i data-lucide="edit-3"></i>
      </button>
    </div>
    <div class="ct-profile-body">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
        <div style="width:60px;height:60px;border-radius:18px;background:var(--primary-light);color:var(--primary);
          font-size:24px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${c.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-size:19px;font-weight:700">${c.name}</div>
          ${c.phone ? `<div style="font-size:13px;color:var(--text3);margin-top:2px">${c.phone}</div>` : ""}
          ${c.address ? `<div style="font-size:12px;color:var(--text3)">${c.address}</div>` : ""}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">
        <div class="stat-card" style="text-align:center">
          <div class="stat-label">Compras</div>
          <div class="stat-val" style="color:var(--primary);font-size:20px">${mySales.length}</div>
        </div>
        <div class="stat-card" style="text-align:center">
          <div class="stat-label">Total gasto</div>
          <div class="stat-val" style="color:var(--success);font-size:14px">${fmt(totalGasto)}</div>
        </div>
        <div class="stat-card" style="text-align:center">
          <div class="stat-label">Fiado</div>
          <div class="stat-val" style="color:${fiadoAberto>0?"var(--warning)":"var(--success)"};font-size:14px">${fmt(fiadoAberto)}</div>
        </div>
      </div>

      <div class="fc-tabbar">
        <button class="fc-tab active" data-tab="compras" onclick="window._switchProfileTab('compras')">Compras</button>
        <button class="fc-tab" data-tab="fiados" onclick="window._switchProfileTab('fiados')">
          Fiados${fiadoAberto > 0 ? `<span class="fc-tab-dot"></span>` : ""}
        </button>
      </div>

      <div id="cp-panel-compras" class="fc-tab-panel" style="display:block;max-height:none">
        ${renderComprasPanel(mySales)}
      </div>
      <div id="cp-panel-fiados" class="fc-tab-panel" style="display:none;max-height:none">
        ${renderFiadosPanel(myFiados, c.name)}
      </div>
    </div>`;
  refreshIcons(ov);
};

window._closeModal = closeModal;
