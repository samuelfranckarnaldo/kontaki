import { db } from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { clientService } from "../services.js";
import "./fiados.js";
import { isOverdue, daysOverdue, waLink } from "./fiados.js";
import { payIcon, payColor, payLabel, payClass, fmtChartVal } from "./historico.js";
import { _statCard } from "./produtos.js";

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

function fmtStatVal(n) {
  return Math.abs(n) >= 1000000 ? fmtChartVal(n) : fmt(n);
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
    if (window._ctOpenProfileId) window._openClienteProfile(window._ctOpenProfileId);
  };
  window._ctTopbarAdd = ctTopbarAdd;
  setupCtSwipe();
  switchCtTab("geral");
}

const CT_TAB_ORDER = ["geral", "clientes", "fiados"];

function avatarColor(name) {
  var palette = [
    { bg: "#ede9fe", color: "#7c3aed" }, // roxo
    { bg: "#dbeafe", color: "#2563eb" }, // azul
    { bg: "#dcfce7", color: "#16a34a" }, // verde
    { bg: "#fce7f3", color: "#db2777" }, // rosa
    { bg: "#ccfbf1", color: "#0d9488" }, // teal
    { bg: "#e0e7ff", color: "#4f46e5" }, // índigo
  ];
  var sum = 0;
  var s = name || "?";
  for (var i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return palette[sum % palette.length];
}

function setupCtSwipe() {
  const container = document.querySelector("#pg-fiados .page-inner");
  if (!container || container.dataset.swipeBound) return;
  container.dataset.swipeBound = "1";

  const tabbar = document.getElementById("ct-tabbar");
  let indicator = document.getElementById("ct-tab-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "ct-tab-indicator";
    indicator.className = "ct-tab-indicator";
    tabbar.appendChild(indicator);
  }

  function computeRects() {
    return CT_TAB_ORDER.map(t => {
      const btn = tabbar.querySelector('.ct-tab[data-tab="' + t + '"]');
      return { left: btn.offsetLeft, width: btn.offsetWidth };
    });
  }
  let rects = computeRects();

  function setIndicator(idx, animate) {
    const r = rects[idx];
    if (!r) return;
    indicator.style.transition = animate ? "transform .25s ease, width .25s ease" : "none";
    indicator.style.width = r.width + "px";
    indicator.style.transform = "translateX(" + r.left + "px)";
  }

  setIndicator(CT_TAB_ORDER.indexOf(getActiveTab()), false);

  document.querySelectorAll("#ct-tabbar .ct-tab").forEach(btn => {
    btn.onclick = () => {
      switchCtTab(btn.dataset.tab);
      setIndicator(CT_TAB_ORDER.indexOf(btn.dataset.tab), true);
    };
  });

  let startX = 0, startY = 0, tracking = false, curIdx = 0;

  container.addEventListener("touchstart", (e) => {
    if (document.getElementById("cliente-profile-overlay")) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    curIdx = CT_TAB_ORDER.indexOf(getActiveTab());
    rects = computeRects();
  }, { passive: true });

  container.addEventListener("touchmove", (e) => {
    if (!tracking) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return;

    let targetIdx = dx < 0 ? curIdx + 1 : curIdx - 1;
    if (targetIdx < 0 || targetIdx > CT_TAB_ORDER.length - 1) targetIdx = curIdx;

    const cur = rects[curIdx], tgt = rects[targetIdx];
    const tabWidth = cur.width || 100;
    const progress = Math.min(Math.abs(dx) / tabWidth, 1);
    const interpLeft = cur.left + (tgt.left - cur.left) * progress;
    const interpWidth = cur.width + (tgt.width - cur.width) * progress;

    indicator.style.transition = "none";
    indicator.style.transform = "translateX(" + interpLeft + "px)";
    indicator.style.width = interpWidth + "px";
  }, { passive: true });

  container.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    if (Math.abs(dx) >= 60 && Math.abs(dx) >= Math.abs(dy) * 1.2) {
      if (dx < 0 && curIdx < CT_TAB_ORDER.length - 1) {
        switchCtTab(CT_TAB_ORDER[curIdx + 1]);
        setIndicator(curIdx + 1, true);
        return;
      } else if (dx > 0 && curIdx > 0) {
        switchCtTab(CT_TAB_ORDER[curIdx - 1]);
        setIndicator(curIdx - 1, true);
        return;
      }
    }
    setIndicator(curIdx, true);
  }, { passive: true });
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

  const fiadoGroups = {};
  fiados.forEach(f => {
    const key = f.clientId ? "id:" + f.clientId : "name:" + (f.clientName || "").toLowerCase().trim();
    if (!fiadoGroups[key]) fiadoGroups[key] = { clientId: f.clientId || null, clientName: f.clientName || "Desconhecido", entries: [] };
    fiadoGroups[key].entries.push(f);
  });

  const enriched = Object.values(fiadoGroups).map(g => {
    const matchClient = g.clientId
      ? clients.find(c => c.id === g.clientId)
      : clients.find(c => (c.name || "").toLowerCase() === g.clientName.toLowerCase());
    const open = g.entries.filter(f => f.status === "open");
    const totalOpen = open.reduce((a, f) => a + (f.amount || 0), 0);
    const overdueEntries = open.filter(isOverdue);
    const maxDays = overdueEntries.reduce((m, e) => Math.max(m, daysOverdue(e)), 0);
    const firstOpen = open[0];
    return {
      client: matchClient || { id: null, name: g.clientName },
      totalOpen, overdue: overdueEntries.length > 0, maxDays, firstOpen
    };
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
    `<div class="hist-hero">
      <div class="hist-hero-label">Total a receber</div>
      <div class="hist-hero-val${sizeMod("hist-hero-val", fmt(totalReceber))}">${fmt(totalReceber)}</div>
      ${overdueTotal > 0 ? `<div class="ct-hero-badge">${fmt(overdueTotal)} atrasados</div>` : ""}
      <div class="hist-hero-sub">
        <span>${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}</span>
        <span>·</span>
        <span>${clientesComDivida} com dívida</span>
      </div>
      ${clientesComDivida > 0 ? `<div class="hist-hero-context" style="margin-top:6px">${clientesComDivida === 1 ? "Apenas 1 cliente precisa de cobrança" : clientesComDivida + " clientes precisam de cobrança"}</div>` : ""}
    </div>

    ${overdueList.length > 0 ? `
    <div class="ct-attention-card">
      <i data-lucide="alert-triangle"></i>
      <div>
        <div class="ct-attention-title">${overdueList.length} ${overdueList.length===1?"cliente atrasado":"clientes atrasados"}</div>
        <div class="ct-attention-sub">${fmt(overdueTotal)} em atraso</div>
      </div>
    </div>` : ""}

    <div id="ct-geral-stats-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0">
      ${_statCard({ label:"Clientes", value:clients.length, sub:"total", color:"var(--text)", icon:"users" })}
      ${_statCard({ label:"Recebido", value:fmtStatVal(recebidoMes), sub:"este mês", color:"var(--success)", icon:"trending-up" })}
      ${_statCard({ label:"Cobrança", value:taxaCobranca+"%", sub:"desde sempre", color:"var(--text)", icon:"percent" })}
      ${_statCard({ label:"Atrasados", value:overdueList.length, sub:"clientes", color:overdueList.length>0?"var(--danger)":"var(--text)", icon:"alert-triangle" })}
    </div>
    <style>
      #ct-geral-stats-grid .prod-stat-card { padding: 20px 12px; }
      #ct-geral-stats-grid .prod-stat-icon { width: 44px; height: 44px; }
      #ct-geral-stats-grid .prod-stat-icon i, #ct-geral-stats-grid .prod-stat-icon svg { width: 21px; height: 21px; }
      #ct-geral-stats-grid .prod-stat-val2 { font-size: 28px !important; }
      #ct-geral-stats-grid .prod-stat-val2--sm { font-size: 22px !important; }
      #ct-geral-stats-grid .prod-stat-val2--xs { font-size: 17px !important; }
      #ct-geral-stats-grid .prod-stat-label2 { font-size: 13px; }
      #ct-geral-stats-grid .prod-stat-sub { font-size: 11px; }
    </style>

    <div class="ct-section-label"><i data-lucide="trending-down"></i>Maiores dívidas</div>
    ${top3.length === 0
      ? `<div class="empty-state" style="padding:24px 12px">
          <i data-lucide="check-circle"></i>
          <div class="empty-state-title">Nenhuma dívida em aberto</div>
        </div>`
      : `<div class="list-card">
          ${top3.map(({ client: c, totalOpen, overdue, maxDays, firstOpen }, i) => `
            <div class="produto-item" style="cursor:pointer" onclick="${c.id ? `window._openClienteProfile(${c.id})` : (firstOpen ? `window._openPayModal(${firstOpen.id})` : "")}">
              <div class="produto-avatar" style="background:${overdue ? "var(--danger-muted-light)" : avatarColor(c.name).bg};color:${overdue ? "var(--danger-muted)" : avatarColor(c.name).color}">
                ${(c.name||"?").charAt(0).toUpperCase()}
              </div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <div class="produto-name">${c.name}</div>
                  ${!c.id ? '<span class="produto-badge produto-badge-low">sem ficha</span>' : ""}
                  ${overdue ? `<span class="produto-badge produto-badge-zero">Atrasado ${maxDays}${maxDays===1?"d":"d"}</span>` : ""}
                </div>
                <div class="produto-meta">${overdue ? "Em atraso" : "Em aberto"}</div>
                <div class="produto-price" style="margin-top:4px;color:${overdue ? "var(--danger)" : "var(--primary)"}">${fmt(totalOpen)}</div>
              </div>
              <i data-lucide="chevron-right" style="width:18px;height:18px;color:var(--text4);flex-shrink:0"></i>
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
    row.className = "produto-item";
    row.style.borderLeft = row.style.borderLeft || "3px solid transparent";
    row.innerHTML =
      `<div class="produto-avatar" style="background:${overdue ? "var(--danger-muted-light)" : "var(--primary-light)"};color:${overdue ? "var(--danger-muted)" : "var(--primary)"}">
        ${c.name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <div class="produto-name">${c.name}</div>
        </div>
        <div class="produto-meta">${c.phone ? formatPhone(c.phone) : "sem telefone"} · ${mySales.length === 0 ? "Cliente novo" : mySales.length + " " + (mySales.length===1?"compra":"compras")}</div>
        <div style="margin-top:4px">
          <span class="fc-risk-chip" style="color:${risk.color};background:${risk.bg}"><i data-lucide="${risk.icon}"></i>${risk.label}</span>
        </div>
        ${fiadoAberto > 0
          ? `<div class="produto-price" style="margin-top:4px;color:${overdue?"var(--danger)":"var(--text2)"}">${fmt(fiadoAberto)}<span style="font-size:11px;font-weight:600;margin-left:6px;color:var(--text3)">${overdue?"Atrasado há "+maxDays+"d":"Pendente"}</span></div>`
          : `<div style="margin-top:4px;font-size:12px;font-weight:700;color:var(--success);display:flex;align-items:center;gap:4px"><i data-lucide="check-circle" style="width:13px;height:13px"></i> Em dia</div>`
        }
      </div>
      <button class="produto-menu-btn" onclick="event.stopPropagation();window._openClienteActions(${c.id})">
        <i data-lucide="more-vertical"></i>
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
    await clientService.create(data);
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
  document.querySelectorAll("#fiados-filter-pills .produto-filter-chip").forEach(btn => {
    if (!btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        fiadosFilter = btn.dataset.filter;
        document.querySelectorAll("#fiados-filter-pills .produto-filter-chip").forEach(b => b.classList.remove("produto-filter-chip--active"));
        btn.classList.add("produto-filter-chip--active");
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
    `<div class="ct-inline-summary-card">
      <div class="ct-inline-summary">
        <span class="ct-inline-val">${fmt(total)}</span>
        <span class="ct-inline-label">em aberto · ${uniqueClients} ${uniqueClients===1?"cliente":"clientes"}</span>
      </div>
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
  listEl.className = groups.length ? "list-card" : "";

  if (!groups.length) {
    listEl.innerHTML =
      `<div class="empty-state">
        <i data-lucide="wallet"></i>
        <div class="empty-state-title">Nenhum crédito</div>
        <div class="empty-state-sub">Os créditos registados aparecem aqui.</div>
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

    const ac = avatarColor(g.clientName);
    const avatarBg    = isSaldado ? "var(--success-light)" : groupOverdue ? "var(--danger-muted-light)" : ac.bg;
    const avatarColor2 = isSaldado ? "var(--success)" : groupOverdue ? "var(--danger-muted)" : ac.color;
    const metaText = isSaldado ? "Saldado" : groupOverdue ? `Atrasado há ${maxDays} ${maxDays===1?"dia":"dias"}` : "Em aberto";

    const row = document.createElement("div");
    row.className = "produto-item";
    row.style.cursor = "pointer";
    row.onclick = () => {
      if (matchClient) window._openClienteProfile(matchClient.id);
      else if (firstOpen) window._openPayModal(firstOpen.id);
    };

    row.innerHTML =
      `<div class="produto-avatar" style="background:${avatarBg};color:${avatarColor2}">${g.clientName.charAt(0).toUpperCase()}</div>
       <div style="flex:1;min-width:0">
         <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
           <div class="produto-name">${g.clientName}</div>
           ${!matchClient ? '<span class="produto-badge produto-badge-low">sem ficha</span>' : ""}
           ${groupOverdue ? `<span class="produto-badge produto-badge-zero">Atrasado ${maxDays}d</span>` : ""}
           ${isSaldado ? '<span class="produto-badge produto-badge-ok">Saldado</span>' : ""}
         </div>
         <div class="produto-meta">${g.entries.length} ${g.entries.length===1?"entrada":"entradas"}</div>
         ${!isSaldado ? `<div class="produto-price" style="margin-top:4px;color:${groupOverdue?"var(--danger)":"var(--primary)"}">${fmt(g.totalOpen)}</div>` : ""}
       </div>
       ${!isSaldado && openCount === 1
         ? `<button class="produto-menu-btn" style="background:var(--success-light);color:var(--success)" onclick="event.stopPropagation();window._openPayModal(${firstOpen.id})" title="Receber">
             <i data-lucide="check"></i>
           </button>`
         : `<i data-lucide="chevron-right" style="width:18px;height:18px;color:var(--text4);flex-shrink:0"></i>`
       }`;
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
    return `<div class="cp-sale-card" style="border-left:3px solid ${color}" onclick="window._openSaleDetail(${s.id})">
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
        <i data-lucide="plus"></i> Novo crédito
      </button>
    </div>`;

  if (!sorted.length) {
    return actions + `<div style="text-align:center;color:var(--text4);font-size:13px;padding:24px">Sem créditos registados</div>`;
  }

  const sortedSliced = sorted.slice(0,30);
  const rows = sortedSliced.map((f) => {
    const cancelled = f.status === "cancelled";
    const paid = f.status === "paid";
    const overdue = !paid && !cancelled && isOverdue(f);
    const amountColor = paid ? "var(--success)" : cancelled ? "var(--text4)" : overdue ? "var(--danger-muted)" : "var(--warning)";
    const title = paid ? "Pagamento recebido" : cancelled ? "Crédito anulado" : "Crédito";
    const days = overdue ? daysOverdue(f) : 0;

    const metaParts = [fmtDate(f.date)];
    if (f.notes) metaParts.push(f.notes);
    if (f.dueDate && f.status === "open") metaParts.push("vence " + fmtDate(f.dueDate));
    if (cancelled && f.cancelReason) metaParts.push("Motivo: " + f.cancelReason);

    const entryIcon = paid ? "check-circle" : cancelled ? "ban" : overdue ? "alert-triangle" : "hand-coins";
    const entryIconBg = paid ? "var(--success-light)" : cancelled ? "var(--border2)" : overdue ? "var(--danger-muted-light)" : "var(--warning-light)";
    const entryIconColor = paid ? "var(--success)" : cancelled ? "var(--text4)" : overdue ? "var(--danger-muted)" : "var(--warning)";
    const borderColor = paid ? "var(--success)" : cancelled ? "var(--border2)" : overdue ? "var(--danger-muted)" : "var(--warning)";

    return `<div class="fc-credit-card${cancelled?" fc-credit-card--cancelled":""}" style="border-left:3px solid ${borderColor}">
      <div class="fc-credit-avatar" style="background:${entryIconBg};color:${entryIconColor}">
        <i data-lucide="${entryIcon}"></i>
      </div>
      <div class="fc-credit-info">
        <div class="fiado-entry-title-wrap">
          <span class="fiado-entry-title">${title}</span>
          ${overdue ? `<span class="fiado-overdue-chip">Atrasado há ${days} ${days===1?"dia":"dias"}</span>` : ""}
        </div>
        <div class="fc-credit-meta">${metaParts.join(" · ")}</div>
      </div>
      <div class="fc-credit-right">
        <span class="fiado-entry-amount${sizeMod("fiado-entry-amount", fmt(f.amount))}" style="color:${amountColor};${cancelled?"text-decoration:line-through":""}">${fmt(f.amount)}</span>
        ${f.status === "open" ? `
          <button class="fiado-kebab-btn-sm" onclick="window._openFiadoActions(${f.id})">
            <i data-lucide="more-vertical" style="width:15px;height:15px"></i>
          </button>` : ""
        }
      </div>
    </div>`;
  }).join("");

  return actions + `<div class="fc-credit-list">${rows}</div>`;
}

window._openFiadoActions = (id) => {
  openModal("",
    `<div class="hist-export-options">
      <button class="hist-export-option" onclick="window._closeModal();window._openPayModal(${id})">
        <div class="hist-export-icon" style="background:var(--success-light);color:var(--success)"><i data-lucide="check"></i></div>
        <div class="hist-export-info">
          <div class="hist-export-title">Receber</div>
          <div class="hist-export-desc">Regista o pagamento deste crédito</div>
        </div>
        <i data-lucide="chevron-right" class="hist-export-arrow"></i>
      </button>
      <button class="hist-export-option" onclick="window._closeModal();window._openEditFiado(${id})">
        <div class="hist-export-icon hist-export-icon--edit"><i data-lucide="pencil"></i></div>
        <div class="hist-export-info">
          <div class="hist-export-title">Editar crédito</div>
          <div class="hist-export-desc">Altera valor, data de vencimento ou notas</div>
        </div>
        <i data-lucide="chevron-right" class="hist-export-arrow"></i>
      </button>
      <button class="hist-export-option" onclick="window._closeModal();window._openCancelFiado(${id})">
        <div class="hist-export-icon hist-export-icon--cancel"><i data-lucide="ban"></i></div>
        <div class="hist-export-info">
          <div class="hist-export-title">Anular crédito</div>
          <div class="hist-export-desc">Cancela este registo sem cobrar o valor</div>
        </div>
        <i data-lucide="chevron-right" class="hist-export-arrow"></i>
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

function switchProfileTab(tab) {
  window._ctOpenProfileTab = tab;
  document.querySelectorAll("#cliente-profile-overlay .fc-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const compras = document.getElementById("cp-panel-compras");
  const fiadosP = document.getElementById("cp-panel-fiados");
  fadeSwitch(tab === "compras" ? compras : fiadosP, [tab === "compras" ? fiadosP : compras]);
}
window._switchProfileTab = switchProfileTab;

window._closeClienteProfile = () => {
  window._ctOpenProfileId = null;
  window._ctOpenProfileTab = null;
  const ov = document.getElementById("cliente-profile-overlay");
  if (ov) ov.remove();
  document.body.style.overflow = "";
  switchCtTab(getActiveTab());
};

window._openClienteProfile = async (id) => {
  const c = await db.get("clients", id);
  if (!c) { toast("Cliente não encontrado.", "error"); return; }
  window._ctOpenProfileId = id;
  const activeTab = window._ctOpenProfileTab || "compras";

  const [sales, fiados] = await Promise.all([db.getAll("sales"), db.getAll("fiado")]);
  const mySales  = sales.filter(s => s.clientId===c.id || (s.clientName||"").toLowerCase()===c.name.toLowerCase())
                        .sort((a,b) => new Date(b.date) - new Date(a.date));
  const myFiados = fiados.filter(f => f.clientId===c.id || (f.clientName||"").toLowerCase()===c.name.toLowerCase());
  const openFiados = myFiados.filter(f => f.status === "open");
  const totalGasto  = mySales.reduce((a,s) => a + ((s.total||0) - (s.totalDevolvido||0)), 0);
  const fiadoAberto = openFiados.reduce((a,f) => a + (f.amount||0), 0);
  const ticketMedio = mySales.length ? totalGasto / mySales.length : 0;
  const ultimaCompra = mySales.length ? fmtDate(mySales[0].date) : "—";
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
      <div class="ct-profile-header-title">Ficha do cliente</div>
      <button class="ct-profile-back" onclick="window._openClienteForm(${JSON.stringify(c).replace(/"/g,"&quot;")})">
        <i data-lucide="edit-3"></i>
      </button>
    </div>
    <div class="ct-profile-body">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-lg);padding:18px 16px;box-shadow:var(--shadow-sm)">
        <div style="width:58px;height:58px;border-radius:17px;background:linear-gradient(135deg, var(--primary), var(--primary-mid));color:#fff;
          font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(91,33,182,.25)">
          ${c.name.charAt(0).toUpperCase()}
        </div>
        <div style="min-width:0;flex:1">
          <div style="font-size:19px;font-weight:800;letter-spacing:-.2px">${c.name}</div>
          <div style="display:flex;flex-direction:column;gap:3px;margin-top:5px">
            ${c.phone ? `<div style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text3)"><i data-lucide="phone" style="width:12px;height:12px;flex-shrink:0"></i>${formatPhone(c.phone)}</div>` : ""}
            ${c.address ? `<div style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text3)"><i data-lucide="map-pin" style="width:12px;height:12px;flex-shrink:0"></i>${c.address}</div>` : ""}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:7px">
            ${c.createdAt ? `<span style="font-size:10.5px;color:var(--text4);background:var(--border2);padding:2px 8px;border-radius:20px;font-weight:600">Cliente desde ${formatMonthYear(c.createdAt)}</span>` : ""}
            ${trackedPaidFiados.length > 0 ? `<span style="font-size:10.5px;color:var(--text4);background:var(--border2);padding:2px 8px;border-radius:20px;font-weight:600">${onTimeCount} de ${trackedPaidFiados.length} pagamentos no prazo</span>` : ""}
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        ${_statCard({ label:"Compras", value:mySales.length, sub:"total", color:"var(--text)", icon:"shopping-bag" })}
        ${_statCard({ label:"Total gasto", value:fmtStatVal(totalGasto), sub:"todas as compras", color:"var(--success)", icon:"wallet" })}
      </div>

      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:var(--radius-lg);margin-bottom:8px;
        background:${fiadoAberto>0?"color-mix(in srgb, var(--warning) 10%, var(--bg2))":"var(--bg2)"};
        border:1px solid ${fiadoAberto>0?"var(--warning)":"var(--border2)"}">
        <div style="width:38px;height:38px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
          background:${fiadoAberto>0?"var(--warning)":"var(--success)"}20;color:${fiadoAberto>0?"var(--warning)":"var(--success)"}">
          <i data-lucide="hand-coins" style="width:18px;height:18px"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">Crédito</div>
          <div style="font-size:19px;font-weight:800;color:${fiadoAberto>0?"var(--warning)":"var(--success)"};margin-top:1px">${fmtStatVal(fiadoAberto)}</div>
        </div>
        <div style="font-size:11.5px;font-weight:600;color:var(--text3);text-align:right;flex-shrink:0">${fiadoAberto>0?"em aberto":"nada em aberto"}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        ${_statCard({ label:"Ticket médio", value:fmtStatVal(ticketMedio), sub:"por compra", color:"var(--text)", icon:"receipt" })}
        ${_statCard({ label:"Última compra", value:ultimaCompra, sub:mySales.length?"":"sem compras", color:"var(--text)", icon:"calendar" })}
      </div>

      <div class="fc-tabbar">
        <button class="fc-tab${activeTab==="compras"?" active":""}" data-tab="compras" onclick="window._switchProfileTab('compras')">Compras</button>
        <button class="fc-tab${activeTab==="fiados"?" active":""}" data-tab="fiados" onclick="window._switchProfileTab('fiados')">
          Créditos${fiadoAberto > 0 ? `<span class="fc-tab-dot"></span>` : ""}
        </button>
      </div>

      <div id="cp-panel-compras" class="fc-tab-panel ct-fade-panel" style="display:${activeTab==="compras"?"block":"none"};max-height:none">
        <div class="hist-list">${renderComprasPanel(mySales)}</div>
      </div>
      <div id="cp-panel-fiados" class="fc-tab-panel ct-fade-panel" style="display:${activeTab==="fiados"?"block":"none"};max-height:none">
        ${renderFiadosPanel(myFiados, c.name)}
      </div>
    </div>`;
  refreshIcons(ov);
  window._ctOpenProfileTab = activeTab;
  requestAnimationFrame(() => {
    const initPanel = document.getElementById(activeTab === "fiados" ? "cp-panel-fiados" : "cp-panel-compras");
    if (initPanel) initPanel.classList.add("ct-fade-in");
  });
};

window._closeModal = closeModal;
