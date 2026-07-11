import { db } from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import "./fiados.js";
import { isOverdue, daysOverdue, waLink } from "./fiados.js";
import { payIcon, payColor, payLabel, payClass } from "./historico.js";

let fiadosFilter = "all";

const CT_MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function formatMonthYear(iso) {
  const d = new Date(iso);
  return CT_MONTHS[d.getMonth()] + " de " + d.getFullYear();
}

function formatPhone(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 9) return digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  return phone;
}

function sizeMod(baseClass, val) {
  const len = String(val).length;
  if (len > 13) return " " + baseClass + "--xs";
  if (len > 9)  return " " + baseClass + "--sm";
  return "";
}

export async function initClientesTab() {
  document.querySelectorAll("#ct-tabbar .ct-tab").forEach(btn => {
    btn.onclick = () => switchCtTab(btn.dataset.tab);
  });
  window._openClienteForm = openClienteForm;
  window._refreshClientesTab = () => {
    const tab = getActiveTab();
    if (tab === "geral")    renderGeral(false);
    if (tab === "clientes") renderClientesList(false);
    if (tab === "fiados")   renderFiadosList(false);
    updateTopbarAddVisibility(tab);
  };
  window._ctTopbarAdd = ctTopbarAdd;
  switchCtTab("geral");
}

function getActiveTab() {
  const active = document.querySelector("#ct-tabbar .ct-tab.active");
  return active ? active.dataset.tab : "geral";
}

function ctTopbarAdd() {
  const tab = getActiveTab();
  if (tab === "clientes") { window._openClienteForm(); return; }
  if (tab === "fiados")   { window._openFiadoAdd(); return; }
}

function updateTopbarAddVisibility(tab) {
  const addBtn = document.getElementById("btn-topbar-add");
  if (!addBtn) return;
  addBtn.style.display = tab === "geral" ? "none" : "flex";
}

function fadeSwitch(showEl, hideEls) {
  hideEls.forEach(e => { if (e) { e.style.display = "none"; e.classList.remove("ct-fade-in"); } });
  if (showEl) {
    showEl.style.display = "block";
    showEl.classList.remove("ct-fade-in");
    void showEl.offsetWidth;
    requestAnimationFrame(() => showEl.classList.add("ct-fade-in"));
  }
}

function switchCtTab(tab) {
  document.querySelectorAll("#ct-tabbar .ct-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const panels = {
    geral:    document.getElementById("ct-panel-geral"),
    clientes: document.getElementById("ct-panel-clientes"),
    fiados:   document.getElementById("ct-panel-fiados"),
  };
  fadeSwitch(panels[tab], Object.keys(panels).filter(k => k !== tab).map(k => panels[k]));

  if (tab === "geral")    renderGeral(true);
  if (tab === "clientes") renderClientesList(true);
  if (tab === "fiados")   renderFiadosList(true);
  updateTopbarAddVisibility(tab);
}
window._switchCtTab = switchCtTab;

// ── Risco do cliente (baseado só no atraso atual, sem inventar dados) ─────────
function computeRisk(myFiados) {
  const openEntries = myFiados.filter(f => f.status === "open");
  const overdueEntries = openEntries.filter(isOverdue);
  const paidEntries = myFiados.filter(f => f.status === "paid");
  const trackedPaid = paidEntries.filter(f => typeof f.paidLate === "boolean");
  const lateHistory = trackedPaid.filter(f => f.paidLate);
  const lateRate = trackedPaid.length ? lateHistory.length / trackedPaid.length : 0;

  if (overdueEntries.length) {
    const maxDays = overdueEntries.reduce((m, e) => Math.max(m, daysOverdue(e)), 0);
    if (maxDays >= 7) return { icon: "alert-octagon", label: "Em atraso", color: "var(--danger-muted)", bg: "var(--danger-muted-light)" };
    return { icon: "alert-triangle", label: "Atenção", color: "var(--warning-muted)", bg: "var(--warning-muted-light)" };
  }
  if (trackedPaid.length === 0) {
    return { icon: "circle-dashed", label: "Sem histórico", color: "var(--text3)", bg: "var(--border)" };
  }
  if (lateRate === 0) {
    return { icon: "award", label: "Excelente", color: "var(--success)", bg: "var(--success-light)" };
  }
  if (lateRate < 0.34) {
    return { icon: "check-circle", label: "Bom pagador", color: "var(--success)", bg: "var(--success-light)" };
  }
  return { icon: "alert-triangle", label: "Atenção", color: "var(--warning-muted)", bg: "var(--warning-muted-light)" };
}

// ── VISÃO GERAL ───────────────────────────────────────────────────────────────
function minDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ctSkeletonRow() {
  return '<div class="fc-row hist-skel">' +
    '<div class="skel-circle"></div>' +
    '<div style="flex:1"><div class="skel-line skel-line--title"></div><div class="skel-line skel-line--sub"></div></div>' +
    '<div class="skel-line skel-line--price"></div>' +
    '</div>';
}

function ctSkeletonStat() {
  return '<div class="ct-stat-card hist-skel"><div class="skel-line skel-line--label"></div><div class="skel-line skel-line--val"></div></div>';
}

function ctSkeletonGeral() {
  return '<div class="fiados-hero hist-skel"><div class="skel-line skel-line--label"></div><div class="skel-line skel-line--hero"></div></div>' +
    '<div class="ct-stat-row">' + ctSkeletonStat() + ctSkeletonStat() + ctSkeletonStat() + ctSkeletonStat() + '</div>';
}

async function renderGeral(showSkeleton) {
  if (showSkeleton) {
    const panelSkel = el("ct-panel-geral");
    if (panelSkel) panelSkel.innerHTML = ctSkeletonGeral();
    await minDelay(550);
  }
  const [clients, fiados] = await Promise.all([db.getAll("clients"), db.getAll("fiado")]);

  const enriched = clients.map(c => {
    const myFiados = fiados.filter(f =>
      (f.clientName || "").toLowerCase() === (c.name || "").toLowerCase());
    const open = myFiados.filter(f => f.status === "open");
    const totalOpen = open.reduce((a, f) => a + (f.amount || 0), 0);
    const overdueEntries = open.filter(isOverdue);
    const maxDays = overdueEntries.reduce((m, e) => Math.max(m, daysOverdue(e)), 0);
    return { client: c, totalOpen, overdue: overdueEntries.length > 0, maxDays };
  });

  const totalReceber = enriched.reduce((a, e) => a + e.totalOpen, 0);
  const overdueList = enriched.filter(e => e.overdue);
  const overdueTotal = overdueList.reduce((a, e) => a + e.totalOpen, 0);
  const clientesComDivida = enriched.filter(e => e.totalOpen > 0).length;
  const top3 = [...enriched].filter(e => e.totalOpen > 0)
    .sort((a, b) => b.totalOpen - a.totalOpen).slice(0, 3);

  const now = new Date();
  const recebidoMes = fiados.filter(f => f.status === "paid").filter(f => {
    const d = new Date(f.paidAt || f.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((a, f) => a + (f.amount || 0), 0);

  const totalPaidAll = fiados.filter(f => f.status === "paid").reduce((a, f) => a + (f.amount || 0), 0);
  const totalOpenAll = fiados.filter(f => f.status === "open").reduce((a, f) => a + (f.amount || 0), 0);
  const taxaCobranca = (totalPaidAll + totalOpenAll) > 0
    ? Math.round((totalPaidAll / (totalPaidAll + totalOpenAll)) * 100)
    : 100;

  const panel = el("ct-panel-geral");
  panel.innerHTML =
    `<div class="fiados-hero">
      <div class="fiados-hero-label">Total a receber</div>
      <div class="fiados-hero-val${sizeMod("fiados-hero-val", fmt(totalReceber))}">${fmt(totalReceber)}</div>
      ${overdueTotal > 0 ? `<div class="ct-hero-badge">${fmt(overdueTotal)} atrasados</div>` : ""}
      <div class="fiados-hero-sub">
        <span>${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}</span>
        <span>·</span>
        <span>${clientesComDivida} com dívida</span>
      </div>
    </div>

    ${overdueList.length > 0 ? `
    <div class="ct-attention-card">
      <i data-lucide="alert-triangle"></i>
      <div>
        <div class="ct-attention-title">${overdueList.length} ${overdueList.length===1?"cliente atrasado":"clientes atrasados"}</div>
        <div class="ct-attention-sub">${fmt(overdueTotal)} em atraso</div>
      </div>
    </div>` : ""}

    <div class="ct-kpi-row">
      <div class="ct-kpi-item">
        <div class="ct-kpi-val${sizeMod("ct-kpi-val", clients.length)}">${clients.length}</div>
        <div class="ct-kpi-label">clientes</div>
      </div>
      <div class="ct-kpi-divider"></div>
      <div class="ct-kpi-item">
        <div class="ct-kpi-val${sizeMod("ct-kpi-val", fmt(recebidoMes))}">${fmt(recebidoMes)}</div>
        <div class="ct-kpi-label">recebido/mês</div>
      </div>
      <div class="ct-kpi-divider"></div>
      <div class="ct-kpi-item">
        <div class="ct-kpi-val${sizeMod("ct-kpi-val", taxaCobranca + "%")}">${taxaCobranca}%</div>
        <div class="ct-kpi-label">cobrança</div>
      </div>
    </div>

    <div class="ct-section-label">Maiores dívidas</div>
    ${top3.length === 0
      ? `<div class="empty-state" style="padding:24px 12px">
          <i data-lucide="check-circle"></i>
          <div class="empty-state-title">Nenhuma dívida em aberto</div>
        </div>`
      : `<div class="list-card">
          ${top3.map(({ client: c, totalOpen, overdue, maxDays }) => `
            <div class="ct-devedor-row" onclick="window._openClienteProfile(${c.id})">
              <div class="fc-row-avatar" style="background:${overdue ? "var(--danger-muted-light);color:var(--danger-muted)" : "var(--warning-muted-light);color:var(--warning-muted)"}">
                ${(c.name||"?").charAt(0).toUpperCase()}
              </div>
              <div class="fc-row-info">
                <div class="fc-row-name">${c.name}</div>
                ${overdue ? `<span class="fc-badge-overdue">Atrasado há ${maxDays} ${maxDays===1?"dia":"dias"}</span>` : ""}
              </div>
              <div class="fc-row-val ${overdue ? "overdue" : ""}${sizeMod("fc-row-val", fmt(totalOpen))}">${fmt(totalOpen)}</div>
            </div>`).join("")}
        </div>`
    }`;
  refreshIcons(panel);
}

// ── ABA CLIENTES ──────────────────────────────────────────────────────────────
async function renderClientesList(showSkeleton) {
  const search = el("clientes-search");
  if (search && !search.oninput) search.oninput = () => renderClientesList();

  if (showSkeleton) {
    const listSkel = el("clientes-list");
    if (listSkel) listSkel.innerHTML = ctSkeletonRow() + ctSkeletonRow() + ctSkeletonRow();
    await minDelay(550);
  }

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
    const openEntries = myFiados.filter(f => f.status==="open");
    const fiadoAberto = openEntries.reduce((a,f) => a+(f.amount||0), 0);
    const overdueEntries = openEntries.filter(isOverdue);
    const overdue = overdueEntries.length > 0;
    const maxDays = overdueEntries.reduce((m,e) => Math.max(m, daysOverdue(e)), 0);
    const risk = computeRisk(myFiados);

    const row = document.createElement("div");
    row.className = "fc-row";
    if (risk.color === "var(--warning-muted)" || risk.color === "var(--danger-muted)") {
      row.style.borderLeft = "3px solid " + risk.color;
    } else {
      row.style.borderLeft = "3px solid transparent";
    }
    row.onclick = () => window._openClienteProfile(c.id);
    row.innerHTML =
      `<div class="fc-row-avatar" style="background:${overdue ? "var(--danger-muted-light);color:var(--danger-muted)" : "var(--primary-light);color:var(--primary)"}">
        ${c.name.charAt(0).toUpperCase()}
      </div>
      <div class="fc-row-info">
        <div class="fc-row-name">${c.name}</div>
        <div class="fc-row-meta">${c.phone ? formatPhone(c.phone) : "sem telefone"} · ${mySales.length === 0 ? "Cliente novo" : mySales.length + " " + (mySales.length===1?"compra":"compras")}</div>
        <span class="fc-risk-chip" style="color:${risk.color};background:${risk.bg}"><i data-lucide="${risk.icon}"></i>${risk.label}</span>
      </div>
      <div class="fc-row-right">
        ${fiadoAberto > 0
          ? `<div class="fc-row-val ${overdue?"overdue":""}${sizeMod("fc-row-val", fmt(fiadoAberto))}">${fmt(fiadoAberto)}</div><div class="fc-row-sub">${overdue?"Atrasado há "+maxDays+"d":"Pendente"}</div>`
          : `<div class="fc-row-saldo"><i data-lucide="check-circle" style="width:13px;height:13px"></i> Em dia</div>`
        }
      </div>
      <button class="fc-row-kebab" onclick="event.stopPropagation();window._openClienteActions(${c.id})">
        <i data-lucide="more-vertical" style="width:16px;height:16px"></i>
      </button>`;
    listEl.appendChild(row);
  });

  refreshIcons(listEl);
}

function actionRow(icon, iconBg, iconColor, label, onclick, danger) {
  return `<button class="fiado-action-row${danger ? " danger" : ""}" onclick="${onclick}">
    <span class="ct-action-icon" style="background:${iconBg};color:${iconColor}"><i data-lucide="${icon}"></i></span>
    ${label}
  </button>`;
}

window._openClienteActions = async (id) => {
  const c = await db.get("clients", id);
  if (!c) return;
  const phone = (c.phone || "").trim();
  const waMsg = waLink(phone, "Olá " + c.name + ", tudo bem?");

  openModal("",
    `<div class="fiado-entry-actions-sheet">
      ${phone ? `
        ${actionRow("phone", "var(--info-light,#dbeafe)", "var(--info,#2563eb)", "Ligar", "window._closeModal();window.location.href='tel:" + phone.replace(/\s+/g,"") + "'")}
        ${actionRow("message-circle", "#dcfce7", "#16a34a", "WhatsApp", "window._closeModal();window.open('" + waMsg + "','_blank')")}
        ` : `
        <div style="padding:8px 10px 14px;font-size:12px;color:var(--text4)">Este cliente não tem telefone registado.</div>`
      }
      ${actionRow("user", "var(--primary-light)", "var(--primary)", "Ver ficha completa", "window._closeModal();window._openClienteProfile(" + id + ")")}
    </div>`);
  refreshIcons(el("modal-box"));
};

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
  if (id) {
    const ex = await db.get("clients", id);
    await db.put("clients", { ...ex, ...data });
    toast("Cliente actualizado.", "success");
  } else {
    await db.add("clients", { ...data, createdAt: new Date().toISOString() });
    toast("Cliente adicionado.", "success");
  }
  closeModal();
  if (document.getElementById("cliente-profile-overlay") && id) {
    window._openClienteProfile(id);
  } else {
    switchCtTab(getActiveTab());
  }
};

// ── ABA FIADOS (agrupado por cliente, ação direta na linha) ───────────────────
async function renderFiadosList(showSkeleton) {
  const search = el("fiados-search");
  if (search && !search.oninput) search.oninput = () => renderFiadosList();
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

  if (showSkeleton) {
    const listSkel = el("fiados-list");
    if (listSkel) listSkel.innerHTML = ctSkeletonRow() + ctSkeletonRow() + ctSkeletonRow();
    await minDelay(550);
  }

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
    const k = (f.clientName || "").toLowerCase().trim();
    if (!grouped[k]) grouped[k] = { clientName: f.clientName, entries: [], totalOpen: 0 };
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
    const openEntries = g.entries.filter(e => e.status === "open");
    const openCount = openEntries.length;
    const firstOpen = openEntries[0];
    const overdueEntries = openEntries.filter(isOverdue);
    const groupOverdue = overdueEntries.length > 0;
    const maxDays = overdueEntries.reduce((m,e) => Math.max(m, daysOverdue(e)), 0);
    const matchClient = clients.find(c => (c.name||"").toLowerCase() === g.clientName.toLowerCase());

    let avatarStyle;
    if (isSaldado) avatarStyle = "background:var(--success-light);color:var(--success)";
    else if (groupOverdue) avatarStyle = "background:var(--danger-muted-light);color:var(--danger-muted)";
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
         <div class="fc-row-meta">${g.entries.length} ${g.entries.length===1?"entrada":"entradas"}${groupOverdue ? " · atrasado há " + maxDays + "d" : ""}</div>
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
  return mySales.slice(0,30).map(s => {
    const totalLiq = (s.total||0) - (s.totalDevolvido||0);
    const hasDev   = s.temDevolucao && (s.totalDevolvido||0) > 0;
    const color    = payColor(s.payMethod);
    const nItems   = (s.items||[]).length;
    return `<div class="hist-sale-card" style="border-left:3px solid ${color}" onclick="window._openSaleDetail(${s.id})">
      <div class="hist-sale-avatar ${payClass(s.payMethod)}"><i data-lucide="${payIcon(s.payMethod)}" style="width:18px;height:18px"></i></div>
      <div class="hist-sale-info">
        <div class="hist-sale-id">Venda #${String(s.id).padStart(4,"0")}${hasDev ? ' <span class="hist-badge-dev">↩ Dev.</span>' : ''}</div>
        <span class="hist-sale-tag" style="background:color-mix(in srgb, ${color} 15%, white);color:${color}">${payLabel(s.payMethod)}</span>
        <div class="hist-sale-meta">${fmtDate(s.date)} · ${nItems} ${nItems===1?"item":"itens"}</div>
      </div>
      <div class="hist-sale-right">
        ${hasDev
          ? `<div class="hist-sale-total--dev">${fmt(s.total)}</div><div class="hist-sale-total-liq">${fmt(totalLiq)}</div>`
          : `<div class="hist-sale-total" style="color:${color}">${fmt(s.total)}</div>`}
        ${s.discount>0 ? `<div style="font-size:10px;color:var(--danger)">-${fmt(s.discount)} desc.</div>` : ''}
      </div>
    </div>`;
  }).join("");
}

function renderFiadosPanel(myFiados, clientName) {
  const open = myFiados.filter(f => f.status === "open");
  const totalOpen = open.reduce((a, f) => a + (f.amount || 0), 0);
  const sorted = [...myFiados].sort((a,b) => new Date(b.date) - new Date(a.date));

  const actions =
    `<div class="ct-fiado-actions-row">
      ${totalOpen > 0
        ? `<button class="ct-action-btn ct-action-btn-primary" onclick="window._confirmReceiveAll('${encodeURIComponent(clientName)}',${totalOpen})">
             <i data-lucide="check-check"></i> Receber tudo
           </button>` : ""
      }
      <button class="ct-action-btn ct-action-btn-secondary" onclick="window._openFiadoAdd('${clientName.replace(/'/g,"\\'")}')">
        <i data-lucide="plus"></i> Novo fiado
      </button>
    </div>`;

  if (!sorted.length) {
    return actions + `<div style="text-align:center;color:var(--text4);font-size:13px;padding:24px">Sem fiados registados</div>`;
  }

  const rows = sorted.slice(0,30).map(f => {
    const cancelled = f.status === "cancelled";
    const paid = f.status === "paid";
    const overdue = !paid && !cancelled && isOverdue(f);
    const statusAttr = paid ? "paid" : cancelled ? "cancelled" : overdue ? "overdue" : "open";
    const amountColor = paid ? "var(--success)" : cancelled ? "var(--text4)" : overdue ? "var(--danger-muted)" : "var(--warning-muted)";
    const title = paid ? "Pagamento recebido" : cancelled ? "Fiado anulado" : "Fiado";
    const days = overdue ? daysOverdue(f) : 0;

    const metaParts = [fmtDate(f.date)];
    if (f.notes) metaParts.push(f.notes);
    if (f.dueDate && f.status === "open") metaParts.push("vence " + fmtDate(f.dueDate));
    if (cancelled && f.cancelReason) metaParts.push("Motivo: " + f.cancelReason);

    return `<div class="fiado-entry" data-status="${statusAttr}">
      <div class="fiado-entry-top">
        <div class="fiado-entry-title-wrap">
          <span class="fiado-entry-title">${title}</span>
          ${overdue ? `<span class="fiado-overdue-chip">Atrasado há ${days} ${days===1?"dia":"dias"}</span>` : ""}
        </div>
        <span class="fiado-entry-amount${sizeMod("fiado-entry-amount", fmt(f.amount))}" style="color:${amountColor};${cancelled?"text-decoration:line-through":""}">${fmt(f.amount)}</span>
      </div>
      <div class="fiado-entry-meta">${metaParts.join(" · ")}</div>
      ${f.status === "open" ? `
        <div class="fiado-entry-bottom">
          <button class="fiado-kebab-btn" onclick="window._openFiadoActions(${f.id})">
            <i data-lucide="more-vertical" style="width:16px;height:16px"></i>
          </button>
          <button class="fiado-receive-pill" onclick="window._openPayModal(${f.id})">
            <i data-lucide="check" style="width:14px;height:14px"></i> Receber
          </button>
        </div>` : ""
      }
    </div>`;
  }).join("");

  return actions + `<div class="fiado-entries-list">${rows}</div>`;
}

window._openFiadoActions = (id) => {
  openModal("",
    `<div class="hist-export-options">
      <button class="hist-export-option" onclick="window._closeModal();window._openEditFiado(${id})">
        <div class="hist-export-icon hist-export-icon--edit"><i data-lucide="pencil"></i></div>
        <div class="hist-export-info">
          <div class="hist-export-title">Editar fiado</div>
        </div>
        <i data-lucide="chevron-right" class="hist-export-arrow"></i>
      </button>
      <button class="hist-export-option" onclick="window._closeModal();window._openCancelFiado(${id})">
        <div class="hist-export-icon hist-export-icon--cancel"><i data-lucide="ban"></i></div>
        <div class="hist-export-info">
          <div class="hist-export-title">Anular fiado</div>
        </div>
        <i data-lucide="chevron-right" class="hist-export-arrow"></i>
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

function switchProfileTab(tab) {
  document.querySelectorAll("#cliente-profile-overlay .fc-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const compras = document.getElementById("cp-panel-compras");
  const fiadosP = document.getElementById("cp-panel-fiados");
  fadeSwitch(tab === "compras" ? compras : fiadosP, [tab === "compras" ? fiadosP : compras]);
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
  const paidFiados = myFiados.filter(f => f.status === "paid");
  const trackedPaidFiados = paidFiados.filter(f => typeof f.paidLate === "boolean");
  const onTimeCount = trackedPaidFiados.filter(f => !f.paidLate).length;

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
          ${c.phone ? `<div style="font-size:13px;color:var(--text3);margin-top:2px">${formatPhone(c.phone)}</div>` : ""}
          ${c.address ? `<div style="font-size:12px;color:var(--text3)">${c.address}</div>` : ""}
          ${c.createdAt ? `<div style="font-size:11px;color:var(--text4);margin-top:2px">Cliente desde ${formatMonthYear(c.createdAt)}</div>` : ""}
          ${trackedPaidFiados.length > 0 ? `<div style="font-size:11px;color:var(--text4);margin-top:2px">${onTimeCount} de ${trackedPaidFiados.length} pagamentos no prazo</div>` : ""}
        </div>
      </div>

      <div class="ct-kpi-row" style="margin-bottom:16px">
        <div class="ct-kpi-item">
          <div class="ct-kpi-val${sizeMod("ct-kpi-val", mySales.length)}">${mySales.length}</div>
          <div class="ct-kpi-label">compras</div>
        </div>
        <div class="ct-kpi-divider"></div>
        <div class="ct-kpi-item">
          <div class="ct-kpi-val${sizeMod("ct-kpi-val", fmt(totalGasto))}" style="color:var(--success)">${fmt(totalGasto)}</div>
          <div class="ct-kpi-label">total gasto</div>
        </div>
        <div class="ct-kpi-divider"></div>
        <div class="ct-kpi-item">
          <div class="ct-kpi-val${sizeMod("ct-kpi-val", fmt(fiadoAberto))}" style="color:${fiadoAberto>0?"var(--warning-muted)":"var(--success)"}">${fmt(fiadoAberto)}</div>
          <div class="ct-kpi-label">fiado</div>
        </div>
      </div>

      <div class="fc-tabbar">
        <button class="fc-tab active" data-tab="compras" onclick="window._switchProfileTab('compras')">Compras</button>
        <button class="fc-tab" data-tab="fiados" onclick="window._switchProfileTab('fiados')">
          Fiados${fiadoAberto > 0 ? `<span class="fc-tab-dot"></span>` : ""}
        </button>
      </div>

      <div id="cp-panel-compras" class="fc-tab-panel ct-fade-panel" style="display:block;max-height:none">
        <div class="hist-list">${renderComprasPanel(mySales)}</div>
      </div>
      <div id="cp-panel-fiados" class="fc-tab-panel ct-fade-panel" style="display:none;max-height:none">
        ${renderFiadosPanel(myFiados, c.name)}
      </div>
    </div>`;
  refreshIcons(ov);
  requestAnimationFrame(() => {
    const initPanel = document.getElementById("cp-panel-compras");
    if (initPanel) initPanel.classList.add("ct-fade-in");
  });
};

window._closeModal = closeModal;
