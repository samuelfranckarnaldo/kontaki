import { db } from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import "./fiados.js";
import { isOverdue } from "./fiados.js";

let clienteFilter = "all";

export async function initClientesTab() {
  const search = el("fiados-search");
  if (search) { search.placeholder = "Pesquisar cliente..."; search.oninput = renderClientesTab; }

  document.querySelectorAll("#fiados-filter-pills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      clienteFilter = btn.dataset.filter;
      document.querySelectorAll("#fiados-filter-pills .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderClientesTab();
    });
  });

  window._openClienteForm = openClienteForm;
  window._refreshClientesTab = renderClientesTab;
  await renderClientesTab();
}

async function renderClientesTab() {
  const [clients, sales, fiados] = await Promise.all([
    db.getAll("clients"), db.getAll("sales"), db.getAll("fiado"),
  ]);

  const q = (el("fiados-search") ? el("fiados-search").value : "").toLowerCase();

  const enriched = clients.map(c => {
    const myFiados = fiados.filter(f =>
      f.clientId === c.id || (f.clientName || "").toLowerCase() === (c.name || "").toLowerCase());
    const mySales = sales.filter(s =>
      s.clientId === c.id || (s.clientName || "").toLowerCase() === (c.name || "").toLowerCase());
    const open = myFiados.filter(f => f.status === "open");
    const totalOpen = open.reduce((a, f) => a + (f.amount || 0), 0);
    const overdue = open.some(isOverdue);
    return { client: c, myFiados, mySales, totalOpen, overdue };
  });

  const totalReceber = enriched.reduce((a, e) => a + e.totalOpen, 0);
  const clientesComDivida = enriched.filter(e => e.totalOpen > 0).length;

  el("fiados-total-bar").innerHTML =
    `<div class="fiados-hero">
      <div class="fiados-hero-label">A receber</div>
      <div class="fiados-hero-val">${fmt(totalReceber)}</div>
      <div class="fiados-hero-sub">
        <span>${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}</span>
        ${clientesComDivida > 0
          ? `<span>·</span><span class="fiados-hero-hot">${clientesComDivida} com dívida</span>`
          : ""
        }
      </div>
    </div>`;

  let filtered = enriched.filter(e => (e.client.name || "").toLowerCase().includes(q));
  if (clienteFilter === "debt")  filtered = filtered.filter(e => e.totalOpen > 0);
  if (clienteFilter === "clean") filtered = filtered.filter(e => e.totalOpen === 0);
  filtered.sort((a, b) => b.totalOpen - a.totalOpen || (a.client.name||"").localeCompare(b.client.name||""));

  const listEl = el("fiados-list");
  listEl.innerHTML = "";

  if (!filtered.length) {
    listEl.innerHTML =
      `<div class="empty-state">
        <i data-lucide="users"></i>
        <div class="empty-state-title">${clients.length === 0 ? "Nenhum cliente" : "Sem resultados"}</div>
        <div class="empty-state-sub">${clients.length === 0
          ? "Toca em + para adicionar o teu primeiro cliente."
          : "Tenta pesquisar por outro nome."}</div>
      </div>`;
    refreshIcons(listEl);
    return;
  }

  filtered.forEach(({ client: c, mySales, totalOpen, overdue }) => {
    const isSaldado = totalOpen === 0;
    let avatarStyle;
    if (mySales.length === 0 && totalOpen === 0) avatarStyle = "background:var(--primary-light);color:var(--primary)";
    else if (overdue) avatarStyle = "background:var(--danger-light);color:var(--danger)";
    else if (isSaldado) avatarStyle = "background:var(--success-light);color:var(--success)";
    else avatarStyle = "background:var(--primary-light);color:var(--primary)";

    const row = document.createElement("div");
    row.className = "fc-row";
    row.onclick = () => window._openClienteDetail(c.id);

    row.innerHTML =
      `<div class="fc-row-avatar" style="${avatarStyle}">${(c.name||"?").charAt(0).toUpperCase()}</div>
       <div class="fc-row-info">
         <div class="fc-row-name">${c.name}</div>
         <div class="fc-row-meta">${c.phone || "sem telefone"} · ${mySales.length} ${mySales.length === 1 ? "compra" : "compras"}</div>
       </div>
       <div class="fc-row-right">
         ${totalOpen > 0
           ? `<div class="fc-row-val ${overdue ? "overdue" : ""}">${fmt(totalOpen)}</div>
              <div class="fc-row-sub">${overdue ? "Atrasado" : "Pendente"}</div>`
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
  if (id) {
    const ex = await db.get("clients", id);
    await db.put("clients", { ...ex, ...data });
    toast("Cliente actualizado.", "success");
  } else {
    await db.add("clients", { ...data, createdAt: new Date().toISOString() });
    toast("Cliente adicionado.", "success");
  }
  closeModal();
  await renderClientesTab();
};

function renderComprasPanel(mySales) {
  if (!mySales.length) {
    return `<div style="text-align:center;color:var(--text4);font-size:13px;padding:24px">Sem compras registadas</div>`;
  }
  return mySales.slice(0, 30).map(s => `
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
         </button>`
      : ""
    ) +
    `<button class="btn btn-outline btn-full btn-sm" style="margin-bottom:14px" onclick="window._closeModal();window._openFiadoAdd('${clientName.replace(/'/g,"\\'")}')">
       <i data-lucide="plus"></i> Registar novo fiado
     </button>`;

  const list = !sorted.length
    ? `<div style="text-align:center;color:var(--text4);font-size:13px;padding:24px">Sem fiados registados</div>`
    : sorted.slice(0, 30).map(f => {
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

window._switchClienteTab = (tab) => {
  document.querySelectorAll(".fc-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const compras = document.getElementById("fc-tab-panel-compras");
  const fiadosP = document.getElementById("fc-tab-panel-fiados");
  if (compras) compras.style.display = tab === "compras" ? "block" : "none";
  if (fiadosP) fiadosP.style.display = tab === "fiados" ? "block" : "none";
};

window._openClienteDetail = async (id) => {
  const c = await db.get("clients", id);
  if (!c) return;

  const [sales, fiados] = await Promise.all([db.getAll("sales"), db.getAll("fiado")]);
  const mySales  = sales.filter(s => s.clientId === c.id || (s.clientName||"").toLowerCase() === c.name.toLowerCase())
                        .sort((a,b) => new Date(b.date) - new Date(a.date));
  const myFiados = fiados.filter(f => f.clientId === c.id || (f.clientName||"").toLowerCase() === c.name.toLowerCase());
  const openFiados = myFiados.filter(f => f.status === "open");
  const totalGasto  = mySales.reduce((a,s) => a + ((s.total||0) - (s.totalDevolvido||0)), 0);
  const fiadoAberto = openFiados.reduce((a,f) => a + (f.amount||0), 0);

  openModal(c.name,
    `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <div style="width:52px;height:52px;border-radius:16px;background:var(--primary-light);color:var(--primary);
        font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${c.name.charAt(0).toUpperCase()}
      </div>
      <div>
        <div style="font-size:17px;font-weight:700">${c.name}</div>
        ${c.phone ? `<div style="font-size:12px;color:var(--text3);margin-top:2px">${c.phone}</div>` : ""}
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
      <button class="fc-tab active" data-tab="compras" onclick="window._switchClienteTab('compras')">Compras</button>
      <button class="fc-tab" data-tab="fiados" onclick="window._switchClienteTab('fiados')">
        Fiados${fiadoAberto > 0 ? `<span class="fc-tab-dot"></span>` : ""}
      </button>
    </div>

    <div id="fc-tab-panel-compras" class="fc-tab-panel" style="display:block">
      ${renderComprasPanel(mySales)}
    </div>
    <div id="fc-tab-panel-fiados" class="fc-tab-panel" style="display:none">
      ${renderFiadosPanel(myFiados, c.name)}
    </div>

    <div class="form-actions" style="margin-top:16px">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>
      <button class="btn btn-primary btn-full" onclick="window._openClienteForm(${JSON.stringify(c).replace(/"/g,"&quot;")})">
        <i data-lucide="edit-3"></i> Editar</button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._closeModal = closeModal;
